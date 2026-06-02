/**
 * ToolContract: Tool 是独立能力，不感知调用步骤，不返回建议下一步。
 */

import type { ZodSchema } from "zod";

/**
 * Tool 的安全等级（对象结构）。
 *
 * - 内置 KB 工具默认 { readOnly: true }。
 * - 写入型 MCP 工具应声明 { canWrite: true, requiresConfirmation: true }。
 * - 本字段仅描述硬安全等级，**不**触发任何自动确认逻辑。
 */
export interface ToolSafetyInfo {
  readOnly: boolean;
  canWrite?: boolean;
  requiresConfirmation?: boolean;
  permissionScope?: string;
}

/** 历史别名：保留供旧 import。 */
export type ToolSafety = ToolSafetyInfo;

/** Tool 来源。 */
export type ToolSource = "builtin" | "mcp" | "skill" | "system";

/** Tool 输出物形态。 */
export type ToolOutputKind =
  | "navigation"
  | "candidates"
  | "evidence"
  | "answer"
  | "references"
  | "history"
  | "tree"
  | "error_only";

/**
 * Planner 可见 observation content：安全展示数据，不含流程建议。
 * 初期仅支持 knowledge_map。
 */
export interface PlannerVisibleKnowledgeMapNode {
  handle: string;
  title: string;
  depth: number;
  childCount: number;
  children?: PlannerVisibleKnowledgeMapNode[];
  truncatedChildren?: boolean;
}

export interface PlannerVisibleKnowledgeMapNotebook {
  handle: string;
  title: string;
  docCount: number;
  roots: PlannerVisibleKnowledgeMapNode[];
  truncated?: boolean;
}

export interface PlannerVisibleConversationReference {
  handle: string;
  title: string;
  preview?: string;
  usedCount?: number;
}

export type PlannerVisibleObservationContent =
  | {
      type: "knowledge_map";
      notebooks: PlannerVisibleKnowledgeMapNotebook[];
      truncated: boolean;
    }
  | {
      type: "conversation_references";
      references: PlannerVisibleConversationReference[];
      truncated: boolean;
    };

/** Tool 不可用时的硬原因码。 */
export type ToolUnavailableReason =
  | "tool_not_registered"
  | "permission_denied"
  | "budget_exhausted"
  | "prerequisite_missing"
  | "execution_only_helper";

/** Tool 硬可用性判定：只表达硬条件，**不**给建议。 */
export interface ToolAvailability {
  available: boolean;
  reasonCode?: ToolUnavailableReason;
  hint?: string;
}

export type ToolInput = unknown;

/**
 * answer 工具的输出数据结构。
 * - body / evidenceMode 来自 Planner 的 answer decision；answer tool 只做校验和承载。
 * - displayedReferenceHandles 是 UI 展示句柄，**不**含真实 docId / blockId / path。
 */
export interface AnswerToolData {
  evidenceMode: "with_evidence" | "insufficient_evidence" | "without_kb_evidence";
  body: string;
  displayedReferenceHandles?: string[];
}

/** 工具执行结果。 */
export interface ToolResult {
  ok: boolean;
  outputKind: ToolOutputKind;
  data: unknown;
  errorCode?: string;
}

/** 预算快照。 */
export interface BudgetSnapshot {
  searchRemaining: number;
  readRemaining: number;
  blockRemaining: number;
}

/**
 * Tool 返回给 Planner 的 observation。**只**含事实。
 */
export interface ToolObservation {
  toolName: string;
  ok: boolean;
  outputKind: ToolOutputKind;
  facts: {
    candidateDocCount?: number;
    strongCandidateDocCount?: number;
    unreadReadableCandidateCount?: number;
    evidenceItemCount?: number;
    hits?: number;
    /** read_candidate_docs 累计读取的 doc 计数。 */
    readDocCount?: number;
    /** read_block_context 累计读取的 block 上下文计数。 */
    readBlockContextCount?: number;
    /** list_knowledge_map 返回的节点总数。 */
    totalNodeCount?: number;
    /** list_knowledge_map 实际返回的节点数。 */
    returnedNodeCount?: number;
    /** list_knowledge_map 返回的 notebook 数。 */
    notebookCount?: number;
    matchedNodeCount?: number;
    referenceCount?: number;
    errorCode?: string;
    isZeroHits?: boolean;
  };
  summary: string;
  /** Planner 可见安全内容（如知识图谱树）。 */
  content?: PlannerVisibleObservationContent;
}

/** 工具运行时上下文：Tool 看到的事实子集比 Skill 更窄。 */
export interface ToolRuntimeContext {
  question: string;
  budgets: BudgetSnapshot;
  candidateSummary?: {
    candidateDocCount: number;
    strongCandidateDocCount: number;
    unreadReadableCandidateCount: number;
  };
  evidenceSummary?: {
    readDocCount: number;
    readBlockContextCount: number;
    evidenceItemCount: number;
    hasEnoughEvidence: boolean;
  };
  callCounts: Record<string, number>;
}

/**
 * Tool contract。
 * - inputSchema **必须**是真实 ZodSchema；不允许 undefined。
 * - availability 仅表达硬条件。
 * - observationFormatter 仅输出事实。
 */
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
  boundSkillName?: string;
  availability(ctx: ToolRuntimeContext): ToolAvailability;
  execute(args: ToolInput, ctx: ToolRuntimeContext): Promise<ToolResult>;
  observationFormatter(result: ToolResult, ctx: ToolRuntimeContext): ToolObservation;
}

/** Tool 暴露给 Planner 的 manifest。**不**含 execute。 */
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
  boundSkillName?: string;
  availability: ToolAvailability;
}

/** ToolContract 类型守护：仅检查字段存在性。 */
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

/** 把 ToolSafetyInfo 渲染成一行短字符串。 */
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
