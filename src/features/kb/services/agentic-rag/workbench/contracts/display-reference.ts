/**
 * DisplayReference — 通用可展示来源结构。
 *
 * 设计目标：
 * - references 不是知识库专属证据，而是"可展示来源"的通用抽象。
 * - 任何 Tool（KB 检索、网页抓取、文件寻取、MCP 资源、API 响应、操作型能力），
 *   只要产出可展示来源，都可以表达为 DisplayReference。
 * - 直接暴露真实资源 ID（docId / blockId / url / fileId / resourceId），
 *   不使用隐藏 identifier 映射层。Planner 和 UI 都能看到真实 ID。
 * - 整篇文档引用只传 docId，具体片段引用传 docId + blockId。
 * - blockId 始终 optional，不强制出现。
 */

/** DisplayReference 来源类型。*/
export type DisplayReferenceSourceType =
  | "siyuan_doc"
  | "web_page"
  | "file"
  | "mcp_resource"
  | "api_result"
  | "operation_result"
  | "unknown";

/** UI 打开动作。*/
export type DisplayReferenceOpenAction =
  | "open_siyuan_doc"
  | "open_url"
  | "open_file"
  | "open_resource"
  | "none";

/**
 * DisplayReference — UI / Storage 使用的可展示来源结构。
 *
 * - sourceType: 来源类型，UI 根据它路由 openAction。
 * - docId: 思源文档 ID（整篇文档引用时使用，不传 blockId）。
 * - blockId: 思源块 ID（具体片段引用时可选，须与 docId 同时出现）。
 * - title / subtitle / snippet: 展示文本。
 * - url: 跳转 URL（仅当 sourceType=web_page/file/mcp_resource 时使用）。
 * - provider: 提供方名称（可选，给 UI 提示来源渠道）。
 * - openAction: 默认打开方式；UI 也可按 sourceType 自行决定。
 */
export interface DisplayReference {
  sourceType: DisplayReferenceSourceType;
  /** 思源文档 ID（整篇文档引用时使用） */
  docId?: string;
  /** 思源块 ID（具体片段引用时可选，须与 docId 同时出现） */
  blockId?: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  url?: string;
  provider?: string;
  openAction?: DisplayReferenceOpenAction;
}

/**
 * DisplayReferenceStore — 通用 DisplayReference 存储。
 *
 * 任何 Tool 都可以注册 DisplayReference。
 * UI 通过 store 获取 DisplayReference 用于展示和交互。
 * 不再使用 identifier 映射层，直接用 docId/blockId/url 作为标识。
 */
export interface DisplayReferenceStore {
  /** 注册一个 DisplayReference。 */
  register(reference: DisplayReference): void;
  /** 根据 docId 查找 DisplayReference。 */
  findByDocId(docId: string): DisplayReference | undefined;
  /** 根据 docId + blockId 查找 DisplayReference。 */
  findByBlockId(docId: string, blockId: string): DisplayReference | undefined;
  /** 获取所有已注册的 DisplayReference。 */
  getAll(): DisplayReference[];
  /** 当前 store 内已注册的 DisplayReference 数。 */
  size(): number;
  /** 清空（每 turn 重建）。 */
  reset(): void;
}
