/**
 * PlannerLoop
 *
 * 核心循环：每轮重建 Planner context，让 AI Planner 自主选 Tool。
 * - 工具执行结果以 observation 形式回给 Planner。
 * - 预算耗尽时仅追加 observation，不替 Planner 选工具。
 * - maxSteps 耗尽时 fail closed。
 */

import { ObservationStore } from "./observation-store";
import { BudgetGuard, type BudgetState } from "./budget-guard";
import {
  buildPlannerContext,
  type PlannerContext,
  type PlannerContextInput,
} from "./planner-context";
import type { RecentTurnContext } from "../contracts/recent-turn-context";
import { validatePlannerDecision, type PlannerDecision } from "../contracts/planner-decision";
import { ExecutionEngine, type AnswerDraft } from "./execution-engine";
import type { SkillRegistry } from "../registries/skill-registry";
import type { ToolRegistry } from "../registries/tool-registry";
import type { ToolRuntimeContext, BudgetSnapshot } from "../contracts/tool-contract";
import type { SkillObservation } from "../contracts/skill-contract";
import { sanitizePlannerVisibleError } from "../guards/planner-visible-error";

export interface PlannerLoopDeps {
  skillRegistry: SkillRegistry;
  toolRegistry: ToolRegistry;
  budgetGuard: BudgetGuard;
  observationStore: ObservationStore;
  executionEngine: ExecutionEngine;
  /**
   * Planner 决策提供者：把 PlannerContext 喂给底层 LLM，返回 raw decision object。
   * PlannerLoop 仅做校验与执行，不替 Planner 选工具。
   */
  decideNextStep: (ctx: PlannerContext) => Promise<unknown>;
  /** 可注入的测试用时钟。 */
  now?: () => number;
  /** 循环上限。 */
  maxSteps?: number;
}

export interface PlannerLoopInput {
  question: string;
  /**
   * 用户在 UI 上选择的 scopeMode（中性的事实字段，**不**参与工具 / answer 自动选择）。
   * 取代旧的 needsKnowledgeBase。Planner 自主决定是否 / 如何使用知识库工具。
   */
  activeScopeMode: import("../../scope/types").AgentScopeMode;
  userEnabledSkillNames: readonly string[];
  userDisabledSkillNames?: readonly string[];
  candidateSummary?: PlannerContextInput["candidateSummary"];
  contentSummary?: PlannerContextInput["contentSummary"];
  /** 初始 observations（仅作为种子；循环内由 observationStore 提供）。 */
  initialObservations?: SkillObservation[];
  /**
   * Tool 运行时上下文模板。callCounts 由循环覆盖；budgets 由循环每轮重算。
   */
  toolRuntimeContextBase: Omit<ToolRuntimeContext, "callCounts" | "budgets">;
  /**
   * 最近对话上下文（通用，脱敏）。
   * - 包含最近 N 条用户/助手消息摘要。
   * - 包含上一轮展示的引用摘要（docId/blockId/url + title + sourceType + snippet）。
   * - 包含上一轮可见产物摘要（如文档树标题、候选列表数量等）。
   * - 内容只作为中性上下文事实，不触发任何工具选择。
   */
  recentConversationContext?: readonly RecentTurnContext[];
}

export interface PlannerStepDiagnostic {
  stepIndex: number;
  decisionType: "tool" | "answer" | "stop" | "invalid";
  toolName?: string;
  argsSummary?: Record<string, unknown>;
  rationaleChars?: number;
  validationOk: boolean;
  sanitizedError?: string;
  invalidDecisionCount?: number;
}

export interface ToolExecDiagnostic {
  stepIndex: number;
  toolName: string;
  argsSummary?: Record<string, unknown>;
  budgetBefore: { search: number; read: number };
  budgetAfter: { search: number; read: number };
  ok: boolean;
  outputKind?: string;
  outputSummary?: string;
  errorCode?: string;
  issuePath?: string;
  issueMessage?: string;
}

export interface TurnDiagnostics {
  searchCallCount: number;
  listMapCallCount: number;
  readCandidateDocsDecisionCount: number;
  readCandidateDocsExecuteCount: number;
  readCandidateDocsValidationFailureCount: number;
  finalAnswerDecisionCount: number;
  maxStepsHit: boolean;
  llmPlannerCallCount: number;
  progressAnswerCount: number;
  readSuccessItemCount: number;
  emptyContentCount: number;
  containerWithoutContentCount: number;
  /** 请求的 docId 数量（格式合法） */
  docIdCount: number;
  /** 请求的 blockId 数量（格式合法） */
  blockIdCount: number;
  /** 真实存在且可读的文档数 */
  resolvedDocCount: number;
  /** 真实存在且可读的块数 */
  resolvedBlockCount: number;
  /** blockId 归属 docId 不匹配次数 */
  resourceMismatchCount: number;
}

