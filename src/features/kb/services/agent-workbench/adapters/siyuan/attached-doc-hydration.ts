/**
 * Attached Doc Hydration — 自动加载用户本轮显式附加的文档正文。
 *
 * 职责：
 * - 读取附加文档的完整 Markdown（带预算截断）
 * - 返回结构化结果，供 Planner prompt 和 Composer evidence 使用
 * - 不写入历史上下文、不持久化、不进入 conversationContext
 * - 复用 readSiyuanDocForTool，避免复制读取逻辑
 */

import { readSiyuanDocForTool } from "../../tools/siyuan/internal/readers/read-doc-full";
import { batchQueryResourceMeta } from "../../tools/siyuan/impl/read-docs.impl";
import type { SiyuanDocLite } from "../../tools/siyuan/internal/doc-types";
import { pushAgentDebugEvent } from "../../debug/workbench-debug";

const HYDRATION_MAX_CHARS_PER_DOC = 12000;

export interface HydratedAttachedDocItem {
  docId: string;
  title: string;
  content: string;
  contentChars: number;
  truncated: boolean;
  chunkIndex?: number;
  chunkCount?: number;
}

export interface HydratedAttachedDocsResult {
  items: HydratedAttachedDocItem[];
  errors: Array<{ docId: string; code: string; message: string }>;
  totalChars: number;
  loadedCount: number;
  failedCount: number;
}

export async function hydrateAttachedDocsForTurn(
  docIds: string[],
): Promise<HydratedAttachedDocsResult> {
  const result: HydratedAttachedDocsResult = {
    items: [],
    errors: [],
    totalChars: 0,
    loadedCount: 0,
    failedCount: 0,
  };

  const uniqueIds = [...new Set(docIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return result;
  }

  pushAgentDebugEvent("ATTACHED_DOC_HYDRATION_START", { docCount: uniqueIds.length }, "debug");

  const metaMap = await batchQueryResourceMeta(uniqueIds);

  for (const docId of uniqueIds) {
    const meta = metaMap.get(docId);
    if (!meta) {
      result.errors.push({
        docId,
        code: "resource_not_found",
        message: "该文档不存在或已被删除。",
      });
      result.failedCount++;
      continue;
    }

    const docLite: SiyuanDocLite = {
      docId: meta.id,
      title: meta.title || "未命名文档",
      box: meta.box,
      path: meta.path,
    };

    try {
      const fullDoc = await readSiyuanDocForTool({
        doc: docLite,
        maxChars: HYDRATION_MAX_CHARS_PER_DOC,
        startOffset: 0,
      });

      if (!fullDoc) {
        result.errors.push({
          docId,
          code: "read_failed",
          message: "未能读取该文档内容。",
        });
        result.failedCount++;
        continue;
      }

      if ((fullDoc as { contentEmpty?: boolean }).contentEmpty) {
        result.errors.push({
          docId,
          code: "empty_content",
          message: "该文档正文为空。",
        });
        result.failedCount++;
        continue;
      }

      const content = fullDoc.content;
      const contentChars = content.length;
      const truncated = fullDoc.truncated || contentChars >= HYDRATION_MAX_CHARS_PER_DOC;

      result.items.push({
        docId: meta.id,
        title: meta.title || "未命名文档",
        content,
        contentChars,
        truncated,
        chunkIndex: 1,
        chunkCount: truncated ? undefined : 1,
      });
      result.totalChars += contentChars;
      result.loadedCount++;
    } catch (err) {
      result.errors.push({
        docId,
        code: "read_exception",
        message: err instanceof Error ? err.message : String(err),
      });
      result.failedCount++;
    }
  }

  pushAgentDebugEvent("ATTACHED_DOC_HYDRATION_SAFE", {
    docCount: uniqueIds.length,
    loadedCount: result.loadedCount,
    failedCount: result.failedCount,
    totalChars: result.totalChars,
  }, "info");

  return result;
}
