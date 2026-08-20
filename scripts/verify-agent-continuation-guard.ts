import assert from "node:assert/strict";
import { NativeToolAgentLoop } from "../src/features/kb/services/agent-core/loop/native-tool-agent-loop";
import { inspectUnfinishedAgentOutput } from "../src/features/kb/services/agent-core/loop/unfinished-agent-output";
import type { AgentStreamEvent } from "../src/features/kb/services/agent-core/loop/stream-event";
import type {
  AgentChatRequest,
  AgentProviderEvent,
  ProviderAdapter,
} from "../src/features/kb/services/agent-core/providers/provider-adapter";
import type { AgentHttpTransport } from "../src/features/kb/services/agent-core/providers/agent-http-transport";
import { OpenAICompatibleAdapter } from "../src/features/kb/services/agent-core/providers/openai-compatible-adapter";
import { OPENAI_COMPATIBLE_CAPABILITIES } from "../src/features/kb/services/agent-core/providers/provider-capabilities";
import { NativeToolRegistry } from "../src/features/kb/services/agent-core/tools/native-tool-registry";
import type { AssistantChatMessage } from "../src/features/kb/types/chat";
import {
  assertFinalAnswer,
  buildFinalAnswerComposerPrompt,
} from "../src/features/kb/services/agent-workbench/runtime/final-answer-composer";
import {
  routeAgentStreamEvent,
  routeFinalAnswerComposerEvent,
  type AgentPresentationState,
} from "../src/features/kb/services/agent-workbench/runtime/run-agent-profile";

const repeated = [
  "从当前结果中只能看到 focus 组件位于 visualChart 之后、PicCaro 之前，但这还不足以确定分类，因此我准备继续查看它的完整信息并核对 categoryId 字段。",
  "当前主页只有 accounting 和 musicPlayer 两个组件，为了整理每个分类下的全部组件，我还需要把组件目录与现有布局逐项进行比对，然后继续完成添加操作。",
  "从当前结果中只能看到 focus 组件位于 visualChart 之后、PicCaro 之前，但这还不足以确定分类，因此我准备继续查看它的完整信息并核对 categoryId 字段。",
  "当前主页只有 accounting 和 musicPlayer 两个组件，为了整理每个分类下的全部组件，我还需要把组件目录与现有布局逐项进行比对，然后继续完成添加操作。",
  "从当前结果中只能看到 focus 组件位于 visualChart 之后、PicCaro 之前，但这还不足以确定分类，因此我准备继续查看它的完整信息并核对 categoryId 字段。",
  "当前主页只有 accounting 和 musicPlayer 两个组件，为了整理每个分类下的全部组件，我还需要把组件目录与现有布局逐项进行比对，然后继续完成添加操作。",
].join("\n\n");
assert.equal(
  inspectUnfinishedAgentOutput(repeated, { toolsAvailable: true })?.reason,
  "repetitive_output",
);
assert.equal(
  inspectUnfinishedAgentOutput("已有结果还不完整。让我查看 focus 组件的完整信息。", { toolsAvailable: true })?.reason,
  "dangling_tool_intent",
);
assert.equal(
  inspectUnfinishedAgentOutput("已完成检查，focus 属于日常工具分类。", { toolsAvailable: true }),
  undefined,
);
assert.equal(
  inspectUnfinishedAgentOutput("请告诉我希望修改哪个组件？", { toolsAvailable: true }),
  undefined,
);

class RecoveryProvider implements ProviderAdapter {
  readonly id = "continuation-guard-test";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    const turn = this.requests.length;
    if (turn === 1) {
      yield { type: "text_delta", delta: "已有结果还不完整。让我查看 focus 组件的完整信息。" };
      yield { type: "done", finishReason: "stop" };
      return;
    }
    if (turn === 2) {
      yield {
        type: "tool_call_done",
        toolCall: { id: "call-recovery", name: "lookup_widget", arguments: "{}", index: 0 },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "text_delta", delta: "已通过真实工具调用确认，任务继续并完成。" };
    yield { type: "done", finishReason: "stop" };
  }
}

const provider = new RecoveryProvider();
const registry = new NativeToolRegistry();
registry.register({
  name: "lookup_widget",
  title: "查询组件",
  description: "测试用只读查询",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute() {
    return { ok: true, content: JSON.stringify({ categoryId: "tool" }), summary: "查询完成" };
  },
});

