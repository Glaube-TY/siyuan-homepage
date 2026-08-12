import type { RobotAgentRuntime, RobotAgentTurnInput, RobotAgentTurnResult, RobotAgentToolSummary } from "./robot-agent-runtime";
import { NativeToolAgentLoop } from "../../../features/kb/services/agent-core/loop/native-tool-agent-loop";
import { AgentSession } from "../../../features/kb/services/agent-core/session/agent-session";
import type { AgentMessage } from "../../../features/kb/services/agent-core/messages/agent-message";
import { compactAgentSessionMessagesForStorage } from "../../../features/kb/services/agent-core/messages/message-compactor";
import { createProviderAdapterForKbModel } from "../../../features/kb/services/agent-core/providers/agent-provider-factory";
import { NativeToolRegistry } from "../../../features/kb/services/agent-core/tools/native-tool-registry";
import type { AgentHttpTransport } from "../../../features/kb/services/agent-core/providers/agent-http-transport";
import type { KbChatModelConfig, KbChatProviderConfig, KbChatProviderType } from "../../../features/kb/types/settings";
import type { RobotModelConfigStore } from "../runtime/robot-model-config";
import type { RobotConfirmation } from "../contracts/robot-confirmation";
import { RobotConfirmationBridge } from "./robot-confirmation-bridge";
import type { RobotConfirmationOutcome } from "../core/robot-core";
import {
  agentProfileAllowsTool,
  agentProfileAllowsMemory,
  getAgentProfile,
  ROBOT_AGENT_PROFILE_ID,
  type AgentProfile,
} from "../../../features/agent-platform/agent-profile";
import { buildGlobalMemoryContext } from "../../../features/kb/services/agent-workbench/memory/global-memory-store";

export interface KernelRobotAgentRuntimeDeps {
  /** Kernel HTTP transport（siyuan.client.fetch → forwardProxy），stream:false。 */
  transport: AgentHttpTransport;
  /** Kernel-safe 工具注册表（buildRobotKernelToolRegistry）。 */
  toolRegistry: NativeToolRegistry;
  modelConfigStore: RobotModelConfigStore;
  /** 从 Robot Secret Vault 读取 API Key；无则返回 null。 */
  getApiKey(): Promise<string | null>;
  requestConfirmation(confirmation: RobotConfirmation, promptText: string): Promise<RobotConfirmationOutcome>;
  /** 调度/取消定时器；不传则用 globalThis.setTimeout。 */
  timeout?(fn: () => void, ms: number): () => void;
  maxToolCalls?: number;
}

/**
 * Kernel 版 Robot Agent runtime。
 * 复用共享 `NativeToolAgentLoop` + KernelAgentHttpTransport（非流式）+ 注入的 Kernel-safe tool registry；
 * 不复制第二套 Agent loop，不依赖 window / Svelte / DOM。
 */
export class KernelRobotAgentRuntime implements RobotAgentRuntime {
  constructor(private readonly deps: KernelRobotAgentRuntimeDeps) {}

  async runTurn(input: RobotAgentTurnInput): Promise<RobotAgentTurnResult> {
    const profile = getAgentProfile(ROBOT_AGENT_PROFILE_ID);
    const snapshot = await this.deps.modelConfigStore.get();
    if (!snapshot) {
      return { ok: false, answer: "机器人模型配置尚未同步，请在设置中选择 AI 知识库当前模型。", errorCode: "model_config_missing", toolSummaries: [], conversationId: input.conversationId };
    }

    const apiKey = await this.deps.getApiKey();
    const provider = this.toProviderConfig(snapshot, apiKey);
    const model: KbChatModelConfig = {
      id: snapshot.modelId,
      name: snapshot.modelId,
      temperature: snapshot.temperature ?? 0.3,
      ...(snapshot.maxTokens !== undefined ? { maxTokens: snapshot.maxTokens } : {}),
    };
    const adapter = createProviderAdapterForKbModel({
      provider,
      model,
      thinkingMode: "off",
      agentThinkingEnabled: false,
      overrides: {
        transport: this.deps.transport,
        stream: false,
        requestTimeoutMs: input.modelTimeoutMs,
      },
    });

    const persistedAgentMessages = Array.isArray(input.session.agentMessages) ? input.session.agentMessages : [];
    const session = new AgentSession(input.conversationId, persistedAgentMessages);

    const bridge = new RobotConfirmationBridge({
      provider: input.provider,
      accountId: input.accountId,
      chatId: input.chatId,
      senderId: input.senderId,
      requestConfirmation: this.deps.requestConfirmation,
      toolPolicy: input.toolPolicy,
    });

    const turnRegistry = this.createTurnRegistry(input.toolPolicy, profile);
    const memoryContext = agentProfileAllowsMemory(profile, "read")
      ? await buildGlobalMemoryContext(input.userText, { limit: 8, maxChars: 4000 })
      : undefined;

    const abort = new AbortController();
    let timedOut = false;
    const cancelTimeout = this.scheduleTimeout(() => {
      timedOut = true;
      abort.abort();
    }, input.turnTimeoutMs);

    const loop = new NativeToolAgentLoop({
      provider: adapter,
      toolRegistry: turnRegistry,
      session,
      conversationId: input.conversationId,
      systemPrompt: input.systemPrompt,
      contextInstructions: memoryContext
        ? `# User Long-term Memory\nUse these user facts silently. Current user input wins on conflicts. Never expose memory IDs or storage implementation.\n${memoryContext}`
        : undefined,
      bridge,
      maxToolCalls: this.deps.maxToolCalls ?? profile.execution.defaultMaxToolCalls,
      abortSignal: abort.signal,
    });
    const initialMessageCount = session.messageCount();

    try {
      const result = await loop.run(input.userText);
      const agentMessages = compactAgentSessionMessagesForStorage(result.messages);
      if (timedOut) {
        return { ok: false, answer: "AI 模型响应超时，请稍后再试。", errorCode: "provider_timeout", toolSummaries: [], conversationId: input.conversationId, agentMessages };
      }
      if (result.status !== "answer_ready") {
        return {
          ok: false,
          answer: result.answer || "AI 服务当前不可用，请稍后重试。",
          errorCode: result.errorCode ?? "agent_failed",
          toolSummaries: extractToolSummaries(result.messages.slice(initialMessageCount)),
          conversationId: input.conversationId,
          agentMessages,
        };
      }
      return {
        ok: true,
        answer: result.answer,
        toolSummaries: extractToolSummaries(result.messages.slice(initialMessageCount)),
        conversationId: input.conversationId,
        agentMessages,
      };
    } catch (error) {
      const providerTimedOut = error && typeof error === "object"
        && (error as { code?: unknown }).code === "provider_timeout";
      const timeout = timedOut || providerTimedOut;
      const runtimeCode = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
        ? String((error as { code: string }).code).slice(0, 80)
        : "agent_failed";
      return {
        ok: false,
        answer: timeout ? "AI 模型响应超时，请稍后再试。" : "AI 服务当前不可用，请稍后重试。",
        errorCode: timeout ? "provider_timeout" : runtimeCode,
        toolSummaries: [],
        conversationId: input.conversationId,
        agentMessages: compactAgentSessionMessagesForStorage(session.snapshot()),
      };
    } finally {
      cancelTimeout();
    }
  }

