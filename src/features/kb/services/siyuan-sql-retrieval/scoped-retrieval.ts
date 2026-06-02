/**
 * SQL Scoped Retrieval
 *
 * 为 Agent Core listDocsForAgent 提供 notebook/doc_tree 范围内文档枚举
 */

import { sql } from "@/api";
import type { DocIndexLite } from "./doc-title-match";

/**
 * 从思源 SQL 加载 notebook 下的所有文档
 * @param notebookId notebook ID (box)
 * @returns 文档列表（轻量，仅包含基本信息）
 */
async function loadDocsInNotebook(notebookId: string): Promise<Array<{
  docId: string;
  title: string;
  path: string;
  box: string;
}>> {
  const sqlStmt = `
    SELECT id as docId, content as title, path, box
    FROM blocks
    WHERE box = '${notebookId.replace(/'/g, "''")}'
      AND type = 'd'
    ORDER BY updated DESC
  `;

  try {
    const rows = await sql(sqlStmt);
    if (!Array.isArray(rows)) return [];

    return rows.map((row: any) => ({
      docId: row.docId || "",
      title: row.title || "",
      path: row.path || "",
      box: row.box || "",
    })).filter(d => d.docId);
  } catch (e) {
    console.error("[ScopedRetrieval] Failed to load docs in notebook:", e);
    return [];
  }
}

/**
 * 从思源 SQL 加载 doc tree scope 下的所有文档
 * @param box notebook ID
 * @param rootDocId 根文档 ID
 * @returns 文档列表（包含当前文档及其所有子文档）
 */
async function loadDocsInDocTree(
  box: string,
  rootDocId: string
): Promise<Array<{
  docId: string;
  title: string;
  path: string;
  box: string;
}>> {
  // 子文档判定：path 中包含 rootDocId 作为路径段
  // 当前文档本身：id = rootDocId
  // 子文档：path 中存在 /rootDocId/ 这类层级段
  const escapedBox = box.replace(/'/g, "''");
  const escapedRootDocId = rootDocId.replace(/'/g, "''");

  const sqlStmt = `
    SELECT id as docId, content as title, path, box
    FROM blocks
    WHERE box = '${escapedBox}'
      AND type = 'd'
      AND (id = '${escapedRootDocId}' OR path LIKE '%/${escapedRootDocId}/%')
    ORDER BY updated DESC
  `;

  try {
    const rows = await sql(sqlStmt);
    if (!Array.isArray(rows)) return [];

    return rows.map((row: any) => ({
      docId: row.docId || "",
      title: row.title || "",
      path: row.path || "",
      box: row.box || "",
    })).filter(d => d.docId);
  } catch (e) {
    console.error("[ScopedRetrieval] Failed to load docs in doc tree:", e);
    return [];
  }
}

/**
 * 获取 scope 内文档列表，用于 Agent Core scope inventory / compare / recent evidence scope 过滤
 *
 * @param scopeType 范围类型
 * @param box notebook ID
 * @param docId 文档 ID（doc_tree 模式下使用）
 * @returns 文档列表（DocIndexLite 格式）
 */
export async function getDocsInScope(
  scopeType: "notebook" | "doc_tree",
  box: string,
  docId?: string
): Promise<DocIndexLite[]> {
  const rawDocs = scopeType === "notebook"
    ? await loadDocsInNotebook(box)
    : scopeType === "doc_tree" && docId
      ? await loadDocsInDocTree(box, docId)
      : [];

  // 转换为 DocIndexLite 格式
  return rawDocs.map(d => ({
    doc_id: d.docId,
    box: d.box,
    title: d.title,
    updated: "",
    tag: "",
    hash: "",
    path: d.path,
  }));
}
