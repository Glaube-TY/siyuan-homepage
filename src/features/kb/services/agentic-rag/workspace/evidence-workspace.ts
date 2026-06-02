/**
 * Evidence Workspace
 *
 * Agentic RAG evidence workspace types.
 *
 * 职责：
 * - 顶层字段清晰：证据数组 + observation + warnings + coverage 统计
 * - coverage 只保留统计字段，不承载证据数组
 * - 搜索候选不是最终证据；最终回答只能使用已进入 workspace 的证据
 * - 复用旧 ReferenceItem 类型，但不依赖旧分类路由
 */

import type { ReferenceItem } from "../../../types/chat";
import type { ResearchCandidatePool } from "./research-candidate-pool";
import type { KnowledgeMapState, KnowledgeDocHandleMapping, ActiveFocusScope } from "../tools/knowledge-map-types";
import type { SafeTextMeta } from "../debug/agentic-rag-debug";

export interface DailyNoteDoc {
  docId: string;
  title: string;
  date: string;
  box: string;
  path?: string;
  source?: "official_attr";
  attrName?: string;
  attrValue?: string;
  confidence?: "official_attr";
}

export interface AgenticTaskItem {
  blockId: string;
  docId: string;
  docTitle: string;
  content: string;
  markdown?: string;
  status: "open" | "done";
  box?: string;
  path?: string;
  created?: string;
  updated?: string;
  sort?: number;
  parentId?: string;
  rootId?: string;
}

export interface MetadataHit {
  blockId: string;
  docId: string;
  docTitle: string;
  type: string;
  subtype?: string;
  content: string;
  box?: string;
  path?: string;
  created?: string;
  updated?: string;
  attrs?: Record<string, string>;
  matchedBy: string[];
}

export interface LinkGraphNode {
  id: string;
  docId: string;
  docTitle: string;
  type: string;
  subtype?: string;
  content: string;
  box?: string;
  path?: string;
  inScope?: boolean;
}

export interface LinkGraphEdge {
  sourceBlockId: string;
  targetBlockId: string;
  sourceDocId?: string;
  targetDocId?: string;
  relation: "block_ref";
  direction: "outbound" | "backlink";
}

export interface LinkGraphResult {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
}

export interface QueryBlockInfo {
  blockId: string;
  docId: string;
  docTitle: string;
  box?: string;
  path?: string;
  markdown: string;
  content?: string;
  sql?: string;
  executable: boolean;
  warnings?: string[];
}

export interface QueryBlockExecutionResult {
  blockId: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  warnings?: string[];
}

export interface QueryBlockInspection {
  queryBlocks: QueryBlockInfo[];
  executionResults?: QueryBlockExecutionResult[];
}

export type CandidateDocProvenance =
  | "list_scope_docs"
  | "list_scope_docs_query"
  | "search_scope"
  | "search_scope_kernel"
  | "search_scope_title"
  | "search_scope_hybrid_doc"
  | "metadata"
  | "link_graph"
  | "recent"
  | "outline"
  | "previous_evidence"
  | "doc_tree_context"
  | "structural_focus"
  | "unknown";

export type CandidateDocLifecycle = "inventory" | "candidate" | "evidence_candidate";

export interface CandidateDoc {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  titlePath?: string;
  parentTitles?: string[];
  updated?: string;
  score?: number;
  source: string;
  lifecycle?: CandidateDocLifecycle;
  provenance?: CandidateDocProvenance;
  sourceQueryMeta?: SafeTextMeta;
  hasQuery?: boolean;
  inventoryOnly?: boolean;
  relevanceScore?: number;
  topBlockScore?: number;
  aggregateScore?: number;
  sourceQueryMetas?: SafeTextMeta[];
  channelHits?: string[];
  relationToFocus?: "root" | "descendant" | "sibling" | "branch_root";
  structuralReason?: string;
}

export interface CandidateBlock {
  blockId: string;
  docId: string;
  docTitle: string;
  content: string;
  score?: number;
  box?: string;
  path?: string;
  source: string;
  relevanceScore?: number;
  sourceQueryMeta?: SafeTextMeta;
  channel?: string;
  channelHits?: string[];
}

export interface EvidenceDocument {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  content: string;
  contentFormat: "markdown";
  truncated: boolean;
  contentChars: number;
}

export interface EvidenceBlockContext {
  blockId: string;
  docId: string;
  docTitle: string;
  content: string;
  box?: string;
  path?: string;
  truncated: boolean;
  contentChars: number;
  headingPath?: string[];
  contextBlocks?: Array<{ blockId: string; content: string; type?: string; subtype?: string }>;
  sourceBlockIds?: string[];
}

export interface DocOutlineNode {
  blockId: string;
  content: string;
  level: number;
  children: DocOutlineNode[];
  preview?: string;
  sort?: number;
  type?: string;
  subtype?: string;
}

export interface DocOutline {
  docId: string;
  title: string;
  rootNodes: DocOutlineNode[];
}

