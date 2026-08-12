import assert from "node:assert/strict";
import { buildConversationContext } from "../src/features/kb/services/agent-workbench/runtime/conversation-context-builder";
import { inspectAgentRunResume, type AgentRunCheckpoint } from "../src/features/kb/services/agent-core/session/agent-run-checkpoint";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import { NativeToolRegistry } from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
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

console.log("Agent 上下文账本、长会话连续性与安全恢复边界校验通过。");
