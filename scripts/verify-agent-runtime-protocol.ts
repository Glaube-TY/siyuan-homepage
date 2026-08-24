import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAgentRunIdentity } from "../src/features/agent-platform/agent-run-protocol";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import type { AgentStreamEvent } from "../src/features/kb/services/agent-core/loop/stream-event";
import type { AgentChatRequest, AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import { AgentProviderError } from "../src/features/kb/services/agent-core/providers/provider-error";
import { mergeLatestAgentTokenUsage, normalizeProviderUsage } from "../src/features/kb/services/agent-core/providers/provider-usage";
import { TimedAgentHttpTransport, type AgentHttpTransport } from "../src/features/kb/services/agent-core/providers/agent-http-transport";
import { NativeToolRegistry } from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import { StormBreaker } from "../src/features/kb/services/agent-core/loop/storm-breaker";

class UsageProvider implements ProviderAdapter {
  readonly id = "verify:usage";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requestTimeoutMs = 30_000;

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    yield { type: "usage", usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15, cachedInputTokens: 4, reasoningTokens: 1 } };
    yield { type: "text_delta", delta: "完成" };
    yield { type: "done", finishReason: "stop" };
  }
}

class TerminalProvider implements ProviderAdapter {
  readonly id = "verify:terminal";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;

  constructor(
    private readonly answer: string,
    private readonly finishReason: string,
  ) {}

  async *streamChat(): AsyncGenerator<AgentProviderEvent> {
    if (this.answer) yield { type: "text_delta", delta: this.answer };
    yield { type: "done", finishReason: this.finishReason };
  }
}

class ToolThenTimeoutProvider implements ProviderAdapter {
  readonly id = "verify:provider-timeout-recovery";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    if (this.requests.length === 1) {
      yield {
        type: "tool_call_done",
        toolCall: { id: "write-once", name: "write_once", arguments: "{}" },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    if (this.requests.length === 2) {
      throw new AgentProviderError("timeout before response", { code: "provider_timeout" });
    }
    yield { type: "text_delta", delta: "已完成" };
    yield { type: "done", finishReason: "stop" };
  }
}

async function runTerminalProvider(answer: string, finishReason: string, signal?: AbortSignal) {
  const loop = new NativeToolAgentLoop({
    provider: new TerminalProvider(answer, finishReason),
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: "test",
    abortSignal: signal,
  });
  return loop.run("test");
}

async function verifyRunIdentityAndUsage(): Promise<void> {
  const identity = createAgentRunIdentity({ sessionId: "session-a", runId: "run-a", correlationId: "corr-a", startedAt: 1 });
  const events: AgentStreamEvent[] = [];
  const loop = new NativeToolAgentLoop({
    provider: new UsageProvider(),
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: "test",
    identity,
    onEvent: (event) => events.push(event),
  });
  const result = await loop.run("test");
  assert.equal(result.status, "answer_ready");
  assert.equal(result.identity, identity);
  assert.equal(result.providerRequestCount, 1);
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 3, totalTokens: 15, cachedInputTokens: 4, reasoningTokens: 1 });
  assert.deepEqual(events.slice(0, 2).map((event) => event.type), ["run_started", "model_started"]);
  assert.ok(events.some((event) => event.type === "usage"));
}

function verifyProviderUsageNormalization(): void {
  assert.deepEqual(normalizeProviderUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }), {
    inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 0, reasoningTokens: 0,
  });
  assert.equal(normalizeProviderUsage({ input_tokens: 7, output_tokens: 2 })?.totalTokens, 9);
  assert.equal(normalizeProviderUsage({ promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 })?.totalTokens, 12);
  assert.equal(mergeLatestAgentTokenUsage(
    { inputTokens: 7, outputTokens: 0, totalTokens: 7, cachedInputTokens: 0, reasoningTokens: 0 },
    { inputTokens: 0, outputTokens: 2, totalTokens: 2, cachedInputTokens: 0, reasoningTokens: 0 },
  ).totalTokens, 9);
}

function verifyRepeatedInvalidActionState(): void {
  const breaker = new StormBreaker();
  const call = { id: "read", name: "siyuan_doc_edit", arguments: "{}", index: 0 };
  breaker.recordFailedCall(call, { action: "read_blocks", args: { docId: "doc-a" } }, "invalid_action_args", 1);
  breaker.recordFailedCall(call, { action: "read_blocks", args: { docId: "doc-b" } }, "invalid_action_args", 2);
  assert.equal(breaker.shouldFatalAfterRepeatedInvalidActionArgs(), true);

  const dispatchSource = readFileSync(
    new URL("../src/features/kb/services/agent-core/loop/dispatch-tool-calls.ts", import.meta.url),
    "utf8",
  );
  assert.match(dispatchSource, /repeatedInvalidArgsBeforeThisBatch/);
  assert.match(dispatchSource, /repeatedInvalidArgsBeforeThisBatch\s*&&\s*stormBreaker\.shouldFatalAfterRepeatedInvalidActionArgs\(\)/);
}

