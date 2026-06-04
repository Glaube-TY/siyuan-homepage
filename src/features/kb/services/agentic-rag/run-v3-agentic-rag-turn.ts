/**
 * v3 Agentic RAG Turn — Skill-first Workbench entry point.
 *
 * V3 uses PlannerLoop + ToolRegistry + SkillRegistry as the runtime path.
 * Previous runtime is not imported here; orchestration runs V3 only.
 */

import { z } from "zod";
import { createAgenticRagWorkbench } from "./create-agentic-rag-workbench";
import { KbRetrievalRuntimeState } from "./skills/builtin/kb-retrieval/adapters/kb-retrieval-runtime-state";
import type { KbConversationTurnReferences } from "./skills/builtin/kb-retrieval/adapters/kb-retrieval-tool-deps";
import type { RecentTurnContext } from "./workbench/contracts/recent-turn-context";
import { PlannerLoop } from "./workbench/runtime/planner-loop";
import { ExecutionEngine } from "./workbench/runtime/execution-engine";
import { renderPlannerContextPreview, type PlannerContext } from "./workbench/runtime/planner-context";
import { callLlmObject, type LlmCallOptions } from "../qa/llm-client";
import { resolveReasoningEffortForCompose, resolveEffectiveCapability } from "../qa/model-capabilities";
import { getKbSettings } from "../settings/kb-settings-service";
import { resolveAgentScope } from "./scope/resolve-scope";
import type { AgentScopeMode } from "./scope/types";
import type { V3TurnResult, V3ProgressEvent } from "./workbench/contracts/turn-result";
import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { ThinkingMode } from "../qa/model-capabilities";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface RunV3AgenticRagTurnParams {
  question: string;
  mode: AgentScopeMode;
  customDocIds?: string[];
  abortSignal?: AbortSignal;
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  /**
   * 历史对话引用（安全输入）。
   * - 从 currentState.messages 中的 assistant message 提取。
   * - docId 可用于内部 mapping，但不得进入 Planner observation/prompt。
   * - 无历史引用时传空数组或不传。
   * @deprecated 使用 recentConversationContext 替代。
   */
  conversationTurns?: readonly KbConversationTurnReferences[];
  /**
   * 最近对话上下文（通用，脱敏）。
   * - 包含最近 N 条用户/助手消息摘要。
   * - 包含上一轮展示的引用摘要（docId/blockId/url + title + sourceType + snippet）。
   * - 包含上一轮可见产物摘要（如文档树标题、候选列表数量等）。
   * - 内容只作为中性上下文事实，不触发任何工具选择。
   * - 通用结构，未来可复用于网页、MCP、文件等来源。
   */
  recentConversationContext?: readonly RecentTurnContext[];
  onProgress?: (event: V3ProgressEvent) => void;
  /** 流式回调：逐 chunk 推送回答正文。 */
  onAnswerChunk?: (event: { chunk: string; fullContent: string }) => void;
  onAnswerFinish?: (fullContent: string) => void;
}

