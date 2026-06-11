/**
 * 文档内容编辑基础设施统一导出入口。
 */

export type {
  DocContentEditOperation,
  DocContentEditConfirmationAction,
  DocContentEditRiskLevel,
  DocContentEditContentChangeKind,
  DocContentEditRenderedLine,
  DocContentEditRenderedSideBySide,
  DocContentEditArrowFlow,
  DocContentEditVisualCompare,
  DocContentEditTarget,
  DocContentEditConfirmation,
  DocContentEditConfirmationStoreState,
} from "./doc-content-edit-types";

export {
  createRenderedSideBySideCompare,
  createArrowFlowCompare,
  type RenderedCompareOptions,
} from "./doc-content-edit-diff";

export {
  assessDocContentEditRisk,
  type AssessDocContentEditRiskInput,
  type AssessDocContentEditRiskResult,
} from "./doc-content-edit-risk";

export {
  createDocContentEditConfirmation,
  getDocContentEditConfirmation,
  removeDocContentEditConfirmation,
  pruneExpiredDocContentEditConfirmations,
  type CreateDocContentEditConfirmationInput,
} from "./doc-content-edit-confirmation-service";
