import assert from "node:assert/strict";
import { buildConversationContext } from "../src/features/kb/services/agent-workbench/runtime/conversation-context-builder";
import {
  buildAgentResumeProgress,
  getAgentRecoveryContextFingerprint,
  hasAgentResumeProgress,
  inspectAgentRunResume,
  markAgentRunCheckpointNoProgress,
  type AgentRunCheckpoint,
} from "../src/features/kb/services/agent-core/session/agent-run-checkpoint";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import { NativeToolRegistry } from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
import type { AgentStreamEvent } from "../src/features/kb/services/agent-core/loop/stream-event";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import type { ChatMessage } from "../src/features/kb/types/chat";
import { AgentSession } from "../src/features/kb/services/agent-core/session/agent-session";
import { sanitizeMessageForStorage } from "../src/features/kb/services/agent-core/session/session-store";
import { compactAgentSessionMessagesForStorage } from "../src/features/kb/services/agent-core/messages/message-compactor";

function history(turnCount: number): ChatMessage[] {
  const compactThrough = Math.max(0, turnCount - 10);
  const messages: ChatMessage[] = [];
  for (let turn = 1; turn <= turnCount; turn++) {
    const compacted = turn <= compactThrough || undefined;
    messages.push({ id: `u-${turn}`, role: "user", content: `第${turn}轮事实`, createdAt: turn * 2, compacted });
    messages.push({
      id: `a-${turn}`,
      role: "assistant",
      content: turn === turnCount ? "最新修正：项目代号应为 B，不再是 A。" : `第${turn}轮回答`,
      createdAt: turn * 2 + 1,
      isComplete: true,
      compacted,
    });
  }
  messages.push({ id: "current", role: "user", content: "项目代号是什么？", createdAt: 9999 });
  return messages;
}

for (const turnCount of [10, 30, 100]) {
  const compactThrough = Math.max(0, turnCount - 10);
  const context = buildConversationContext({
    messages: history(turnCount),
    currentUserMessageId: "current",
    currentQuestion: "项目代号是什么？",
    compressedContextSummary: compactThrough ? `第1-${compactThrough}轮历史事实摘要` : undefined,
    compressionState: compactThrough
      ? { enabled: true, latestCompressedTurnIndex: compactThrough, compressedTurnCount: compactThrough }
      : undefined,
  });
  assert.equal(context.currentTurn.userQuestion, "项目代号是什么？");
  assert.equal(context.recentTurns.length, Math.min(turnCount, 10));
  assert.match(context.recentTurns[context.recentTurns.length - 1]?.assistant?.finalAnswer ?? "", /项目代号应为 B/);
  assert.ok(context.manifest.entries.some((item) => item.source === "current-turn" && item.included));
  assert.ok(context.manifest.estimatedTokens > 0);
  if (compactThrough) {
    const summary = context.manifest.entries.find((item) => item.source === "compressed-history");
    assert.equal(summary?.coverage?.endTurnIndex, compactThrough);
  }
}

const compactInput = Array.from({ length: 60 }, (_, index) => (
  index % 2 === 0
    ? { role: "user" as const, content: `历史问题 ${index}` }
    : { role: "assistant" as const, content: `历史回答 ${index}` }
));
const compactedTwice = compactAgentSessionMessagesForStorage([
  ...compactAgentSessionMessagesForStorage(compactInput),
  ...compactInput.slice(0, 20),
]);
assert.equal(
  compactedTwice.filter((message) => message.role === "system" && message.content.startsWith("Agent session storage compacted by runtime.")).length,
  1,
);

class WriteFailureProvider implements ProviderAdapter {
  readonly id = "write-failure";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  async *streamChat(_request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    yield { type: "tool_call_done", toolCall: { id: "write-1", name: "unsafe_write", arguments: "{}" } };
    yield { type: "done", finishReason: "tool_calls" };
  }
}

const registry = new NativeToolRegistry();
registry.register({
  name: "unsafe_write",
  title: "写入测试",
  description: "验证未知副作用不会重放",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  readOnly: false,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: false, canWrite: true },
  async execute() { throw new Error("connection lost after dispatch"); },
});

const checkpoints: AgentRunCheckpoint[] = [];
const errorEvents: Array<{ safeToReplay?: boolean; sideEffectState?: string }> = [];
const result = await new NativeToolAgentLoop({
  provider: new WriteFailureProvider(),
  toolRegistry: registry,
  systemPrompt: "test",
  autoAllowedToolNames: ["unsafe_write"],
  onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
  onEvent: (event) => {
    if (event.type === "error") errorEvents.push(event);
  },
}).run("执行写入");

