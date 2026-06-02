/**
 * Agent Action Types
 *
 * Agentic RAG action type definitions.
 *
 * 职责：
 * - 使用 discriminated union，每个 type 对应自己的 args
 * - 定义 AgentActionName 联合类型
 * - 不依赖旧分类路由词
 */

export type AgentActionName =
  | "search_scope"
  | "list_scope_docs"
  | "read_docs"
  | "read_block_context"
  | "get_conversation_used_references"
  | "get_doc_tree_context"
  | "read_candidate_docs"
  | "read_previous_evidence"
  | "answer"
  | "list_knowledge_map"
  | "focus_doc_scope";

export type RetrievalMode = "balanced" | "keyword_first" | "exact_only";

export interface SearchScopeQuery {
  text: string;
  keywordQuery?: string;
  fuzzyQuery?: string;
  channels?: {
    keyword?: boolean;
    fuzzy?: boolean;
  };
  mode?: RetrievalMode;
}

export interface SearchScopeArgs {
  queries: SearchScopeQuery[];
  limit?: number;
  excludeDocIds?: string[];
  excludeAlreadyRead?: boolean;
  includeDocIds?: string[];
}

export interface ListScopeDocsArgs {
  limit?: number;
  query?: string;
}

export interface ReadDocsArgs {
  docIds: string[];
  maxCharsPerDoc?: number;
  readSource?: string;
}

export interface ReadBlockContextArgs {
  blockIds: string[];
  before?: number;
  after?: number;
  includeParent?: boolean;
  includeChildren?: boolean;
  includeHeadingPath?: boolean;
  maxCharsPerBlock?: number;
}

export type EvidenceMode =
  | "with_evidence"
  | "insufficient_evidence"
  | "without_kb_evidence";

export interface AnswerArgs {
  evidenceMode: EvidenceMode;
  answerKind?: string;
  evidenceDocIds?: string[];
  evidenceBlockIds?: string[];
}

export interface GetConversationUsedReferencesArgs {
  turnScope?: "last" | "recent" | "all" | "selected";
  turnIndexes?: number[];
  maxTurns?: number;
  maxRefsPerTurn?: number;
  includeAnswerItemMapping?: boolean;
}

export interface GetDocTreeContextArgs {
  anchorRefs?: string[];
  anchorIndexes?: number[];
  includeParent?: boolean;
  includeSiblings?: boolean;
  includeChildren?: boolean;
  includeDescendants?: boolean;
  maxDepth?: number;
  maxItems?: number;
}

export interface ListKnowledgeMapArgs {
  query?: string;
  maxDepth?: number;
  maxNodes?: number;
  rootHandles?: string[];
  includeAncestors?: boolean;
  includeChildrenPreview?: boolean;
}

export type FocusScopeMode = "exact" | "subtree" | "siblings" | "notebook";

export interface FocusDocScopeArgs {
  handles: string[];
  mode?: FocusScopeMode;
  reason?: string;
  maxDocIds?: number;
}

export type AgentAction =
  | { type: "search_scope"; reason: string; args: SearchScopeArgs }
  | { type: "list_scope_docs"; reason: string; args: ListScopeDocsArgs }
  | { type: "read_docs"; reason: string; args: ReadDocsArgs }
  | { type: "read_block_context"; reason: string; args: ReadBlockContextArgs }
  | { type: "get_conversation_used_references"; reason: string; args: GetConversationUsedReferencesArgs }
  | { type: "get_doc_tree_context"; reason: string; args: GetDocTreeContextArgs }
  | { type: "read_candidate_docs"; reason: string; args: { selection: "top_k" | "representative" | "unread_top_k"; k?: number } }
  | { type: "read_previous_evidence"; reason: string; args: { k?: number; previousAnswerItemIndexes?: number[]; evidenceHandles?: string[] } }
  | { type: "answer"; reason: string; args: AnswerArgs }
  | { type: "list_knowledge_map"; reason: string; args: ListKnowledgeMapArgs }
  | { type: "focus_doc_scope"; reason: string; args: FocusDocScopeArgs };

export type AnswerAction = Extract<AgentAction, { type: "answer" }>;
