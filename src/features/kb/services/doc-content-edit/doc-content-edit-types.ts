/**
 * 文档内容编辑基础设施类型定义。
 * 本阶段只包含类型，不包含写入逻辑。
 */

export type DocContentEditOperation =
  | "create_doc"
  | "rename_doc"
  | "delete_doc"
  | "replace_doc_content"
  | "update_block"
  | "insert_block"
  | "delete_blocks"
  | "move_block";

export type DocContentEditConfirmationAction = DocContentEditOperation;

export type DocContentEditRiskLevel = "low" | "medium" | "high";

/**
 * 内容变更类型，用于渲染左右对比的每一行。
 */
export type DocContentEditContentChangeKind = "unchanged" | "added" | "removed" | "modified";

/**
 * 渲染后的单行数据。
 */
export interface DocContentEditRenderedLine {
  text: string;
  kind: DocContentEditContentChangeKind;
  lineNo?: number;
}

/**
 * 左右分栏渲染对比数据。
 */
export interface DocContentEditRenderedSideBySide {
  beforeLines: DocContentEditRenderedLine[];
  afterLines: DocContentEditRenderedLine[];
  truncated?: boolean;
}

/**
 * 箭头流动对比数据，用于非内容类操作。
 */
export interface DocContentEditArrowFlow {
  fromLabel: string;
  toLabel: string;
  fromDescription?: string;
  toDescription?: string;
}

/**
 * 视觉对比数据，confirmation 使用。
 */
export type DocContentEditVisualCompare =
  | { type: "rendered_side_by_side"; sideBySide: DocContentEditRenderedSideBySide }
  | { type: "arrow_flow"; arrow: DocContentEditArrowFlow }
  | { type: "block_diff"; diff: EditDiffPreview };

export interface DocContentEditTarget {
  docId?: string;
  notebookId?: string;
  docPath?: string;
  blockId?: string;
  parentBlockId?: string;
  referenceBlockId?: string;
  previousID?: string;
  parentID?: string;
  title?: string;
  /** 面向用户展示的人类可读路径，不得使用内部 .sy 路径代替。 */
  displayPath?: string;
  notebookName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocContentEditDisplayItem {
  kind: "文档" | "内容块" | "笔记本" | "数据库" | "其他";
  title: string;
  notebookName?: string;
  path?: string;
  excerpt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocContentEditPresentation {
  mode: "delete" | "create" | "modify" | "move";
  heading: string;
  description?: string;
  items?: DocContentEditDisplayItem[];
  destination?: {
    label: string;
    path?: string;
    detail?: string;
  };
  method?: string;
  addedContent?: string;
}

export interface DocContentEditConfirmation {
  id: string;
  conversationId: string;
  action: DocContentEditConfirmationAction;
  toolName: string;
  toolInput: Record<string, unknown>;
  target: DocContentEditTarget;
  /** 仅用于确认弹窗的用户可读语义，不参与写入执行。 */
  presentation?: DocContentEditPresentation;
  beforeSnapshot?: string;
  afterSnapshot?: string;
  visualCompare?: DocContentEditVisualCompare;
  riskLevel: DocContentEditRiskLevel;
  warnings?: string[];
  createdAt: number;
  expiresAt: number;
}

export interface DocContentEditConfirmationStoreState {
  confirmations: DocContentEditConfirmation[];
}

// ─── Block diff types (new EDIT DIFF engine) ───

export type EditDiffStatus = "unchanged" | "modified" | "added" | "removed";

export type InlineDiffKind = "same" | "removed" | "added";

export interface InlineDiffPart {
  text: string;
  kind: InlineDiffKind;
}

export interface EditPreviewBlock {
  id?: string;
  type?: string;
  subtype?: string;
  text: string;
  markdown: string;
  order: number;
  startLine?: number;
  depth?: number;
}

export interface EditBlockDiffEntry {
  key: string;
  status: EditDiffStatus;
  oldBlock?: EditPreviewBlock;
  newBlock?: EditPreviewBlock;
  oldParts?: InlineDiffPart[];
  newParts?: InlineDiffPart[];
}

export interface EditDiffDisplayOptions {
  defaultView: "split" | "unified";
  collapseUnchanged: boolean;
  contextBlocks: number;
}

export interface EditDiffPreview {
  mode: "block_diff";
  title: string;
  summary: string;
  entries: EditBlockDiffEntry[];
  stats: {
    addedLines: number;
    removedLines: number;
    modifiedBlocks: number;
    addedBlocks: number;
    removedBlocks: number;
  };
  displayOptions: EditDiffDisplayOptions;
  truncated?: boolean;
  noChanges?: boolean;
}