assert.equal(result.status, "failed");
assert.equal(result.errorCode, "write_result_unknown");
const lastCheckpoint = checkpoints[checkpoints.length - 1];
assert.equal(lastCheckpoint?.sideEffectState, "unknown");
assert.deepEqual(inspectAgentRunResume(lastCheckpoint!), { resumable: false, reason: "side_effect_unknown" });
assert.equal(errorEvents[errorEvents.length - 1]?.safeToReplay, false);
const sanitizedCall = sanitizeMessageForStorage({
  role: "assistant",
  content: "",
  toolCalls: [{ id: "sensitive", name: "write", arguments: JSON.stringify({ docId: "doc-1", content: "private", token: "secret" }) }],
});
assert.equal(sanitizedCall.role, "assistant");
assert.deepEqual(
  JSON.parse(sanitizedCall.role === "assistant" ? sanitizedCall.toolCalls?.[0]?.arguments ?? "{}" : "{}"),
  { docId: "doc-1" },
);

class ResumeProvider implements ProviderAdapter {
  readonly id = "resume";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  request?: AgentChatRequest;
  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.request = request;
    yield { type: "text_delta", delta: "已从安全边界继续。" };
    yield { type: "done", finishReason: "stop" };
  }
}
const resumeProvider = new ResumeProvider();
const resumeResult = await new NativeToolAgentLoop({
  provider: resumeProvider,
  toolRegistry: new NativeToolRegistry(),
  session: new AgentSession("resume-session", [{ role: "user", content: "继续原任务" }]),
  systemPrompt: "test",
}).resume();
assert.equal(resumeResult.status, "answer_ready");
assert.equal(resumeProvider.request?.messages.filter((message) => message.role === "user").length, 1);

// ── 安全检查点恢复：一次性指令、成功工具不重放、空响应有限重试 ──
class SeedThenEmptyProvider implements ProviderAdapter {
  readonly id = "seed-then-empty";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    if (this.requests.length === 1) {
      yield { type: "tool_call_done", toolCall: { id: "seed-call", name: "seed_read", arguments: "{}" } };
    }
    yield { type: "done", finishReason: this.requests.length === 1 ? "tool_calls" : "stop" };
  }
}

let seedReadCount = 0;
let resumeReadCount = 0;
const recoveryRegistry = new NativeToolRegistry();
recoveryRegistry.register({
  name: "seed_read",
  title: "初始读取",
  description: "测试已成功工具不重放",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute() {
    seedReadCount += 1;
    return { ok: true, content: JSON.stringify({ ok: true, seed: "done" }), summary: "初始读取完成" };
  },
});
recoveryRegistry.register({
  name: "resume_read",
  title: "恢复读取",
  description: "测试恢复后的新工具调用",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute() {
    resumeReadCount += 1;
    return { ok: true, content: JSON.stringify({ ok: true, resumed: true }), summary: "恢复读取完成" };
  },
});

const initialRecoveryCheckpoints: AgentRunCheckpoint[] = [];
const initialRecoveryProvider = new SeedThenEmptyProvider();
const initialRecoveryResult = await new NativeToolAgentLoop({
  provider: initialRecoveryProvider,
  toolRegistry: recoveryRegistry,
  systemPrompt: "test",
  onCheckpoint: (checkpoint) => initialRecoveryCheckpoints.push(checkpoint),
}).run("继续执行恢复测试");
assert.equal(initialRecoveryResult.status, "failed");
assert.equal(initialRecoveryResult.errorCode, "provider_empty_response");
assert.equal(initialRecoveryProvider.requests.length, 3, "普通空响应最多自动重试一次");
assert.equal(seedReadCount, 1);
const recoverableCheckpoint = initialRecoveryCheckpoints[initialRecoveryCheckpoints.length - 1]!;
assert.equal(recoverableCheckpoint.recoveryExhausted, undefined);

class ProgressResumeProvider implements ProviderAdapter {
  readonly id = "progress-resume";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    if (this.requests.length === 1) {
      assert.equal(request.messages.some((message) => message.role === "system" && message.content.includes("Runtime Recovery Instruction")), true);
      yield { type: "tool_call_done", toolCall: { id: "resume-call", name: "resume_read", arguments: "{}" } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "text_delta", delta: "已从安全检查点继续完成。" };
    yield { type: "done", finishReason: "stop" };
  }
}

