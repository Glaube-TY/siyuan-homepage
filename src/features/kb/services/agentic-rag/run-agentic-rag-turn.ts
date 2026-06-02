/**
 * Run Agentic RAG Turn
 *
 * Agentic RAG 服务入口。
 *
 * 职责：
 * - 把 scope 解析、settings→budget、结果封装起来
 * - 只返回结果，不写 UI、不写 store、不创建 ChatMessage
 * - 为后续 orchestration 接入做准备
 * - 支持流式输出回调（onAnswerChunk/onAnswerStart/onAnswerFinish）
 *
 * 分流：
 * - 固定文档模式（current_doc / custom_docs）：runFixedDocQaTurn，直读固定文档全文
 * - 检索型 Agent 模式（whole_kb / current_notebook / current_doc_with_children）：runAgenticRagDomainStep
 *
 * 流程：
 *   1. trim question，空问题抛 Error
 *   2. emit resolving_scope
 *   3. resolveAgentScope({ mode, customDocIds, trace })
 *   4. emit building_context
 *   5. getKbSettings() → buildAgenticRagBudgetFromSettings(settings)
 *   6. 分流：固定文档直读 vs Agent 检索
 *   7. 返回 AgenticRagTurnResult
 */

import type { AgentScopeMode } from "./scope/types";
import { isFixedDocumentScope } from "./scope/types";
import { resolveAgentScope } from "./scope/resolve-scope";
import type { AgenticRuntimeContext } from "./runtime/recent-context-types";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { ThinkingMode } from "../../types/session";
import type { AttachedKbDoc } from "../../types/chat";
import { getKbSettings } from "../settings/kb-settings-service";
import { buildAgenticRagBudgetFromSettings } from "./runtime/budget-from-settings";
import { createInitialAgenticRagState } from "./graph/create-initial-state";
import { runAgenticRagDomainStep } from "./graph/graph";
import { runWithChatModelSelection } from "../qa/llm-client";
import type { AgenticRagState } from "./graph/state";
import type { AgenticEvidencePack } from "./evidence/evidence-types";
import type { ReferenceItem } from "../../types/chat";
import type { AnswerAction } from "./actions/action-types";
import { buildFollowUpContext } from "./runtime/follow-up-context";
import { runFixedDocQaTurn } from "./fixed-doc/run-fixed-doc-qa-turn";
import { pushAgentDebugEvent } from "./debug/agentic-rag-debug";

export type AgenticRagProgressPhase =
  | "resolving_scope"
  | "building_context"
  | "analyzing_question"
  | "planning_retrieval"
  | "searching_evidence"
  | "assembling_evidence"
  | "reading_fixed_docs"
  | "running_agent_loop"
  | "composing_answer"
  | "streaming_answer"
  | "done";

export interface AgenticRagProgressEvent {
  phase: AgenticRagProgressPhase;
  scopeType?: string;
  detail?: string;
}

export interface RunAgenticRagTurnParams {
  question: string;
  mode: AgentScopeMode;
  customDocIds?: string[];
  attachedDocs?: AttachedKbDoc[];
  recentContextSummary?: string;
  runtime?: Partial<AgenticRuntimeContext>;
  trace?: boolean;
  abortSignal?: AbortSignal;
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  onProgress?: (event: AgenticRagProgressEvent) => void;
  onAnswerChunk?: (event: { chunk: string; fullContent: string }) => void;
  onAnswerStart?: () => void;
  onAnswerFinish?: (fullContent: string) => void;
}

export interface AgenticRagTurnResult {
  scope: AgenticRagState["scope"];
  scopeSummary: AgenticRagState["scopeSummary"];
  answer: string;
  finalEvidencePack?: AgenticEvidencePack;
  footerReferences: ReferenceItem[];
  workspace: AgenticRagState["workspace"];
  warnings: string[];
  trace: AgenticRagState["traceLog"];
  actionHistory: AgenticRagState["actionHistory"];
  finalAnswerAction?: AnswerAction;
  graphState?: AgenticRagState;
}

function emitProgress(
  onProgress?: (event: AgenticRagProgressEvent) => void,
  event?: AgenticRagProgressEvent
) {
  if (onProgress && event) {
    onProgress(event);
  }
}

interface EffectiveRuntimeCallbacks {
  effectiveOnAnswerStart?: () => void;
  effectiveOnAnswerChunk?: (event: { chunk: string; fullContent: string }) => void;
  effectiveOnAnswerFinish?: (fullContent: string) => void;
}

function buildEffectiveRuntimeCallbacks(params: RunAgenticRagTurnParams): EffectiveRuntimeCallbacks {
  const { runtime, onAnswerStart, onAnswerChunk, onAnswerFinish } = params;

  const effectiveOnAnswerStart = onAnswerStart ?? runtime?.onAnswerStart;
  const effectiveOnAnswerChunk = onAnswerChunk ?? runtime?.onAnswerChunk;
  const effectiveOnAnswerFinish = onAnswerFinish ?? runtime?.onAnswerFinish;

  return {
    effectiveOnAnswerStart,
    effectiveOnAnswerChunk,
    effectiveOnAnswerFinish,
  };
}

