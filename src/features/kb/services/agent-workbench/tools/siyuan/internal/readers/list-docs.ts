/**
 * List Docs For Agent Workbench
 *
 * 职责：
 * - 枚举 scope 范围内的文档
 * - 复用只读文档索引能力
 * - 复用 loadAllDocsFromSql 和 getDocsInScope，不重写检索算法
 * - 不使用 hpath/name/alias 作为核心字段
 * - 不引入 taskType/sourceTaskType
 */

import type { SiyuanDocLite, ListSiyuanDocsForToolParams } from "../doc-types";
import {
  loadAllDocsFromSql,
  type DocIndexLite,
} from "../../../../../siyuan-sql-retrieval/doc-title-match";
import { getDocsInScope } from "../../../../../siyuan-sql-retrieval/scoped-retrieval";
import { sqlSelectReadonly } from "../../../../../siyuan/read-only-kernel";
import { pushAgentDebugEvent } from "../../../../debug/workbench-debug";

/**
 * 将 DocIndexLite 转换为 SiyuanDocLite
 */
function toSiyuanDocLiteFromDocIndexLite(doc: DocIndexLite): SiyuanDocLite {
  return {
    docId: doc.doc_id,
    title: doc.title,
    box: doc.box,
    path: doc.path,
    updated: doc.updated,
  };
}

const BATCH_SIZE = 64;

/**
 * 将数组拆分为指定大小的批次
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * 批量查询文档元数据（按 64 分批避免思源截断）
 * @param docIds 文档 ID 列表
 * @returns SiyuanDocLite[] 按原始 docIds 顺序返回
 */
async function queryDocMetasByIds(docIds: string[]): Promise<SiyuanDocLite[]> {
  if (docIds.length === 0) return [];

  const uniqueIds = [...new Set(docIds)];
  const chunks = chunkArray(uniqueIds, BATCH_SIZE);

  const metaMap = new Map<string, SiyuanDocLite>();

  for (const chunk of chunks) {
    const idList = chunk
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");

    try {
      const rows = await sqlSelectReadonly<{ id: string; title?: string; box?: string; path?: string; updated?: string }>(
        `SELECT id, content as title, box, path, updated FROM blocks WHERE id IN (${idList}) AND type = 'd'`,
        { maxLimit: Math.max(chunk.length, 50), allowedTables: ["blocks"] }
      );

      if (Array.isArray(rows)) {
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
      }
    } catch (_e) {
      pushAgentDebugEvent("DOC_LIST_META_FAILED", {}, "warn");
    }
  }

  // Preserve original uniqueIds ordering
  return uniqueIds
    .map((id) => metaMap.get(id))
    .filter((d): d is SiyuanDocLite => d !== undefined);
}

/**
 * 从 path 中提取父级文档 ID，并批量查询父级标题，生成 titlePath
 * path 格式示例: "/20230101000000-abc123/20230102000000-def456/20230103000000-ghi789"
 * 最后一个 ID 是文档自身，前面的是父级文档 ID
 */
async function enrichDocsWithTitlePaths(docs: SiyuanDocLite[]): Promise<SiyuanDocLite[]> {
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

  let parentTitleMap: Map<string, string>;
  try {
    parentTitleMap = new Map<string, string>();
    const parentChunks = chunkArray(uniqueParentIds, BATCH_SIZE);

    for (const chunk of parentChunks) {
      const idList = chunk
        .map((id) => `'${id.replace(/'/g, "''")}'`)
        .join(",");

      const rows = await sqlSelectReadonly<{ id: string; title?: string }>(
        `SELECT id, content as title FROM blocks WHERE id IN (${idList}) AND type = 'd'`,
        { maxLimit: Math.max(chunk.length, 100), allowedTables: ["blocks"] }
      );

      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row.id) {
            parentTitleMap.set(row.id, row.title || "");
          }
        }
      }
    }
  } catch (_e) {
    pushAgentDebugEvent("DOC_LIST_PARENT_FAILED", {}, "warn");
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
 * 为 Agent Workbench 枚举范围内的文档
 * @param params 参数
 * @returns SiyuanDocLite[]
 */
export async function listSiyuanDocsForTool(
  params: ListSiyuanDocsForToolParams
): Promise<SiyuanDocLite[]> {
  const { scope, limit = 200, trace } = params;

  if (trace) {
    pushAgentDebugEvent("DOC_LIST_SCOPE", { scope: scope.type }, "debug");
  }

  try {
    let docs: SiyuanDocLite[] = [];

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
          docs = docIndexLites.map(toSiyuanDocLiteFromDocIndexLite);
        }
        break;
      }

      case "doc_neighborhood": {
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

      case "notebook": {
        if (scope.notebookId) {
          const docIndexLites = await getDocsInScope(
            "notebook",
            scope.notebookId
          );
          docs = docIndexLites.map(toSiyuanDocLiteFromDocIndexLite);
        }
        break;
      }

      case "whole_kb": {
        const allDocs = await loadAllDocsFromSql();
        docs = allDocs.map(toSiyuanDocLiteFromDocIndexLite);
        break;
      }

      default:
        pushAgentDebugEvent("DOC_LIST_UNKNOWN_SCOPE", { type: (scope as any).type }, "warn");
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
      pushAgentDebugEvent("DOC_LIST_FOUND", { count: docs.length }, "debug");
    }

    return docs;
  } catch (_e) {
    pushAgentDebugEvent("DOC_LIST_FAILED", {}, "warn");
    return [];
  }
}