const progressResumeProvider = new ProgressResumeProvider();
const progressResumeResult = await new NativeToolAgentLoop({
  provider: progressResumeProvider,
  toolRegistry: recoveryRegistry,
  session: new AgentSession("resume-progress", recoverableCheckpoint.messages),
  systemPrompt: "test",
  resumeAttempt: 1,
  resumeContext: recoverableCheckpoint.recoveryContext,
}).resume();
assert.equal(progressResumeResult.status, "answer_ready");
assert.equal(seedReadCount, 1, "恢复不得重放已成功的初始工具");
assert.equal(resumeReadCount, 1, "恢复后的新工具只执行一次");

class EmptyRecoveryProvider implements ProviderAdapter {
  readonly id = "empty-recovery";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    yield { type: "done", finishReason: "stop" };
  }
}

const exhaustedCheckpoints: AgentRunCheckpoint[] = [];
const exhaustedRecoveryProvider = new EmptyRecoveryProvider();
const exhaustedRecoveryResult = await new NativeToolAgentLoop({
  provider: exhaustedRecoveryProvider,
  toolRegistry: recoveryRegistry,
  session: new AgentSession("resume-no-progress", recoverableCheckpoint.messages),
  systemPrompt: "test",
  resumeAttempt: 1,
  resumeContext: recoverableCheckpoint.recoveryContext,
  onCheckpoint: (checkpoint) => exhaustedCheckpoints.push(checkpoint),
}).resume();
assert.equal(exhaustedRecoveryResult.status, "failed");
assert.equal(exhaustedRecoveryProvider.requests.length, 2, "恢复后的空响应也最多自动重试一次");
const exhaustedCheckpoint = exhaustedCheckpoints[exhaustedCheckpoints.length - 1]!;
assert.equal(exhaustedCheckpoint.recoveryExhausted, undefined);
const exhaustedProgress = buildAgentResumeProgress({
  producedToolCall: false,
  addedToolResult: false,
  producedSuccessfulToolResult: false,
  producedFinal: false,
  stepAdvanced: false,
  toolResultCodes: [],
});
const exhaustedCheckpointWithState = markAgentRunCheckpointNoProgress(exhaustedCheckpoint, exhaustedProgress, exhaustedRecoveryResult.errorCode);
assert.equal(exhaustedCheckpointWithState?.recoveryExhausted, true);
assert.deepEqual(inspectAgentRunResume(exhaustedCheckpointWithState!), { resumable: false, reason: "no_progress" });

// unfinished output 的内部 retry system message 不算语义进展，最终仍应耗尽恢复状态。
class UnfinishedResumeProvider implements ProviderAdapter {
  readonly id = "unfinished-resume";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  requestCount = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.requestCount += 1;
    yield { type: "text_delta", delta: "下一步我会读取当前状态。" };
    yield { type: "done", finishReason: "stop" };
  }
}

const unfinishedResumeCheckpoint: AgentRunCheckpoint = { ...recoverableCheckpoint };
const unfinishedResumeResult = await new NativeToolAgentLoop({
  provider: new UnfinishedResumeProvider(),
  toolRegistry: recoveryRegistry,
  session: new AgentSession("resume-unfinished", unfinishedResumeCheckpoint.messages),
  systemPrompt: "test",
  resumeAttempt: 1,
  onCheckpoint: (checkpoint) => Object.assign(unfinishedResumeCheckpoint, checkpoint),
}).resume();
assert.equal(unfinishedResumeResult.errorCode, "agent_continuation_missing");
assert.equal(unfinishedResumeResult.messages.length > recoverableCheckpoint.messages.length, true, "内部 retry message 应进入运行时 session");
const unfinishedProgress = buildAgentResumeProgress({
  producedToolCall: false,
  addedToolResult: false,
  producedSuccessfulToolResult: false,
  producedFinal: false,
  stepAdvanced: false,
  toolResultCodes: [],
});
assert.equal(hasAgentResumeProgress(unfinishedProgress), false);
const unfinishedExhausted = markAgentRunCheckpointNoProgress(unfinishedResumeCheckpoint, unfinishedProgress, unfinishedResumeResult.errorCode);
assert.equal(unfinishedExhausted?.recoveryExhausted, true);
assert.deepEqual(inspectAgentRunResume(unfinishedExhausted!), { resumable: false, reason: "no_progress" });