export interface RecentEvidenceItem {
  docId: string;
  docTitle: string;
  box?: string;
  role?: string;
  readLevel?: "snippet" | "section" | "document";
}

export interface ToolObservationCounts {
  candidateDocs?: number;
  candidateBlocks?: number;
  evidenceDocs?: number;
  evidenceBlocks?: number;
  outlines?: number;
  recentEvidence?: number;
}

export interface ToolObservation {
  actionType: string;
  success: boolean;
  summary?: string;
  counts?: ToolObservationCounts;
  error?: string;
  warning?: string;
  attemptedDocIds?: string[];
  failedDocIds?: string[];
  attemptedBlockIds?: string[];
  failedBlockIds?: string[];
}

export interface WorkspaceCoverage {
  searchedQueryMetas: SafeTextMeta[];
  searchCallCount: number;
  readDocCount: number;
  readBlockContextCount: number;
  reusedRecentDocCount: number;
  listedDocCount: number;
}

export interface ConversationUsedReference {
  turnIndex: number;
  turnId: string;
  assistantSummary: string;
  answerItems: {
    itemIndex: number;
    itemText: string;
    usedEvidenceHandles: string[];
  }[];
  references: {
    referenceHandle: string;
    docTitle: string;
    readLevel: string;
    sourceTurnId: string;
    sourceKind?: "footer_reference" | "cited_reference";
    sourceAnswerItemIndexes: number[];
    /** 内部字段：仅 runtime/workspace/materializer 使用，不进入 prompt/observation/debug/Planner 输入 */
    internalDocId?: string;
  }[];
}

export interface PreviousReferenceReadState {
  totalCount: number;
  selectedTurnIndexes: number[];
  readDocIdSet: Set<string>;
  remainingDocIds: string[];
  source: "displayed_footer_references";
}

export interface EvidenceWorkspace {
  candidateDocs: CandidateDoc[];
  candidateBlocks: CandidateBlock[];
  dailyNotes: DailyNoteDoc[];
  tasks: AgenticTaskItem[];
  metadataHits: MetadataHit[];
  linkGraph?: LinkGraphResult;
  queryBlockInspections?: QueryBlockInspection[];
  readDocuments: EvidenceDocument[];
  readBlockContexts: EvidenceBlockContext[];
  docOutlines: DocOutline[];
  recentEvidence: RecentEvidenceItem[];
  toolObservations: ToolObservation[];
  warnings: string[];
  coverage: WorkspaceCoverage;
  usedEvidenceIds: string[];
  references: ReferenceItem[];
  researchCandidatePool?: ResearchCandidatePool;
  conversationUsedReferences?: ConversationUsedReference[];
  lastReadPreviousEvidenceBatch?: string[];
  previousReferenceReadState?: PreviousReferenceReadState;
  // 文档图谱相关状态
  knowledgeMap?: KnowledgeMapState;
  docHandleMappings?: KnowledgeDocHandleMapping[];
  activeFocusScope?: ActiveFocusScope;
}

export function createEmptyEvidenceWorkspace(): EvidenceWorkspace {
  return {
    candidateDocs: [],
    candidateBlocks: [],
    dailyNotes: [],
    tasks: [],
    metadataHits: [],
    readDocuments: [],
    readBlockContexts: [],
    docOutlines: [],
    recentEvidence: [],
    toolObservations: [],
    warnings: [],
    coverage: {
      searchedQueryMetas: [],
      searchCallCount: 0,
      readDocCount: 0,
      readBlockContextCount: 0,
      reusedRecentDocCount: 0,
      listedDocCount: 0,
    },
    usedEvidenceIds: [],
    references: [],
    lastReadPreviousEvidenceBatch: undefined,
    previousReferenceReadState: undefined,
    // 文档图谱相关状态
    knowledgeMap: undefined,
    docHandleMappings: [],
    activeFocusScope: undefined,
  };
}

/**
 * 获取 conversationUsedReferences 中尚未被读取的 internalDocId 列表。
 * 只输出数量用于日志，不暴露真实 docId。
 */
export function getUnreadConversationReferenceDocIds(workspace: EvidenceWorkspace): string[] {
  const conversationUsedRefs = workspace.conversationUsedReferences;
  if (!conversationUsedRefs || conversationUsedRefs.length === 0) {
    return [];
  }

  const readDocIdSet = new Set<string>(workspace.readDocuments.map((d) => d.docId));
  const allRefDocIds = new Set<string>();

  for (const turnRef of conversationUsedRefs) {
    for (const ref of turnRef.references ?? []) {
      if (ref.internalDocId && ref.internalDocId.trim().length > 0) {
        allRefDocIds.add(ref.internalDocId);
      }
    }
  }

  const unreadDocIds: string[] = [];
  for (const docId of allRefDocIds) {
    if (!readDocIdSet.has(docId)) {
      unreadDocIds.push(docId);
    }
  }

  return unreadDocIds;
}
