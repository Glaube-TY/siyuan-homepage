import type { NormalizedRobotMessage, RobotOutboundMessage } from "../contracts/robot-message";
import type { RobotConfirmation } from "../contracts/robot-confirmation";
import type { RobotPairingCaptureState } from "../contracts/robot-pairing";
import type { RobotSessionState } from "../contracts/robot-session";
import type { RobotAssistantSettings } from "../settings/robot-settings-types";
import type { RobotAdmissionSettings } from "../contracts/robot-pairing";
import type { RobotProviderRuntimeStatus } from "../contracts/robot-provider";
import { decideRobotAdmission } from "./robot-admission";
import { RobotDedupCache } from "./robot-dedup";
import { parseRobotCommand, type RobotInternalCommand } from "./robot-command-service";
import { splitRobotReply } from "./robot-reply-splitter";
import { RobotSessionService } from "../session/robot-session-service";
import { RobotHistoryService, maskIdentity, buildRobotHistoryItem } from "../history/robot-history-service";
import type { RobotConfirmationStore } from "../contracts/robot-confirmation";
import type { RobotHistoryStore } from "../history/robot-history-service";
import type { RobotSessionStore } from "../contracts/robot-session";
import type { RobotAgentRuntime, RobotAgentTurnResult } from "../agent/robot-agent-runtime";
import { buildRobotHelpReply, buildRobotSystemPrompt, type RobotPromptContext } from "../agent/robot-prompt-builder";
import { ROBOT_TEXT_UNSUPPORTED_REPLY } from "../contracts/robot-message";
import type { RobotDebugLogger } from "./robot-logger";
import { NOOP_ROBOT_LOGGER } from "./robot-logger";
import { createRobotId } from "../contracts/robot-id";

/** 确认请求结果。 */
export type RobotConfirmationOutcome = "approved" | "rejected" | "expired";

export interface RobotCoreDeps {
  getSettings(): Promise<RobotAssistantSettings>;
  isEntitlementAvailable(): Promise<boolean>;
  getProviderAdmission(providerId: string): Promise<RobotAdmissionSettings>;
  getProviderStatus(providerId: string): Promise<RobotProviderRuntimeStatus>;
  sessionStore: RobotSessionStore;
  historyStore: RobotHistoryStore;
  confirmationStore: RobotConfirmationStore;
  dedup: RobotDedupCache;
  agentRuntime: RobotAgentRuntime;
  sendOutbound(message: RobotOutboundMessage): Promise<{ ok: boolean; errorCode?: string; message?: string }>;
  /** 读取指定 provider 的配对捕获状态（无则 null）。 */
  getPairingState?(providerId: string): Promise<RobotPairingCaptureState | null>;
  /** 捕获下一条私聊文本消息；返回 true 表示已捕获并消费。 */
  capturePairingMessage?(message: NormalizedRobotMessage): Promise<boolean>;
  /** 历史写入后通知（前端刷新历史列表）。 */
  onHistoryChanged?(): void;
  now?(): number;
  /** 调度定时器，返回取消函数。 */
  timeout?(fn: () => void, ms: number): () => void;
  log?: RobotDebugLogger;
}

interface PendingConfirmationWait {
  confirmation: RobotConfirmation;
  resolve: (outcome: RobotConfirmationOutcome) => void;
  timerId: unknown;
}

export class RobotCore {
  private readonly sessionService: RobotSessionService;
  private readonly historyService: RobotHistoryService;
  private readonly log: RobotDebugLogger;
  private readonly pendingByChat = new Map<string, PendingConfirmationWait>();
  private readonly pendingById = new Map<string, { wait: PendingConfirmationWait; chatKey: string }>();
  private readonly sessionQueues = new Map<string, Promise<void>>();
  private activeTurns = 0;
  private readonly globalWaiters: Array<() => void> = [];