// pseudo tool retry 同样会追加内部 system message，但不能被算作恢复进展。
class PseudoToolResumeProvider implements ProviderAdapter {
  readonly id = "pseudo-tool-resume";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  requestCount = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.requestCount += 1;
    yield { type: "text_delta", delta: "<tool_calls><invoke name=\"seed_read\" /></tool_calls>" };
    yield { type: "done", finishReason: "stop" };
  }
}

const pseudoResumeCheckpoint: AgentRunCheckpoint = { ...recoverableCheckpoint };
const pseudoResumeResult = await new NativeToolAgentLoop({
  provider: new PseudoToolResumeProvider(),
  toolRegistry: recoveryRegistry,
  session: new AgentSession("resume-pseudo", pseudoResumeCheckpoint.messages),
  systemPrompt: "test",
  resumeAttempt: 1,
  onCheckpoint: (checkpoint) => Object.assign(pseudoResumeCheckpoint, checkpoint),
}).resume();
assert.equal(pseudoResumeResult.errorCode, "pseudo_tool_markup_blocked");
assert.equal(pseudoResumeResult.messages.length > recoverableCheckpoint.messages.length, true);
const pseudoExhausted = markAgentRunCheckpointNoProgress(pseudoResumeCheckpoint, unfinishedProgress, pseudoResumeResult.errorCode);
assert.equal(pseudoExhausted?.recoveryExhausted, true);
assert.deepEqual(inspectAgentRunResume(pseudoExhausted!), { resumable: false, reason: "no_progress" });

// softFinalizeAfterToolStop 返回空正文时必须走非空安全 fallback，不能 answer_ready + ""。
class DuplicateReadThenEmptyProvider implements ProviderAdapter {
  readonly id = "duplicate-read-empty";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  requestCount = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.requestCount += 1;
    if (this.requestCount <= 4) {
      yield { type: "tool_call_done", toolCall: { id: `duplicate-${this.requestCount}`, name: "duplicate_read", arguments: "{}" } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "done", finishReason: "stop" };
  }
}

const duplicateRegistry = new NativeToolRegistry();
let duplicateReadExecuteCount = 0;
duplicateRegistry.register({
  name: "duplicate_read",
  title: "重复读取",
  description: "测试重复只读保护",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute() {
    duplicateReadExecuteCount += 1;
    return { ok: true, content: JSON.stringify({ ok: true }), summary: "读取完成" };
  },
});
const softFinalizeResult = await new NativeToolAgentLoop({
  provider: new DuplicateReadThenEmptyProvider(),
  toolRegistry: duplicateRegistry,
  systemPrompt: "test",
}).run("测试重复读取保护");
assert.equal(softFinalizeResult.status, "failed");
assert.equal(softFinalizeResult.errorCode, "duplicate_read_call_blocked");
assert.equal(softFinalizeResult.answer.trim().length > 0, true);
assert.equal(duplicateReadExecuteCount, 1);

