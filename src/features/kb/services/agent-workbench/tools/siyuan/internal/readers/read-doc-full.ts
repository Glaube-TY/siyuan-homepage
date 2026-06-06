/**
 * Read Docs Full For Agent Workbench
 *
 * 职责：
 * - 读取文档完整 Markdown 内容
 * - 通过只读 facade 获取正文
 * - 使用 exportMdContent 读取完整 Markdown，不用 SQL content/markdown 拼全文
 * - SQL 只可用于内部读取 block ids 或必要元数据，不暴露给 LLM action 参数
 * - 不使用 hpath
 * - 保持并发读取逻辑，复用 mapWithConcurrency
 * - 截断逻辑保持一致
 */

import { exportMdContentReadonly } from "../../../../../siyuan/read-only-kernel";
import { mapWithConcurrency } from "../../../../../../utils/async-map";
import type { SiyuanDocFull, ReadSiyuanDocsForToolParams, ReadSiyuanDocForToolParams } from "../doc-types";
import { pushAgentDebugEvent } from "../../../../debug/workbench-debug";

/**
 * 读取单个文档全文
 * @param params 参数
 * @returns SiyuanDocFull | null
 */
export async function readSiyuanDocForTool(
  params: ReadSiyuanDocForToolParams
): Promise<SiyuanDocFull | null> {
  const { doc, maxChars, startOffset = 0, trace } = params;

  const title = doc.title || "未命名文档";

  // 读取文档完整 Markdown 内容
  if (trace) {
    pushAgentDebugEvent("READ_DOC_START", {}, "debug");
  }

  try {
    const exported = await exportMdContentReadonly(doc.docId);
    const markdown = exported?.content ?? "";

    if (!markdown.trim()) {
      pushAgentDebugEvent("READ_DOC_EMPTY", { titleChars: title.length }, "warn");
      return {
        docId: doc.docId,
        title: doc.title || "未命名文档",
        box: doc.box,
        path: doc.path,
        content: "",
        contentFormat: "markdown",
        truncated: false,
        contentChars: 0,
        originalContentChars: 0,
        startOffset: 0,
        returnedContentChars: 0,
        remainingChars: 0,
        contentEmpty: true,
      } as SiyuanDocFull & { contentEmpty: true };
    }

    const originalContentChars = markdown.length;

    const safeStartOffset = Math.max(0, Math.min(Math.floor(startOffset), originalContentChars));
    const requestedMaxChars = maxChars !== undefined
      ? Math.max(0, Math.floor(maxChars))
      : undefined;
    const endOffset = requestedMaxChars !== undefined
      ? Math.min(originalContentChars, safeStartOffset + requestedMaxChars)
      : originalContentChars;

    let content = markdown.slice(safeStartOffset, endOffset);
    let truncated = safeStartOffset > 0 || endOffset < originalContentChars;

    // 默认不截断正文。只有显式传入 maxChars 或 startOffset 使返回片段小于原文时才标记截断。
    if (truncated) {
      pushAgentDebugEvent("READ_DOC_TRUNCATED", {
        originalChars: originalContentChars,
        startOffset: safeStartOffset,
        finalChars: content.length,
        truncated: true,
        maxChars,
      }, "warn");
    }

    const result: SiyuanDocFull = {
      docId: doc.docId,
      title: doc.title || "未命名文档",
      box: doc.box,
      path: doc.path,
      content,
      contentFormat: "markdown",
      truncated,
      contentChars: content.length,
      originalContentChars,
      startOffset: safeStartOffset,
      returnedContentChars: content.length,
      remainingChars: Math.max(0, originalContentChars - endOffset),
      nextStartOffset: endOffset < originalContentChars ? endOffset : undefined,
    };

    if (trace && !truncated) {
      pushAgentDebugEvent("READ_DOC_FULL_OK", {
        originalContentChars,
        contentChars: content.length,
        truncated,
      }, "debug");
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushAgentDebugEvent("READ_DOC_FAILED", { msg }, "warn");
    return null;
  }
}

/**
 * 批量读取文档全文
 * @param params 参数
 * @returns SiyuanDocFull[]
 */
export async function readSiyuanDocsForTool(
  params: ReadSiyuanDocsForToolParams
): Promise<SiyuanDocFull[]> {
  const { docs, maxChars, startOffset, concurrency = 3, trace } = params;

  if (docs.length === 0) {
    return [];
  }

  if (trace) {
    pushAgentDebugEvent("READ_DOCS_START", { count: docs.length }, "debug");
  }

  const results = await mapWithConcurrency(
    docs,
    concurrency,
    async (doc) => {
      try {
        const fullDoc = await readSiyuanDocForTool({
          doc,
          maxChars,
          startOffset,
          trace,
        });
        return fullDoc;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushAgentDebugEvent("READ_DOCS_ITEM_FAILED", { msg }, "warn");
        return null;
      }
    }
  );

  const validResults = results.filter((r): r is SiyuanDocFull => r !== null);

  if (trace) {
    pushAgentDebugEvent("READ_DOCS_DONE", { done: validResults.length, total: docs.length }, "debug");
  }

  return validResults;
}
