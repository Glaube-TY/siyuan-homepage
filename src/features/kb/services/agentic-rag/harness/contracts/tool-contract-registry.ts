import type { AgentActionName } from "../../actions/action-types";
import {
  AnswerArgsSchema,
  FocusDocScopeArgsSchema,
  GetConversationUsedReferencesArgsSchema,
  GetDocTreeContextArgsSchema,
  ListKnowledgeMapArgsSchema,
  ListScopeDocsArgsSchema,
  ReadBlockContextArgsSchema,
  ReadCandidateDocsArgsSchema,
  ReadDocsArgsSchema,
  ReadPreviousEvidenceArgsSchema,
  SearchScopeArgsSchema,
} from "../../actions/action-schema";
import {
  PlannerAnswerArgsSchema,
  PlannerFocusDocScopeArgsSchema,
  PlannerGetConversationUsedReferencesArgsSchema,
  PlannerGetDocTreeContextArgsSchema,
  PlannerListKnowledgeMapArgsSchema,
  PlannerListScopeDocsArgsSchema,
  PlannerReadBlockContextArgsSchema,
  PlannerReadCandidateDocsArgsSchema,
  PlannerReadPreviousEvidenceArgsSchema,
  PlannerSearchScopeArgsSchema,
} from "../../planner/planner-action";
import type {
  KbAgentEvidenceRole,
  KbAgentToolContract,
  KbAgentToolFamily,
} from "./tool-contract";
const safeSecurity = {
  readOnly: true,
  requiresCurrentDoc: false,
  exposesRealDocIds: false,
  exposesRealPaths: false,
  exposesRealBox: false,
  plannerMayProvideRealIds: false,
} as const;

function prompt(
  title: string,
  capability: string,
  args: string,
  returns: string,
  boundary: string,
): KbAgentToolContract["prompt"] {
  return { title, capability, args, returns, boundary };
}

function debug(name: AgentActionName, safeFields: string[] = ["actionType", "success"]): KbAgentToolContract["debug"] {
  return {
    safeEventName: `TOOL_CONTRACT_${name.toUpperCase()}_SAFE`,
    safeFields,
  };
}

