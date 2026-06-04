/**
 * ToolContract: Tool 是独立能力，不感知调用步骤，不返回建议下一步�? */

import type { ZodSchema } from "zod";

/**
 * Tool 的安全等级（对象结构）�? *
 * - 内置 KB 工具默认 { readOnly: true }�? * - 写入�?MCP 工具应声�?{ canWrite: true, requiresConfirmation: true }�? * - 本字段仅描述硬安全等级，**�?*触发任何自动确认逻辑�? */
export interface ToolSafetyInfo {
  readOnly: boolean;
  canWrite?: boolean;
  requiresConfirmation?: boolean;
  permissionScope?: string;
}

/** 历史别名：保留供�?import�?*/
export type ToolSafety = ToolSafetyInfo;

/** Tool 来源�?*/
export type ToolSource = "builtin" | "mcp" | "skill" | "system";

/** Tool 输出物形态�?*/
export type ToolOutputKind =
  | "navigation"
  | "candidates"
  | "content"
  | "answer"
  | "progress"
  | "references"
  | "history"
  | "tree"
  | "error_only";

/**
 * Planner 可见 observation content：安全展示数据，不含流程建议�? * 初期仅支�?knowledge_map�? */
export interface PlannerVisibleKnowledgeMapNode {
  docId: string;
  sourceType?: string;
  title: string;
  depth: number;
  childCount: number;
  parentDocId?: string;
  siblingCount?: number;
  hasChildren?: boolean;
  nodeKind?: "document" | "container" | "unknown";
  canReadContent?: boolean;
  linkedDocs?: Array<{
    docId: string;
    title: string;
    relation: "backlink" | "mention";
    count: number;
    sampleBlockId?: string;
    source: "getBacklink";
  }>;
  linkRefsCount?: number;
  mentionsCount?: number;
  linkedDocsStatus?: "not_requested" | "available" | "unavailable" | "error";
  nodeStatus?: "available" | "unavailable";
  children?: PlannerVisibleKnowledgeMapNode[];
  truncatedChildren?: boolean;
}

export interface PlannerVisibleKnowledgeMapNotebook {
  notebookId: string;
  title: string;
  notebookName?: string;
  notebookNameStatus?: "available" | "unavailable";
  icon?: string;
  sort?: number;
  sortMode?: number;
  closed?: boolean;
  docCount: number;
  roots: PlannerVisibleKnowledgeMapNode[];
  truncated?: boolean;
}

export interface PlannerVisibleConversationReference {
  docId?: string;
  blockId?: string;
  url?: string;
  fileId?: string;
  resourceId?: string;
  title: string;
  sourceType?: string;
  preview?: string;
  usedCount?: number;
}

export interface PlannerVisibleSearchCandidate {
  docId: string;
  blockId?: string;
  sourceType?: string;
  title: string;
  preview?: string;
  rank: number;
  score?: number;
}

export interface PlannerVisibleScopeDoc {
  docId: string;
  sourceType?: string;
  title: string;
  depth?: number;
  childCount?: number;
  parentDocId?: string;
  siblingCount?: number;
  hasChildren?: boolean;
  nodeKind?: "document" | "container" | "unknown";
  canReadContent?: boolean;
  linkedDocs?: Array<{
    docId: string;
    title: string;
    relation: "backlink" | "mention";
    count: number;
    sampleBlockId?: string;
    source: "getBacklink";
  }>;
  linkRefsCount?: number;
  mentionsCount?: number;
  linkedDocsStatus?: "not_requested" | "available" | "unavailable" | "error";
  nodeStatus?: "available" | "unavailable";
}

export interface PlannerVisibleReadItem {
  docId?: string;
  blockId?: string;
  sourceType?: string;
  title: string;
  content?: string;
  snippet: string;
  referenceIndex: number;
  truncated?: boolean;
  originalContentChars?: number;
  returnedContentChars?: number;
  nextCursor?: string;
  remainingChars?: number;
  startOffset?: number;
}

export type PlannerVisibleObservationContent =
  | {
      type: "knowledge_map";
      resultScope?: "notebooks" | "notebook_roots" | "children" | "subtree" | "neighborhood" | "list";
      notebooks: PlannerVisibleKnowledgeMapNotebook[];
      truncated: boolean;
      hasMore?: boolean;
      nextCursor?: string;
    }
  | {
      type: "conversation_references";
      references: PlannerVisibleConversationReference[];
      truncated: boolean;
    }
  | {
      type: "search_results";
      candidates: PlannerVisibleSearchCandidate[];
      truncated: boolean;
    }
  | {
      type: "scope_docs";
      resultScope?: "notebooks" | "notebook_roots" | "children" | "subtree" | "neighborhood" | "list";
      docs: PlannerVisibleScopeDoc[];
      truncated: boolean;
      hasMore?: boolean;
      nextCursor?: string;
    }
  | {
      type: "content_items" | "read_items";
      items: PlannerVisibleReadItem[];
      truncated: boolean;
      errors?: Array<{
        docId?: string;
        blockId?: string;
        code: string;
        message: string;
        hint?: string;
      }>;
    };