  private createTurnRegistry(policy: RobotAgentTurnInput["toolPolicy"], profile: AgentProfile): NativeToolRegistry {
    const registry = new NativeToolRegistry();
    for (const tool of this.deps.toolRegistry.list()) {
      const explicit = policy.tools[tool.name];
      const allowed = explicit
        ? explicit.remoteAllowed
        : tool.readOnly && policy.readOnlyDefaultAllowed;
      if (allowed && agentProfileAllowsTool(profile, tool.name)) registry.register(tool);
    }
    return registry;
  }

  private scheduleTimeout(fn: () => void, ms: number): () => void {
    if (this.deps.timeout) return this.deps.timeout(fn, ms);
    if (typeof globalThis.setTimeout === "function" && typeof globalThis.clearTimeout === "function") {
      const id = globalThis.setTimeout(fn, ms);
      return () => globalThis.clearTimeout(id);
    }
    return () => {};
  }

  private toProviderConfig(snapshot: { providerId: string; providerType: string; baseUrl?: string; nativeCompatibility?: Record<string, unknown> }, apiKey: string | null): KbChatProviderConfig {
    return {
      id: snapshot.providerId,
      name: snapshot.providerId,
      type: snapshot.providerType as KbChatProviderType,
      baseUrl: snapshot.baseUrl ?? "",
      ...(apiKey ? { apiKey } : {}),
      enabled: true,
      models: [],
      ...(snapshot.nativeCompatibility ? { providerNativeAgentCompatibility: snapshot.nativeCompatibility as KbChatProviderConfig["providerNativeAgentCompatibility"] } : {}),
    };
  }
}

function extractToolSummaries(messages: readonly AgentMessage[]): RobotAgentToolSummary[] {
  const calls = new Map<string, { toolName: string; action?: string }>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      let action: string | undefined;
      try {
        const args = JSON.parse(call.arguments) as unknown;
        if (args && typeof args === "object" && !Array.isArray(args) && typeof (args as Record<string, unknown>).action === "string") {
          action = String((args as Record<string, unknown>).action).slice(0, 80);
        }
      } catch {
        // 参数损坏时仍记录工具名。
      }
      calls.set(call.id, { toolName: call.name, ...(action ? { action } : {}) });
    }
  }

  const seen = new Set<string>();
  const summaries: RobotAgentToolSummary[] = [];
  for (const message of messages) {
    if (message.role !== "tool" || typeof message.name !== "string" || !message.name) continue;
    const call = calls.get(message.toolCallId);
    const identity = message.toolCallId || `${message.name}:${summaries.length}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    let summary = "工具已执行";
    try {
      const parsed = JSON.parse(message.content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const value = parsed as Record<string, unknown>;
        const ok = value.ok === true;
        const error = value.error && typeof value.error === "object" ? value.error as Record<string, unknown> : {};
        const code = typeof value.errorCode === "string"
          ? value.errorCode
          : typeof error.code === "string"
            ? error.code
            : "";
        summary = ok ? "执行成功" : `执行失败${code ? `：${code.slice(0, 80)}` : ""}`;
      }
    } catch {
      // 非 JSON 结果只显示稳定摘要。
    }
    summaries.push({
      toolName: call?.toolName ?? message.name,
      ...(call?.action ? { action: call.action } : {}),
      summary,
    });
  }
  return summaries;
}
