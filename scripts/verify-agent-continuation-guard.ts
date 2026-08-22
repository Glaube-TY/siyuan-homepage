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
  streamFinalAnswerFromDraft,
  type FinalAnswerComposerIo,
} from "../src/features/kb/services/agent-workbench/runtime/final-answer-composer";
import { AgentProviderError, isEmptyStreamError } from "../src/features/kb/services/agent-core/providers/provider-error";
import type { StreamModelTextCallbacks } from "../src/features/kb/services/qa/kb-model-call";
import type { ThinkingMode } from "../src/features/kb/types/session";
import { buildAgentSystemPrompt } from "../src/features/kb/services/agent-core/prompts/system-prefix";
import {
  routeAgentStreamEvent,
  routeFinalAnswerComposerEvent,
  type AgentPresentationState,
  runAgentProfile,
} from "../src/features/kb/services/agent-workbench/runtime/run-agent-profile";
import { ToolResultLog } from "../src/features/kb/services/agent-workbench/runtime/tool-result-log";
import { validateTurnFinalAnswer } from "../src/features/kb/services/agent-workbench/runtime/tool-evidence-validator";
import { mapAgentErrorToUserFacing } from "../src/features/kb/services/agent-workbench/runtime/user-facing-agent-error";
import { buildAgentTurnMemory } from "../src/features/kb/services/agent-workbench/memory/agent-turn-memory";
import { mergeWorkbenchEvents } from "../src/features/kb/services/orchestration/agent-workbench-mode-flow";
import type { AgentRunCheckpoint as AgentRunCheckpointType } from "../src/features/kb/services/agent-core/session/agent-run-checkpoint";
import type { ToolResultEntry as ToolResultEntryLite } from "../src/features/kb/services/agent-workbench/runtime/tool-result-log";
import { extractActionTraceSummary } from "../src/features/kb/services/agent-workbench/memory/agent-turn-memory";
import type { AgentWorkbenchEvent } from "../src/features/kb/services/agent-workbench/events/agent-workbench-events";
import { getAgentProfile, KNOWLEDGE_CHAT_AGENT_PROFILE_ID } from "../src/features/agent-platform/agent-profile";
import { setNotebrainPlugin } from "../src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import {
  formatToolDisplayName,
  formatToolResultSummary,
  formatToolFailureSummary,
  resolveWorkbenchFinalStatus,
} from "../src/features/kb/services/agent-workbench/presentation/tool-step-presentation";
import {
  HomepageComponentConflictError,
  isComponentConflictError,
  homepageComponentFailure,
} from "../src/features/kb/services/agent-workbench/tools/homepage-components/homepage-component-tool-utils";
import {
  ReviewConflictError,
} from "../src/components/utils/widgetBlock/widget/reviewDocs/reviewDocs";
import {
  EnhancedDiaryProjectWriteTargetError,
  extractProjectWriteTargetErrorCode,
} from "../src/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceProjectLifecycle";
import {
  createHomepageReviewActionTools,
} from "../src/features/kb/services/agent-workbench/tools/homepage-components/homepage-review.tool";
import {
  createListItemsByTimeTool,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/list-items-by-time.tool";
import {
  executeListItemsByTime,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/list-items-by-time.impl";
import {
  SiyuanToolInvalidArgsError,
  createGenericSiyuanTool,
} from "../src/features/kb/services/agent-workbench/tools/siyuan/siyuan-generic-tool-factory";
import { requireString } from "../src/features/kb/services/agent-workbench/tools/siyuan/impl/siyuan-tool-impl-utils.impl";
import { requestChecked, SiyuanApiError } from "../src/api";
import { setSiyuanRuntimePort } from "../src/runtime/siyuan-runtime-port";
import { z } from "zod";

setNotebrainPlugin({
  isMobile: false,
  loadData: async () => undefined,
  saveData: async () => {},
  removeData: async () => {},
} as never);

// === 1. Language-Agnostic Repetitive Output Diagnostics ===
const repeated = [
  "从当前结果中只能看到 focus 组件位于 visualChart 之后、PicCaro 之前，但这还不足以确定分类，因此我准备继续查看它的完整信息并核对 categoryId 字段。",
  "当前主页只有 accounting 和 musicPlayer 两个组件，为了整理每个分类下的全部组件，我还需要把组件目录与现有布局逐项进行比对，然后继续完成添加操作。",
  "从当前结果中只能看到 focus 组件位于 visualChart 之后、PicCaro 之前，但这还不足以确定分类，因此我准备继续查看它的完整信息并核对 categoryId 字段。",
  "当前主页只有 accounting 和 musicPlayer 两个组件，为了整理每个分类下的全部组件，我还需要把组件目录与现有布局逐项进行比对，然后继续完成添加操作。",
  "从当前结果中只能看到 focus 组件位于 visualChart 之后、PicCaro 之前，但这还不足以确定分类，因此我准备继续查看它的完整信息并核对 categoryId 字段。",
  "当前主页只有 accounting 和 musicPlayer 两个组件，为了整理每个分类下的全部组件，我还需要把组件目录与现有布局逐项进行比对，然后继续完成添加操作。",
].join("\n\n");
assert.equal(
  inspectUnfinishedAgentOutput(repeated)?.reason,
  "repetitive_output",
);
assert.equal(
  inspectUnfinishedAgentOutput("已完成检查，focus 属于日常工具分类。"),
  undefined,
);
assert.equal(
  inspectUnfinishedAgentOutput("请告诉我希望修改哪个组件？"),
  undefined,
);
assert.equal(
  inspectUnfinishedAgentOutput("Which component would you like to update?"),
  undefined,
);
assert.equal(
  inspectUnfinishedAgentOutput("どのコンポーネントを変更しますか？"),
  undefined,
);

// === 2. Provider Adapter & Transport Regressions ===
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
    ].join("\n\n");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/event-stream" : null) },
      async json() { return {}; },
      async text() { return sse; },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      }),
    };
  },
};

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
);
assert.equal(requestBodies[0]?.tool_choice, "required");

// === 3. Presentation State & Reasoning Tests ===
const presentationEvents: AgentStreamEvent[] = [
  { type: "assistant_reasoning_delta", delta: "让我先核对一下组件目录。", fullReasoning: "让我先核对一下组件目录。" },
  { type: "tool_start", stepIndex: 0, toolCallId: "call-1", toolName: "lookup_widget", argsPreview: {}, readOnly: true, startedAt: Date.now() },
  { type: "tool_result", stepIndex: 0, toolCallId: "call-1", toolName: "lookup_widget", result: { ok: true, content: "{}" }, durationMs: 10 },
  { type: "assistant_text_delta", delta: "根据核对结果，focus 属于工具分类。", fullContent: "根据核对结果，focus 属于工具分类。" },
  { type: "assistant_reasoning_delta", delta: "继续检查是否有更多字段。", fullReasoning: "让我先核对一下组件目录。继续检查是否有更多字段。" },
  { type: "tool_start", stepIndex: 1, toolCallId: "call-2", toolName: "lookup_widget", argsPreview: {}, readOnly: true, startedAt: Date.now() },
  { type: "tool_result", stepIndex: 1, toolCallId: "call-2", toolName: "lookup_widget", result: { ok: true, content: "{}" }, durationMs: 10 },
];