export interface V3TurnOutcome {
  /** v3 是否成功完成。answer_ready → ok=true。其它 stop / fail_closed 状态为 ok=false，调用方应直接显示安全错误，不允许切换运行链路。 */
  ok: boolean;
  result?: V3TurnResult;
  /** v3 失败原因（safe code，禁含 docId / path / 内部 mapping）。 */
  v3ErrorCode?: string;
  /** 实际执行步数（loopResult.steps）。 */
  steps?: number;
  /** 实际 footer references 数量。 */
  footerReferencesCount?: number;
  /** 失败时 Planner 给出的 stop reasonCode（如有）。 */
  stopReasonCode?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Prompt builder
// ═══════════════════════════════════════════════════════════════════

function buildV3PlannerPrompt(ctx: PlannerContext): string {
  const contextPreview = renderPlannerContextPreview(ctx);
  return [
    "你在思源笔记中帮助用户完成知识管理任务。",
    "",
    "决策格式（三选一）：",
    '1. 调用工具: { "type": "tool", "toolName": "...", "args": {...}, "rationale": "..." }',
    '2. 最终回答: { "type": "answer", "args": { "body": "..." }, "rationale": "..." }',
    '   如需附带引用：{ "type": "answer", "args": { "body": "...", "references": [{"sourceType":"siyuan_doc","docId":"...","title":"..."}] } }',
    '3. 停止: { "type": "stop", "reasonCode": "user_canceled", "rationale": "..." }',
    "",
    "输出约束：",
    "- 只输出一个合法 JSON object。",
    "- 禁止 Markdown 代码块、解释文字、前后缀、自然语言夹杂。",
    "- 只能使用下方列出的可用工具。",
    "- 只能使用工具返回的真实资源 ID（docId/blockId）作为后续参数，不得编造。",
    "",
    contextPreview,
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// decideNextStep adapter
// ═══════════════════════════════════════════════════════════════════

function createDecideNextStep(options: {
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  abortSignal?: AbortSignal;
}) {
  return async (ctx: PlannerContext): Promise<unknown> => {
    const prompt = buildV3PlannerPrompt(ctx);

    // Map thinkingMode → reasoningEffort / providerOptions using existing capability resolution.
    // Resolve provider type from settings + chatModelSelection to determine reasoning capability.
    let reasoningEffort: "low" | "medium" | "none" | undefined;
    let providerOptions: Record<string, Record<string, unknown>> | undefined;
    try {
      const settings = await getKbSettings();
      const providerId = options.chatModelSelection?.providerId ?? settings.selectedChatProviderId;
      const provider = (settings.chatProviders ?? []).find((p) => p.id === providerId);
      const providerType = provider?.type ?? "";
      const modelId = options.chatModelSelection?.modelId ?? settings.selectedChatModelId;
      const modelConfig = (provider?.models ?? []).find((m) => m.id === modelId);
      const userDeclaredCapability = modelConfig?.reasoningCapability;
      const capability = resolveEffectiveCapability(providerType, userDeclaredCapability);
      const resolved = resolveReasoningEffortForCompose(
        options.thinkingMode ?? "off",
        capability,
      );
      reasoningEffort = resolved.effort;
      providerOptions = resolved.providerOptions;
    } catch {
      // If settings resolution fails, proceed without reasoning effort.
    }

    const llmOptions: LlmCallOptions = {
      abortSignal: options.abortSignal,
      purpose: "planner",
      maxOutputTokens: 2048,
      temperature: 0.1,
      chatModelSelection: options.chatModelSelection,
      reasoningEffort,
      providerOptions,
    };

    // 宽松接收 LLM JSON：先用 z.unknown() 接收 object，再交给 validatePlannerDecision 做统一归一化和错误 observation。
    // 宽松接收不等于自动决策；只是不让控制平面在 LLM JSON 解析层提前 fail closed。
    const looseSchema = z.object({}).passthrough();
    const first = await callLlmObject(prompt, looseSchema, llmOptions);
    if (first && typeof first === "object" && (first as { errorKind?: unknown }).errorKind === "schema_validation_failed") {
      console.info("[AgenticRagV3] PLANNER_SCHEMA_RETRY_ONCE", {
        firstIssueCode: (first as { firstIssueCode?: unknown }).firstIssueCode,
        firstIssuePath: (first as { firstIssuePath?: unknown }).firstIssuePath,
      });
      return await callLlmObject(prompt, looseSchema, llmOptions);
    }
    return first;
  };
}

// ═══════════════════════════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════════════════════════

function saveTurnTrace(loopResult: import("./workbench/runtime/planner-loop").PlannerLoopResult): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__kbAgentLastV3Turn = {
    turnId: `${Date.now()}`,
    finalStatus: loopResult.status,
    stopReasonCode: loopResult.stopReasonCode,
    plannerDecisions: loopResult.plannerDecisions,
    toolExecutions: loopResult.toolExecutions,
    observations: loopResult.observations.map((o) => ({
      kind: o.kind,
      toolName: o.toolName,
      summary: o.summary,
      contentItems: o.content?.type === "content_items" || o.content?.type === "read_items"
        ? {
            itemCount: (o.content as { items?: unknown[] }).items?.length ?? 0,
            truncated: o.content.truncated,
          }
        : undefined,
    })),
    turnDiagnostics: loopResult.turnDiagnostics,
  };
}

export async function runV3AgenticRagTurn(
  params: RunV3AgenticRagTurnParams,
): Promise<V3TurnOutcome> {
  // Resolve the visible scope for this turn.
  const resolvedScope = await resolveAgentScope({
    mode: params.mode,
    customDocIds: params.customDocIds,
  });
  const scope = resolvedScope.scope;

  // ── 诊断日志：TURN_STARTED ──
  // payload 只含安全元数据，不含 docId / blockId / notebookId / path / 原文。
  const hasRecentContext = Array.isArray(params.recentConversationContext) && params.recentConversationContext.length > 0;
  console.info("[AgenticRagV3] TURN_STARTED", {
    scopeMode: params.mode,
    hasConversationTurns: Array.isArray(params.conversationTurns) && params.conversationTurns.length > 0,
    hasRecentConversationContext: hasRecentContext,
    thinkingMode: params.thinkingMode ?? "off",
    hasChatModelSelection: !!params.chatModelSelection,
  });

  const deps = new KbRetrievalRuntimeState({
    scope,
    conversationTurns: params.conversationTurns,
    recentConversationContext: params.recentConversationContext,
  });

  const wb = createAgenticRagWorkbench({
    kbRetrievalToolDeps: deps,
  });

  const engine = new ExecutionEngine({
    toolRegistry: wb.toolRegistry,
    budgetGuard: wb.budgetGuard,
    observationStore: wb.observationStore,
  });

  const loop = new PlannerLoop({
    skillRegistry: wb.skillRegistry,
    toolRegistry: wb.toolRegistry,
    budgetGuard: wb.budgetGuard,
    observationStore: wb.observationStore,
    executionEngine: engine,
    decideNextStep: createDecideNextStep({
      chatModelSelection: params.chatModelSelection,
      thinkingMode: params.thinkingMode,
      abortSignal: params.abortSignal,
    }),
  });

  try {
    const loopResult = await loop.run({
      question: params.question,
      activeScopeMode: params.mode,
      // 不硬编码 userEnabledSkillNames；内置 Skill 由 SkillContract.enabledByDefault 决定。
      // 预留接口：UI/Settings 可传入 userEnabledSkillNames / userDisabledSkillNames。
      userEnabledSkillNames: [],
      toolRuntimeContextBase: {
        question: params.question,
      },
      recentConversationContext: params.recentConversationContext,
    });

    if (loopResult.status === "answer_ready" && loopResult.answerDraft) {
      // 先推送 progress bodies（如果有）
      if (params.onProgress && loopResult.progressBodies.length > 0) {
        for (const body of loopResult.progressBodies) {
          params.onProgress({
            phase: "tool_running",
            kind: "progress",
            body,
          });
        }
      }

      const draft = loopResult.answerDraft;
      // 流式推送（非真正 streaming，v3 暂用一次性输出）
      if (params.onAnswerChunk) {
        params.onAnswerChunk({ chunk: draft.body, fullContent: draft.body });
      }
      if (params.onAnswerFinish) {
        params.onAnswerFinish(draft.body);
      }
      // 将回答工具的 references（ResourceRef[]）转换为 UI 层 ReferenceItem[]
      // 只转换 Planner 显式给出的 references，不自动补充
      const footerReferences: import("../../types/chat").ReferenceItem[] = (draft.references ?? [])
        .filter((ref) => ref.sourceType === "siyuan_doc" && ref.docId)
        .map((ref, idx) => ({
          index: idx + 1,
          docTitle: ref.title ?? "",
          headingPathText: ref.title ?? "",
          sourceBlockIds: ref.blockId ? [ref.blockId] : [],
          docId: ref.docId,
          displayTitle: ref.title,
        }));

      // 收集 trace / actionHistory 简表（仅作展示，禁含 docId/blockId/path）。
      const trace: V3TurnResult["trace"] = loopResult.observations
        .filter((o) => typeof o?.summary === "string" && o.summary.length > 0)
        .slice(0, 30)
        .map((o) => {
          const rawStep = (o as { stepIndex?: unknown }).stepIndex;
          const stepIndex = typeof rawStep === "number" ? rawStep : undefined;
          return {
            name: String(o.kind),
            status: "info" as const,
            summary: o.summary,
            stepIndex,
          };
        });
      const actionHistory: V3TurnResult["actionHistory"] = loopResult.observations
        .filter((o) => typeof o?.toolName === "string" && o.toolName.length > 0)
        .map((o) => {
          const rawStep = (o as { stepIndex?: unknown }).stepIndex;
          const stepIndex = typeof rawStep === "number" ? rawStep : undefined;
          const rawOk = (o as unknown as Record<string, unknown>).ok;
          return {
            type: "tool",
            toolName: o.toolName,
            stepIndex,
            status: rawOk === false ? "error" as const : "ok" as const,
          };
        });

      // ── 存储本轮 trace 到 window ──
      saveTurnTrace(loopResult);

      console.info("[AgenticRagV3] TURN_SUCCEEDED", {
        status: loopResult.status,
        steps: loopResult.steps,
        footerReferencesCount: footerReferences.length,
        plannerDecisions: loopResult.plannerDecisions,
        toolExecutions: loopResult.toolExecutions,
        turnDiagnostics: loopResult.turnDiagnostics,
      });

      const v3Result: V3TurnResult = {
        scope,
        scopeSummary: resolvedScope.summary,
        answer: draft.body,
        footerReferences,
        warnings: [],
        trace,
        actionHistory,
      };

      return {
        ok: true,
        steps: loopResult.steps,
        footerReferencesCount: footerReferences.length,
        result: v3Result,
      };
    }

    // stopped_by_planner / fail_closed
    saveTurnTrace(loopResult);
    console.info("[AgenticRagV3] TURN_FAILED", {
      v3ErrorCode: loopResult.status,
      loopStatus: loopResult.status,
      steps: loopResult.steps,
      safeReasonCode: loopResult.stopReasonCode,
    });
    return {
      ok: false,
      v3ErrorCode: loopResult.status,
      steps: loopResult.steps,
      stopReasonCode: loopResult.stopReasonCode,
    };
  } catch (err) {
    // ── 诊断日志：TURN_FAILED（异常） ──
    const v3ErrorCode = err instanceof Error ? err.message.slice(0, 80) : "v3_unexpected_error";
    console.info("[AgenticRagV3] TURN_FAILED", {
      v3ErrorCode,
      loopStatus: "exception",
      steps: 0,
      safeReasonCode: "exception",
    });
    return {
      ok: false,
      v3ErrorCode,
      stopReasonCode: "exception",
    };
  }
}
