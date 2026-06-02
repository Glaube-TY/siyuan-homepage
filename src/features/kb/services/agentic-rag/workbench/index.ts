/**
 * Workbench index: 集中导出 Skill-first Agent Workbench 通用模块。
 */

// contracts
export type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
  SkillObservation,
} from "./contracts/skill-contract";
export { isSkillContractLike } from "./contracts/skill-contract";

export type { SkillSourceLoader, SkillLoadContext } from "./contracts/skill-source";

export type {
  ToolContract,
  ToolManifest,
  ToolInput,
  ToolResult,
  ToolObservation,
  ToolRuntimeContext,
  ToolAvailability,
  ToolSafetyInfo,
  ToolSafety,
  ToolSource,
  ToolOutputKind,
  ToolUnavailableReason,
  AnswerToolData,
  BudgetSnapshot,
} from "./contracts/tool-contract";
export { isToolContractLike, formatToolSafety } from "./contracts/tool-contract";

export type {
  PlannerDecision,
  PlannerToolDecision,
  PlannerAnswerDecision,
  PlannerStopDecision,
  PlannerStopReasonCode,
} from "./contracts/planner-decision";
export { validatePlannerDecision } from "./contracts/planner-decision";

// registries
export type { SkillSource } from "./registries/skill-registry";
export {
  SkillRegistry,
  getGlobalSkillRegistry,
  resetGlobalSkillRegistry,
} from "./registries/skill-registry";

export {
  ToolRegistry,
  getGlobalToolRegistry,
  resetGlobalToolRegistry,
  EXECUTION_ONLY_TOOL_NAMES,
} from "./registries/tool-registry";

// runtime
export type { PlannerContext, PlannerContextInput } from "./runtime/planner-context";
export { buildPlannerContext, renderPlannerContextPreview } from "./runtime/planner-context";

export type { ObservationEntry } from "./runtime/observation-store";
export { ObservationStore } from "./runtime/observation-store";

export type { BudgetConfig, BudgetState, BudgetCategory } from "./runtime/budget-guard";
export { BudgetGuard, resolveBudgetCategory } from "./runtime/budget-guard";

export type {
  ExecutionEngineDeps,
  PlannedToolCall,
  ExecutionOutcome,
  AnswerDraft,
} from "./runtime/execution-engine";
export {
  ExecutionEngine,
  extractAnswerDraft,
  isExecutionOnlyTool,
} from "./runtime/execution-engine";

export type {
  PlannerLoopDeps,
  PlannerLoopInput,
  PlannerLoopResult,
} from "./runtime/planner-loop";
export { PlannerLoop } from "./runtime/planner-loop";

// guards
export {
  sanitizePlannerVisibleError,
  MAX_SUMMARY_LENGTH,
} from "./guards/planner-visible-error";

export {
  FORBIDDEN_FLOW_CONTROL_FIELDS,
  isForbiddenFlowControlField,
  assertNoFlowControlFields,
} from "./guards/flow-control-guard";

export { assertNoPlannerVisibleInternalReferences } from "./guards/planner-visible-data-guard";

// evidence
export type { EvidenceAnchor, DisplayedHandleMeta } from "./evidence/evidence-pack";
export { EvidencePack, assertSafeDisplayedHandle } from "./evidence/evidence-pack";

// self-check
export {
  assertNoPlannerVisibleExecutionOnlyTools,
  assertNoUndefinedToolSchemas,
  assertNoFlowControlFieldsInSkill,
  assertNoFlowControlFieldsInTool,
  assertNoFlowControlFieldsInDecision,
  assertNoFlowControlFieldsInObservation,
  assertNoPlannerVisibleInternalReferencesInObservation,
  runAllSelfChecks,
} from "./self-check/self-check";