const requestBodies: Array<Record<string, unknown>> = [];
const sseTransport: AgentHttpTransport = {
  async post(options) {
    requestBodies.push(JSON.parse(options.body) as Record<string, unknown>);
    const sse = [
      'data: {"choices":[{"delta":{"content":"部分正文"},"finish_reason":null}]}',
      "",
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
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
const openAIAdapter = new OpenAICompatibleAdapter({
  id: "openai-sse-regression",
  model: "test-model",
  chatCompletionsUrl: "https://example.invalid/v1/chat/completions",
  transport: sseTransport,
});
const openAIEvents: AgentProviderEvent[] = [];
for await (const event of openAIAdapter.streamChat({
  messages: [{ role: "user", content: "测试" }],
  tools: registry.listProviderVisible(),
  toolChoice: "required",
})) {
  openAIEvents.push(event);
}
assert.equal(
  openAIEvents.slice().reverse().find((event) => event.type === "done")?.finishReason,
  "length",
  "[DONE] must not erase the concrete finish_reason from the preceding SSE frame",
);
assert.equal(requestBodies[0]?.tool_choice, "required");

const fallbackBodies: Array<Record<string, unknown>> = [];
const fallbackAdapter = new OpenAICompatibleAdapter({
  id: "required-tool-choice-fallback",
  model: "thinking-model",
  chatCompletionsUrl: "https://example.invalid/v1/chat/completions",
  transport: {
    async post(options) {
      fallbackBodies.push(JSON.parse(options.body) as Record<string, unknown>);
      if (fallbackBodies.length === 1) {
        return {
          ok: false,
          status: 400,
          statusText: "Bad Request",
          headers: { get: () => "application/json" },
          async json() { return {}; },
          async text() {
            return JSON.stringify({ error: { message: "Thinking mode does not support this tool_choice" } });
          },
          body: null,
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        async json() {
          return { choices: [{ message: { content: "fallback ok" }, finish_reason: "stop" }] };
        },
        async text() { return ""; },
        body: null,
      };
    },
  },
});
const fallbackEvents: AgentProviderEvent[] = [];
for await (const event of fallbackAdapter.streamChat({
  messages: [{ role: "user", content: "测试" }],
  tools: registry.listProviderVisible(),
  toolChoice: "required",
})) {
  fallbackEvents.push(event);
}
assert.equal(fallbackBodies.length, 2);
assert.equal(fallbackBodies[0]?.tool_choice, "required");
assert.equal(fallbackBodies[1]?.tool_choice, "auto");
assert.ok(fallbackEvents.some((event) => event.type === "text_delta" && event.delta === "fallback ok"));

const events: string[] = [];
const result = await new NativeToolAgentLoop({
  provider,
  toolRegistry: registry,
  systemPrompt: "测试",
  onEvent: (event) => events.push(event.type),
}).run("继续完成任务");

assert.equal(result.status, "answer_ready");
assert.equal(result.answer, "已通过真实工具调用确认，任务继续并完成。");
assert.equal(provider.requests.length, 3);
assert.equal(provider.requests[0]?.toolChoice, "auto");
assert.equal(provider.requests[1]?.toolChoice, "auto");
assert.equal(provider.requests[2]?.toolChoice, "auto");
assert.ok(events.includes("assistant_text_reset"));
assert.ok(events.includes("notice"));
assert.ok(events.includes("tool_start"));
assert.ok(events.includes("tool_result"));

// The presentation boundary is verified at the ChatMessage-shaped state, not
// only at Native/Adapter event output.
const presentationEvents: AgentStreamEvent[] = [
  { type: "assistant_text_delta", delta: "让我先核对工具结果。", fullContent: "让我先核对工具结果。" },
  { type: "tool_start" } as AgentStreamEvent,
  { type: "tool_result" } as AgentStreamEvent,
  { type: "assistant_text_delta", delta: "|字段|值|\n|---|---|\n|状态|已找到|", fullContent: "|字段|值|\n|---|---|\n|状态|已找到|" },
  { type: "tool_start" } as AgentStreamEvent,
  { type: "tool_result" } as AgentStreamEvent,
  { type: "assistant_final", answer: "Agent 过程草稿" },
  { type: "done", status: "answer_ready" },
];
assert.equal(presentationEvents.filter((event) => event.type === "tool_start").length, 2);

let processReasoning = "";
let processReasoningParts = 0;
let processReasoningStatus: "streaming" | "done" = "streaming";
let agentAnswerFinishCount = 0;
let presentationState: AgentPresentationState = { reasoningStarted: false, answerFinished: false };
for (const event of presentationEvents) {
  presentationState = routeAgentStreamEvent(event, presentationState, {
    composeFinalAnswer: true,
    thinkingMode: "on",
    onAnswerFinish: () => { agentAnswerFinishCount++; },
    onReasoningDelta: (reasoningEvent) => {
      if (reasoningEvent.type === "reasoning-start") processReasoningStatus = "streaming";
      if (reasoningEvent.type === "reasoning-delta") {
        processReasoning += reasoningEvent.delta ?? "";
        processReasoningParts++;
      }
      if (reasoningEvent.type === "reasoning-end") processReasoningStatus = "done";
    },
  });
}
assert.equal(presentationState.reasoningStarted, true);
assert.equal(presentationState.answerFinished, false);
assert.equal(agentAnswerFinishCount, 0);
assert.match(processReasoning, /工具结果/);
assert.match(processReasoning, /字段/);

let composerReasoning = "";
let composerContent = "";
let composerState: Pick<AgentPresentationState, "reasoningStarted"> = {
  reasoningStarted: presentationState.reasoningStarted,
};
for (const reasoningEvent of [
  { type: "reasoning-start" as const },
  { type: "reasoning-delta" as const, delta: "正在组织最终回答。" },
  { type: "reasoning-delta" as const, delta: "只保留已验证事实。" },
  { type: "reasoning-end" as const },
]) {
  composerState = routeFinalAnswerComposerEvent(reasoningEvent, composerState, (event) => {
    if (event.type === "reasoning-delta") composerReasoning += event.delta ?? "";
    if (event.type === "reasoning-end") processReasoningStatus = "done";
  });
}
assert.equal(composerState.reasoningStarted, false);
composerContent = "最终回答只来自 Composer。";
processReasoning += composerReasoning;
processReasoningParts += 2;
const composedMessage: AssistantChatMessage = {
  id: "presentation-check",
  role: "assistant",
  content: composerContent,
  createdAt: Date.now(),
  isComplete: true,
  reasoning: {
    content: processReasoning,
    status: processReasoningStatus,
    partCount: processReasoningParts,
    chars: processReasoning.length,
  },
};
assert.equal(composedMessage.content, "最终回答只来自 Composer。");
assert.equal(composedMessage.content.includes("让我先核对"), false);
assert.equal(composedMessage.content.includes("字段"), false);
assert.ok(composedMessage.reasoning);
assert.equal(composedMessage.reasoning.status, "done");
assert.match(composedMessage.reasoning.content, /最终回答/);

let thinkingOffReasoning = "";
let thinkingOffContent = "";
let thinkingOffState: AgentPresentationState = { reasoningStarted: false, answerFinished: false };
for (const event of presentationEvents) {
  thinkingOffState = routeAgentStreamEvent(event, thinkingOffState, {
    composeFinalAnswer: true,
    thinkingMode: "off",
    onAnswerChunk: ({ fullContent }) => { thinkingOffContent = fullContent; },
    onReasoningDelta: (reasoningEvent) => { thinkingOffReasoning += reasoningEvent.delta ?? ""; },
  });
}
thinkingOffContent = "关闭思考时的最终 Composer 正文";
assert.equal(thinkingOffState.reasoningStarted, false);
assert.equal(thinkingOffReasoning, "");
assert.equal(thinkingOffContent, "关闭思考时的最终 Composer 正文");

const composerPrompt = buildFinalAnswerComposerPrompt({
  question: "汇总已完成结果",
  draftBody: "Agent draft D:\\private\\draft.md",
  globalMemory: "token=should-not-leak",
  observations: [{
    id: 1,
    timestamp: 0,
    kind: "tool_executed",
    toolName: "lookup_widget",
    summary: "查询完成，路径 D:\\private\\result.json",
    content: "raw-sensitive-tool-content",
  }],
});
assert.match(composerPrompt, /查询完成/);
assert.equal(composerPrompt.includes("raw-sensitive-tool-content"), false);
assert.equal(composerPrompt.includes("D:\\private\\result.json"), false);
assert.equal(composerPrompt.includes("should-not-leak"), false);

assert.throws(
  () => assertFinalAnswer(""),
  (error: unknown) => (error as { code?: string }).code === "final_answer_composer_empty",
);
assert.equal(presentationEvents.filter((event) => event.type === "tool_start").length, 2, "Composer failure must not rerun tools");
assert.equal(processReasoningStatus, "done", "Composer failure must not leave reasoning streaming");

console.log("Agent continuation guard verification passed.");
