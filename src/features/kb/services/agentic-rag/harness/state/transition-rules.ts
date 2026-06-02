/**
 * ⚠️ LEGACY FLOW-CONTROL ⚠️
 *
 * 本文件是 v2 状态机的"按状态计算 allowedActions"逻辑。
 * 属于"legacy flow-control，待迁移为 observation-only"。
 *
 * v3 方向（见 docs/notebrain/agent-skill-workbench-v3-design.md §10）：
 * - allowedActions 只能表达硬可用性（权限 / 预算 / 工具是否存在 / 是否有候选）。
 * - 不允许在 allowedActions 中表达流程建议、优先顺序、强制下一动作。
 *
 * 迁移期约束：
 * - 本轮**不**新增新流程逻辑。
 * - 后续轮次：把"流程建议"从 allowedActions 中剥离，改写到对应 Skill 的
 *   `guidance` 字段（写入 Planner prompt 描述，不进入硬过滤）。
 * - 旧调用方暂不破坏。
 */

import type { AgentActionName } from "../../actions/action-types";
import type { KbAgentStateContext, KbAgentStateName } from "./kb-agent-state";

export interface AllowedActionsContext {
  state: KbAgentStateName;
  gateMissing?: string;
  candidateDocCount: number;
  readableCandidateDocCount: number;
  candidateBlockCount: number;
  readDocCount: number;
  readBlockContextCount: number;
  hasKnowledgeMap: boolean;
  hasActiveFocusScope: boolean;
  searchBudgetRemaining: number;
  readBudgetRemaining: number;
  hasExecutedListKnowledgeMap?: boolean;
  previousReferenceDocIdsCount?: number;
}

const ALL_CONTRACT_ACTIONS: readonly AgentActionName[] = [
  "list_knowledge_map",
  "focus_doc_scope",
  "search_scope",
  "list_scope_docs",
  "read_candidate_docs",
  "read_docs",
  "read_block_context",
  "get_doc_tree_context",
  "get_conversation_used_references",
  "read_previous_evidence",
  "answer",
];

const CAPABILITY_ACTIONS: readonly AgentActionName[] = [
  "list_knowledge_map",
  "focus_doc_scope",
  "search_scope",
  "list_scope_docs",
  "read_candidate_docs",
  "read_block_context",
  "get_doc_tree_context",
  "get_conversation_used_references",
  "read_previous_evidence",
  "answer",
];

const ALLOWED_ACTIONS_BY_STATE: Record<KbAgentStateName, readonly AgentActionName[]> = {
  TURN_STARTED: [],
  SCOPE_RESOLVED: ["list_knowledge_map", "search_scope", "list_scope_docs", "read_previous_evidence", "get_conversation_used_references"],
  NEEDS_KB: ["list_knowledge_map", "search_scope", "list_scope_docs", "read_previous_evidence", "get_conversation_used_references"],
  NO_KB_REQUIRED: ["answer"],
  MAP_REQUIRED: ["list_knowledge_map", "search_scope", "list_scope_docs", "read_previous_evidence", "get_conversation_used_references"],
  MAP_LOADED: [...CAPABILITY_ACTIONS],
  FOCUS_REQUIRED: [...CAPABILITY_ACTIONS],
  FOCUS_SET: [...CAPABILITY_ACTIONS],
  SEARCH_REQUIRED: [...CAPABILITY_ACTIONS],
  SEARCH_DONE: [...CAPABILITY_ACTIONS],
  CANDIDATES_READY: [...CAPABILITY_ACTIONS],
  READ_REQUIRED: [...CAPABILITY_ACTIONS],
  EVIDENCE_READ: [...CAPABILITY_ACTIONS],
  TREE_EXPANSION_REQUIRED: [...CAPABILITY_ACTIONS],
  LINK_EXPANSION_REQUIRED: [],
  EVIDENCE_SUFFICIENT: ["answer"],
  EVIDENCE_INSUFFICIENT_WITH_OPTIONS: [...CAPABILITY_ACTIONS],
  EVIDENCE_INSUFFICIENT_FINAL: ["answer"],
  ANSWER_READY: ["answer"],
  FINALIZED: [],
};

const HARD_FORBID_ANSWER_STATES = new Set<KbAgentStateName>([]);

export function getAllowedActionsForState(
  context: Pick<KbAgentStateContext, "state">,
): AgentActionName[] {
  return [...ALLOWED_ACTIONS_BY_STATE[context.state]];
}

export function getAllowedActionsForStateContext(_ctx: AllowedActionsContext): AgentActionName[] | null {
  return null;
}

export function getForbiddenActionsForState(
  context: Pick<KbAgentStateContext, "state"> & { allowedActions?: AgentActionName[] },
): AgentActionName[] {
  const allowed = new Set(context.allowedActions ?? getAllowedActionsForState(context));
  return ALL_CONTRACT_ACTIONS.filter((action) => !allowed.has(action));
}

export function canAnswerInState(state: KbAgentStateName): boolean {
  if (HARD_FORBID_ANSWER_STATES.has(state)) return false;
  return ALLOWED_ACTIONS_BY_STATE[state].includes("answer");
}