export interface PlannerLoopResult {
  status:
    | "answer_ready"
    | "stopped_by_planner"
    | "fail_closed_max_steps"
    | "fail_closed_no_planner_decision";
  answerDraft?: AnswerDraft;
  stopReasonCode?: string;
  steps: number;
  observations: SkillObservation[];
  finalContext: PlannerContext | null;
  progressBodies: string[];
  plannerDecisions: PlannerStepDiagnostic[];
  toolExecutions: ToolExecDiagnostic[];
  turnDiagnostics: TurnDiagnostics;
}

/**
 * 构造 tool 运行时上下文。budgets 来自当前循环的 budget 状态。
 */
/** 安全摘要：提取 args 的关键调试字段，不暴露完整正文。 */
function summarizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") return {};
  const a = args as Record<string, unknown>;
  const s: Record<string, unknown> = {};
  if (typeof a.query === "string") { s.queryChars = a.query.length; s.queryPreview = a.query.slice(0, 60); }
  if (typeof a.limit === "number") s.limit = a.limit;
  if (typeof a.mode === "string") s.mode = a.mode;
  if (typeof a.maxDepth === "number") s.maxDepth = a.maxDepth;
  if (typeof a.readMode === "string") s.readMode = a.readMode;
  if (Array.isArray(a.docIds)) { s.docIdCount = a.docIds.length; s.docIds = a.docIds.slice(0, 3); }
  if (Array.isArray(a.blockIds)) { s.blockIdCount = a.blockIds.length; s.blockIds = a.blockIds.slice(0, 3); }
  if (Array.isArray(a.docs)) s.docsCount = a.docs.length;
  if (typeof a.cursor === "string") s.hasCursor = a.cursor.length > 0;
  if (typeof a.startOffset === "number") s.startOffset = a.startOffset;
  if (typeof a.maxCharsPerDoc === "number") s.maxCharsPerDoc = a.maxCharsPerDoc;
  if (typeof a.maxNodes === "number") s.maxNodes = a.maxNodes;
  if (typeof a.rootDocId === "string") s.rootDocId = a.rootDocId;
  if (typeof a.notebookId === "string") s.notebookId = a.notebookId;
  if (typeof a.body === "string") s.bodyChars = a.body.length;
  if (Array.isArray(a.references)) s.referenceCount = a.references.length;
  return s;
}

function buildToolRuntimeContext(
  base: Omit<ToolRuntimeContext, "callCounts" | "budgets">,
  budget: BudgetSnapshot,
  store: ObservationStore,
): ToolRuntimeContext {
  return {
    ...base,
    budgets: budget,
    callCounts: store.callCounts(),
  };
}

export class PlannerLoop {
  private readonly deps: PlannerLoopDeps;
  private readonly maxSteps: number;
  /** Planner 决策解析失败的最大容忍次数，超过后才 fail closed。 */
  private readonly maxInvalidPlannerDecisions: number;

  constructor(deps: PlannerLoopDeps) {
    this.deps = deps;
    this.maxSteps = deps.maxSteps ?? 12;
    this.maxInvalidPlannerDecisions = 3;
  }

