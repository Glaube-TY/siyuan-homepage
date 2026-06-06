/**
 * Agent Workbench: thin generic Agent Harness for siyuan-note.
 *
 * - Workbench is a transparent execution platform
 * - Tools are global independent capabilities
 * - Skills are Chinese capability manuals
 * - Planner/Model is the only business decision maker
 */

// contracts
export type {
  ToolContract,
  ToolManifest,
  ToolResult,
  ToolObservation,
  ToolRuntimeContext,
  ToolAvailability,
  ToolSafetyInfo,
  ToolSource,
  ToolUnavailableReason,
  ToolErrorDetail,
} from "./contracts/tool-contract";

export type {
  PlannerDecision,
  PlannerToolDecision,
  PlannerAnswerDecision,
  PlannerStopDecision,
  PlannerStopReasonCode,
  AnswerResourceRef,
  AnswerStageSummary,
} from "./contracts/planner-decision";
export { validatePlannerDecision } from "./contracts/planner-decision";

export type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
  SkillObservation,
} from "./contracts/skill-contract";

export type {
  AgentWorkbenchEvent,
  AgentWorkbenchEventType,
  ToolDispatchEvent,
  ToolResultEvent,
  NoticeEvent,
} from "./contracts/turn-event";

// registries
export { ToolRegistry } from "./registries/tool-registry";
export { SkillRegistry } from "./registries/skill-registry";
export type { SkillSource } from "./registries/skill-registry";

// runtime
export { ObservationLog } from "./runtime/observation-log";
export { buildPlannerContext } from "./runtime/planner-context-builder";
export type { PlannerContext, PlannerContextInput } from "./runtime/planner-context-builder";
export { buildConversationContext } from "./runtime/conversation-context-builder";
export type {
  BuildConversationContextParams,
  ConversationContextSnapshot,
  ConversationReferenceContext,
  ConversationTurnContext,
} from "./runtime/conversation-context-builder";
export { ToolExecutor } from "./runtime/tool-executor";
export type { ToolCall, ExecutionOutcome } from "./runtime/tool-executor";
export { AgentLoop } from "./runtime/agent-loop";
export type { AgentLoopDeps, AgentLoopInput, AgentLoopResult, AnswerDraft } from "./runtime/agent-loop";
export { PromptJsonPlannerProvider } from "./runtime/planner-provider";
export type {
  PlannerProvider,
  PlannerProviderInput,
  PlannerProviderMode,
  PlannerProviderToolSchema,
  PlannerProviderMessage,
  PlannerProviderToolCall,
  PlannerProviderDecisionResult,
} from "./runtime/planner-provider";
export { saveTurnTrace, getLastTurnTrace, getRecentTurnTraces, clearTurnTraces } from "./runtime/turn-trace-store";
export type { TurnTrace } from "./runtime/turn-trace-store";
export { createAgentWorkbenchRuntime, refreshUserSkills } from "./runtime/create-agent-workbench";
export type {
  AgentWorkbenchRuntime,
  AgentWorkbenchRuntimeOptions,
} from "./runtime/create-agent-workbench";
export { runAgentTurn } from "./runtime/run-agent-turn";
export type {
  RunAgentTurnParams,
  AgentTurnOutcome,
} from "./runtime/run-agent-turn";

// tools
export { createFinalAnswerTool } from "./tools/system/final-answer.tool";

// siyuan tools
export {
  createListKnowledgeMapTool,
  listKnowledgeMapInputSchema,
} from "./tools/siyuan/list-knowledge-map.tool";
export type { ListKnowledgeMapInput, ListKnowledgeMapOutput, KnowledgeMapNode, KnowledgeMapNotebook, KnowledgeLinkedDoc, ListKnowledgeMapDeps } from "./tools/siyuan/list-knowledge-map.tool";

export {
  createSearchScopeTool,
  searchScopeInputSchema,
} from "./tools/siyuan/search-scope.tool";
export type { SearchScopeInput, SearchScopeOutput, SearchCandidate, SearchScopeDeps } from "./tools/siyuan/search-scope.tool";

export {
  createReadDocsTool,
  readDocsInputSchema,
  readDocsOutputSchema,
} from "./tools/siyuan/read-docs.tool";
export type { ReadDocsInput, ReadDocsOutput, ReadDocsItem, ReadDocsError, ReadDocsDeps } from "./tools/siyuan/read-docs.tool";

export {
  createGetDailyWorkspaceOverviewTool,
  getDailyWorkspaceOverviewInputSchema,
  getDailyWorkspaceOverviewOutputSchema,
} from "./tools/siyuan/get-daily-workspace-overview.tool";
export type { GetDailyWorkspaceOverviewInput, GetDailyWorkspaceOverviewOutput, GetDailyWorkspaceOverviewDeps } from "./tools/siyuan/get-daily-workspace-overview.tool";

export {
  createQueryTasksTool,
  queryTasksInputSchema,
  queryTasksOutputSchema,
} from "./tools/siyuan/query-tasks.tool";
export type { QueryTasksInput, QueryTasksOutput, QueryTasksDeps } from "./tools/siyuan/query-tasks.tool";

export {
  createQueryDiaryRecordsTool,
  queryDiaryRecordsInputSchema,
  queryDiaryRecordsOutputSchema,
} from "./tools/siyuan/query-diary-records.tool";
export type { QueryDiaryRecordsInput, QueryDiaryRecordsOutput, QueryDiaryRecordsDeps } from "./tools/siyuan/query-diary-records.tool";

export {
  createFindDiaryDocsTool,
  findDiaryDocsInputSchema,
  findDiaryDocsOutputSchema,
} from "./tools/siyuan/find-diary-docs.tool";
export type { FindDiaryDocsInput, FindDiaryDocsOutput, FindDiaryDocsDeps } from "./tools/siyuan/find-diary-docs.tool";

// skills
export { createKnowledgeBaseQaSkill, BUILTIN_KB_SKILL_NAME } from "./skills/builtin/knowledge-base-qa.skill";
export { createScheduleTaskDiarySkill, BUILTIN_SCHEDULE_TASK_DIARY_SKILL_NAME } from "./skills/builtin/schedule-task-diary.skill";

// debug (dev-only)
export { checkToolSchemaSanity, runSchemaSanity } from "./debug/schema-sanity";
export type { SchemaSanityResult } from "./debug/workbench-debug";

// turn result types
export type {
  AgentTurnResult,
} from "./contracts/turn-result";
