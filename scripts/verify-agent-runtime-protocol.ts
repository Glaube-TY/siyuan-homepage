import assert from "node:assert/strict";
import { createAgentRunIdentity } from "../src/features/agent-platform/agent-run-protocol";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import type { AgentStreamEvent } from "../src/features/kb/services/agent-core/loop/stream-event";
import type { AgentProviderEvent, ProviderAdapter } from "../src/features/kb/services/agent-core/providers/provider-adapter";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import { AgentProviderError } from "../src/features/kb/services/agent-core/providers/provider-error";
import { mergeLatestAgentTokenUsage, normalizeProviderUsage } from "../src/features/kb/services/agent-core/providers/provider-usage";
import { TimedAgentHttpTransport, type AgentHttpTransport } from "../src/features/kb/services/agent-core/providers/agent-http-transport";
import { NativeToolRegistry } from "../src/features/kb/services/agent-core/tools/native-tool-registry";

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

await verifyRunIdentityAndUsage();
verifyProviderUsageNormalization();
await verifyTerminalSemantics();
await verifySharedTimeout();
console.log("agent runtime protocol verification passed");
