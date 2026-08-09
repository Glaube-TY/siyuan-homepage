import assert from "node:assert/strict";
import { RobotCore } from "../src/features/robot-assistant/core/robot-core";
import { RobotDedupCache } from "../src/features/robot-assistant/core/robot-dedup";
import { createDefaultRobotAssistantSettings } from "../src/features/robot-assistant/settings/robot-settings-types";
import type { NormalizedRobotMessage, RobotOutboundMessage } from "../src/features/robot-assistant/contracts/robot-message";
import type { RobotSessionKey, RobotSessionState } from "../src/features/robot-assistant/contracts/robot-session";
import type { RobotConfirmation } from "../src/features/robot-assistant/contracts/robot-confirmation";
import type { RobotHistoryItem } from "../src/features/robot-assistant/contracts/robot-history";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, label: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`timeout: ${label}`);
    await delay(5);
  }
}

function keyOf(key: RobotSessionKey): string {
  return JSON.stringify(key);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const conversations = new Map<string, RobotSessionState>();
const active = new Map<string, string>();
const histories: RobotHistoryItem[] = [];
const confirmations = new Map<string, RobotConfirmation>();
const outbound: RobotOutboundMessage[] = [];
const runs: string[] = [];
let releaseBurst!: () => void;
const burstGate = new Promise<void>((resolve) => { releaseBurst = resolve; });
let releaseBusy!: () => void;
const busyGate = new Promise<void>((resolve) => { releaseBusy = resolve; });
let core!: RobotCore;

const settings = createDefaultRobotAssistantSettings();
settings.enabled = true;
settings.activeProvider = "feishu";
settings.maxConcurrentTurns = 2;
settings.feishu.admission.allowedSenderIds = ["user"];
settings.feishu.admission.allowedChatIds = ["chat-main", "chat-burst", "chat-confirm", "chat-cancel", "chat-busy", "chat-dedup"];

const sessionStore = {
  async get(key: RobotSessionKey) {
    const id = active.get(keyOf(key));
    return id && conversations.has(id) ? clone(conversations.get(id)!) : null;
  },
  async put(state: RobotSessionState) {
    conversations.set(state.conversationId, clone(state));
    active.set(keyOf(state.key), state.conversationId);
  },
  async list() { return [...conversations.values()].map(clone); },
  async create(state: RobotSessionState) {
    conversations.set(state.conversationId, clone(state));
    active.set(keyOf(state.key), state.conversationId);
  },
  async activate(key: RobotSessionKey, conversationId: string) {
    if (!conversations.has(conversationId)) return false;
    active.set(keyOf(key), conversationId);
    return true;
  },
  async rename(conversationId: string, title: string) {
    const state = conversations.get(conversationId);
    if (!state) return false;
    state.title = title;
    return true;
  },
  async delete(conversationId: string) { return conversations.delete(conversationId); },
  async reset(key: RobotSessionKey) { active.delete(keyOf(key)); },
};

core = new RobotCore({
  getSettings: async () => settings,
  isEntitlementAvailable: async () => true,
  getProviderAdmission: async () => settings.feishu.admission,
  getProviderStatus: async () => ({
    provider: "feishu",
    runtimeKind: "electron",
    availability: "available",
    status: "connected",
    updatedAt: Date.now(),
  }),
  sessionStore,
  historyStore: {
    async append(item) { histories.push(clone(item)); },
    async list(limit) { return histories.slice(-limit).map(clone); },
    async clear() { histories.length = 0; },
  },
  confirmationStore: {
    async get(id) { return confirmations.get(id) ?? null; },
    async put(value) { confirmations.set(value.confirmationId, clone(value)); },
    async delete(id) { confirmations.delete(id); },
    async list() { return [...confirmations.values()].map(clone); },
  },
  dedup: new RobotDedupCache(),
  agentRuntime: {
    async runTurn(input) {
      runs.push(input.userText);
      if (input.userText.startsWith("burst-")) await burstGate;
      if (input.userText === "busy") await busyGate;
      if (input.userText.startsWith("write")) {
        const outcome = await core.requestConfirmation({
          confirmationId: `confirm-${input.userText}`,
          provider: input.provider,
          accountId: input.accountId,
          chatId: input.chatId,
          senderId: input.senderId,
          toolName: "homepage_accounting",
          action: "add_record",
          safePreview: "新增测试流水",
          resumeState: {},
          createdAt: Date.now(),
          expiresAt: Date.now() + 2_000,
        }, `CONFIRM:${input.userText}`);
        return outcome === "approved"
          ? { ok: true, answer: "WRITE_OK", toolSummaries: [], conversationId: input.conversationId }
          : { ok: false, answer: "WRITE_CANCELLED", errorCode: outcome, toolSummaries: [], conversationId: input.conversationId };
      }
      await delay(5);
      return { ok: true, answer: `ANSWER:${input.userText}`, toolSummaries: [], conversationId: input.conversationId };
    },
  },
  async sendOutbound(message) {
    outbound.push(clone(message));
    return { ok: true };
  },
});

let messageCounter = 0;
function message(text: string, chatId = "chat-main", messageId?: string): NormalizedRobotMessage {
  messageCounter += 1;
  return {
    provider: "feishu",
    accountId: "app",
    messageId: messageId ?? `m-${messageCounter}`,
    senderId: "user",
    chatId,
    chatType: "private",
    text,
    messageType: "text",
    isFromBot: false,
    isMentioned: false,
    receivedAt: Date.now(),
  };
}

// 1. 突发消息严格 FIFO；同一会话最多保留 6 个 turn，第 7 个明确拒绝。
await Promise.all(Array.from({ length: 7 }, (_, index) => core.handleIncomingMessage(message(`burst-${index + 1}`, "chat-burst"))));
await waitFor(() => runs.some((text) => text === "burst-1"), "first burst turn started");
assert.equal(runs.filter((text) => text.startsWith("burst-")).length, 1, "only the first burst turn may run before release");
assert.ok(outbound.some((item) => item.text.includes("本条消息未加入队列")), "queue overflow must be visible");
releaseBurst();
await waitFor(() => runs.filter((text) => text.startsWith("burst-")).length === 6, "six burst turns executed");
assert.deepEqual(runs.filter((text) => text.startsWith("burst-")), [
  "burst-1", "burst-2", "burst-3", "burst-4", "burst-5", "burst-6",
]);

// 2. 等待确认时，其他文字立即拒绝且绝不悄悄进入 Agent 队列。
await core.handleIncomingMessage(message("write", "chat-confirm"));
await waitFor(() => outbound.some((item) => item.text === "CONFIRM:write"), "confirmation prompt");
const confirmationNoise = Array.from({ length: 12 }, (_, index) => `随便输入-${index + 1}`);
const noiseTasks = confirmationNoise.map((text) => core.handleIncomingMessage(message(text, "chat-confirm")));
const confirmTask = core.handleIncomingMessage(message("确认", "chat-confirm"));
await confirmTask;
await Promise.all(noiseTasks);
assert.ok(outbound.some((item) => item.text.includes("刚才的消息未加入执行队列")));
assert.equal(
  outbound.filter((item) => item.chatId === "chat-confirm" && item.text.includes("刚才的消息未加入执行队列")).length,
  1,
  "invalid confirmation reminders must be throttled",
);
assert.ok(!runs.some((text) => confirmationNoise.includes(text)), "invalid confirmation input must not reach Agent");

// 3. 确认消息旁路执行队列，立即解除挂起写操作；重复确认返回幂等状态。
await waitFor(() => outbound.some((item) => item.text === "WRITE_OK"), "confirmed write result");
await core.handleIncomingMessage(message("确认", "chat-confirm"));
assert.ok(outbound.some((item) => item.text.includes("已经确认并进入执行")));

// 4. 取消会解除挂起，但不会被误报为 AI 服务异常；重复取消同样幂等。
await core.handleIncomingMessage(message("write-cancel", "chat-cancel"));
await waitFor(() => outbound.some((item) => item.chatId === "chat-cancel" && item.text === "CONFIRM:write-cancel"), "cancel prompt");
await core.handleIncomingMessage(message("取消", "chat-cancel"));
await waitFor(() => outbound.some((item) => item.chatId === "chat-cancel" && item.text.includes("操作已取消")), "cancelled result");
await core.handleIncomingMessage(message("取消", "chat-cancel"));
assert.ok(outbound.some((item) => item.chatId === "chat-cancel" && item.text === "该操作已经取消。"));

// 5. Agent 忙时禁止“新会话”越过旧 turn，避免旧会话保存结果覆盖新会话绑定。
await core.handleIncomingMessage(message("busy", "chat-busy"));
await waitFor(() => runs.includes("busy"), "busy turn started");
await core.handleIncomingMessage(message("新会话", "chat-busy"));
assert.ok(outbound.some((item) => item.chatId === "chat-busy" && item.text.includes("暂不能切换新会话")));
releaseBusy();

// 6. 同一平台 messageId 重投只执行一次。
await core.handleIncomingMessage(message("dedup", "chat-dedup", "stable-id"));
await core.handleIncomingMessage(message("dedup", "chat-dedup", "stable-id"));
await waitFor(() => runs.filter((text) => text === "dedup").length === 1, "dedup run");
assert.equal(runs.filter((text) => text === "dedup").length, 1);

console.log("robot core extreme scenarios: ok");