// 已成功写入在恢复时不能再次执行。
let successfulWriteCount = 0;
const successfulWriteRegistry = new NativeToolRegistry();
successfulWriteRegistry.register({
  name: "safe_write",
  title: "安全写入",
  description: "测试成功写入不重放",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      target: { type: "string" },
      content: { type: "string" },
    },
  },
  readOnly: false,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: false, canWrite: true },
  async execute() {
    successfulWriteCount += 1;
    return { ok: true, content: JSON.stringify({ ok: true }), summary: "写入完成" };
  },
});
class SuccessfulWriteThenEmptyProvider implements ProviderAdapter {
  readonly id = "successful-write-empty";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  count = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.count += 1;
    if (this.count === 1) {
      yield {
        type: "tool_call_done",
        toolCall: {
          id: "safe-write",
          name: "safe_write",
          arguments: JSON.stringify({ target: "item-1", content: "write-once" }),
        },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "done", finishReason: "stop" };
  }
}
const successfulWriteCheckpoints: AgentRunCheckpoint[] = [];
const successfulWriteInitial = await new NativeToolAgentLoop({
  provider: new SuccessfulWriteThenEmptyProvider(),
  toolRegistry: successfulWriteRegistry,
  systemPrompt: "test",
  autoAllowedToolNames: ["safe_write"],
  onCheckpoint: (checkpoint) => successfulWriteCheckpoints.push(checkpoint),
}).run("测试写入恢复");
assert.equal(successfulWriteInitial.status, "failed");
const successfulWriteCheckpoint = successfulWriteCheckpoints[successfulWriteCheckpoints.length - 1]!;
assert.equal(successfulWriteCheckpoint.successfulWriteGuards?.[0]?.toolName, "safe_write");
assert.match(successfulWriteCheckpoint.successfulWriteGuards?.[0]?.keyDigest ?? "", /^[0-9a-f]{8}$/);
assert.equal(JSON.stringify(successfulWriteCheckpoint.successfulWriteGuards).includes("write-once"), false);
class ReplaySuccessfulWriteThenEmptyProvider implements ProviderAdapter {
  readonly id = "replay-successful-write-empty";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  count = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.count += 1;
    if (this.count === 1) {
      yield {
        type: "tool_call_done",
        toolCall: {
          id: "safe-write-replay",
          name: "safe_write",
          arguments: JSON.stringify({ target: "item-1", content: "write-once" }),
        },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "done", finishReason: "stop" };
  }
}
const replayEvents: AgentStreamEvent[] = [];
const replayCheckpoints: AgentRunCheckpoint[] = [];
const successfulWriteResume = await new NativeToolAgentLoop({
  provider: new ReplaySuccessfulWriteThenEmptyProvider(),
  toolRegistry: successfulWriteRegistry,
  session: new AgentSession("safe-write-resume", successfulWriteCheckpoint.messages),
  systemPrompt: "test",
  resumeAttempt: 1,
  resumeStepIndex: successfulWriteCheckpoint.stepIndex,
  resumeContext: successfulWriteCheckpoint.recoveryContext,
  successfulWriteGuards: successfulWriteCheckpoint.successfulWriteGuards,
  onEvent: (event) => replayEvents.push(event),
  onCheckpoint: (checkpoint) => replayCheckpoints.push(checkpoint),
}).resume();
assert.equal(successfulWriteResume.status, "failed");
assert.equal(successfulWriteResume.errorCode, "provider_empty_response");
assert.equal(successfulWriteCount, 1);
assert.equal(replayEvents.some((event) => (
  event.type === "tool_result"
  && (event.result.errorCode ?? event.result.code) === "duplicate_write_call_blocked"
)), true);
const replayCheckpoint = replayCheckpoints[replayCheckpoints.length - 1]!;
const replayToolResults = replayEvents.filter((event) => event.type === "tool_result");
const replayProgress = buildAgentResumeProgress({
  producedToolCall: replayEvents.some((event) => event.type === "tool_start"),
  addedToolResult: replayToolResults.length > 0,
  producedSuccessfulToolResult: replayToolResults.some((event) => event.result.ok),
  producedFinal: successfulWriteResume.answer.trim().length > 0,
  stepAdvanced: successfulWriteResume.steps > successfulWriteCheckpoint.stepIndex,
  toolResultCodes: replayToolResults
    .map((event) => event.result.errorCode ?? event.result.code)
    .filter((code): code is string => typeof code === "string"),
  previousRecoveryContext: successfulWriteCheckpoint.recoveryContext,
  latestRecoveryContext: replayCheckpoint.recoveryContext,
});
// 当前 duplicate write guard 在真实 executor 前拦截，因此不会发出 tool_start；即使未来保留该诊断事件，也不能改变下面的语义判定。
assert.equal(replayProgress.producedToolCall, false);
assert.equal(replayProgress.addedToolResult, true);
assert.equal(replayProgress.stepAdvanced, true);
assert.equal(replayProgress.producedMeaningfulToolResult, false);
assert.equal(hasAgentResumeProgress(replayProgress), false);
const replayExhausted = markAgentRunCheckpointNoProgress(replayCheckpoint, replayProgress, successfulWriteResume.errorCode);
assert.equal(replayExhausted?.recoveryExhausted, true);
assert.deepEqual(inspectAgentRunResume(replayExhausted!), { resumable: false, reason: "no_progress" });

// Guard-only 的只读失败也不能因为 tool_result/step 增加而算作进展。
const duplicateReadProgress = buildAgentResumeProgress({
  producedToolCall: true,
  addedToolResult: true,
  producedSuccessfulToolResult: false,
  producedFinal: false,
  stepAdvanced: true,
  toolResultCodes: ["duplicate_read_call_blocked"],
  previousRecoveryContext: {
    toolName: "read_docs",
    errorCode: "duplicate_read_call_blocked",
    targetIds: { docId: "doc-1" },
  },
  latestRecoveryContext: {
    toolName: "read_docs",
    errorCode: "duplicate_read_call_blocked",
    targetIds: { docId: "doc-1" },
  },
});
assert.equal(duplicateReadProgress.producedMeaningfulToolResult, false);
assert.equal(hasAgentResumeProgress(duplicateReadProgress), false);