export async function runAgenticRagTurn(params: RunAgenticRagTurnParams): Promise<AgenticRagTurnResult> {
  const {
    question: rawQuestion,
    mode,
    customDocIds,
    attachedDocs,
    recentContextSummary,
    runtime,
    trace,
    abortSignal,
    chatModelSelection,
    onProgress,
  } = params;

  const question = rawQuestion.trim();
  if (!question) {
    throw new Error("问题不能为空");
  }

  // 1. resolving_scope
  emitProgress(onProgress, { phase: "resolving_scope" });

  const resolvedScope = await resolveAgentScope({ mode, customDocIds, trace });
  const scope = resolvedScope.scope;
  const scopeSummary = resolvedScope.summary;

  emitProgress(onProgress, { phase: "resolving_scope", scopeType: scope.type });

  // 2. building_context
  emitProgress(onProgress, { phase: "building_context" });

  const settings = await getKbSettings();
  const budget = buildAgenticRagBudgetFromSettings(settings);

  // 3. 构建 effective runtime callbacks（不覆盖 runtime 里的回调）
  const { effectiveOnAnswerStart, effectiveOnAnswerChunk, effectiveOnAnswerFinish } = buildEffectiveRuntimeCallbacks(params);

  if (trace) {
    console.info("[KB-AGENT | STREAM_CALLBACKS_BOUND]", {
      hasOnAnswerStart: !!effectiveOnAnswerStart,
      hasOnAnswerChunk: !!effectiveOnAnswerChunk,
      hasOnAnswerFinish: !!effectiveOnAnswerFinish,
      mode,
      isFixedDocumentScope: isFixedDocumentScope(mode),
    });
  }

  const effectiveRuntime = {
    ...runtime,
    abortSignal,
    trace,
    recentContext: runtime?.recentContext,
    onAnswerStart: effectiveOnAnswerStart,
    onAnswerChunk: effectiveOnAnswerChunk,
    onAnswerFinish: effectiveOnAnswerFinish,
    onProgress,
    onReasoningStart: runtime?.onReasoningStart,
    onReasoningChunk: runtime?.onReasoningChunk,
    onReasoningFinish: runtime?.onReasoningFinish,
  };

  // 4. 分流：固定文档直读 vs Agent 检索
  if (isFixedDocumentScope(mode)) {
    const fixedResult = await runWithChatModelSelection(chatModelSelection, () =>
      runFixedDocQaTurn({
        question,
        mode,
        scope,
        scopeSummary,
        budget,
        recentContextSummary,
        attachedDocs,
        runtime: effectiveRuntime,
        trace,
        abortSignal,
        onProgress,
      })
    );

    return {
      scope,
      scopeSummary,
      answer: fixedResult.answer,
      finalEvidencePack: fixedResult.finalEvidencePack,
      footerReferences: fixedResult.footerReferences,
      workspace: undefined as unknown as AgenticRagState["workspace"],
      warnings: fixedResult.warnings,
      trace: fixedResult.traceLog,
      actionHistory: [],
      finalAnswerAction: undefined,
      graphState: undefined,
    };
  }

  // 检索型 Agent 路径：进入 graph
  pushAgentDebugEvent("KB_AGENT_HARNESS_ENTRY_SELECTED_SAFE", {
    mode,
    isFixedDocumentScope: isFixedDocumentScope(mode),
    hasAbortSignal: !!abortSignal,
    hasOnProgress: !!onProgress,
  }, "info");

  const followUpContext = buildFollowUpContext({
    currentQuestion: question,
    recentContext: runtime?.recentContext,
  });

  const initialState = createInitialAgenticRagState({
    question,
    mode,
    customDocIds,
    recentContextSummary,
    runtime: effectiveRuntime as AgenticRuntimeContext,
    scope,
    scopeSummary,
    budget,
    trace,
    followUpContext,
    thinkingMode: params.thinkingMode ?? "off",
  });

  pushAgentDebugEvent("KB_AGENT_THINKING_MODE_BOUND_SAFE", {
    thinkingMode: initialState.thinkingMode ?? "off",
    rawValue: params.thinkingMode,
    mode,
  }, "info");

  const graphState = await runWithChatModelSelection(chatModelSelection, () =>
    runAgenticRagDomainStep({ initialState, abortSignal, onProgress: effectiveRuntime.onProgress })
  );

  // 注意：streaming_answer 和 done 阶段由 graph 内部或 orchestration 层根据实际执行点 emit
  // 不在这里预先 emit，避免一次性显示所有阶段

  return {
    scope: graphState.scope,
    scopeSummary: graphState.scopeSummary,
    answer: graphState.composedAnswer || "",
    finalEvidencePack: graphState.finalEvidencePack,
    footerReferences: graphState.footerReferences,
    workspace: graphState.workspace,
    warnings: graphState.warnings,
    trace: graphState.traceLog,
    actionHistory: graphState.actionHistory,
    finalAnswerAction: graphState.finalAnswerAction,
    graphState,
  };
}