let processReasoning = "";
let processReasoningParts = 0;
let processReasoningStatus: "streaming" | "done" = "streaming";
let presentationState: AgentPresentationState = { reasoningStarted: false, answerFinished: false };

for (const event of presentationEvents) {
  presentationState = routeAgentStreamEvent(event, presentationState, {
    composeFinalAnswer: true,
    thinkingMode: "on",
    onAnswerChunk: () => {
      assert.fail("Live tool stream text must not be emitted to user answer when composeFinalAnswer is active");
    },
    onReasoningDelta: (reasoningEvent) => {
      if (reasoningEvent.type === "reasoning-start") {
        processReasoningParts += 1;
      } else if (reasoningEvent.type === "reasoning-delta") {
        processReasoning += reasoningEvent.delta ?? "";
      } else if (reasoningEvent.type === "reasoning-end") {
        processReasoningStatus = "done";
      }
    },
  });
}
assert.equal(presentationState.reasoningStarted, true);
assert.match(processReasoning, /让我先核对一下组件目录/);
assert.match(processReasoning, /根据核对结果，focus 属于工具分类/);
assert.match(processReasoning, /继续检查是否有更多字段/);

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
assert.ok(composedMessage.reasoning);
assert.equal(composedMessage.reasoning.status, "done");

// === 4. Composer Prompt, System Prompt & Safety Boundary ===
const universalSystemPrompt = buildAgentSystemPrompt();
const promptNonBlankLines = universalSystemPrompt.split("\n").filter((l) => l.trim().length > 0);
assert.ok(promptNonBlankLines.length <= 25, `System prompt 行数必须 <= 25，实际 ${promptNonBlankLines.length}`);
assert.equal(universalSystemPrompt.includes("用户当前消息明确提供的内容可作输入事实"), true);
assert.equal(universalSystemPrompt.includes("历史回答不得作为本轮外部状态证据"), true);
assert.equal(universalSystemPrompt.includes("必须依据本轮真实 tool_result"), true);
assert.equal(universalSystemPrompt.includes("未执行工具时不得声称已检查或给出当前状态"), true);

// 4.1. 有 Observation 场景：结构化执行证据
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
assert.equal(composerPrompt.includes("本轮真实结构化证据"), true);
assert.equal(composerPrompt.includes("raw-sensitive-tool-content"), false);
assert.equal(composerPrompt.includes("D:\\private\\result.json"), false);
assert.equal(composerPrompt.includes("should-not-leak"), false);

// 4.2. 无 Observation 场景：明确声明无工具证据，草稿不得作为外部检查事实
const zeroObservationPrompt = buildFinalAnswerComposerPrompt({
  question: "检查当前数据库组件配置",
  draftBody: "已完成只读检查，当前数据源为 manual，包含两条任务。",
  globalMemory: "token=should-not-leak",
  observations: [],
});
assert.equal(zeroObservationPrompt.includes("本轮未执行任何工具，无外部状态证据"), true);
assert.equal(zeroObservationPrompt.includes("草稿、历史会话和全局记忆均不是外部状态证据"), true);
assert.equal(zeroObservationPrompt.includes("非外部事实证据，不得据此声称已检查或已操作"), true);
assert.equal(zeroObservationPrompt.includes("should-not-leak"), false);

assert.throws(
  () => assertFinalAnswer(""),
  (error: unknown) => (error as { code?: string }).code === "final_answer_composer_empty",
);

// === 5. Multi-Lingual Consistency: Chinese, English, Japanese, German, Arabic ===
const MULTI_LANG_QUESTIONS = [
  { lang: "zh", text: "什么是 SQL？" },
  { lang: "en", text: "What is SQL?" },
  { lang: "ja", text: "SQLとは何ですか？" },
  { lang: "de", text: "Was ist SQL?" },
  { lang: "ar", text: "ما هي لغة SQL؟" },
];

class MultilingualDirectProvider implements ProviderAdapter {
  readonly id = "multilingual-direct-provider";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    yield { type: "text_delta", delta: "SQL is a domain-specific language used in programming and designed for managing data in RDBMS." };
    yield { type: "done", finishReason: "stop" };
  }
}

for (const { lang, text } of MULTI_LANG_QUESTIONS) {
  const directProvider = new MultilingualDirectProvider();
  const directObsLog = new ToolResultLog();
  const directEvents: AgentStreamEvent[] = [];

  const directResult = await new NativeToolAgentLoop({
    provider: directProvider,
    toolRegistry: registry,
    systemPrompt: "System Prompt",
    validateFinalAnswer: (answer) => validateTurnFinalAnswer(answer, {
      observations: directObsLog.all(),
    }),
    onEvent: (e) => directEvents.push(e),
  }).run(text);

  assert.equal(directResult.status, "answer_ready", `Direct concept question in ${lang} must succeed without tools`);
  assert.equal(directProvider.requests.length, 1);
  assert.equal(directEvents.some((e) => e.type === "assistant_final"), true);
}

// === 6. Multi-Lingual Native Tool Execution & Recovery Loop ===
class MultilingualToolRecoveryProvider implements ProviderAdapter {
  readonly id = "multilingual-tool-provider";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    const turn = this.requests.length;
    if (turn === 1) {
      yield {
        type: "tool_call_done",
        toolCall: { id: "call-multi", name: "lookup_widget", arguments: "{}", index: 0 },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "text_delta", delta: "Verified: widget category is tool." };
    yield { type: "done", finishReason: "stop" };
  }
}

for (const { lang, text } of MULTI_LANG_QUESTIONS) {
  const toolProvider = new MultilingualToolRecoveryProvider();
  const toolObsLog = new ToolResultLog();
  const toolEvents: AgentStreamEvent[] = [];

  const loopResult = await new NativeToolAgentLoop({
    provider: toolProvider,
    toolRegistry: registry,
    systemPrompt: "System Prompt",
    validateFinalAnswer: (answer) => validateTurnFinalAnswer(answer, {
      observations: toolObsLog.all(),
    }),
    onEvent: (e) => toolEvents.push(e),
  }).run(text);

  assert.equal(loopResult.status, "answer_ready", `Tool execution in ${lang} must succeed`);
  assert.equal(toolProvider.requests.length, 2);
  assert.ok(toolEvents.some((e) => e.type === "tool_start"));
  assert.ok(toolEvents.some((e) => e.type === "tool_result"));
}

// === 7. Real runAgentProfile Integration Lifecycles ===