// 新的结构化失败诊断应算作进展，即使最终仍未成功。
const meaningfulFailureProgress = buildAgentResumeProgress({
  producedToolCall: true,
  addedToolResult: true,
  producedSuccessfulToolResult: false,
  producedFinal: false,
  stepAdvanced: true,
  toolResultCodes: ["resource_not_found"],
  previousRecoveryContext: {
    toolName: "homepage_components",
    action: "weather.instance.update",
    errorCode: "invalid_action_args",
    field: "targetPath",
  },
  latestRecoveryContext: {
    toolName: "homepage_components",
    action: "weather.instance.update",
    errorCode: "resource_not_found",
    targetIds: { widgetId: "widget-2" },
    hint: "检查目标组件是否仍存在。",
  },
});
assert.equal(meaningfulFailureProgress.meaningfulFailureContextChanged, true);
assert.equal(meaningfulFailureProgress.producedMeaningfulToolResult, true);
assert.equal(hasAgentResumeProgress(meaningfulFailureProgress), true);

assert.deepEqual(inspectAgentRunResume({ ...recoverableCheckpoint, phase: "waiting_confirmation", pendingToolCalls: [{ id: "pending", name: "safe_write", arguments: "{}" }] }), {
  resumable: false,
  reason: "confirmation_pending",
});

// invalid_action_args 的恢复上下文只保留结构化安全字段，不携带原始正文。
const invalidArgsRegistry = new NativeToolRegistry();
invalidArgsRegistry.register({
  name: "invalid_args_tool",
  title: "参数错误工具",
  description: "测试恢复错误上下文",
  parameters: { type: "object", additionalProperties: false, properties: { action: { type: "string" } } },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute() {
    return {
      ok: false,
      errorCode: "invalid_action_args",
      content: "[TOOL_FAILED] {\"ok\":false,\"code\":\"invalid_action_args\",\"message\":\"action 不合法\",\"field\":\"action\",\"hint\":\"先查看 agent_tool_help\"}",
      summary: "action 不合法",
    };
  },
});
class InvalidArgsThenEmptyProvider implements ProviderAdapter {
  readonly id = "invalid-args-empty";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  count = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.count += 1;
    if (this.count === 1) {
      yield { type: "tool_call_done", toolCall: { id: "invalid-call", name: "invalid_args_tool", arguments: JSON.stringify({ action: "bad_action", content: "private" }) } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "done", finishReason: "stop" };
  }
}
const invalidArgsCheckpoints: AgentRunCheckpoint[] = [];
const invalidArgsResult = await new NativeToolAgentLoop({
  provider: new InvalidArgsThenEmptyProvider(),
  toolRegistry: invalidArgsRegistry,
  systemPrompt: "test",
  onCheckpoint: (checkpoint) => invalidArgsCheckpoints.push(checkpoint),
}).run("测试参数错误恢复");
assert.equal(invalidArgsResult.status, "failed");
const invalidArgsCheckpoint = invalidArgsCheckpoints[invalidArgsCheckpoints.length - 1]!;
assert.equal(invalidArgsCheckpoint.recoveryContext?.toolName, "invalid_args_tool");
assert.equal(invalidArgsCheckpoint.recoveryContext?.action, "bad_action");
assert.equal(invalidArgsCheckpoint.recoveryContext?.errorCode, "invalid_action_args");
assert.equal(invalidArgsCheckpoint.recoveryContext?.field, "action");
assert.match(invalidArgsCheckpoint.recoveryContext?.hint ?? "", /agent_tool_help/);
assert.equal("content" in (invalidArgsCheckpoint.recoveryContext?.safeArgs ?? {}), false);

