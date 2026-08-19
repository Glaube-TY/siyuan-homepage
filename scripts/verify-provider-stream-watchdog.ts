import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readProviderStreamWithIdleTimeout, type AgentHttpTransport } from "../src/features/kb/services/agent-core/providers/agent-http-transport";
import { AgentProviderError } from "../src/features/kb/services/agent-core/providers/provider-error";
import { OpenAICompatibleAdapter } from "../src/features/kb/services/agent-core/providers/openai-compatible-adapter";
import { AnthropicAdapter } from "../src/features/kb/services/agent-core/providers/anthropic-adapter";
import { GeminiAdapter } from "../src/features/kb/services/agent-core/providers/gemini-adapter";

function hangingStream(onCancel: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream({ cancel: onCancel });
}

function repeatingSseStream(
  frameAt: (index: number) => string,
  options: { intervalMs: number; closeAfter?: number; onCancel?: () => void },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  return new ReadableStream({
    start(controller) {
      let index = 0;
      timer = setInterval(() => {
        index += 1;
        controller.enqueue(encoder.encode(frameAt(index)));
        if (options.closeAfter !== undefined && index >= options.closeAfter) {
          clearInterval(timer);
          timer = undefined;
          controller.close();
        }
      }, options.intervalMs);
    },
    cancel() {
      if (timer !== undefined) clearInterval(timer);
      options.onCancel?.();
    },
  });
}

async function consume(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) { /* consume */ }
}

async function verifyIdleSemantics(): Promise<void> {
  let cancelled = false;
  await assert.rejects(
    () => consume(readProviderStreamWithIdleTimeout(hangingStream(() => { cancelled = true; }), {
      idleTimeoutMs: 20,
      providerId: "verify",
      modelStepIndex: 1,
    })),
    (error: unknown) => error instanceof AgentProviderError
      && error.code === "provider_stream_idle_timeout"
      && error.category === "timeout"
      && error.retryable
      && error.safeToReplay,
  );
  assert.equal(cancelled, true);

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const active = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 1; index <= 5; index += 1) {
        setTimeout(() => controller.enqueue(encoder.encode(`${index}`)), index * 10);
      }
      setTimeout(() => controller.close(), 60);
    },
  });
  const chunks: string[] = [];
  for await (const chunk of readProviderStreamWithIdleTimeout(active, { idleTimeoutMs: 25, providerId: "verify" })) {
    chunks.push(new TextDecoder().decode(chunk));
  }
  assert.equal(chunks.join(""), "12345");
  assert.ok(Date.now() - startedAt > 25, "idle timeout 不能成为回答总时长上限");

  const resetStartedAt = Date.now();
  const oneThenStall = new ReadableStream<Uint8Array>({
    start(controller) { setTimeout(() => controller.enqueue(encoder.encode("x")), 10); },
  });
  await assert.rejects(
    () => consume(readProviderStreamWithIdleTimeout(oneThenStall, { idleTimeoutMs: 25, providerId: "verify" })),
    (error: unknown) => error instanceof AgentProviderError && error.code === "provider_stream_idle_timeout",
  );
  assert.ok(Date.now() - resetStartedAt >= 30, "收到 chunk 后必须从最后活动重新计时");

  let abortCancelled = false;
  const abort = new AbortController();
  setTimeout(() => abort.abort(), 10);
  await consume(readProviderStreamWithIdleTimeout(hangingStream(() => { abortCancelled = true; }), {
    idleTimeoutMs: 100,
    signal: abort.signal,
    providerId: "verify",
  }));
  assert.equal(abortCancelled, true);
}

function streamTransport(onCancel: () => void): AgentHttpTransport {
  return {
    async post() {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/event-stream" },
        async json() { return {}; },
        async text() { return ""; },
        body: hangingStream(onCancel),
      };
    },
  };
}

function bodyTransport(body: ReadableStream<Uint8Array>): AgentHttpTransport {
  return {
    async post() {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/event-stream" },
        async json() { return {}; },
        async text() { return ""; },
        body,
      };
    },
  };
}

async function assertAdapterTimesOut(adapter: { streamChat(request: { messages: []; tools: [] }): AsyncIterable<unknown> }): Promise<void> {
  await assert.rejects(
    () => consume(adapter.streamChat({ messages: [], tools: [] })),
    (error: unknown) => error instanceof AgentProviderError && error.code === "provider_stream_idle_timeout",
  );
}