// Lifecycle 1: Zero observation direct answer -> Composer 1, finalize 1
{
  let directComposerCalls = 0;
  let directFinalizeCalls = 0;
  const directEvents: AgentWorkbenchEvent[] = [];

  const directProfileResult = await runAgentProfile({
    profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
    mode: "whole_kb",
    question: "What is SQL in English?",
    provider: new MultilingualDirectProvider(),
    validateFinalAnswer: (answer, context) => validateTurnFinalAnswer(answer, context),
    composeFinalAnswer: async (context) => {
      directComposerCalls += 1;
      return "Direct Composer: " + context.draftBody;
    },
    finalize: async (context) => {
      directFinalizeCalls += 1;
      return { result: { answer: context.answer } };
    },
    onWorkbenchEvent: (e) => directEvents.push(e),
  });

  assert.equal(directProfileResult.ok, true);
  assert.equal(directComposerCalls, 1, "Direct answer composeFinalAnswer must be called exactly once");
  assert.equal(directFinalizeCalls, 1, "Direct answer finalize must be called exactly once");
  assert.match(directProfileResult.result?.answer ?? "", /Direct Composer:/);
}

// Lifecycle 2: Tool execution success -> Composer 1, finalize 1, action trace contains real tool
{
  let toolComposerCalls = 0;
  let toolFinalizeCalls = 0;
  const toolProfileEvents: AgentWorkbenchEvent[] = [];

  const profileSuccessResult = await runAgentProfile({
    profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
    mode: "whole_kb",
    question: "Check widgets across languages",
    provider: new MultilingualToolRecoveryProvider(),
    validateFinalAnswer: (answer, context) => validateTurnFinalAnswer(answer, context),
    composeFinalAnswer: async (context) => {
      toolComposerCalls += 1;
      return "Composer Output: " + context.draftBody;
    },
    finalize: async (context) => {
      toolFinalizeCalls += 1;
      return { result: { answer: context.answer } };
    },
    onWorkbenchEvent: (e) => toolProfileEvents.push(e),
  });

  assert.equal(profileSuccessResult.ok, true);
  assert.equal(toolComposerCalls, 1, "composeFinalAnswer must be called exactly once on tool success");
  assert.equal(toolFinalizeCalls, 1, "finalize must be called exactly once on tool success");
  assert.equal(profileSuccessResult.result?.answer, "Composer Output: Verified: widget category is tool.");
  const realTrace = extractActionTraceSummary(toolProfileEvents);
  assert.deepEqual(realTrace.toolNames, ["lookup_widget"], "Action trace must strictly contain real executed tools");
}

// Lifecycle 3: Missing Citation Validation Failure Lifecycle -> Composer 0, finalize 0
class MissingCitationProvider implements ProviderAdapter {
  readonly id = "missing-citation-provider";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    const turn = this.requests.length;
    if (turn === 1) {
      yield {
        type: "tool_call_done",
        toolCall: { id: "call-search", name: "lookup_widget", arguments: "{}", index: 0 },
      };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    // Turn 2 & 3: Outputs answer without citation tags
    yield { type: "text_delta", delta: "Doc content without citation tag." };
    yield { type: "done", finishReason: "stop" };
  }
}

const citationObsLog = new ToolResultLog();
citationObsLog.push({
  kind: "tool_executed",
  toolName: "read_docs",
  summary: "Read document",
  content: {
    items: [{
      docId: "20240101120000-abcdefg",
      title: "Doc Guide",
      content: "Important content",
    }],
  },
});

const citationEvents: AgentStreamEvent[] = [];
const citationLoopResult = await new NativeToolAgentLoop({
  provider: new MissingCitationProvider(),
  toolRegistry: registry,
  systemPrompt: "System Prompt",
  validateFinalAnswer: (answer) => validateTurnFinalAnswer(answer, {
    observations: citationObsLog.all(),
  }),
  onEvent: (e) => citationEvents.push(e),
}).run("Query doc guide");

assert.equal(citationLoopResult.status, "failed");
assert.equal(citationLoopResult.errorCode, "missing_citation_reference");

let failComposerCalls = 0;
let failFinalizeCalls = 0;

const validationFailResult = await runAgentProfile({
  profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
  mode: "whole_kb",
  question: "Query doc guide",
  provider: new MissingCitationProvider(),
  validateFinalAnswer: () => ({
    valid: false,
    retryInstruction: "Must provide valid citation tags.",
    forceToolCall: false,
    errorCode: "missing_citation_reference",
    errorMessage: "Missing citation reference in answer.",
  }),
  composeFinalAnswer: async () => {
    failComposerCalls += 1;
    return "Should not reach here";
  },
  finalize: async () => {
    failFinalizeCalls += 1;
    return { result: { answer: "" } };
  },
});

assert.equal(validationFailResult.ok, false);
assert.equal(validationFailResult.agentErrorCode, "missing_citation_reference");
assert.equal(failComposerCalls, 0, "Composer must never be called on citation validation failure");
assert.equal(failFinalizeCalls, 0, "Finalize must never be called on citation validation failure");

// === 8. User Facing Error Mapping ===
const missingCitationError = mapAgentErrorToUserFacing({
  agentErrorCode: "missing_citation_reference",
});
assert.equal(missingCitationError.title, "回答未通过来源引用校验");

const finalValidationFailedError = mapAgentErrorToUserFacing({
  agentErrorCode: "final_answer_validation_failed",
});
assert.equal(finalValidationFailedError.title, "终稿校验未通过");

// === 9. Multi-Lingual Presentation & Tool Summary Formatter ===
assert.equal(formatToolDisplayName("lookup_widget"), "lookup_widget");
assert.equal(formatToolDisplayName("siyuan_kb"), "使用知识库");
assert.equal(formatToolResultSummary("Query Tool", "Success with 5 items"), "Success with 5 items");
assert.equal(formatToolResultSummary("クエリツール", "5件のデータ取得完了"), "5件のデータ取得完了");
assert.equal(formatToolResultSummary("أداة البحث", "تم استرداد 5 عناصر بنجاح"), "تم استرداد 5 عناصر بنجاح");
assert.equal(formatToolFailureSummary("Tool", "Network timeout"), "Network timeout");

assert.equal(resolveWorkbenchFinalStatus([
  { type: "error", code: "pseudo_tool_markup_blocked" },
]), "failed");
assert.equal(resolveWorkbenchFinalStatus([
  { type: "done", status: "answer_ready" },
]), "answer_ready");

// === 10. Real SiYuan API Exception Chain (requestChecked -> SiyuanApiError -> GenericTool) ===
setSiyuanRuntimePort({
  async post(path: string) {
    if (path === "/api/test/fail") {
      return { code: -1, msg: "mock db lock error", data: null };
    }
    return { code: 0, msg: "", data: { success: true } };
  },
});

let caughtApiErr: unknown;
try {
  await requestChecked("/api/test/fail", {}, "testCall");
} catch (e) {
  caughtApiErr = e;
}
assert.ok(caughtApiErr instanceof SiyuanApiError, "requestChecked must throw SiyuanApiError on code !== 0");
assert.equal((caughtApiErr as SiyuanApiError).code, "siyuan_api_failed");
assert.equal((caughtApiErr as SiyuanApiError).siyuanCode, -1);
assert.equal((caughtApiErr as SiyuanApiError).siyuanMsg, "mock db lock error");