  constructor(private readonly deps: RobotCoreDeps) {
    this.sessionService = new RobotSessionService(deps.sessionStore);
    this.historyService = new RobotHistoryService(deps.historyStore);
    this.log = deps.log ?? NOOP_ROBOT_LOGGER;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private appendHistory(item: Parameters<RobotHistoryService["append"]>[0]): Promise<void> {
    return this.historyService.append(item).then(() => this.deps.onHistoryChanged?.());
  }

  private timeout(fn: () => void, ms: number): () => void {
    if (this.deps.timeout) return this.deps.timeout(fn, ms);
    if (typeof globalThis.setTimeout === "function" && typeof globalThis.clearTimeout === "function") {
      const id = globalThis.setTimeout(fn, ms);
      return () => globalThis.clearTimeout(id);
    }
    return () => {};
  }

  private chatKeyFor(message: NormalizedRobotMessage, senderIsolated: boolean): string {
    const base = `${message.provider}:${message.accountId}:${message.chatId}`;
    return senderIsolated ? `${base}:${message.senderId}` : base;
  }

  /**
   * 接收一条标准化消息（Robot Core 唯一业务入口）。
   */
  async handleIncomingMessage(message: NormalizedRobotMessage): Promise<void> {
    const startedAt = this.now();
    const settings = await this.deps.getSettings();
    const record = (status: RobotHistoryItemStatus, extra: { resultSummary?: string; toolSummary?: string } = {}) => {
      return this.appendHistory(buildRobotHistoryItem({
        id: createRobotId(),
        provider: message.provider,
        direction: "in",
        senderMasked: maskIdentity(message.senderId),
        chatMasked: maskIdentity(message.chatId),
        messageId: message.messageId,
        contentPreview: message.text.slice(0, 120),
        resultSummary: extra.resultSummary,
        toolSummary: extra.toolSummary,
        status,
        durationMs: this.now() - startedAt,
        createdAt: startedAt,
      }));
    };

    // 1. 全局开关
    if (!settings.enabled) {
      this.log.info({ provider: message.provider, status: "disabled" });
      await record("ignored");
      return;
    }

    // 2. 防自循环
    if (message.isFromBot) return;

    // 3. 去重
    const dedupKey = this.deps.dedup.key(message.provider, message.accountId, message.messageId);
    if (this.deps.dedup.isProcessed(dedupKey)) {
      this.log.info({ provider: message.provider, status: "duplicate", messageIdHash: maskIdentity(message.messageId) });
      await record("ignored");
      return;
    }
    this.deps.dedup.markProcessed(dedupKey);

    // 4. 配对捕获必须先于白名单准入，否则未授权账号永远无法被捕获。
    if (message.chatType === "private" && message.messageType === "text") {
      const pairing = await this.deps.getPairingState?.(message.provider);
      if (pairing && pairing.enabled && this.now() <= pairing.expiresAt) {
        const captured = await this.deps.capturePairingMessage?.(message);
        if (captured) {
          await record("received", { resultSummary: "pairing_captured" });
          return;
        }
      }
    }

    // 5. 准入
    const admission = await this.deps.getProviderAdmission(message.provider);
    if (decideRobotAdmission(message, admission) === "ignored") {
      this.log.info({ provider: message.provider, status: "admission_ignored", messageIdHash: maskIdentity(message.messageId) });
      await record("ignored");
      return;
    }

    // 6. 长度限制
    if (message.text.length > settings.maxMessageLength) {
      await this.replyText(message, "消息过长，已忽略。", "status");
      await record("ignored", { resultSummary: "message_too_long" });
      return;
    }

    // 7. 非文本消息
    if (message.messageType !== "text") {
      await this.replyText(message, ROBOT_TEXT_UNSUPPORTED_REPLY, "status");
      await record("ignored", { resultSummary: "unsupported_message_type" });
      return;
    }

    // 8. 确认 / 取消回复
    const chatKey = this.chatKeyFor(message, true);
    const pending = this.pendingByChat.get(chatKey);
    const command = parseRobotCommand(message.text);
    if (pending && command?.kind === "confirm" && pending.confirmation.senderId === message.senderId) {
      // 先启动回执发送，再释放 Agent 的工具调用；用户能立即看到确认已被接收，
      // 同时不让回复接口的耗时继续卡住原始 turn。
      const acknowledgement = this.replyText(message, "已确认，正在执行…", "status");
      this.resolvePending(pending, "approved");
      await acknowledgement;
      await record("executed", { resultSummary: "confirmation_approved" });
      return;
    }
    if (pending && command?.kind === "cancel" && pending.confirmation.senderId === message.senderId) {
      this.resolvePending(pending, "rejected");
      await this.replyText(message, "已取消该操作。", "status");
      await record("ignored", { resultSummary: "confirmation_rejected" });
      return;
    }

    // 9. 机器人内部命令
    if (command && !pending) {
      await this.handleInternalCommand(message, command);
      await record("executed", { resultSummary: `command_${command.kind}` });
      return;
    }

    // 10. Agent turn（按会话串行 + 全局并发上限）
    await this.enqueueAgentTurn(message, settings, startedAt);
  }

  /** 供 Agent runtime 在工具需要确认时调用；返回用户确认结果。 */
  async requestConfirmation(confirmation: RobotConfirmation, promptText: string): Promise<RobotConfirmationOutcome> {
    const chatKey = `${confirmation.provider}:${confirmation.accountId}:${confirmation.chatId}:${confirmation.senderId}`;
    const existing = this.pendingByChat.get(chatKey);
    if (existing) this.resolvePending(existing, "expired");

    await this.deps.confirmationStore.put(confirmation);

    // 必须在把提示发到远端之前登记 pending。否则用户极快回复“确认”时，
    // 入站消息可能先于 pending 创建，被误判为“没有等待确认的操作”。
    const outcome = new Promise<RobotConfirmationOutcome>((resolve) => {
      const ttl = Math.max(confirmation.expiresAt - this.now(), 1000);
      let cancelTimer: (() => void) | null = null;
      cancelTimer = this.timeout(() => {
        this.pendingByChat.delete(chatKey);
        this.pendingById.delete(confirmation.confirmationId);
        void this.deps.confirmationStore.delete(confirmation.confirmationId).catch(() => {});
        resolve("expired");
      }, ttl);
      const wait: PendingConfirmationWait = {
        confirmation,
        resolve: (result) => {
          if (this.pendingByChat.get(chatKey)?.confirmation.confirmationId === confirmation.confirmationId) {
            this.pendingByChat.delete(chatKey);
          }
          this.pendingById.delete(confirmation.confirmationId);
          cancelTimer?.();
          void this.deps.confirmationStore.delete(confirmation.confirmationId).catch(() => {});
          resolve(result);
        },
        timerId: null,
      };
      this.pendingByChat.set(chatKey, wait);
      this.pendingById.set(confirmation.confirmationId, { wait, chatKey });
    });

    await this.replyText(
      {
        provider: confirmation.provider,
        accountId: confirmation.accountId,
        chatId: confirmation.chatId,
        senderId: confirmation.senderId,
      } as unknown as NormalizedRobotMessage,
      promptText,
      "confirmation",
    );
    return outcome;
  }

  /** 设置页 / 管理端按 confirmationId 批准挂起确认（拥有设置权限即视为授权方）。 */
  async approvePendingConfirmation(confirmationId: string): Promise<RobotConfirmationOutcome | null> {
    const entry = this.pendingById.get(confirmationId);
    if (!entry) return null;
    this.resolvePending(entry.wait, "approved");
    return "approved";
  }

  /** 设置页 / 管理端按 confirmationId 取消挂起确认。 */
  async cancelPendingConfirmation(confirmationId: string): Promise<RobotConfirmationOutcome | null> {
    const entry = this.pendingById.get(confirmationId);
    if (!entry) return null;
    this.resolvePending(entry.wait, "rejected");
    return "rejected";
  }

  /** 当前挂起确认数量（供 getStatus / 管理端摘要，不返回敏感内容）。 */
  pendingConfirmationCount(): number {
    return this.pendingById.size;
  }

  /**
   * 冷启动读取持久化确认。Agent 调用栈无法跨 Goja 进程安全恢复，因此一律安全失效，
   * 防止重启后仅凭过期的“确认”消息执行没有原始调用上下文的写操作。
   */
  async expirePersistedConfirmations(): Promise<number> {
    const confirmations = await this.deps.confirmationStore.list?.() ?? [];
    for (const confirmation of confirmations) {
      await this.deps.confirmationStore.delete(confirmation.confirmationId);
    }
    return confirmations.length;
  }

  /** 构建 Robot Agent 上下文（provider / chat / sender / 时间 / allowlist）。 */
  async buildRobotPromptContext(message: NormalizedRobotMessage, allowlistedTools: string[]): Promise<RobotPromptContext> {
    return {
      provider: message.provider,
      chatType: message.chatType,
      senderId: message.senderId,
      senderName: message.senderName,
      nowIso: new Date(this.now()).toISOString(),
      allowlistedTools,
    };
  }

  private resolvePending(wait: PendingConfirmationWait, outcome: RobotConfirmationOutcome): void {
    wait.resolve(outcome);
  }

  private async handleInternalCommand(message: NormalizedRobotMessage, command: RobotInternalCommand): Promise<void> {
    const settings = await this.deps.getSettings();
    switch (command.kind) {
      case "help": {
        const ctx = await this.buildRobotPromptContext(message, []);
        await this.replyText(message, buildRobotHelpReply(ctx), "status");
        return;
      }
      case "status": {
        const status = await this.deps.getProviderStatus(message.provider);
        const text = [
          `当前渠道：${message.provider}`,
          `Provider 状态：${status.status}`,
          settings.agentModel === "explicit" ? "Agent 模型：显式选择" : "Agent 模型：使用 AI 知识库当前模型",
        ].join("\n");
        await this.replyText(message, text, "status");
        return;
      }
      case "new_session": {
        const key = this.sessionService.keyFromParts({
          provider: message.provider,
          accountId: message.accountId,
          chatId: message.chatId,
          senderId: message.senderId,
        });
        await this.sessionService.create(key, createRobotId(), "新对话", this.now());
        await this.replyText(message, "已新建并切换到一个空白对话；旧对话仍可在思源设置中查看和重新设为默认。", "status");
        return;
      }
      case "cancel": {
        await this.replyText(message, "没有进行中的操作。", "status");
        return;
      }
      case "confirm": {
        await this.replyText(message, "没有等待确认的操作。", "status");
        return;
      }
      default:
        return;
    }
  }

  private async enqueueAgentTurn(
    message: NormalizedRobotMessage,
    settings: RobotAssistantSettings,
    startedAt: number,
  ): Promise<void> {
    const key = this.sessionService.keyFromParts({
      provider: message.provider,
      accountId: message.accountId,
      chatId: message.chatId,
      senderId: message.senderId,
    });
    const queueKey = this.chatKeyFor(message, true);
    const previous = this.sessionQueues.get(queueKey) ?? Promise.resolve();
    await this.appendHistory(buildRobotHistoryItem({
      id: createRobotId(),
      provider: message.provider,
      direction: "in",
      senderMasked: maskIdentity(message.senderId),
      chatMasked: maskIdentity(message.chatId),
      messageId: message.messageId,
      contentPreview: message.text.slice(0, 120),
      resultSummary: "agent_queued",
      status: "received",
      durationMs: this.now() - startedAt,
      createdAt: startedAt,
    }));
    const task = previous.catch(() => undefined).then(async () => {
      if (!(await this.deps.isEntitlementAvailable())) {
        await this.replyText(message, "机器人助手为高级能力，当前不可用。", "status");
        return { ok: false, resultSummary: "entitlement_unavailable", toolSummary: "" };
      }
      const release = await this.acquireGlobalTurn(settings.maxConcurrentTurns);
      try {
        const session = await this.sessionService.load(key, createRobotId(), settings.sessionTtlMs, this.now());
        const allowlistedTools = Object.entries(settings.robotToolPolicy.tools)
          .filter(([, policy]) => policy.remoteAllowed)
          .map(([toolName]) => toolName);
        const ctx = await this.buildRobotPromptContext(message, allowlistedTools);
        const systemPrompt = buildRobotSystemPrompt(ctx);
        const result = await this.runAgentTurnWithTimeout(message, session, systemPrompt, settings);
        await this.finishAgentTurn(message, session, result, settings);
        return {
          ok: result.ok,
          resultSummary: result.ok ? "agent_completed" : result.errorCode ?? "agent_failed",
          toolSummary: result.toolSummaries.map((tool) => tool.action ? `${tool.toolName}.${tool.action}` : tool.toolName).join(", "),
        };
      } finally {
        release();
      }
    });
    this.sessionQueues.set(queueKey, task.catch(() => undefined));
    let outcome: { ok: boolean; resultSummary: string; toolSummary: string };
    try {
      outcome = await task;
    } catch (error) {
      const messageText = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
      this.log.error({
        provider: message.provider,
        status: "agent_turn_exception",
        messageIdHash: maskIdentity(message.messageId),
        errorCode: "agent_turn_exception",
        message: messageText,
      });
      try {
        await this.replyText(message, "AI Agent 执行异常，请查看机器人会话记录后重试。", "error");
      } catch {
        // 回复失败仍必须写入入站失败记录。
      }
      await this.appendHistory(buildRobotHistoryItem({
        id: createRobotId(),
        provider: message.provider,
        direction: "in",
        senderMasked: maskIdentity(message.senderId),
        chatMasked: maskIdentity(message.chatId),
        messageId: message.messageId,
        contentPreview: message.text.slice(0, 120),
        resultSummary: `agent_turn_exception: ${messageText}`,
        status: "failed",
        durationMs: this.now() - startedAt,
        createdAt: startedAt,
      }));
      return;
    }
    await this.appendHistory(buildRobotHistoryItem({
      id: createRobotId(),
      provider: message.provider,
      direction: "in",
      senderMasked: maskIdentity(message.senderId),
      chatMasked: maskIdentity(message.chatId),
      messageId: message.messageId,
      contentPreview: message.text.slice(0, 120),
      resultSummary: outcome.resultSummary,
      ...(outcome.toolSummary ? { toolSummary: outcome.toolSummary } : {}),
      status: outcome.ok ? "executed" : "failed",
      durationMs: this.now() - startedAt,
      createdAt: startedAt,
    }));
  }

  private async runAgentTurnWithTimeout(
    message: NormalizedRobotMessage,
    session: RobotSessionState,
    systemPrompt: string,
    settings: RobotAssistantSettings,
  ): Promise<RobotAgentTurnResult> {
    return await this.deps.agentRuntime.runTurn({
      session,
      userText: message.text,
      provider: message.provider,
      accountId: message.accountId,
      chatId: message.chatId,
      chatType: message.chatType,
      senderId: message.senderId,
      senderName: message.senderName,
      conversationId: session.conversationId,
      systemPrompt,
      toolPolicy: settings.robotToolPolicy,
      modelTimeoutMs: settings.modelTimeoutMs,
      turnTimeoutMs: settings.turnTimeoutMs,
    });
  }

  private async acquireGlobalTurn(maxConcurrentTurns: number): Promise<() => void> {
    const limit = Math.max(1, Math.round(maxConcurrentTurns));
    if (this.activeTurns >= limit) {
      await new Promise<void>((resolve) => this.globalWaiters.push(resolve));
    }
    this.activeTurns += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeTurns = Math.max(0, this.activeTurns - 1);
      this.globalWaiters.shift()?.();
    };
  }