async function verifyAdaptersAndTerminalWiring(): Promise<void> {
  await assertAdapterTimesOut(new OpenAICompatibleAdapter({
    id: "openai", model: "test", chatCompletionsUrl: "https://example.invalid", transport: streamTransport(() => undefined), requestTimeoutMs: 15,
  }));
  await assertAdapterTimesOut(new AnthropicAdapter({
    id: "anthropic", model: "test", apiKey: "test", transport: streamTransport(() => undefined), requestTimeoutMs: 15,
  }));
  await assertAdapterTimesOut(new GeminiAdapter({
    id: "gemini", model: "test", apiKey: "test", transport: streamTransport(() => undefined), requestTimeoutMs: 15,
  }));

  const runProfileSource = readFileSync(new URL("../src/features/kb/services/agent-workbench/runtime/run-agent-profile.ts", import.meta.url), "utf8");
  assert.match(runProfileSource, /type:\s*"error"[\s\S]*localEvents\.some\(\(event\) => event\.type === "done"\)[\s\S]*type:\s*"done"/);
  const modeFlowSource = readFileSync(new URL("../src/features/kb/services/orchestration/agent-workbench-mode-flow.ts", import.meta.url), "utf8");
  assert.match(modeFlowSource, /agentStatus:\s*undefined/);
  assert.match(modeFlowSource, /isAbortLikeError\(err, abortSignal\)/);
}

const HEARTBEAT = ": ping\n\n";
const OPENAI_TEXT = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n';
const ANTHROPIC_TEXT = 'data: {"type":"content_block_delta","index":0,"delta":{"text":"x"}}\n\n';
const GEMINI_TEXT = 'data: {"candidates":[{"content":{"parts":[{"text":"x"}]}}]}\n\n';

function openAiAdapter(body: ReadableStream<Uint8Array>, requestTimeoutMs = 20) {
  return new OpenAICompatibleAdapter({
    id: "openai-semantic",
    model: "test",
    chatCompletionsUrl: "https://example.invalid",
    transport: bodyTransport(body),
    requestTimeoutMs,
  });
}

async function verifySemanticProgress(): Promise<void> {
  for (const adapter of [
    openAiAdapter(repeatingSseStream(() => HEARTBEAT, { intervalMs: 8 })),
    new AnthropicAdapter({
      id: "anthropic-semantic", model: "test", apiKey: "test", requestTimeoutMs: 20,
      transport: bodyTransport(repeatingSseStream(() => HEARTBEAT, { intervalMs: 8 })),
    }),
    new GeminiAdapter({
      id: "gemini-semantic", model: "test", apiKey: "test", requestTimeoutMs: 20,
      transport: bodyTransport(repeatingSseStream(() => HEARTBEAT, { intervalMs: 8 })),
    }),
  ]) {
    await assertAdapterTimesOut(adapter);
  }

  const mixedStartedAt = Date.now();
  const mixedEvents: unknown[] = [];
  const mixed = openAiAdapter(repeatingSseStream(
    (index) => index % 2 === 0 ? OPENAI_TEXT : HEARTBEAT,
    { intervalMs: 8, closeAfter: 10 },
  ));
  for await (const event of mixed.streamChat({ messages: [], tools: [] })) mixedEvents.push(event);
  assert.ok(Date.now() - mixedStartedAt > 40, "周期性模型事件应允许总响应时间超过 Semantic Timeout");
  assert.ok(mixedEvents.some((event) => (event as { type?: string }).type === "text_delta"));

  const lastProgressStartedAt = Date.now();
  await assertAdapterTimesOut(openAiAdapter(repeatingSseStream(
    (index) => index === 1 ? OPENAI_TEXT : HEARTBEAT,
    { intervalMs: 8 },
  )));
  assert.ok(Date.now() - lastProgressStartedAt >= 40, "Semantic Timeout 必须从最后一次模型进展重新计算");

  await assertAdapterTimesOut(openAiAdapter(repeatingSseStream(
    () => "event: ping\nnot-data: garbage\n\n",
    { intervalMs: 8 },
  )));

  for (const [frame, adapterFactory] of [
    [OPENAI_TEXT, (body: ReadableStream<Uint8Array>) => openAiAdapter(body)],
    [ANTHROPIC_TEXT, (body: ReadableStream<Uint8Array>) => new AnthropicAdapter({
      id: "anthropic-progress", model: "test", apiKey: "test", requestTimeoutMs: 20, transport: bodyTransport(body),
    })],
    [GEMINI_TEXT, (body: ReadableStream<Uint8Array>) => new GeminiAdapter({
      id: "gemini-progress", model: "test", apiKey: "test", requestTimeoutMs: 20, transport: bodyTransport(body),
    })],
  ] as const) {
    await consume(adapterFactory(repeatingSseStream(() => frame, { intervalMs: 8, closeAfter: 10 })).streamChat({ messages: [], tools: [] }));
  }

  let abortCancelled = false;
  const abort = new AbortController();
  const abortAdapter = openAiAdapter(repeatingSseStream(() => HEARTBEAT, {
    intervalMs: 8,
    onCancel: () => { abortCancelled = true; },
  }));
  setTimeout(() => abort.abort(), 15);
  const abortEvents: Array<{ type?: string; finishReason?: string }> = [];
  for await (const event of abortAdapter.streamChat({ messages: [], tools: [], abortSignal: abort.signal })) {
    abortEvents.push(event);
  }
  assert.equal(abortCancelled, true);
  assert.ok(abortEvents.some((event) => event.type === "done" && event.finishReason === "aborted"));
}

