/**
 * Notebook Resolver
 * 根据文档 ID 解析所属笔记本
 */

import { sqlSelectReadonly } from "./read-only-kernel";

/**
 * 根据文档 ID 获取所属笔记本 ID
 * @param docId 文档 ID
 * @returns notebookId (box) 或 null
 */
export async function getNotebookIdByDocId(docId: string): Promise<string | null> {
  try {
    // 直接从 SQL 查询 notebook (box)
    const escapedDocId = docId.replace(/'/g, "''");
    const result = await sqlSelectReadonly<{ box?: string }>(
      `SELECT box FROM blocks WHERE id = '${escapedDocId}' LIMIT 1`,
      { maxLimit: 1, allowedTables: ["blocks"] },
    );

    if (result && result.length > 0 && result[0].box) {
      return result[0].box;
    }

    return null;
  } catch (e) {
    console.error("[NotebookResolver] Failed to get notebook for doc:", docId, e);
    return null;
  }
}
