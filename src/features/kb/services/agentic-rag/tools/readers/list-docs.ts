/**
 * List Docs For Agentic RAG
 *
 * 职责：
 * - 枚举 scope 范围内的文档
 * - 复用只读文档索引能力
 * - 复用 loadAllDocsFromSql 和 getDocsInScope，不重写检索算法
 * - 不使用 hpath/name/alias 作为核心字段
 * - 不引入 taskType/sourceTaskType
 */

import type { AgenticDocLite, ListDocsForAgenticRagParams } from "../doc-types";
import {
  loadAllDocsFromSql,
  type DocIndexLite,
} from "../../../siyuan-sql-retrieval/doc-title-match";
import { getDocsInScope } from "../../../siyuan-sql-retrieval/scoped-retrieval";
import { sqlSelectReadonly } from "../../../siyuan/read-only-kernel";

/**
 * 将 DocIndexLite 转换为 AgenticDocLite
 */
function toAgenticDocLiteFromDocIndexLite(doc: DocIndexLite): AgenticDocLite {
  return {
    docId: doc.doc_id,
    title: doc.title,
    box: doc.box,
    path: doc.path,
    updated: doc.updated,
  };
}

/**
 * 批量查询文档元数据
 * @param docIds 文档 ID 列表
 * @returns AgenticDocLite[]
 */
async function queryDocMetasByIds(docIds: string[]): Promise<AgenticDocLite[]> {
  if (docIds.length === 0) return [];

  const uniqueIds = [...new Set(docIds)];

  const idList = uniqueIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(",");

  try {
    const rows = await sqlSelectReadonly<{ id: string; title?: string; box?: string; path?: string; updated?: string }>(
      `SELECT id, content as title, box, path, updated FROM blocks WHERE id IN (${idList}) AND type = 'd'`,
      { maxLimit: Math.max(uniqueIds.length, 50), allowedTables: ["blocks"] }
    );

    if (!Array.isArray(rows)) return [];

    const metaMap = new Map<string, AgenticDocLite>();
    for (const row of rows) {
      if (row.id) {
        metaMap.set(row.id, {
          docId: row.id,
          title: row.title || "",
          box: row.box || "",
          path: row.path || "",
          updated: row.updated || "",
        });
      }
    }

    return uniqueIds
      .map((id) => metaMap.get(id))
      .filter((d): d is AgenticDocLite => d !== undefined);
  } catch (e) {
    console.warn("[AgenticRagListDocs] 查询文档元数据失败");
    return [];
  }
}

/**
 * 从 path 中提取父级文档 ID，并批量查询父级标题，生成 titlePath
 * path 格式示例: "/20230101000000-abc123/20230102000000-def456/20230103000000-ghi789"
 * 最后一个 ID 是文档自身，前面的是父级文档 ID
 */
async function enrichDocsWithTitlePaths(docs: AgenticDocLite[]): Promise<AgenticDocLite[]> {
  const allParentIds = new Set<string>();
  const docParentIdMap = new Map<string, string[]>();

  for (const doc of docs) {
    if (!doc.path) continue;
    const parts = doc.path.split("/").filter(Boolean);
    const parentIds = parts.slice(0, -1);
    if (parentIds.length > 0) {
      docParentIdMap.set(doc.docId, parentIds);
      for (const pid of parentIds) {
        allParentIds.add(pid);
      }
    }
  }

  if (allParentIds.size === 0) return docs;

  const uniqueParentIds = [...allParentIds];
  const idList = uniqueParentIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(",");

  let parentTitleMap: Map<string, string>;
  try {
    const rows = await sqlSelectReadonly<{ id: string; title?: string }>(
      `SELECT id, content as title FROM blocks WHERE id IN (${idList}) AND type = 'd'`,
      { maxLimit: Math.max(uniqueParentIds.length, 100), allowedTables: ["blocks"] }
    );

    parentTitleMap = new Map<string, string>();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row.id) {
          parentTitleMap.set(row.id, row.title || "");
        }
      }
    }
  } catch (e) {
    console.warn("[AgenticRagListDocs] 查询父级标题失败");
    return docs;
  }

  return docs.map((doc) => {
    const parentIds = docParentIdMap.get(doc.docId);
    if (!parentIds || parentIds.length === 0) return doc;

    const parentTitles = parentIds
      .map((pid) => parentTitleMap.get(pid) || "")
      .filter(Boolean);

    const titlePath = [...parentTitles, doc.title].filter(Boolean).join(" / ");

    return {
      ...doc,
      titlePath,
      parentTitles,
    };
  });
}

/**
 * 为 Agentic RAG 枚举范围内的文档
 * @param params 参数
 * @returns AgenticDocLite[]
 */
export async function listDocsForAgenticRag(
  params: ListDocsForAgenticRagParams
): Promise<AgenticDocLite[]> {
  const { scope, limit = 200, trace } = params;

  if (trace) {
    console.debug(`[AgenticRagListDocs] Listing docs for scope: ${scope.type}`);
  }

  try {
    let docs: AgenticDocLite[] = [];

    switch (scope.type) {
      case "current_doc": {
        const docId = scope.docId;
        const title = scope.title;
        const box = scope.box;

        if (docId) {
          const metas = await queryDocMetasByIds([docId]);
          if (metas.length > 0) {
            docs = metas;
          } else {
            docs = [
              {
                docId,
                title: title || "当前文档",
                box,
              },
            ];
          }
        }
        break;
      }

      case "custom_docs": {
        if (scope.docIds && scope.docIds.length > 0) {
          const validIds = [
            ...new Set(
              scope.docIds
                .map((id) => id.trim())
                .filter(Boolean)
            ),
          ];
          docs = await queryDocMetasByIds(validIds);
        }
        break;
      }

      case "doc_tree": {
        if (scope.box && scope.rootDocId) {
          const docIndexLites = await getDocsInScope(
            "doc_tree",
            scope.box,
            scope.rootDocId
          );
          docs = docIndexLites.map(toAgenticDocLiteFromDocIndexLite);
        }
        break;
      }

      case "notebook": {
        if (scope.notebookId) {
          const docIndexLites = await getDocsInScope(
            "notebook",
            scope.notebookId
          );
          docs = docIndexLites.map(toAgenticDocLiteFromDocIndexLite);
        }
        break;
      }

      case "whole_kb": {
        const allDocs = await loadAllDocsFromSql();
        docs = allDocs.map(toAgenticDocLiteFromDocIndexLite);
        break;
      }

      default:
        console.warn(`[AgenticRagListDocs] Unknown scope type: ${(scope as any).type}`);
    }

    docs = docs.filter((d) => d.docId);

    docs = await enrichDocsWithTitlePaths(docs);

    if (params.query) {
      const q = params.query.toLowerCase();
      docs = docs.filter((d) => {
        const titleMatch = d.title.toLowerCase().includes(q);
        const titlePathMatch = d.titlePath?.toLowerCase().includes(q) ?? false;
        const parentMatch = d.parentTitles?.some((t) => t.toLowerCase().includes(q)) ?? false;
        return titleMatch || titlePathMatch || parentMatch;
      });
    }

    if (docs.length > limit) {
      docs = docs.slice(0, limit);
    }

    if (trace) {
      console.debug(`[AgenticRagListDocs] Found ${docs.length} docs`);
    }

    return docs;
  } catch (e) {
    console.warn("[AgenticRagListDocs] 列出文档失败");
    return [];
  }
}