// 历史失败在后续成功 Tool Batch 后必须清空，不能继续污染 Resume Instruction。
const lifecycleRegistry = new NativeToolRegistry();
lifecycleRegistry.register({
  name: "lifecycle_tool",
  title: "生命周期测试工具",
  description: "测试失败修正后的 recoveryContext 清理",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { value: { type: "string" } },
  },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute(args) {
    if (args.value === "bad") {
      return {
        ok: false,
        errorCode: "invalid_action_args",
        content: JSON.stringify({ ok: false, code: "invalid_action_args", field: "value", message: "value 无效" }),
        summary: "value 无效",
      };
    }
    return { ok: true, content: JSON.stringify({ ok: true, value: args.value }), summary: "修正成功" };
  },
});
class ResolvedFailureProvider implements ProviderAdapter {
  readonly id = "resolved-failure";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  count = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.count += 1;
    if (this.count === 1) {
      yield { type: "tool_call_done", toolCall: { id: "lifecycle-bad", name: "lifecycle_tool", arguments: JSON.stringify({ value: "bad" }) } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    if (this.count === 2) {
      yield { type: "tool_call_done", toolCall: { id: "lifecycle-good", name: "lifecycle_tool", arguments: JSON.stringify({ value: "good" }) } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "done", finishReason: "stop" };
  }
}
const resolvedFailureCheckpoints: AgentRunCheckpoint[] = [];
const resolvedFailureResult = await new NativeToolAgentLoop({
  provider: new ResolvedFailureProvider(),
  toolRegistry: lifecycleRegistry,
  systemPrompt: "test",
  onCheckpoint: (checkpoint) => resolvedFailureCheckpoints.push(checkpoint),
}).run("修正失败参数");
assert.equal(resolvedFailureResult.errorCode, "provider_empty_response");
const resolvedFailureCheckpoint = resolvedFailureCheckpoints[resolvedFailureCheckpoints.length - 1]!;
assert.equal(resolvedFailureCheckpoint.recoveryContext, undefined);
const resolvedResumeProvider = new ResumeProvider();
const resolvedResumeResult = await new NativeToolAgentLoop({
  provider: resolvedResumeProvider,
  toolRegistry: lifecycleRegistry,
  session: new AgentSession("resolved-failure-resume", resolvedFailureCheckpoint.messages),
  systemPrompt: "test",
  resumeAttempt: 1,
  resumeStepIndex: resolvedFailureCheckpoint.stepIndex,
  resumeContext: resolvedFailureCheckpoint.recoveryContext,
}).resume();
assert.equal(resolvedResumeResult.status, "answer_ready");
const resolvedInstruction = resolvedResumeProvider.request?.messages.find(
  (message) => message.role === "system" && message.content.includes("Runtime Recovery Instruction"),
);
assert.ok(resolvedInstruction);
assert.equal(resolvedInstruction.content.includes("最近失败的安全结构化上下文"), false);
assert.equal(resolvedInstruction.content.includes("invalid_action_args"), false);

// Mixed Tool Batch 只保留同一批次最后一个失败；后续修正成功后清空。
const mixedRegistry = new NativeToolRegistry();
for (const name of ["mixed_a", "mixed_c"]) {
  mixedRegistry.register({
    name,
    title: name,
    description: "mixed batch success",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    readOnly: true,
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: true },
    async execute() {
      return { ok: true, content: JSON.stringify({ ok: true }), summary: `${name} success` };
    },
  });
}
mixedRegistry.register({
  name: "mixed_b",
  title: "mixed_b",
  description: "mixed batch failure then success",
  parameters: { type: "object", additionalProperties: false, properties: { value: { type: "string" } } },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute(args) {
    if (args.value === "bad") {
      return {
        ok: false,
        errorCode: "invalid_action_args",
        content: JSON.stringify({ ok: false, code: "invalid_action_args", field: "value", message: "mixed_b value 无效" }),
        summary: "mixed_b value 无效",
      };
    }
    return { ok: true, content: JSON.stringify({ ok: true }), summary: "mixed_b success" };
  },
});
class MixedBatchProvider implements ProviderAdapter {
  readonly id = "mixed-batch";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  count = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.count += 1;
    if (this.count === 1) {
      yield { type: "tool_call_done", toolCall: { id: "mixed-a", name: "mixed_a", arguments: "{}" } };
      yield { type: "tool_call_done", toolCall: { id: "mixed-b-bad", name: "mixed_b", arguments: JSON.stringify({ value: "bad" }) } };
      yield { type: "tool_call_done", toolCall: { id: "mixed-c", name: "mixed_c", arguments: "{}" } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    if (this.count === 2) {
      yield { type: "tool_call_done", toolCall: { id: "mixed-b-good", name: "mixed_b", arguments: JSON.stringify({ value: "good" }) } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "done", finishReason: "stop" };
  }
}
const mixedCheckpoints: AgentRunCheckpoint[] = [];
const mixedResult = await new NativeToolAgentLoop({
  provider: new MixedBatchProvider(),
  toolRegistry: mixedRegistry,
  systemPrompt: "test",
  onCheckpoint: (checkpoint) => mixedCheckpoints.push(checkpoint),
}).run("测试 mixed batch");
assert.equal(mixedResult.errorCode, "provider_empty_response");
const mixedFailureCheckpoint = mixedCheckpoints.find(
  (checkpoint) => checkpoint.phase === "after_tool" && checkpoint.recoveryContext?.toolName === "mixed_b",
);
assert.equal(mixedFailureCheckpoint?.recoveryContext?.errorCode, "invalid_action_args");
const mixedFinalCheckpoint = mixedCheckpoints[mixedCheckpoints.length - 1]!;
assert.equal(mixedFinalCheckpoint.recoveryContext, undefined);

// Provider Empty 没有新 Tool Batch 时，最近失败上下文必须保留并进入 Resume Instruction。
const emptyContextRegistry = new NativeToolRegistry();
emptyContextRegistry.register({
  name: "empty_context_tool",
  title: "空响应上下文工具",
  description: "测试 provider empty 保留失败上下文",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute() {
    return {
      ok: false,
      errorCode: "invalid_action_args",
      content: JSON.stringify({ ok: false, code: "invalid_action_args", field: "value", message: "仍需修正 value" }),
      summary: "仍需修正 value",
    };
  },
});
class EmptyContextProvider implements ProviderAdapter {
  readonly id = "empty-context";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  count = 0;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    this.count += 1;
    if (this.count === 1) {
      yield { type: "tool_call_done", toolCall: { id: "empty-context-call", name: "empty_context_tool", arguments: "{}" } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "done", finishReason: "stop" };
  }
}
const emptyContextCheckpoints: AgentRunCheckpoint[] = [];
const emptyContextResult = await new NativeToolAgentLoop({
  provider: new EmptyContextProvider(),
  toolRegistry: emptyContextRegistry,
  systemPrompt: "test",
  onCheckpoint: (checkpoint) => emptyContextCheckpoints.push(checkpoint),
}).run("测试失败上下文保留");
assert.equal(emptyContextResult.errorCode, "provider_empty_response");
const emptyContextCheckpoint = emptyContextCheckpoints[emptyContextCheckpoints.length - 1]!;
assert.equal(emptyContextCheckpoint.recoveryContext?.toolName, "empty_context_tool");
const emptyContextResumeProvider = new ResumeProvider();
await new NativeToolAgentLoop({
  provider: emptyContextResumeProvider,
  toolRegistry: emptyContextRegistry,
  session: new AgentSession("empty-context-resume", emptyContextCheckpoint.messages),
  systemPrompt: "test",
  resumeAttempt: 1,
  resumeStepIndex: emptyContextCheckpoint.stepIndex,
  resumeContext: emptyContextCheckpoint.recoveryContext,
}).resume();
const emptyContextInstruction = emptyContextResumeProvider.request?.messages.find(
  (message) => message.role === "system" && message.content.includes("Runtime Recovery Instruction"),
);
assert.ok(emptyContextInstruction);
assert.equal(emptyContextInstruction.content.includes("empty_context_tool"), true);
assert.equal(emptyContextInstruction.content.includes("invalid_action_args"), true);

// fingerprint 只使用稳定结构化字段，不受 hint/nextStep 文案和对象插入顺序影响。
const fingerprintBase = {
  toolName: "test_tool",
  action: "update",
  errorCode: "invalid_action_args",
  field: "value",
  targetIds: { blockId: "b-1", docId: "d-1" },
  safeArgs: { action: "update", id: "b-1", value: "A" },
  hint: "提示 A",
  nextStep: "下一步 A",
};
const fingerprintTextVariant = {
  ...fingerprintBase,
  hint: "提示 B（文案变化）",
  nextStep: "下一步 B",
};
assert.equal(getAgentRecoveryContextFingerprint(fingerprintBase), getAgentRecoveryContextFingerprint(fingerprintTextVariant));
assert.notEqual(
  getAgentRecoveryContextFingerprint(fingerprintBase),
  getAgentRecoveryContextFingerprint({ ...fingerprintBase, safeArgs: { value: "B", id: "b-1", action: "update" } }),
);
assert.equal(
  getAgentRecoveryContextFingerprint(fingerprintBase),
  getAgentRecoveryContextFingerprint({
    ...fingerprintBase,
    targetIds: { docId: "d-1", blockId: "b-1" },
    safeArgs: { value: "A", action: "update", id: "b-1" },
  }),
);

console.log("Agent 上下文账本、长会话连续性与安全恢复边界校验通过。");
