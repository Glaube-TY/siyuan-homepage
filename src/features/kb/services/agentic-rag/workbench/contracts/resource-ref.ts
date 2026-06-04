/**
 * ResourceRef — 统一资源引用结构。
 *
 * 所有工具返回/接收资源时使用此结构，不再依赖 opaque identifier。
 *
 * 用途：
 * - 搜索/结构工具返回候选资源时直接携带 sourceType + docId/blockId。
 * - 阅读工具接收 Planner 显式传入的资源引用。
 * - 回答工具 references 可接受结构化引用对象。
 */

export type ResourceSourceType =
  | "siyuan_doc"
  | "web_page"
  | "file"
  | "mcp_resource"
  | "api_result"
  | "unknown";

/**
 * 最小资源引用。
 * - sourceType 必须存在。
 * - 思源资源使用 docId / blockId。
 * - 网页使用 url。
 * - 文件使用 fileId 或 filePath。
 * - MCP/API 资源使用 provider + resourceId。
 */
export interface ResourceRef {
  sourceType: ResourceSourceType;
  /** 思源文档 ID */
  docId?: string;
  /** 思源块 ID */
  blockId?: string;
  /** 资源标题 */
  title?: string;
  /** 父级标题路径 */
  parentTitle?: string;
  /** 内容片段预览 */
  snippet?: string;
  /** 网页 URL */
  url?: string;
  /** 文件 ID */
  fileId?: string;
  /** 文件路径 */
  filePath?: string;
  /** MCP/API 提供方 */
  provider?: string;
  /** MCP/API 资源 ID */
  resourceId?: string;
  /** 该资源可配合使用的工具名称列表 */
  canUseWith?: string[];
}

/**
 * 思源文档资源引用（常用子类型）。
 */
export interface SiyuanDocRef extends ResourceRef {
  sourceType: "siyuan_doc";
  docId: string;
  blockId?: string;
  title: string;
  parentTitle?: string;
  snippet?: string;
}

/**
 * 网页资源引用。
 */
export interface WebPageRef extends ResourceRef {
  sourceType: "web_page";
  url: string;
  title?: string;
  snippet?: string;
}

/**
 * 文件资源引用。
 */
export interface FileRef extends ResourceRef {
  sourceType: "file";
  fileId?: string;
  filePath?: string;
  title?: string;
}
