/**
 * Agent Workbench: native tool call Agent harness for siyuan-note.
 *
 * Architecture:
 * - NativeToolAgentLoop is the primary Agent loop
 * - ProviderAdapter.streamChat returns standard tool_calls / functionCall / tool_use
 * - dispatchToolCalls handles permission gate, tool execution, role=tool backfill
 * - AgentSession is append-only, persisted per conversation
 * - Tools are global independent capabilities (NativeTool)
 * - Skills are Chinese capability manuals (instruction only, no tool ownership)
 */

// contracts
export type {
  ToolContract,
  ToolManifest,
  ToolResult,
  ToolExecutionRecord,
  ToolRuntimeContext,
  ToolAvailability,
  ToolSafetyInfo,
  ToolSource,
  ToolUnavailableReason,
  ToolErrorDetail,
} from "./contracts/tool-contract";

export type {
  SkillContract,
  SkillPromptSection,
  SkillRuntimeContext,
  SkillContextEvidence,
} from "./contracts/skill-contract";

export type {
  AgentWorkbenchEvent,
  AgentWorkbenchEventType,
  ToolStartEvent,
  ToolResultEvent,
  NoticeEvent,
} from "./contracts/turn-event";

// registries
export { ToolRegistry } from "./registries/tool-registry";
export { SkillRegistry } from "./registries/skill-registry";
export type { SkillSource } from "./registries/skill-registry";

// runtime — native Agent path only
export { ToolResultLog } from "./runtime/tool-result-log";
export { buildConversationContext } from "./runtime/conversation-context-builder";
export type {
  BuildConversationContextParams,
  ConversationContextSnapshot,
  ConversationReferenceContext,
  ConversationTurnContext,
} from "./runtime/conversation-context-builder";
export { ToolExecutor } from "./runtime/tool-executor";
export type { ToolCall, ExecutionOutcome } from "./runtime/tool-executor";
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
export { runNativeAgentLoop } from "./runtime/native-agent-runner";
export type { RunNativeAgentLoopParams, RunNativeAgentLoopResult } from "./runtime/native-agent-runner";
export { buildAgentContextInstructions } from "./runtime/agent-context-instruction-builder";
export type {
  BuildAgentContextInstructionsParams,
  AgentContextInstructions,
} from "./runtime/agent-context-instruction-builder";

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

// debug (dev-only)
export { checkToolSchemaSanity, runSchemaSanity } from "./debug/schema-sanity";
export type { SchemaSanityResult } from "./debug/workbench-debug";

// turn result types
export type {
  AgentTurnResult,
} from "./contracts/turn-result";
