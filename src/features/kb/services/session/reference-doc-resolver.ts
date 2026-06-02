/**
 * Reference Document Resolver
 *
 * 职责：
 * - 根据 docId 异步查询文档标题等信息
 * - 用于会话恢复后补全 assistant.citedReferences 的显示标题
 * - 不保存到持久化，只用于内存显示
 */

import { sql } from "../../../../api";

/**
 * 解析后的引用文档信息
 */
export interface ResolvedReferenceDocInfo {
  docId: string;
  docTitle: string;
  box?: string;
}

// 内部缓存：docId -> Promise<解析结果>
const docInfoCache = new Map<string, Promise<ResolvedReferenceDocInfo | null>>();

/**
 * 转义 SQL 字符串中的单引号
 */
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * 根据 docId 解析文档信息
 * @param docId 文档 ID
 * @returns 文档信息或 null
 */
export async function resolveReferenceDocInfo(docId: string): Promise<ResolvedReferenceDocInfo | null> {
  if (!docId) {
    return null;
  }

  // 优先走缓存
  if (docInfoCache.has(docId)) {
    return docInfoCache.get(docId)!;
  }

  const promise = (async (): Promise<ResolvedReferenceDocInfo | null> => {
    try {
      const escapedDocId = escapeSqlString(docId);
      const query = `select id, box, content from blocks where id = '${escapedDocId}' and type = 'd' limit 1`;
      const rows = await sql(query);

      if (rows && rows.length > 0) {
        const row = rows[0];
        return {
          docId: row.id,
          docTitle: row.content || docId,
          box: row.box || undefined,
        };
      }

      return null;
    } catch (error) {
      console.warn("[ReferenceDocResolver] Failed to resolve doc info:", docId, error);
      return null;
    }
  })();

  docInfoCache.set(docId, promise);
  return promise;
}

/**
 * 批量解析多个文档信息
 * @param docIds 文档 ID 列表
 * @returns Map<docId, 文档信息>
 */
export async function resolveReferenceDocInfos(docIds: string[]): Promise<Map<string, ResolvedReferenceDocInfo>> {
  // 去重
  const uniqueDocIds = [...new Set(docIds)].filter(Boolean);

  if (uniqueDocIds.length === 0) {
    return new Map();
  }

  // 并发查询
  const results = await Promise.all(
    uniqueDocIds.map(async (docId) => {
      const info = await resolveReferenceDocInfo(docId);
      return { docId, info };
    })
  );

  // 组装 Map
  const infoMap = new Map<string, ResolvedReferenceDocInfo>();
  for (const { docId, info } of results) {
    if (info) {
      infoMap.set(docId, info);
    }
  }

  return infoMap;
}

/**
 * 清除缓存（用于测试或需要强制刷新时）
 */
export function clearReferenceDocInfoCache(): void {
  docInfoCache.clear();
}