const realApiTool = createGenericSiyuanTool({
  name: "test_real_api_tool",
  title: "Real API Tool",
  description: "Tests real api error propagation",
  inputSchema: z.object({ shouldFail: z.boolean() }),
  readOnly: true,
  inputHint: "hint",
  boundary: "boundary",
  deps: {
    execute: async (args) => {
      const data = await requestChecked(args.shouldFail ? "/api/test/fail" : "/api/test/ok", {});
      return { output: { action: "query", data, truncated: false, hasMore: false } };
    },
  },
  inputJsonSchemaOverride: {},
});

const realApiFailResult = await realApiTool.execute({} as never, { shouldFail: true });
assert.equal(realApiFailResult.ok, false);
assert.equal(realApiFailResult.error?.code, "siyuan_api_failed", "Real API failure must be classified as siyuan_api_failed");

// === 11. Real Tool Parameter Validation Chain (requireString -> SiyuanToolInvalidArgsError -> GenericTool) ===
let caughtArgsErr: unknown;
try {
  requireString("", "docId");
} catch (e) {
  caughtArgsErr = e;
}
assert.ok(caughtArgsErr instanceof SiyuanToolInvalidArgsError, "requireString must throw SiyuanToolInvalidArgsError on empty input");
assert.equal((caughtArgsErr as SiyuanToolInvalidArgsError).code, "invalid_args");

const realParamTool = createGenericSiyuanTool({
  name: "test_param_tool",
  title: "Param Tool",
  description: "Tests real param error propagation",
  inputSchema: z.object({ docId: z.string() }),
  readOnly: true,
  inputHint: "hint",
  boundary: "boundary",
  deps: {
    execute: async (args) => {
      const id = requireString(args.docId, "docId");
      return { output: { action: "get", data: { id }, truncated: false, hasMore: false } };
    },
  },
  inputJsonSchemaOverride: {},
});

const realParamFailResult = await realParamTool.execute({} as never, { docId: "" });
assert.equal(realParamFailResult.ok, false);
assert.equal(realParamFailResult.error?.code, "invalid_args", "Parameter validation failure must be classified as invalid_args");

// === 12. Message Text Invariance & Code-Stripping Verification ===
// Test custom multilingual message text with structured code -> classification is 100% accurate
const multiLingualApiTool = createGenericSiyuanTool({
  name: "test_ml_tool",
  title: "ML Tool",
  description: "Tests message text invariance",
  inputSchema: z.object({ mode: z.string() }),
  readOnly: true,
  inputHint: "hint",
  boundary: "boundary",
  deps: {
    execute: async (args) => {
      if (args.mode === "en_api") {
        throw new SiyuanApiError("Kernel database connection failed unexpectedly", { siyuanCode: 500 });
      }
      if (args.mode === "ja_args") {
        throw new SiyuanToolInvalidArgsError("無効な引数が指定されました");
      }
      if (args.mode === "plain_err_with_text") {
        // Plain Error containing former keywords - must NOT be misclassified
        throw new Error("思源 API 调用失败 [invalid_args] arbitrary failure");
      }
      return { output: { action: "ok", truncated: false, hasMore: false } };
    },
  },
  inputJsonSchemaOverride: {},
});

const enApiRes = await multiLingualApiTool.execute({} as never, { mode: "en_api" });
assert.equal(enApiRes.error?.code, "siyuan_api_failed", "English API error with structured code must classify as siyuan_api_failed");

const jaArgsRes = await multiLingualApiTool.execute({} as never, { mode: "ja_args" });
assert.equal(jaArgsRes.error?.code, "invalid_args", "Japanese args error with structured code must classify as invalid_args");

const plainErrRes = await multiLingualApiTool.execute({} as never, { mode: "plain_err_with_text" });
assert.equal(plainErrRes.error?.code, "siyuan_tool_failed", "Plain error without structured code must NOT be misclassified by message sniffing");

// === 13. Homepage Component Conflict & CAS Error Handling ===
assert.equal(isComponentConflictError(new HomepageComponentConflictError("conflict")), true);
assert.equal(isComponentConflictError({ code: "conflict" }), true);
assert.equal(isComponentConflictError(new ReviewConflictError("conflict")), true);
assert.equal(isComponentConflictError({ code: "review_conflict" }), true);
assert.equal(isComponentConflictError({ code: "revision_mismatch" }), true);
assert.equal(isComponentConflictError({ code: "stale_revision" }), true);

// Parallel discriminators without code must return false
assert.equal(isComponentConflictError({ details: { conflict: true } }), false, "details.conflict without code must NOT be recognized as conflict");
assert.equal(isComponentConflictError({ isConflict: true }), false, "isConflict boolean without code must NOT be recognized as conflict");
assert.equal(isComponentConflictError({ name: "HomepageComponentConflictError" }), false, "Error.name without code must NOT be recognized as conflict");
assert.equal(isComponentConflictError(new Error("复习计划已在其他窗口修改，请重新读取。")), false, "Error message text without code must NOT be recognized as conflict");

// Real Error vs cross-boundary { code, message, details } object behave identically
const errInstanceFailure = homepageComponentFailure(
  new HomepageComponentConflictError("Instance conflict"),
  "update_widget_failed",
  "Fallback message",
);
const plainObjectFailure = homepageComponentFailure(
  { code: "conflict", message: "Plain object conflict" },
  "update_widget_failed",
  "Fallback message",
);
assert.equal(errInstanceFailure.ok, false);
assert.equal(errInstanceFailure.error?.code, "update_widget_conflict");
assert.equal(plainObjectFailure.ok, false);
assert.equal(plainObjectFailure.error?.code, "update_widget_conflict");

// Message rewrite with valid code preserves classification; without code produces fallback
const rewrittenMessageFailure = homepageComponentFailure(
  { code: "conflict", message: "Custom localized message in Japanese/French/Arabic" },
  "update_widget_failed",
  "Fallback message",
);
assert.equal(rewrittenMessageFailure.error?.code, "update_widget_conflict");

const noCodeWithKeywordsFailure = homepageComponentFailure(
  new Error("已在其他窗口修改 revision 冲突"),
  "update_widget_failed",
  "Fallback message",
);
assert.equal(noCodeWithKeywordsFailure.error?.code, "update_widget_failed", "No code with old keyword text must produce non-conflict fallback code");

// === 14. Real Producer to Tool Consumer Integration (Homepage Review & ListItemsByTime) ===
// 14.1 Homepage Review Tool: stale expectedUpdatedAt -> review_update_plan_conflict
const reviewTools = createHomepageReviewActionTools();
const updatePlanTool = reviewTools.find((t) => t.action === "update_plan")?.tool;
assert.ok(updatePlanTool, "update_plan action tool must exist");