/** Tool 不可用时的硬原因码�?*/
export type ToolUnavailableReason =
  | "tool_not_registered"
  | "permission_denied"
  | "budget_exhausted"
  | "prerequisite_missing"
  | "execution_only_helper";

/** Tool 硬可用性判定：只表达硬条件�?*�?*给建议�?*/
export interface ToolAvailability {
  available: boolean;
  reasonCode?: ToolUnavailableReason;
  hint?: string;
}

export type ToolInput = unknown;

/**
 * answer 工具的输出数据结构（通用最终回答）。
 * - body 来自 Planner 的 answer decision；answer tool 只做校验和承载。
 * - references 是通用资源引用数组，直接携带 docId/blockId/url/fileId 等真实资源 ID，
 *   不使用隐藏 identifier 映射层。整篇文档引用只传 docId，具体片段引用传 docId + blockId。
 */
export interface AnswerToolData {
  body: string;
  /** 通用资源引用（直接暴露真实资源 ID） */
  references?: AnswerResourceRef[];
}

/** 最终回答中的资源引用：直接暴露真实资源 ID，不使用隐藏 identifier */
export interface AnswerResourceRef {
  sourceType: "siyuan_doc" | "web_page" | "file" | "mcp_resource" | "api_result";
  /** 思源文档 ID（整篇文档引用时必填） */
  docId?: string;
  /** 思源块 ID（具体片段引用时可选，须与 docId 同时出现） */
  blockId?: string;
  url?: string;
  fileId?: string;
  resourceId?: string;
  title?: string;
  provider?: string;
}

/** 结构化错误详情：�?Planner 理解错误原因并自主修正�?*/
export interface ToolErrorDetail {
  /** 错误码：invalid_args / identifier_not_found / identifier_expired / wrong_identifier_type / out_of_scope / resource_not_found / permission_denied / tool_internal_error / scope_missing / prerequisite_missing / adapter_failed 等�?*/
  errorCode: string;
  /** 中文错误描述，给 Planner 看�?*/
  message: string;
  /** 是否可恢复（Planner 修正参数后可重试）�?*/
  recoverable?: boolean;
  /** 出问题的参数/字段名（可选）�?*/
  field?: string;
  /** 期望的格�?范围/值（可选）�?*/
  expected?: string;
  /** 实际收到的值（可选，需脱敏）�?*/
  received?: string;
  /** �?Planner 的修正建议（中文）�?*/
  hint?: string;
}

/** 工具执行结果�?*/
export interface ToolResult {
  ok: boolean;
  outputKind: ToolOutputKind;
  data: unknown;
  /** 向后兼容：简单错误码。优先使�?error 字段�?*/
  errorCode?: string;
  /** 结构化错误详情（推荐）�?*/
  error?: ToolErrorDetail;
}

/** 预算快照�?*/
export interface BudgetSnapshot {
  searchRemaining: number;
  readRemaining: number;
}

/**
 * Tool 返回�?Planner �?observation�?*�?*含事实�? */
export interface ToolObservation {
  toolName: string;
  ok: boolean;
  outputKind: ToolOutputKind;
  facts: {
    candidateDocCount?: number;
    returnedCandidateCount?: number;
    focusedDocCount?: number;
    strongCandidateDocCount?: number;
    unreadReadableCandidateCount?: number;
    contentItemCount?: number;
    hits?: number;
    /** read_candidate_docs 累计读取的 doc 计数 */
    readDocCount?: number;
    /** read_candidate_docs 格式有效的 ID 数量 */
    validDocIdCount?: number;
    /** read_candidate_docs 实际解析到的资源数量 */
    resolvedDocCount?: number;
    /** read_candidate_docs 正文为空的资源数 */
    emptyContentCount?: number;
    /** read_candidate_docs 容器文档无内容的数量 */
    containerCount?: number;
    /** read_candidate_docs 读取失败的资源数 */
    failedResourceCount?: number;
    /** read_candidate_docs 请求的 docId 数量 */
    requestedDocIdCount?: number;
    /** read_candidate_docs 请求的 blockId 数量 */
    requestedBlockIdCount?: number;
    /** read_candidate_docs 实际解析到的块数量 */
    resolvedBlockCount?: number;
    /** read_candidate_docs blockId 归属 docId 不匹配次数 */
    resourceMismatchCount?: number;
    /** read_candidate_docs 已读资源摘要 */
    readItemsSummary?: Array<{
      docId: string;
      title: string;
      returnedContentChars: number;
      truncated: boolean;
      hasNextCursor: boolean;
      status: string;
    }>;
    /** read_candidate_docs 错误资源摘要 */
    errorItemsSummary?: Array<{
      docId?: string;
      blockId?: string;
      code: string;
      message: string;
    }>;
    /** list_knowledge_map 返回的节点总数 */
    totalNodeCount?: number;
    /** list_knowledge_map 实际返回的节点数 */
    returnedNodeCount?: number;
    /** list_knowledge_map 返回的 notebook 数量 */
    notebookCount?: number;
    notebookApiLoaded?: boolean;
    sourceNotebookCount?: number;
    missingNotebookNameCount?: number;
    hasMore?: boolean;
    linkedDocsErrorCount?: number;
    linkedDocsRequested?: boolean;
    matchedNodeCount?: number;
    referenceCount?: number;
    /** 向后兼容：简单错误码。优先使用 errorMessage / errorHint */
    errorCode?: string;
    /** 中文错误描述（来自 ToolErrorDetail.message） */
    errorMessage?: string;
    /** 中文修正建议（来自 ToolErrorDetail.hint） */
    errorHint?: string;
    /** 是否可恢复（来自 ToolErrorDetail.recoverable） */
    errorRecoverable?: boolean;
    isZeroHits?: boolean;
  };
  summary: string;
  /** Planner 可见安全内容（如知识图谱树）�?*/
  content?: PlannerVisibleObservationContent;
}

