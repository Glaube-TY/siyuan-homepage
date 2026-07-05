import type { EditDiffPreview, DocContentEditArrowFlow } from "../../doc-content-edit/doc-content-edit-types";

export interface ToolPermissionPreview {
  toolName: string;
  title: string;
  readOnly: boolean;
  risk: "low" | "medium" | "high";
  argsPreview: Record<string, unknown>;
  summary?: string;
  operationLabel?: string;
  targetSummary?: string;
  impactSummary?: string;
  riskReason?: string;
  warnings?: string[];
  missingPreviewReason?: string;
  /** Structured detail sections for the confirmation modal (e.g. URL, Headers, Body). */
  sections?: Array<{ label: string; value: string }>;
  /** UI routing hint: how to display the confirmation dialog */
  displayMode?: "summary" | "block_diff" | "arrow_flow";
  /** Pending confirmation ID (for executeConfirmed path) — never enters session */
  confirmationId?: string;
  /** Block diff preview data (for displayMode=block_diff) — never enters session */
  editDiffPreview?: EditDiffPreview;
  /** Arrow flow data (for displayMode=arrow_flow) */
  arrowFlow?: DocContentEditArrowFlow;
}

export interface ToolPermissionDecision {
  type: "allow" | "deny";
  reason?: string;
  /** 当拒绝是由系统安全策略/权限策略自动触发而非用户手动取消时，使用具体错误码（如 safety_blocked）。 */
  reasonCode?: string;
}