// Mock siyuan kernel runtime port to return before attrs with updatedAt "2026-08-21T10:00:00.000Z"
setSiyuanRuntimePort({
  async post(url: string, data: unknown) {
    if (url === "/api/query/sql") {
      return {
        code: 0,
        data: [{ id: "20260821100000-abcdef1", type: "d", root_id: "20260821100000-abcdef1", box: "nb-1", content: "Test Doc", hpath: "/Test Doc" }],
      };
    }
    if (url === "/api/attr/getBlockAttrs") {
      return {
        code: 0,
        data: {
          "custom-homepage-review-id": "20260821100000-rev123",
          "custom-homepage-review-next-date": "2026-08-25",
          "custom-homepage-review-updated-at": "2026-08-21T10:00:00.000Z",
        },
      };
    }
    return { code: 0, data: null };
  },
});

// Provide stale expectedUpdatedAt "2026-08-20T09:00:00.000Z"
const reviewConflictResult = await updatePlanTool.execute({} as never, {
  targetId: "20260821100000-abcdef1",
  targetType: "doc",
  expectedUpdatedAt: "2026-08-20T09:00:00.000Z",
  plan: {
    nextDate: "2026-08-26",
    note: "Updated note",
    category: "Math",
    priority: "high",
    plan: "manual",
    intervals: [1, 2, 4],
  },
});
assert.equal(reviewConflictResult.ok, false);
assert.equal(reviewConflictResult.error?.code, "review_update_plan_conflict", "Stale expectedUpdatedAt must produce review_update_plan_conflict");

// 14.2 ListItemsByTime Tool: invalid timestamp -> invalid_args
const listTimeTool = createListItemsByTimeTool({
  executeListItemsByTime: async (args) => {
    const deps = {
      getEffectiveScope: () => ({ type: "notebook" as const, notebookId: "nb-1" }),
    };
    return executeListItemsByTime(deps as never, args);
  },
});

const listTimeInvalidResult = await listTimeTool.execute({} as never, {
  itemType: "doc",
  startTime: "not-a-valid-time-format",
});
assert.equal(listTimeInvalidResult.ok, false);
assert.equal(listTimeInvalidResult.error?.code, "invalid_args", "Invalid time argument must produce invalid_args");

// === 15. Enhanced Diary Project Write Target Code Extraction & Prototype Invariance ===
// 15.1 Error instances extract correct code
const errInvalid = new EnhancedDiaryProjectWriteTargetError("invalid_project_target", "Invalid project");
const errArchived = new EnhancedDiaryProjectWriteTargetError("archived_project_target", "Archived project");
assert.equal(extractProjectWriteTargetErrorCode(errInvalid), "invalid_project_target");
assert.equal(extractProjectWriteTargetErrorCode(errArchived), "archived_project_target");

// 15.2 Cross-boundary plain objects extract identical code without prototype/class inheritance
const plainInvalid = { code: "invalid_project_target", message: "Any localized text" };
const plainArchived = { code: "archived_project_target", message: "Any localized text" };
assert.equal(extractProjectWriteTargetErrorCode(plainInvalid), "invalid_project_target");
assert.equal(extractProjectWriteTargetErrorCode(plainArchived), "archived_project_target");

// 15.3 Objects without valid code return undefined (safe fallback)
assert.equal(extractProjectWriteTargetErrorCode({ name: "EnhancedDiaryProjectWriteTargetError" }), undefined, "Error.name alone must NOT extract code");
assert.equal(extractProjectWriteTargetErrorCode({ message: "无法确认项目状态" }), undefined, "Message text alone must NOT extract code");
assert.equal(extractProjectWriteTargetErrorCode(new Error("Generic error")), undefined, "Plain Error without code must NOT extract code");
assert.equal(extractProjectWriteTargetErrorCode({ code: "unknown_code" }), undefined, "Unknown code must NOT extract code");
assert.equal(extractProjectWriteTargetErrorCode(null), undefined);
assert.equal(extractProjectWriteTargetErrorCode(undefined), undefined);

// === 16. Final Composer Empty-Stream Bounded Recovery (real streamFinalAnswerFromDraft) ===

class TwoToolThenDraftProvider implements ProviderAdapter {
  readonly id = "two-tool-draft-provider";
  readonly capabilities = OPENAI_COMPATIBLE_CAPABILITIES;
  readonly requests: AgentChatRequest[] = [];

  async *streamChat(request: AgentChatRequest): AsyncGenerator<AgentProviderEvent> {
    this.requests.push(request);
    if (this.requests.length === 1) {
      yield { type: "tool_call_done", toolCall: { id: "call-a", name: "lookup_widget", arguments: "{}", index: 0 } };
      yield { type: "tool_call_done", toolCall: { id: "call-b", name: "lookup_extra", arguments: "{}", index: 1 } };
      yield { type: "done", finishReason: "tool_calls" };
      return;
    }
    yield { type: "text_delta", delta: "草稿：两项查询均已完成。" };
    yield { type: "done", finishReason: "stop" };
  }
}

registry.register({
  name: "lookup_extra",
  title: "查询组件二",
  description: "测试用只读查询二",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  readOnly: true,
  providerVisible: true,
  source: "builtin",
  safety: { readOnly: true },
  async execute() {
    return { ok: true, content: "{}", summary: "查询完成 B" };
  },
});

{
  let composerStreamCalls = 0;
  let composerCallCalls = 0;
  const recoverEvents: AgentWorkbenchEvent[] = [];
  const recoveryIo: FinalAnswerComposerIo = {
    stream: async () => {
      composerStreamCalls += 1;
      throw new AgentProviderError("模型流式返回空内容", { code: "empty_stream", retryable: false });
    },
    call: async () => {
      composerCallCalls += 1;
      return "恢复生成的最终回答正文。";
    },
  };

  const recoverOutcome = await runAgentProfile({
    profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
    mode: "whole_kb",
    question: "汇总数据库读取结果",
    provider: new TwoToolThenDraftProvider(),
    validateFinalAnswer: (answer, context) => validateTurnFinalAnswer(answer, context),
    composeFinalAnswer: async (composition) => streamFinalAnswerFromDraft(composition, recoveryIo),
    finalize: async (context) => ({ result: { answer: context.answer } }),
    onWorkbenchEvent: (e) => recoverEvents.push(e),
  });

  assert.equal(recoverOutcome.ok, true, "空流恢复后整轮必须交付 answer_ready");
  assert.equal(recoverOutcome.result?.answer, "恢复生成的最终回答正文。", "最终正文必须是恢复生成的内容，而非草稿");
  assert.equal(
    (recoverOutcome.result?.answer ?? "").includes("草稿：两项查询均已完成"),
    false,
    "Agent 草稿不得进入最终 answer",
  );
  assert.equal(
    recoverEvents.filter((e) => e.type === "done" && (e as { status?: string }).status === "answer_ready").length,
    1,
    "answer_ready 必须恰好交付一次",
  );
  assert.equal(composerStreamCalls, 1);
  assert.equal(composerCallCalls, 1, "必须恰好一次非流式 Composer 恢复");
  assert.equal(recoverEvents.filter((e) => e.type === "tool_result").length, 2, "业务工具总调用数必须仍为 2，零重放");
}