/** 工具运行时上下文：Tool 看到的事实子集比 Skill 更窄�?*/
export interface ToolRuntimeContext {
  question: string;
  budgets: BudgetSnapshot;
  candidateSummary?: {
    candidateDocCount: number;
    strongCandidateDocCount: number;
    unreadReadableCandidateCount: number;
  };
  contentSummary?: {
    readDocCount: number;
    contentItemCount: number;
    hasReadContent: boolean;
  };
  callCounts: Record<string, number>;
}

/**
 * Tool contract�? * - inputSchema **必须**是真�?ZodSchema；不允许 undefined�? * - availability 仅表达硬条件�? * - observationFormatter 仅输出事实�? */
export interface ToolContract {
  name: string;
  title: string;
  description: string;
  capability: string;
  inputSchema: ZodSchema;
  outputSchema?: ZodSchema;
  outputKind: ToolOutputKind;
  safety: ToolSafetyInfo;
  boundary: string;
  source: ToolSource;
  /** Brief parameter hint for Planner. No flow suggestions, no docId/blockId/path. */
  inputHint?: string;
  availability(ctx: ToolRuntimeContext): ToolAvailability;
  execute(args: ToolInput, ctx: ToolRuntimeContext): Promise<ToolResult>;
  observationFormatter(result: ToolResult, ctx: ToolRuntimeContext): ToolObservation;
}

/** Tool 暴露�?Planner �?manifest�?*�?*�?execute�?*/
export interface ToolManifest {
  name: string;
  title: string;
  description: string;
  capability: string;
  inputSchema: ZodSchema;
  outputKind: ToolOutputKind;
  safety: ToolSafetyInfo;
  boundary: string;
  source: ToolSource;
  availability: ToolAvailability;
  /** Brief parameter hint for Planner. No flow suggestions, no docId/blockId/path. */
  inputHint?: string;
}

/** ToolContract 类型守护：仅检查字段存在性�?*/
export function isToolContractLike(value: unknown): value is ToolContract {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const safety = v.safety;
  const safetyOk =
    !!safety &&
    typeof safety === "object" &&
    typeof (safety as { readOnly?: unknown }).readOnly === "boolean";
  return (
    typeof v.name === "string" &&
    typeof v.title === "string" &&
    typeof v.description === "string" &&
    typeof v.capability === "string" &&
    !!v.inputSchema &&
    typeof v.outputKind === "string" &&
    safetyOk &&
    typeof v.boundary === "string" &&
    typeof v.source === "string" &&
    typeof v.availability === "function" &&
    typeof v.execute === "function" &&
    typeof v.observationFormatter === "function"
  );
}

/** �?ToolSafetyInfo 渲染成一行短字符串�?*/
export function formatToolSafety(safety: ToolSafetyInfo): string {
  if (safety.readOnly && !safety.canWrite && !safety.requiresConfirmation) {
    return "readOnly";
  }
  const tags: string[] = [];
  if (safety.canWrite) tags.push("canWrite");
  if (safety.requiresConfirmation) tags.push("confirmation");
  const scope = safety.permissionScope ? `:${safety.permissionScope}` : "";
  if (tags.length === 0) return `mutable${scope}`;
  return `${tags.join("+")}${scope}`;
}

/**
 * �?ToolResult 提取错误信息�?observation facts�? * 优先使用结构�?error 字段，向后兼�?errorCode�? */
export function extractErrorFacts(result: ToolResult): {
  errorCode: string;
  errorMessage?: string;
  errorHint?: string;
  errorRecoverable?: boolean;
} {
  if (result.error) {
    return {
      errorCode: result.error.errorCode,
      errorMessage: result.error.message,
      errorHint: result.error.hint,
      errorRecoverable: result.error.recoverable,
    };
  }
  return {
    errorCode: result.errorCode ?? "unknown_error",
  };
}