export const KB_AGENT_TOOL_CONTRACTS = {
  list_knowledge_map: {
    name: "list_knowledge_map",
    plannerType: "list_knowledge_map",
    family: "map",
    canStartPlan: true,
    canContinuePlan: true,
    inputSchema: ListKnowledgeMapArgsSchema,
    plannerSchema: PlannerListKnowledgeMapArgsSchema,
    produces: "navigation",
    evidenceRole: "navigation_only",
    allowedNext: ["focus_doc_scope", "search_scope", "list_scope_docs", "read_candidate_docs", "read_block_context", "answer"],
    materializesTo: ["list_knowledge_map"],
    prompt: prompt(
      "list_knowledge_map",
      "返回当前范围的文档树结构（路线图/目录图），包含 safe handle、titlePath、层级关系、父子关系、childCount，帮助理解笔记空间结构。",
      "{} 或 {maxDepth?, maxNodes?}",
      "文档树结构节点列表，含 safe handle、titlePath、depth、childCount、parentHandle；不是正文证据。",
      "不返回正文，不产生 readable candidates，不读取文档内容。",
    ),
    security: safeSecurity,
    debug: debug("list_knowledge_map", ["returnedNodeCount", "matchedNodeCount"]),
  },
  focus_doc_scope: {
    name: "focus_doc_scope",
    plannerType: "focus_doc_scope",
    family: "focus",
    canStartPlan: false,
    canContinuePlan: true,
    inputSchema: FocusDocScopeArgsSchema,
    plannerSchema: PlannerFocusDocScopeArgsSchema,
    produces: "candidates",
    evidenceRole: "candidate_only",
    allowedNext: ["search_scope", "read_candidate_docs", "read_block_context", "answer"],
    materializesTo: ["focus_doc_scope"],
    prompt: prompt(
      "focus_doc_scope",
      "使用 safe handles 展开指定节点的父子/兄弟/后代结构，产生结构候选。",
      "{handles: string[], mode?}",
      "展开后的文档树结构和 structural candidates；不读取正文。",
      "不读取正文，不产生正文证据。",
    ),
    security: safeSecurity,
    debug: debug("focus_doc_scope", ["resolvedHandleCount", "focusedDocCount", "candidateDocCount"]),
  },
  search_scope: {
    name: "search_scope",
    plannerType: "search_scope",
    family: "search",
    canStartPlan: true,
    canContinuePlan: true,
    inputSchema: SearchScopeArgsSchema,
    plannerSchema: PlannerSearchScopeArgsSchema,
    produces: "candidates",
    evidenceRole: "candidate_only",
    allowedNext: ["search_scope", "list_scope_docs", "read_candidate_docs", "read_block_context", "get_doc_tree_context", "answer"],
    materializesTo: ["search_scope"],
    prompt: prompt(
      "search_scope",
      "按 Planner 给出的查询在当前范围或聚焦范围做精确/模糊检索，返回候选文档和候选块。",
      "{queries:[{text, keywordQuery?, fuzzyQuery?, mode?}], limit?, excludeAlreadyRead?}",
      "候选文档和候选块；0 命中返回空 observation。",
      "不读取正文，不产生正文证据。",
    ),
    security: safeSecurity,
    debug: debug("search_scope", ["queryCount", "candidateDocCount", "candidateBlockCount"]),
  },
  list_scope_docs: {
    name: "list_scope_docs",
    plannerType: "list_scope_docs",
    family: "search",
    canStartPlan: true,
    canContinuePlan: true,
    inputSchema: ListScopeDocsArgsSchema,
    plannerSchema: PlannerListScopeDocsArgsSchema,
    produces: "candidates",
    evidenceRole: "candidate_only",
    allowedNext: ["search_scope", "list_scope_docs", "read_candidate_docs", "read_block_context", "answer"],
    materializesTo: ["list_scope_docs"],
    prompt: prompt(
      "list_scope_docs",
      "列出当前范围文档清单和 safe handles。无 query 主要是 inventory/navigation；带 query 可产生候选。",
      "{} 或 {query?, limit?}",
      "文档清单和 safe handles。无 query 时为 navigation/inventory；带 query 时可产生候选。",
      "不读取正文，navigation/inventory 不是 readable candidate。",
    ),
    security: safeSecurity,
    debug: debug("list_scope_docs", ["candidateDocCount"]),
  },
  read_candidate_docs: {
    name: "read_candidate_docs",
    plannerType: "read_candidate_docs",
    family: "read",
    canStartPlan: false,
    canContinuePlan: true,
    inputSchema: ReadCandidateDocsArgsSchema,
    plannerSchema: PlannerReadCandidateDocsArgsSchema,
    produces: "evidence",
    evidenceRole: "evidence",
    allowedNext: ["read_candidate_docs", "read_block_context", "get_doc_tree_context", "answer"],
    materializesTo: ["read_docs"],
    prompt: prompt(
      "read_candidate_docs",
      "读取当前已形成的可读候选资料正文。",
      "{} 或 {selection, k}",
      "正文证据。",
      "不接受真实文档 ID；无可读候选时返回 observation。",
    ),
    security: safeSecurity,
    debug: debug("read_candidate_docs", ["selectedDocCount", "readDocCount"]),
  },
  read_docs: {
    name: "read_docs",
    family: "read",
    canStartPlan: false,
    canContinuePlan: false,
    inputSchema: ReadDocsArgsSchema,
    produces: "evidence",
    evidenceRole: "evidence",
    allowedNext: ["read_candidate_docs", "read_block_context", "get_doc_tree_context", "answer"],
    materializesTo: ["read_docs"],
    prompt: prompt(
      "read_docs",
      "读取文档正文内容。",
      "{docIds}",
      "文档正文。",
      "系统根据 safe handle 执行读取。",
    ),
    security: safeSecurity,
    debug: debug("read_docs", ["requestedDocCount", "readDocCount"]),
  },
  read_block_context: {
    name: "read_block_context",
    plannerType: "read_block_context",
    family: "read",
    canStartPlan: true,
    canContinuePlan: true,
    inputSchema: ReadBlockContextArgsSchema,
    plannerSchema: PlannerReadBlockContextArgsSchema,
    produces: "evidence",
    evidenceRole: "evidence",
    allowedNext: ["read_block_context", "answer"],
    materializesTo: ["read_block_context"],
    prompt: prompt(
      "read_block_context",
      "读取候选块的上下文内容。",
      "{blockIds}",
      "块上下文证据。",
      "块上下文可作为回答补充证据。",
    ),
    security: safeSecurity,
    debug: debug("read_block_context", ["selectedBlockCount", "readBlockContextCount"]),
  },
  get_doc_tree_context: {
    name: "get_doc_tree_context",
    plannerType: "get_doc_tree_context",
    family: "tree",
    canStartPlan: true,
    canContinuePlan: true,
    inputSchema: GetDocTreeContextArgsSchema,
    plannerSchema: PlannerGetDocTreeContextArgsSchema,
    produces: "candidates",
    evidenceRole: "candidate_only",
    allowedNext: ["get_doc_tree_context", "read_candidate_docs", "read_block_context", "answer"],
    materializesTo: ["get_doc_tree_context"],
    prompt: prompt(
      "get_doc_tree_context",
      "从已知文档的 safe anchor 扩展父、兄弟、子、后代候选。",
      "{anchors}",
      "树扩展候选，不是正文证据。",
      "树扩展候选不是正文证据。",
    ),
    security: safeSecurity,
    debug: debug("get_doc_tree_context", ["anchorCount", "candidateDocCount"]),
  },
  get_conversation_used_references: {
    name: "get_conversation_used_references",
    plannerType: "get_conversation_used_references",
    family: "history",
    canStartPlan: true,
    canContinuePlan: true,
    inputSchema: GetConversationUsedReferencesArgsSchema,
    plannerSchema: PlannerGetConversationUsedReferencesArgsSchema,
    produces: "candidates",
    evidenceRole: "candidate_only",
    allowedNext: ["get_conversation_used_references", "read_previous_evidence", "answer"],
    materializesTo: ["get_conversation_used_references"],
    prompt: prompt(
      "get_conversation_used_references",
      "列出历史对话回答中已展示给用户的参考资料的 safe handle 和标题。",
      "{turnScope?, maxTurns?}",
      "每轮的引用 safe handle、标题、turnIndex。",
      "不返回真实 docId、path、正文；只返回 safe handle 和元数据。",
    ),
    security: safeSecurity,
    debug: debug("get_conversation_used_references", ["turnCount", "referenceCount"]),
  },
  read_previous_evidence: {
    name: "read_previous_evidence",
    plannerType: "read_previous_evidence",
    family: "history",
    canStartPlan: false,
    canContinuePlan: true,
    inputSchema: ReadPreviousEvidenceArgsSchema,
    plannerSchema: PlannerReadPreviousEvidenceArgsSchema,
    produces: "evidence",
    evidenceRole: "evidence",
    allowedNext: ["read_previous_evidence", "answer"],
    materializesTo: ["read_docs"],
    prompt: prompt(
      "read_previous_evidence",
      "读取历史回答中已展示给用户的参考资料正文。",
      "{k?, evidenceHandles?}",
      "正文证据。",
      "只覆盖已展示引用；不接受真实文档 ID。",
    ),
    security: safeSecurity,
    debug: debug("read_previous_evidence", ["selectedDocCount"]),
  },
  answer: {
    name: "answer",
    plannerType: "answer",
    family: "answer",
    canStartPlan: false,
    canContinuePlan: true,
    inputSchema: AnswerArgsSchema,
    plannerSchema: PlannerAnswerArgsSchema,
    produces: "answer",
    evidenceRole: "none",
    allowedNext: [],
    materializesTo: ["answer"],
    prompt: prompt(
      "answer",
      "提交本轮最终回答意图。",
      "{evidenceMode, answerKind?}",
      "最终回答意图。",
      "evidenceMode 必填。",
    ),
    security: safeSecurity,
    debug: debug("answer", ["evidenceMode", "answerKind", "evidenceItemCount"]),
  },
} as const satisfies Record<AgentActionName, KbAgentToolContract>;