function verifyKnowledgeChatSettingsSnapshotBoundary(): void {
  const source = readFileSync(
    new URL("../src/features/kb/services/orchestration/agent-workbench-mode-flow.ts", import.meta.url),
    "utf8",
  );
  const snapshotMarker = "const kbSettings = await getKbSettings();";
  const snapshotIndex = source.indexOf(snapshotMarker);
  const contextIndex = source.indexOf("const conversationContext = buildConversationContext({", snapshotIndex);
  const runIndex = source.indexOf("const agentTurnOutcome: AgentTurnOutcome = await runAgentTurn({", contextIndex);
  assert.ok(snapshotIndex >= 0, "Knowledge Chat must load one KB settings snapshot");
  assert.ok(contextIndex > snapshotIndex, "KB settings must load before conversation context");
  assert.ok(runIndex > contextIndex, "KB settings must load before Agent runtime");
  assert.doesNotMatch(source.slice(snapshotIndex, contextIndex), /catch\s*\{[\s\S]*ignore/);
  assert.match(source.slice(snapshotIndex, runIndex), /webSearchSettings/);
  assert.match(source.slice(runIndex, runIndex + 1500), /\bkbSettings,\s*/);
}

async function verifyTerminalSemantics(): Promise<void> {
  const empty = await runTerminalProvider("", "stop");
  assert.equal(empty.status, "failed");
  assert.equal(empty.errorCode, "provider_empty_response");

  const truncated = await runTerminalProvider("未完成", "length");
  assert.equal(truncated.status, "failed");
  assert.equal(truncated.errorCode, "provider_output_truncated");

  const abort = new AbortController();
  abort.abort();
  const cancelled = await runTerminalProvider("不应生成", "stop", abort.signal);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.errorCode, "user_aborted");

  const rateLimit = new AgentProviderError("rate limited", { code: "provider_rate_limited", status: 429 });
  assert.equal(rateLimit.category, "rate_limit");
  assert.equal(rateLimit.retryable, true);
  assert.equal(rateLimit.safeToReplay, true);
}

async function verifySharedTimeout(): Promise<void> {
  const hanging: AgentHttpTransport = { post: () => new Promise(() => undefined) };
  const timed = new TimedAgentHttpTransport(hanging, 1_000);
  await assert.rejects(
    () => timed.post({ url: "https://example.invalid", headers: {}, body: "{}", stream: false }),
    (error: unknown) => error instanceof AgentProviderError
      && error.code === "provider_timeout"
      && error.category === "timeout"
      && error.retryable
      && error.safeToReplay,
  );
}

async function verifyProviderTimeoutRecovery(): Promise<void> {
  const provider = new ToolThenTimeoutProvider();
  const registry = new NativeToolRegistry();
  let executeCount = 0;
  let confirmationCount = 0;
  const events: AgentStreamEvent[] = [];
  registry.register({
    name: "write_once",
    title: "单次写入",
    description: "验证 Provider 超时不会重放已完成写入。",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    readOnly: false,
    providerVisible: true,
    source: "builtin",
    safety: { readOnly: false, canWrite: true, requiresConfirmation: true },
    async execute() {
      executeCount += 1;
      return { ok: true, content: "{}", summary: "写入完成", sideEffectState: "committed" };
    },
  });
  const result = await new NativeToolAgentLoop({
    provider,
    toolRegistry: registry,
    systemPrompt: "test",
    bridge: {
      async request() {
        confirmationCount += 1;
        return { type: "allow" };
      },
    },
    onEvent: (event) => events.push(event),
  }).run("执行 write_once 后回答");

  assert.equal(result.status, "answer_ready");
  assert.equal(result.providerRequestCount, 3);
  assert.equal(executeCount, 1, "Provider 超时重试不得重放已完成写入");
  assert.equal(confirmationCount, 1, "Provider 超时重试不得重复确认");
  assert.equal(events.filter((event) => event.type === "tool_result").length, 1);
  assert.equal(events.filter((event) => event.type === "notice" && event.message.includes("安全检查点")).length, 1);
  assert.deepEqual(provider.requests[1]?.messages, provider.requests[2]?.messages, "自动重试必须复用同一安全 Provider payload");

  let repeatedTimeoutRequests = 0;
  const repeatedTimeoutProvider: ProviderAdapter = {
    id: "verify:repeated-provider-timeout",
    capabilities: OPENAI_COMPATIBLE_CAPABILITIES,
    async *streamChat() {
      repeatedTimeoutRequests += 1;
      throw new AgentProviderError("still timed out", { code: "provider_timeout" });
    },
  };
  await assert.rejects(
    () => new NativeToolAgentLoop({
      provider: repeatedTimeoutProvider,
      toolRegistry: new NativeToolRegistry(),
      systemPrompt: "test",
    }).run("test"),
    (error: unknown) => error instanceof AgentProviderError && error.code === "provider_timeout",
  );
  assert.equal(repeatedTimeoutRequests, 2, "同一 Provider step 最多自动重试一次");

  let partialTimeoutRequests = 0;
  const partialTimeoutProvider: ProviderAdapter = {
    id: "verify:partial-provider-timeout",
    capabilities: OPENAI_COMPATIBLE_CAPABILITIES,
    async *streamChat() {
      partialTimeoutRequests += 1;
      yield { type: "text_delta", delta: "partial" };
      throw new AgentProviderError("timed out after output", { code: "provider_timeout" });
    },
  };
  await assert.rejects(() => new NativeToolAgentLoop({
    provider: partialTimeoutProvider,
    toolRegistry: new NativeToolRegistry(),
    systemPrompt: "test",
  }).run("test"));
  assert.equal(partialTimeoutRequests, 1, "已收到模型事件后不得自动重放 Provider 请求");
}

await verifyRunIdentityAndUsage();
verifyProviderUsageNormalization();
verifyRepeatedInvalidActionState();
verifyKnowledgeChatSettingsSnapshotBoundary();
await verifyTerminalSemantics();
await verifySharedTimeout();
await verifyProviderTimeoutRecovery();
console.log("agent runtime protocol verification passed");