  private async finishAgentTurn(
    message: NormalizedRobotMessage,
    session: RobotSessionState,
    result: RobotAgentTurnResult,
    settings: RobotAssistantSettings,
  ): Promise<void> {
    const now = this.now();
    session.recentMessages.push({ role: "user", content: message.text.slice(0, 4000), createdAt: now });
    if (result.ok && result.answer) {
      session.recentMessages.push({ role: "assistant", content: result.answer.slice(0, 8000), createdAt: now });
    }
    if (Array.isArray(result.agentMessages)) session.agentMessages = result.agentMessages;
    if (!session.title || session.title === "新对话" || session.title === "远程对话") {
      session.title = message.text.trim().replace(/\s+/g, " ").slice(0, 32) || "远程对话";
    }
    if (result.toolSummaries.length > 0) {
      session.toolCallSummaries.push(...result.toolSummaries.map((tool) => ({
        toolName: tool.toolName,
        ...(tool.action ? { action: tool.action } : {}),
        summary: tool.summary,
        createdAt: now,
      })));
      session.toolCallSummaries = session.toolCallSummaries.slice(-20);
    }
    // 可视记录保留最近 200 条；实际 Agent 上下文由 agentMessages 的存储级压缩负责，
    // 不会把 200 条原文无界塞回模型。
    session.recentMessages = session.recentMessages.slice(-200);
    await this.sessionService.save(session, now);

    if (!result.ok) {
      await this.replyText(message, result.errorCode === "provider_timeout"
        ? "AI 模型响应超时，请稍后再试。"
        : "AI 服务当前不可用，请稍后重试。", "error");
      return;
    }
    const chunks = splitRobotReply(result.answer, settings.maxReplyChars);
    for (const chunk of chunks) {
      const delivery = await this.deps.sendOutbound({
        provider: message.provider,
        accountId: message.accountId,
        chatId: message.chatId,
        replyToMessageId: message.messageId,
        contextToken: message.contextToken,
        text: chunk,
        kind: "text",
      });
      if (!delivery.ok) {
        this.log.error({
          provider: message.provider,
          status: "outbound_failed",
          messageIdHash: maskIdentity(message.messageId),
          errorCode: delivery.errorCode ?? "outbound_failed",
          message: delivery.message?.slice(0, 160),
        });
        await this.recordOutbound(message, delivery.errorCode ?? "微信回复发送失败", "text", "failed");
        return;
      }
    }
    await this.recordOutbound(message, result.answer.slice(0, 120), "text");
  }