export const KB_AGENT_TOOL_NAMES = Object.keys(KB_AGENT_TOOL_CONTRACTS) as AgentActionName[];

export function isKbAgentToolName(value: string): value is AgentActionName {
  return value in KB_AGENT_TOOL_CONTRACTS;
}

export function getToolContract(name: AgentActionName): KbAgentToolContract {
  return KB_AGENT_TOOL_CONTRACTS[name];
}

export function getOptionalToolContract(name: string): KbAgentToolContract | undefined {
  if (!isKbAgentToolName(name)) return undefined;
  return KB_AGENT_TOOL_CONTRACTS[name];
}

export function getAllowedNextActions(name: AgentActionName): AgentActionName[] {
  return [...KB_AGENT_TOOL_CONTRACTS[name].allowedNext];
}

export function getPlannerAllowedNextActions(name: AgentActionName): AgentActionName[] {
  return KB_AGENT_TOOL_CONTRACTS[name].allowedNext.filter((a) => a !== "read_docs");
}

export function getToolFamily(name: AgentActionName): KbAgentToolFamily {
  return KB_AGENT_TOOL_CONTRACTS[name].family;
}

export function canToolProduceEvidence(name: AgentActionName): boolean {
  return KB_AGENT_TOOL_CONTRACTS[name].evidenceRole === "evidence";
}