// 共享观测：以下直接用例证明恢复边界本身
const composerObservations = [
  { id: 1, timestamp: 0, kind: "tool_executed" as const, toolName: "lookup_widget", summary: "查询完成 A", content: "{}" },
  { id: 2, timestamp: 0, kind: "tool_executed" as const, toolName: "lookup_extra", summary: "查询完成 B", content: "{}" },
];

{
  let doubleEmptyStreams = 0;
  let doubleEmptyCalls = 0;
  const doubleEmptyIo: FinalAnswerComposerIo = {
    stream: async () => { doubleEmptyStreams += 1; throw new AgentProviderError("模型流式返回空内容", { code: "empty_stream", retryable: false }); },
    call: async () => { doubleEmptyCalls += 1; throw new AgentProviderError("任意改写的空响应消息", { code: "empty_stream", retryable: false }); },
  };
  await assert.rejects(
    () => streamFinalAnswerFromDraft({ question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "auto" }, doubleEmptyIo),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "final_answer_composer_empty");
      assert.equal(error instanceof AgentProviderError, true, "终态必须是结构化 final_answer_composer_empty，不是 unexpected");
      return true;
    },
    "连续空流必须稳定返回 final_answer_composer_empty",
  );
  assert.equal(doubleEmptyStreams, 1);
  assert.equal(doubleEmptyCalls, 1);
}

{
  let emptyReturnCalls = 0;
  const emptyReturnIo: FinalAnswerComposerIo = {
    stream: async () => { throw new AgentProviderError("模型流式返回空内容", { code: "empty_stream", retryable: false }); },
    call: async () => { emptyReturnCalls += 1; return ""; },
  };
  await assert.rejects(
    () => streamFinalAnswerFromDraft({ question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "auto" }, emptyReturnIo),
    (error: unknown) => (error as { code?: string }).code === "final_answer_composer_empty",
  );
  assert.equal(emptyReturnCalls, 1);
}

{
  let silentResolveStreams = 0;
  let recoveryCalls = 0;
  const silentResolveIo: FinalAnswerComposerIo = {
    stream: async () => { silentResolveStreams += 1; },
    call: async () => { recoveryCalls += 1; return "零正文流恢复的正文"; },
  };
  const answer = await streamFinalAnswerFromDraft(
    { question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "auto" },
    silentResolveIo,
  );
  assert.equal(answer, "零正文流恢复的正文");
  assert.equal(silentResolveStreams, 1);
  assert.equal(recoveryCalls, 1);
}

{
  let nonStreamCalls = 0;
  const nonStreamIo: FinalAnswerComposerIo = {
    stream: async () => { throw new Error("non_stream 模式不应进入流式路径"); },
    call: async () => { nonStreamCalls += 1; throw new AgentProviderError("模型返回空内容", { code: "empty_stream", retryable: false }); },
  };
  await assert.rejects(
    () => streamFinalAnswerFromDraft({ question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "non_stream" }, nonStreamIo),
    (error: unknown) => (error as { code?: string }).code === "final_answer_composer_empty",
  );
  assert.equal(nonStreamCalls, 1, "non_stream 首次为空不得额外再请求一次");
}

{
  let callInvocations = 0;
  const receivedChunks: string[] = [];
  const partialIo: FinalAnswerComposerIo = {
    stream: async (_prompt: string, _mode: ThinkingMode, callbacks: StreamModelTextCallbacks) => {
      callbacks.onChunk({ chunk: "部分正文", fullContent: "部分正文" });
      throw new AgentProviderError("改写后的空流消息", { code: "empty_stream", retryable: false });
    },
    call: async () => { callInvocations += 1; return "不应出现"; },
  };
  await assert.rejects(
    () => streamFinalAnswerFromDraft(
      { question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "auto", onChunk: (e) => receivedChunks.push(e.chunk) },
      partialIo,
    ),
    (error: unknown) => (error as { code?: string }).code === "empty_stream",
    "已输出正文后必须保留原错误并停止",
  );
  assert.equal(callInvocations, 0, "部分正文后不得发起恢复");
  assert.deepEqual(receivedChunks, ["部分正文"], "不得重复输出 chunk");
}

{
  let streamInvocations = 0;
  let callInvocations = 0;
  const receivedChunks: string[] = [];
  const normalIo: FinalAnswerComposerIo = {
    stream: async (_prompt: string, _mode: ThinkingMode, callbacks: StreamModelTextCallbacks) => {
      streamInvocations += 1;
      callbacks.onChunk({ chunk: "第一段。", fullContent: "第一段。" });
      callbacks.onChunk({ chunk: "第二段。", fullContent: "第一段。第二段。" });
    },
    call: async () => { callInvocations += 1; return ""; },
  };
  const answer = await streamFinalAnswerFromDraft(
    { question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "auto", onChunk: (e) => receivedChunks.push(e.chunk) },
    normalIo,
  );
  assert.equal(answer, "第一段。第二段。");
  assert.deepEqual(receivedChunks, ["第一段。", "第二段。"]);
  assert.equal(streamInvocations, 1);
  assert.equal(callInvocations, 0, "正常流式不得触发非流式调用");
}

{
  assert.equal(isEmptyStreamError(new AgentProviderError("任意改写的消息", { code: "empty_stream" })), true, "改写 message 后仍按 code 命中");
  assert.equal(isEmptyStreamError(new Error("模型流式返回空内容")), false, "普通未知 Error 不得因措辞命中");

  let plainCallInvocations = 0;
  const plainIo: FinalAnswerComposerIo = {
    stream: async () => { throw new Error("模型流式返回空内容"); },
    call: async () => { plainCallInvocations += 1; return ""; },
  };
  await assert.rejects(
    () => streamFinalAnswerFromDraft({ question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "auto" }, plainIo),
    (error: unknown) => {
      assert.equal(error instanceof AgentProviderError, false, "普通未知 Error 必须保持原样");
      assert.equal((error as Error).message, "模型流式返回空内容");
      return true;
    },
    "普通未知 Error 不进入空流恢复",
  );
  assert.equal(plainCallInvocations, 0);

  const abortController = new AbortController();
  abortController.abort();
  let abortedCallInvocations = 0;
  const abortedIo: FinalAnswerComposerIo = {
    stream: async () => { throw new AgentProviderError("空流", { code: "empty_stream", retryable: false }); },
    call: async () => { abortedCallInvocations += 1; return ""; },
  };
  await assert.rejects(
    () => streamFinalAnswerFromDraft({ question: "q", draftBody: "d", observations: composerObservations, thinkingMode: "off" as ThinkingMode, finalComposeMode: "auto", abortSignal: abortController.signal }, abortedIo),
    (error: unknown) => (error as { code?: string }).code === "empty_stream",
    "已中止时不得发起恢复",
  );
  assert.equal(abortedCallInvocations, 0);

  const composerEmptyUserFacing = mapAgentErrorToUserFacing({ agentErrorCode: "final_answer_composer_empty" });
  assert.equal(composerEmptyUserFacing.title, "最终回答生成失败");
  assert.match(composerEmptyUserFacing.message, /工具步骤已经完成/);
  assert.match(composerEmptyUserFacing.suggestion ?? "", /不要据此重复执行/);
}

