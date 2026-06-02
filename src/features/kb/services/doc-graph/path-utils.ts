/**
 * 文档路径解析工具
 *
 * 纯函数，不依赖 SQL、API、UI。
 * 用于解析思源内部 path 格式（如 "/a/b/c.sy"）为文档 id 层级结构。
 *
 * 核心原则：
 * - path 是内部文档 id 层级路径，只用于结构判断，不展示给用户
 * - 不使用 hpath，不调用 getHPathByID
 * - 不使用 name / alias / markdown
 */

import type { DocDisplayPathPart } from "./types";

/**
 * 如果以 .sy 结尾则移除，然后 trim 返回
 */
export function stripSySuffix(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith(".sy")) {
    return trimmed.slice(0, -3);
  }
  return trimmed;
}

/**
 * 解析 path 为 docId 数组
 *
 * 示例：
 *   "/a.sy" -> ["a"]
 *   "/a/b.sy" -> ["a","b"]
 *   "/a/b/c.sy" -> ["a","b","c"]
 */
export function parseDocIdPath(path: string): string[] {
  if (!path || !path.trim()) {
    return [];
  }
  const segments = path.split("/");
  const result: string[] = [];
  for (const segment of segments) {
    const cleaned = stripSySuffix(segment);
    if (cleaned) {
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * 将文档 path 转为可用于 SQL LIKE 匹配该文档子树的前缀
 *
 * 用途：
 * 将一个文档 path 转为可用于 SQL LIKE 匹配该文档子树的前缀。
 * 该返回值用于 SQL：path LIKE '${prefix}%'。
 *
 * 规则：
 * - path 为空返回 ""
 * - trim
 * - 如果 path 以 ".sy" 结尾，先去掉末尾 ".sy"
 * - 去掉末尾多余 "/"
 * - 返回结果
 *
 * 示例：
 *   "/a.sy" -> "/a"
 *   "/a/b.sy" -> "/a/b"
 *   "/a/b/" -> "/a/b"
 *   "/a/b" -> "/a/b"
 *
 * 说明：
 * - 该前缀用于匹配子树，不能同时匹配父文档自身（如 "/a.sy"）。
 * - 若需要同时包含自身和子树，上层应同时加 id/root_id 条件或另行处理。
 */
export function toDocTreeSqlPathPrefix(path: string): string {
  if (!path) {
    return "";
  }
  let result = path.trim();
  if (result.endsWith(".sy")) {
    result = result.slice(0, -3);
  }
  if (result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * 判断某 path 是否属于某文档树，包含根文档自身和后代文档
 *
 * 规则：
 * - 如果两者是同一文档，返回 true
 * - 如果 path 是 treeRootPath 的后代，返回 true
 * - 否则 false
 */
export function isPathInDocTree(path: string, treeRootPath: string): boolean {
  if (isSameDocPath(path, treeRootPath)) {
    return true;
  }
  return isDescendantPath(path, treeRootPath);
}

/**
 * 返回 path 中最后一个 docId（即当前文档 id）
 */
export function getDocIdFromPath(path: string): string {
  const parts = parseDocIdPath(path);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/**
 * 返回 path 中倒数第二个 docId（即父文档 id）
 */
export function getParentDocIdFromPath(path: string): string | undefined {
  const parts = parseDocIdPath(path);
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

/**
 * 返回 path 的层级深度
 */
export function getDocDepthFromPath(path: string): number {
  return parseDocIdPath(path).length;
}

/**
 * 比较两个 path 的最后 docId 是否相同
 */
export function isSameDocPath(a: string, b: string): boolean {
  const aParts = parseDocIdPath(a);
  const bParts = parseDocIdPath(b);
  const aId = aParts.length > 0 ? aParts[aParts.length - 1] : "";
  const bId = bParts.length > 0 ? bParts[bParts.length - 1] : "";
  if (!aId || !bId) {
    return false;
  }
  return aId === bId;
}

/**
 * 判断 childPath 是否属于 ancestorPath 的文档树
 *
 * ancestor 为空返回 false。
 * child 长度必须大于 ancestor。
 * ancestor 的每个 id 都要和 child 前缀一致。
 */
export function isDescendantPath(childPath: string, ancestorPath: string): boolean {
  const childParts = parseDocIdPath(childPath);
  const ancestorParts = parseDocIdPath(ancestorPath);

  if (ancestorParts.length === 0) {
    return false;
  }
  if (childParts.length <= ancestorParts.length) {
    return false;
  }

  for (let i = 0; i < ancestorParts.length; i++) {
    if (childParts[i] !== ancestorParts[i]) {
      return false;
    }
  }

  return true;
}

/**
 * 判断 childPath 是否是 parentPath 的直接子文档
 */
export function isDirectChildPath(childPath: string, parentPath: string): boolean {
  const childParts = parseDocIdPath(childPath);
  const parentParts = parseDocIdPath(parentPath);

  if (childParts.length !== parentParts.length + 1) {
    return false;
  }

  return isDescendantPath(childPath, parentPath);
}

/**
 * 判断两个 path 是否为兄弟文档
 *
 * 两者不是同一个 doc，且 parentDocId 相同且都存在。
 */
export function isSiblingPath(a: string, b: string): boolean {
  if (isSameDocPath(a, b)) {
    return false;
  }

  const aParent = getParentDocIdFromPath(a);
  const bParent = getParentDocIdFromPath(b);

  if (!aParent || !bParent) {
    return false;
  }

  return aParent === bParent;
}

/**
 * 根据 path 和 titleByDocId 构建展示路径
 *
 * 解析 path 得到 docId 链，对每个 docId 从 titleByDocId 取 title。
 * title 为空时使用 docId 作为兜底。
 */
export function buildDisplayPathFromTitles(
  path: string,
  titleByDocId: Map<string, string> | Record<string, string>
): DocDisplayPathPart[] {
  const docIds = parseDocIdPath(path);
  const result: DocDisplayPathPart[] = [];

  for (const docId of docIds) {
    let title: string | undefined;
    if (titleByDocId instanceof Map) {
      title = titleByDocId.get(docId);
    } else {
      title = (titleByDocId as Record<string, string>)[docId];
    }

    result.push({
      docId,
      title: title || docId,
    });
  }

  return result;
}