export function getToolPromptSections(): string {
  return KB_AGENT_TOOL_NAMES
    .filter((name) => name !== "read_docs")
    .map((name) => {
      const contract = KB_AGENT_TOOL_CONTRACTS[name];
      const lines = [
        `### ${contract.prompt.title}`,
        `capability: ${contract.prompt.capability}`,
        `args: ${contract.prompt.args}`,
        `returns: ${contract.prompt.returns}`,
        `boundary: ${contract.prompt.boundary}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

export function isPlannerVisibleToolName(name: AgentActionName): boolean {
  return "plannerType" in KB_AGENT_TOOL_CONTRACTS[name];
}

export function getPlannerVisibleToolNames(): AgentActionName[] {
  return KB_AGENT_TOOL_NAMES.filter(isPlannerVisibleToolName);
}

export function getPlannerToolPromptSections(): string {
  return getPlannerVisibleToolNames()
    .map((name) => {
      const contract = KB_AGENT_TOOL_CONTRACTS[name];
      const lines = [
        `### ${contract.prompt.title}`,
        `capability: ${contract.prompt.capability}`,
        `args: ${contract.prompt.args}`,
        `returns: ${contract.prompt.returns}`,
        `boundary: ${contract.prompt.boundary}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

export function getPlannerToolPromptSectionsForAllowed(
  allowedActions: AgentActionName[],
): string {
  const plannerVisible = getPlannerVisibleToolNames();
  const allowedSet = new Set(allowedActions.filter((a) => plannerVisible.includes(a)));
  if (allowedSet.size === 0) {
    return "当前没有可用工具。";
  }
  return plannerVisible
    .filter((name) => allowedSet.has(name))
    .map((name) => {
      const contract = KB_AGENT_TOOL_CONTRACTS[name];
      const lines = [
        `### ${contract.prompt.title}`,
        `capability: ${contract.prompt.capability}`,
        `args: ${contract.prompt.args}`,
        `returns: ${contract.prompt.returns}`,
        `boundary: ${contract.prompt.boundary}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

export function getEvidenceRole(name: AgentActionName): KbAgentEvidenceRole {
  return KB_AGENT_TOOL_CONTRACTS[name].evidenceRole;
}

export function assertReadDocsNotPlannerVisible(): void {
  const readDocsContract = KB_AGENT_TOOL_CONTRACTS.read_docs;
  if ("plannerType" in readDocsContract) {
    console.error("[KB-AGENT | FIRST_PRINCIPLES_VIOLATION_SAFE] read_docs must not have plannerType; it is execution-only");
  }
  if (isPlannerVisibleToolName("read_docs" as AgentActionName)) {
    console.error("[KB-AGENT | FIRST_PRINCIPLES_VIOLATION_SAFE] read_docs must not be planner-visible");
  }
}