  private async recordOutbound(
    message: NormalizedRobotMessage,
    text: string,
    kind: RobotOutboundMessage["kind"],
    status: RobotHistoryItemStatus = "sent",
  ): Promise<void> {
    await this.appendHistory(buildRobotHistoryItem({
      id: createRobotId(),
      provider: message.provider,
      direction: "out",
      senderMasked: maskIdentity(message.senderId),
      chatMasked: maskIdentity(message.chatId),
      messageId: message.messageId,
      resultSummary: text.slice(0, 120),
      status,
      createdAt: this.now(),
    }));
    void kind;
  }

  private async replyText(
    message: NormalizedRobotMessage,
    text: string,
    kind: RobotOutboundMessage["kind"],
  ): Promise<void> {
    const delivery = await this.deps.sendOutbound({
      provider: message.provider,
      accountId: message.accountId,
      chatId: message.chatId,
      replyToMessageId: message.messageId,
      contextToken: message.contextToken,
      text,
      kind,
    });
    if (!delivery.ok) {
      this.log.error({
        provider: message.provider,
        status: "outbound_failed",
        messageIdHash: maskIdentity(message.messageId),
        errorCode: delivery.errorCode ?? "outbound_failed",
        message: delivery.message?.slice(0, 160),
      });
      await this.recordOutbound(message, delivery.errorCode ?? "回复发送失败", kind, "failed");
      return;
    }
    await this.recordOutbound(message, text, kind);
  }
}

type RobotHistoryItemStatus = "received" | "ignored" | "rejected" | "executed" | "failed" | "sent";