// === 17. Checkpoint Resume Restores Sanitized Observations From Messages (no replay) ===
{
  // 记忆中枢写入有“写后读校验”：本节改用可回读的内存插件桩。
  const sectionPluginStore = new Map<string, unknown>();
  setNotebrainPlugin({
    isMobile: false,
    loadData: async (key: string) => (sectionPluginStore.has(key) ? JSON.parse(JSON.stringify(sectionPluginStore.get(key))) : undefined),
    saveData: async (key: string, data: unknown) => { sectionPluginStore.set(key, JSON.parse(JSON.stringify(data))); },
    removeData: async (key: string) => { sectionPluginStore.delete(key); },
  } as never);

  type ScriptedCall = { name: string; arguments: string };
  // 真实 workbench 工具：纯 JS、无需思源内核即可成功（记忆中枢经 notebrain 存储桩运行）。
  // 延迟工具集下需先用 agent_tool_help.describe_tool 激活 memory_manage。
  const ACTIVATE_MEMORY_CALLS: ScriptedCall[] = [
    { name: "agent_tool_help", arguments: JSON.stringify({ action: "describe_tool", toolName: "memory_manage" }) },
  ];
  const MEMORY_SEARCH_CALLS: ScriptedCall[] = [
    { name: "memory_manage", arguments: JSON.stringify({ action: "search", args: { query: "" } }) },
  ];
  const SECRET_TOKEN = "TOP_SECRET_TOKEN=abc123";
  const SECRET_PATH = "D:\\秘密\\绝对路径\\note.md";
  const MEMORY_REMEMBER_CALLS: ScriptedCall[] = [
    { name: "memory_manage", arguments: JSON.stringify({ action: "remember", args: { type: "experience", content: `检查点续跑验证 ${SECRET_TOKEN} ${SECRET_PATH}`, reason: "explicit" } }) },
  ];

  function makeProvider(script: Array<ScriptedCall[] | "draft" | "fail">): ProviderAdapter {
    let requestCount = 0;
    return {
      id: `scripted-provider-${Math.random().toString(36).slice(2)}`,
      capabilities: OPENAI_COMPATIBLE_CAPABILITIES,
      async *streamChat(): AsyncGenerator<AgentProviderEvent> {
        const step = script[Math.min(requestCount, script.length - 1)];
        requestCount += 1;
        if (step === "fail") throw new Error("模拟首次续跑仍无进展的失败");
        if (step === "draft") {
          yield { type: "text_delta", delta: "草稿：所有检查均已完成。" };
          yield { type: "done", finishReason: "stop" };
          return;
        }
        for (const [index, call] of step.entries()) {
          yield { type: "tool_call_done", toolCall: { id: `call-${requestCount}-${index}`, ...call, index } };
        }
        yield { type: "done", finishReason: "tool_calls" };
      },
    };
  }

  const countToolResults = (events: AgentWorkbenchEvent[]): number =>
    events.filter((event) => event.type === "tool_result").length;

  async function runProfile(options: {
    resumeCheckpoint?: AgentRunCheckpointType;
    script: Array<ScriptedCall[] | "draft" | "fail">;
    onWorkbenchEvent?: (event: AgentWorkbenchEvent) => void;
    onCheckpoint?: (checkpoint: AgentRunCheckpointType) => void;
  }) {
    let composerObservations: readonly ToolResultEntryLite[] = [];
    let finalizeEvents: AgentWorkbenchEvent[] = [];
    let finalizeObservations: readonly ToolResultEntryLite[] = [];
    const outcome = await runAgentProfile({
      profile: getAgentProfile(KNOWLEDGE_CHAT_AGENT_PROFILE_ID),
      mode: "whole_kb",
      question: "汇总检查点前的工具证据",
      conversationId: "conv-resume-evidence",
      provider: makeProvider(options.script),
      composeFinalAnswer: async (composition) => {
        composerObservations = composition.observations;
        return streamFinalAnswerFromDraft(composition, {
          stream: async () => {},
          call: async () => "续跑后的最终回答正文。",
        });
      },
      finalize: async (context) => {
        finalizeEvents = context.events;
        finalizeObservations = context.observations;
        return { result: { answer: context.answer } };
      },
      ...(options.resumeCheckpoint ? { resumeCheckpoint: options.resumeCheckpoint } : {}),
      onWorkbenchEvent: options.onWorkbenchEvent,
      onCheckpoint: options.onCheckpoint,
    });
    return { outcome, composerObservations, finalizeEvents, finalizeObservations };
  }

  function toolMessagesOf(checkpoint: AgentRunCheckpointType): AgentRunCheckpointType["messages"] {
    return checkpoint.messages.filter((message) => message.role === "tool");
  }

  // ── 场景 1：两个只读工具成功 -> after_tool checkpoint -> 续跑零重放并恢复两条 Observation ──
  const firstRunEvents: AgentWorkbenchEvent[] = [];
  let savedCheckpoint: AgentRunCheckpointType | undefined;
  await runProfile({
    script: [ACTIVATE_MEMORY_CALLS, MEMORY_SEARCH_CALLS, "fail"],
    onWorkbenchEvent: (event) => firstRunEvents.push(event),
    onCheckpoint: (checkpoint) => {
      if (checkpoint.phase === "after_tool") savedCheckpoint = checkpoint;
    },
  });

  const firstToolResults = firstRunEvents.filter((event) => event.type === "tool_result");
  assert.ok(savedCheckpoint, "工具完成后必须产出 after_tool 检查点");
  assert.equal(countToolResults(firstRunEvents), 2, "第一段必须真实执行两个只读工具");
  assert.equal(firstToolResults.every((event) => (event as { result: { ok: boolean } }).result.ok), true, "两个只读工具必须真实成功");

  // 安全边界：checkpoint 不得再有并行证据字段；工具消息是唯一事实源
  const checkpointJson = JSON.stringify(savedCheckpoint);
  assert.equal(checkpointJson.includes("completedToolEvidence"), false, "检查点不得携带并行证据字段");
  assert.equal(toolMessagesOf(savedCheckpoint).length >= 2, true, "checkpoint 必须包含当前 run 的工具消息事实源");

  const recoveredEvents = firstRunEvents.filter((event) => event.type !== "done" && event.type !== "error");

  async function assertResumeRestoresTwo(
    label: string,
    checkpoint: AgentRunCheckpointType,
    expectedComposerLength: number,
  ): Promise<{ resumeEvents: AgentWorkbenchEvent[]; finalizeEvents: AgentWorkbenchEvent[]; composerObservations: readonly ToolResultEntryLite[] }> {
    const resumeEvents: AgentWorkbenchEvent[] = [];
    const resume = await runProfile({
      resumeCheckpoint: checkpoint,
      script: ["draft"],
      onWorkbenchEvent: (event) => resumeEvents.push(event),
    });
    assert.equal(resume.outcome.ok, true, `${label} 续跑必须交付 answer_ready`);
    assert.equal(countToolResults(resumeEvents), 0, `${label} 续跑不得重放任何工具`);
    assert.equal(countToolResults(firstRunEvents) + countToolResults(resumeEvents), 2, `${label} 两段合计真实 tool_result 必须仍为 2`);
    assert.equal(resume.composerObservations.length, expectedComposerLength, `${label} Composer 恢复 Observation 数量不符`);
    assert.deepEqual(
      resume.composerObservations.map((entry) => entry.toolName).slice(0, 2),
      ["agent_tool_help", "memory_manage"],
      `${label} 恢复的 toolName 顺序必须与检查点一致`,
    );
    assert.equal(resume.finalizeObservations.length, expectedComposerLength, `${label} finalize 必须看到同样的恢复 Observation`);
    return { outcome: resume.outcome, resumeEvents, finalizeEvents: resume.finalizeEvents, composerObservations: resume.composerObservations };
  }

  // 装载两次同一 checkpoint：每次都稳定恢复同样两条
  const loadOnce = await assertResumeRestoresTwo("首次装载", savedCheckpoint!, 2);
  const loadTwice = await assertResumeRestoresTwo("重复装载", savedCheckpoint!, 2);
  assert.deepEqual(loadTwice.composerObservations.map((e) => e.summary), loadOnce.composerObservations.map((e) => e.summary), "重复装载结果必须稳定");

  // 最终 workbenchEvents 与 actionTraceSummary 一致（恢复 + 续跑去重合并）
  const merged = mergeWorkbenchEvents(recoveredEvents, loadOnce.finalizeEvents);
  assert.equal(merged.filter((event) => event.type === "tool_result" && event.result.ok).length, 2, "合并后必须恰好两次成功 tool_result");
  const memory = buildAgentTurnMemory({
    turnId: "mem-resume-1",
    userQuestion: "q",
    result: { answer: loadOnce.outcome.result?.answer ?? "", events: merged } as never,
  });
  assert.equal(memory.actionTraceSummary.outcomes?.every((outcome) => outcome.ok === true), true);
  assert.deepEqual([...memory.actionTraceSummary.toolNames].sort(), ["agent_tool_help", "memory_manage"]);

  // 幂等：事件同时出现在 recovered/current 两侧时去重
  const mergedTwice = mergeWorkbenchEvents(merged, recoveredEvents);
  assert.equal(mergedTwice.filter((event) => event.type === "tool_result").length, 2, "重复装载不得产生重复事件");

  // 稳定去重 A：同一 checkpoint 内人为重复同一 toolCallId 的工具消息 → 只恢复一次
  const originalToolMsgs = toolMessagesOf(savedCheckpoint);
  const duplicateIdCheckpoint: AgentRunCheckpointType = {
    ...savedCheckpoint,
    messages: [...savedCheckpoint.messages, JSON.parse(JSON.stringify(originalToolMsgs[originalToolMsgs.length - 1]))],
  };
  await assertResumeRestoresTwo("同 toolCallId 去重", duplicateIdCheckpoint, 2);

  // 稳定去重 B：不同 toolCallId 即使内容相同也各自保留
  const lastToolMsg = originalToolMsgs[originalToolMsgs.length - 1];
  const copiedToolCallId = `${lastToolMsg.toolCallId}-copy`;
  const differentIdCheckpoint: AgentRunCheckpointType = {
    ...savedCheckpoint,
    messages: [
      ...savedCheckpoint.messages,
      { role: "assistant", content: "", toolCalls: [{ id: copiedToolCallId, name: lastToolMsg.name, arguments: "{}" }] } as never,
      { ...JSON.parse(JSON.stringify(lastToolMsg)), toolCallId: copiedToolCallId } as never,
    ],
  };
  await assertResumeRestoresTwo("不同 toolCallId 各自保留", differentIdCheckpoint, 3);

  // 隔离：无当前 run 工具消息的 checkpoint 不得伪造 Observation
  const isolatedCheckpoint: AgentRunCheckpointType = {
    ...savedCheckpoint,
    messages: savedCheckpoint.messages.filter((message) => message.role !== "tool"),
  };
  const isolated = await runProfile({ resumeCheckpoint: isolatedCheckpoint, script: ["draft"] });
  assert.equal(isolated.outcome.ok, true);
  assert.equal(isolated.composerObservations.length, 0, "没有当前 run 工具消息时不得伪造 Observation");
  assert.equal(isolated.finalizeObservations.length, 0);

  // ── 场景 2：写工具成功后断点，续跑保留证据且不重复写入；敏感值不得进入 checkpoint ──
  const writeFirstEvents: AgentWorkbenchEvent[] = [];
  let writeCheckpoint: AgentRunCheckpointType | undefined;
  await runProfile({
    script: [ACTIVATE_MEMORY_CALLS, MEMORY_REMEMBER_CALLS, "fail"],
    onWorkbenchEvent: (event) => writeFirstEvents.push(event),
    onCheckpoint: (checkpoint) => {
      if (checkpoint.phase === "after_tool") writeCheckpoint = checkpoint;
    },
  });

  const writeResults = writeFirstEvents.filter((event) =>
    event.type === "tool_result" && (event as { toolName?: string }).toolName === "memory_manage");
  assert.equal(writeResults.length, 1, "写入必须恰好执行一次");
  assert.equal(
    (writeResults[0] as { result?: { ok?: boolean } })?.result?.ok,
    true,
    "写入必须真实成功",
  );

  const writeCheckpointJson = JSON.stringify(writeCheckpoint);
  assert.equal(writeCheckpointJson.includes(SECRET_TOKEN), false, "敏感 Token 不得进入 checkpoint");
  assert.equal(writeCheckpointJson.includes(SECRET_PATH), false, "敏感绝对路径不得进入 checkpoint");
  assert.equal(writeCheckpointJson.includes("completedToolEvidence"), false);

  const writeResumeEvents: AgentWorkbenchEvent[] = [];
  const writeResume = await runProfile({
    resumeCheckpoint: writeCheckpoint!,
    script: ["draft"],
    onWorkbenchEvent: (event) => writeResumeEvents.push(event),
  });
  assert.equal(countToolResults(writeResumeEvents), 0, "续跑不得重复写入");
  const writeComposerNames = writeResume.composerObservations.map((entry) => entry.toolName);
  assert.equal(writeComposerNames.includes("agent_tool_help") && writeComposerNames.includes("memory_manage"), true, "续跑必须同时恢复激活与写入两条成功证据");

  const writeMemory = buildAgentTurnMemory({
    turnId: "mem-resume-write",
    userQuestion: "q",
    result: { answer: "", events: mergeWorkbenchEvents(
      writeFirstEvents.filter((event) => event.type !== "done" && event.type !== "error"),
      writeResume.finalizeEvents,
    ) } as never,
  });
  assert.equal(writeMemory.actionTraceSummary.lastWriteStatus, "success", "恢复证据必须支撑 lastWriteStatus=success");
}

console.log("Agent continuation guard & language-agnostic verification passed.");