  async run(input: PlannerLoopInput): Promise<PlannerLoopResult> {
    const now = this.deps.now ?? (() => Date.now());
    const store = this.deps.observationStore;
    const budgetGuard = this.deps.budgetGuard;
    let budget: BudgetState = budgetGuard.init();
    let stepIndex = 0;
    let lastContext: PlannerContext | null = null;
    let lastDecision: PlannerDecision | null = null;
    let pendingAnswerDraft: AnswerDraft | undefined = undefined;
    let budgetExhaustedEmitted = false;
    let invalidDecisionCount = 0;
    const progressBodies: string[] = [];
    const plannerDecisions: PlannerStepDiagnostic[] = [];
    const toolExecutions: ToolExecDiagnostic[] = [];
    const turnDiag: TurnDiagnostics = {
      searchCallCount: 0, listMapCallCount: 0,
      readCandidateDocsDecisionCount: 0, readCandidateDocsExecuteCount: 0,
      readCandidateDocsValidationFailureCount: 0, finalAnswerDecisionCount: 0,
      maxStepsHit: false,
      llmPlannerCallCount: 0, progressAnswerCount: 0,
      readSuccessItemCount: 0, emptyContentCount: 0, containerWithoutContentCount: 0,
      docIdCount: 0, blockIdCount: 0,
      resolvedDocCount: 0, resolvedBlockCount: 0,
      resourceMismatchCount: 0,
    };

    store.reset();

    if (input.initialObservations) {
      for (const obs of input.initialObservations) {
        store.push(obs);
      }
    }

    store.push({
      kind: "turn_started",
      facts: {
        stepIndex: 0,
        searchRemaining: budget.searchRemaining,
        readRemaining: budget.readRemaining,
      },
      timestamp: now(),
    } as SkillObservation);

    while (stepIndex < this.maxSteps) {
      stepIndex += 1;

      // 每轮重建前先把 budget 状态写成 observation，
      // 确保 Planner 在 buildPlannerContext 之后立即看到。
      if (budgetGuard.isAllExhausted(budget) && !budgetExhaustedEmitted) {
        store.push({
          kind: "budget_exhausted",
          facts: {
            searchRemaining: 0,
            readRemaining: 0,
            stepIndex,
          },
        } as SkillObservation);
        budgetExhaustedEmitted = true;
      }

      const ctxInput: PlannerContextInput = {
        question: input.question,
        activeScopeMode: input.activeScopeMode,
        budgets: {
          searchRemaining: budget.searchRemaining,
          readRemaining: budget.readRemaining,
        },
        candidateSummary: input.candidateSummary,
        contentSummary: input.contentSummary,
        observations: input.initialObservations ?? [],
        observationStore: store,
        userEnabledSkillNames: input.userEnabledSkillNames,
        userDisabledSkillNames: input.userDisabledSkillNames,
        callCounts: store.callCounts(),
        recentConversationContext: input.recentConversationContext,
      };
      const ctx = buildPlannerContext(ctxInput, {
        skillRegistry: this.deps.skillRegistry,
        toolRegistry: this.deps.toolRegistry,
        budgetGuard: this.deps.budgetGuard,
      });
      lastContext = ctx;

      let decision: PlannerDecision;
      try {
        const rawDecision = await this.deps.decideNextStep(ctx);
        turnDiag.llmPlannerCallCount++;
        decision = validatePlannerDecision(rawDecision);
        invalidDecisionCount = 0;

        // 记录决策 trace
        const diag: PlannerStepDiagnostic = {
          stepIndex,
          decisionType: decision.type,
          toolName: (decision as { toolName?: string }).toolName,
          argsSummary: summarizeArgs((decision as { args?: unknown }).args),
          rationaleChars: (decision as { rationale?: string }).rationale?.length ?? 0,
          validationOk: true,
        };
        plannerDecisions.push(diag);

        // 更新计数器
        if (decision.type === "tool") {
          const tn = (decision as { toolName?: string }).toolName ?? "";
          if (tn === "search_scope") turnDiag.searchCallCount++;
          if (tn === "list_knowledge_map") turnDiag.listMapCallCount++;
          if (tn === "read_candidate_docs") turnDiag.readCandidateDocsDecisionCount++;
        }
        if (decision.type === "answer") turnDiag.finalAnswerDecisionCount++;

        // 安全日志
        console.info("[AgenticRagV3] PLANNER_DECISION", diag);
      } catch (err) {
        invalidDecisionCount += 1;
        // 记录无效决策 trace
        plannerDecisions.push({
          stepIndex,
          decisionType: "invalid",
          validationOk: false,
          sanitizedError: sanitizePlannerVisibleError(err, "Planner 决策解析失败。"),
          invalidDecisionCount,
        });
        // summary 不得回显原始 err.message；统一由 sanitizePlannerVisibleError 兜底。
        // facts.errorCode 仅在两个事实类别间选择：planner_decision_invalid / planner_decision_missing，
        // 不携带任何业务下一步建议。
        const errMessage = err instanceof Error ? err.message : String(err);
        const errorCode = errMessage.includes("must be")
          ? "planner_decision_invalid"
          : "planner_decision_missing";
        store.push({
          kind: "planner_returned_no_action",
          facts: { errorCode, invalidAttempt: invalidDecisionCount },
          summary: "Planner 决策格式无效，请重新输出合法 JSON 决策。",
        } as SkillObservation);

        // 超过预算才 fail_closed_no_planner_decision
        if (invalidDecisionCount >= this.maxInvalidPlannerDecisions) {
          return {
            status: "fail_closed_no_planner_decision",
            stopReasonCode: "planner_decision_invalid",
            steps: stepIndex,
            observations: store.getPlannerObservations(),
            finalContext: lastContext,
            progressBodies: [],
            plannerDecisions,
            toolExecutions,
            turnDiagnostics: turnDiag,
          };
        }
        // 未超过预算：继续下一轮循环，让 Planner 重新输出
        continue;
      }
      lastDecision = decision;

      if (decision.type === "stop") {
        return {
          status: "stopped_by_planner",
          stopReasonCode: decision.reasonCode,
          steps: stepIndex,
          observations: store.getPlannerObservations(),
          finalContext: lastContext,
          progressBodies,
          plannerDecisions,
          toolExecutions,
          turnDiagnostics: turnDiag,
        };
      }

      const toolCtx = buildToolRuntimeContext(
        input.toolRuntimeContextBase,
        {
          searchRemaining: budget.searchRemaining,
          readRemaining: budget.readRemaining,
        },
        store,
      );

      if (decision.type === "answer") {
        const outcome = await this.deps.executionEngine.execute(
          {
            toolName: decision.toolName,
            args: decision.args,
            rationale: decision.rationale,
          },
          toolCtx,
          budget,
        );
        budget = outcome.budgetAfter;

        toolExecutions.push({
          stepIndex,
          toolName: decision.toolName,
          argsSummary: summarizeArgs(decision.args),
          budgetBefore: { search: budget.searchRemaining, read: budget.readRemaining },
          budgetAfter: { search: outcome.budgetAfter.searchRemaining, read: outcome.budgetAfter.readRemaining },
          ok: outcome.ok,
          outputKind: outcome.observation.outputKind,
          outputSummary: outcome.observation.summary,
          errorCode: outcome.observation.facts?.errorCode as string | undefined,
        });

        if (outcome.ok && outcome.answerDraft) {
          pendingAnswerDraft = outcome.answerDraft;
        }
        if (pendingAnswerDraft) {
          return {
            status: "answer_ready",
            answerDraft: pendingAnswerDraft,
            steps: stepIndex,
            observations: store.getPlannerObservations(),
            finalContext: lastContext,
            progressBodies,
            plannerDecisions,
            toolExecutions,
            turnDiagnostics: turnDiag,
          };
        }
        continue;
      }

      // decision.type === "tool"
      const budgetBefore = { search: budget.searchRemaining, read: budget.readRemaining };
      const outcome = await this.deps.executionEngine.execute(
        {
          toolName: decision.toolName,
          args: decision.args,
          rationale: decision.rationale,
        },
        toolCtx,
        budget,
      );
      budget = outcome.budgetAfter;

      const tn = decision.toolName;
      if (tn === "read_candidate_docs") {
        turnDiag.readCandidateDocsExecuteCount++;
        if (!outcome.ok && outcome.observation.facts?.errorCode === "validation_failed") {
          turnDiag.readCandidateDocsValidationFailureCount++;
        }
        // 统计读取结果
        const readOutput = outcome.observation as { facts?: Record<string, unknown> };
        if (readOutput.facts) {
          // contentItemCount 是 observation facts 中的实际字段名
          if (typeof readOutput.facts.contentItemCount === "number") turnDiag.readSuccessItemCount += readOutput.facts.contentItemCount as number;
          if (typeof readOutput.facts.emptyContentCount === "number") turnDiag.emptyContentCount += readOutput.facts.emptyContentCount as number;
          if (typeof readOutput.facts.containerCount === "number") turnDiag.containerWithoutContentCount += readOutput.facts.containerCount as number;
          if (typeof readOutput.facts.requestedDocIdCount === "number") turnDiag.docIdCount += readOutput.facts.requestedDocIdCount as number;
          if (typeof readOutput.facts.requestedBlockIdCount === "number") turnDiag.blockIdCount += readOutput.facts.requestedBlockIdCount as number;
          if (typeof readOutput.facts.resolvedDocCount === "number") turnDiag.resolvedDocCount += readOutput.facts.resolvedDocCount as number;
          if (typeof readOutput.facts.resolvedBlockCount === "number") turnDiag.resolvedBlockCount += readOutput.facts.resolvedBlockCount as number;
          if (typeof readOutput.facts.resourceMismatchCount === "number") turnDiag.resourceMismatchCount += readOutput.facts.resourceMismatchCount as number;
        }
      }
      if (tn === "progress_answer") {
        turnDiag.progressAnswerCount++;
      }

      toolExecutions.push({
        stepIndex,
        toolName: tn,
        argsSummary: summarizeArgs(decision.args),
        budgetBefore,
        budgetAfter: { search: budget.searchRemaining, read: budget.readRemaining },
        ok: outcome.ok,
        outputKind: outcome.observation.outputKind,
        outputSummary: outcome.observation.summary,
        errorCode: outcome.observation.facts?.errorCode as string | undefined,
      });

      if (outcome.progressBody) {
        progressBodies.push(outcome.progressBody);
      }
    }

    void lastDecision;
    turnDiag.maxStepsHit = true;
    return {
      status: "fail_closed_max_steps",
      stopReasonCode: "max_steps_exhausted",
      steps: stepIndex,
      observations: store.getPlannerObservations(),
      finalContext: lastContext,
      progressBodies,
      plannerDecisions,
      toolExecutions,
      turnDiagnostics: turnDiag,
    };
  }
}