type CollectedProviderEvent = { type: string; delta?: string; finishReason?: string };

async function collectAdapterEvents(adapter: {
  streamChat(request: { messages: []; tools: [] }): AsyncIterable<CollectedProviderEvent>;
}): Promise<CollectedProviderEvent[]> {
  const events: CollectedProviderEvent[] = [];
  for await (const event of adapter.streamChat({ messages: [], tools: [] })) events.push(event);
  return events;
}

function assertSingleDone(events: readonly CollectedProviderEvent[]): void {
  assert.equal(events.filter((event) => event.type === "done").length, 1, "Provider Adapter 只能向上产生一个正式 done");
}

async function verifyTerminalStopsNetworkRead(): Promise<void> {
  let openAiDoneCancelled = false;
  const openAiDoneEvents = await collectAdapterEvents(openAiAdapter(repeatingSseStream(
    (index) => index === 1 ? OPENAI_TEXT : index === 2 ? "data: [DONE]\n\n" : HEARTBEAT,
    { intervalMs: 8, onCancel: () => { openAiDoneCancelled = true; } },
  )));
  assert.equal(openAiDoneCancelled, true);
  assert.ok(openAiDoneEvents.some((event) => event.type === "text_delta" && event.delta === "x"));
  assertSingleDone(openAiDoneEvents);

  let openAiReasonCancelled = false;
  const openAiReasonEvents = await collectAdapterEvents(openAiAdapter(repeatingSseStream(
    (index) => index === 1
      ? 'data: {"choices":[{"delta":{"content":"final"},"finish_reason":"stop"}]}\n\n'
      : HEARTBEAT,
    { intervalMs: 8, onCancel: () => { openAiReasonCancelled = true; } },
  )));
  assert.equal(openAiReasonCancelled, true);
  assert.ok(openAiReasonEvents.some((event) => event.type === "text_delta" && event.delta === "final"));
  assert.ok(openAiReasonEvents.some((event) => event.type === "done" && event.finishReason === "stop"));
  assertSingleDone(openAiReasonEvents);

  let anthropicCancelled = false;
  const anthropicEvents = await collectAdapterEvents(new AnthropicAdapter({
    id: "anthropic-terminal",
    model: "test",
    apiKey: "test",
    requestTimeoutMs: 20,
    transport: bodyTransport(repeatingSseStream(
      (index) => index === 1
        ? ANTHROPIC_TEXT
        : index === 2 ? 'data: {"type":"message_stop"}\n\n' : HEARTBEAT,
      { intervalMs: 8, onCancel: () => { anthropicCancelled = true; } },
    )),
  }));
  assert.equal(anthropicCancelled, true);
  assert.ok(anthropicEvents.some((event) => event.type === "text_delta" && event.delta === "x"));
  assertSingleDone(anthropicEvents);

  let geminiCancelled = false;
  const geminiEvents = await collectAdapterEvents(new GeminiAdapter({
    id: "gemini-terminal",
    model: "test",
    apiKey: "test",
    requestTimeoutMs: 20,
    transport: bodyTransport(repeatingSseStream(
      (index) => index === 1
        ? 'data: {"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"last"}]}}]}\n\n'
        : HEARTBEAT,
      { intervalMs: 8, onCancel: () => { geminiCancelled = true; } },
    )),
  }));
  assert.equal(geminiCancelled, true);
  assert.ok(geminiEvents.some((event) => event.type === "text_delta" && event.delta === "last"));
  assert.ok(geminiEvents.some((event) => event.type === "done" && event.finishReason === "STOP"));
  assertSingleDone(geminiEvents);
}

await verifyIdleSemantics();
await verifyAdaptersAndTerminalWiring();
await verifySemanticProgress();
await verifyTerminalStopsNetworkRead();
console.log("provider stream watchdog verification passed");
