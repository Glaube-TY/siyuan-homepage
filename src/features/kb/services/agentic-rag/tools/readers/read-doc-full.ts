/**
 * Read Docs Full For Agentic RAG
 *
 * 职责：
 * - 读取文档完整 Markdown 内容
 * - 从旧 agent-core/tools/read-doc-full-tool.ts 低风险迁移
 * - 使用 exportMdContent 读取完整 Markdown，不用 SQL content/markdown 拼全文
 * - SQL 只可用于内部读取 block ids 或必要元数据，不暴露给 LLM action 参数
 * - 不使用 hpath
 * - 保持并发读取逻辑，复用 mapWithConcurrency
 * - 截断逻辑保持一致
 */

import { exportMdContentReadonly } from "../../../siyuan/read-only-kernel";
import { mapWithConcurrency } from "../../../../utils/async-map";
import type { AgenticDocFull, ReadDocsFullForAgenticRagParams, ReadDocFullForAgenticRagParams } from "../doc-types";
import { safeTextMeta } from "../../debug/agentic-rag-debug";

/**
 * 读取单个文档全文
 * @param params 参数
 * @returns AgenticDocFull | null
 */
export async function readDocFullForAgenticRag(
  params: ReadDocFullForAgenticRagParams
): Promise<AgenticDocFull | null> {
  const { doc, maxChars, startOffset = 0, trace } = params;

  const title = doc.title || "未命名文档";

  // 读取文档完整 Markdown 内容
  if (trace) {
    console.debug(`[AgenticRagReadDocFull] 读取文档完整 Markdown 内容`);
  }

  try {
    const exported = await exportMdContentReadonly(doc.docId);
    const markdown = exported?.content ?? "";

    if (!markdown.trim()) {
      const titleMeta = safeTextMeta(title);
      console.warn(`[AgenticRagReadDocFull] 文档 titleHash=${titleMeta.hash} chars=${titleMeta.chars} 正文为空`);
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
      } as AgenticDocFull & { contentEmpty: true };
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
      const titleMeta = safeTextMeta(title);
      console.warn(`[AgenticRagReadDocFull | READ_DOC_FULL_SAFE] 文档 titleHash=${titleMeta.hash} | 原始内容字符数: ${originalContentChars}, 起始偏移: ${safeStartOffset}, 最终内容字符数: ${content.length}, 截断: true, maxChars: ${maxChars}`);
    }

    const result: AgenticDocFull = {
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
      const titleMeta = safeTextMeta(title);
      console.debug(
        `[AgenticRagReadDocFull] 文档 titleHash=${titleMeta.hash} | 原始内容字符数: ${originalContentChars}, 最终内容字符数: ${content.length}, 截断: ${truncated}`
      );
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const titleMeta = safeTextMeta(title);
    console.warn(`[AgenticRagReadDocFull] 文档 titleHash=${titleMeta.hash} | 错误: ${msg}`);
    return null;
  }
}

/**
 * 批量读取文档全文
 * @param params 参数
 * @returns AgenticDocFull[]
 */
export async function readDocsFullForAgenticRag(
  params: ReadDocsFullForAgenticRagParams
): Promise<AgenticDocFull[]> {
  const { docs, maxChars, startOffset, concurrency = 3, trace } = params;

  if (docs.length === 0) {
    return [];
  }

  if (trace) {
    console.debug(`[AgenticRagReadDocFull] 读取 ${docs.length} 个文档完整 Markdown 内容`);
  }

  const results = await mapWithConcurrency(
    docs,
    concurrency,
    async (doc) => {
      try {
        const fullDoc = await readDocFullForAgenticRag({
          doc,
          maxChars,
          startOffset,
          trace,
        });
        return fullDoc;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const titleMeta = safeTextMeta(doc.title || "未命名文档");
        console.warn(`[AgenticRagReadDocFull] 文档 titleHash=${titleMeta.hash} | 错误: ${msg}`);
        return null;
      }
    }
  );

  const validResults = results.filter((r): r is AgenticDocFull => r !== null);

  if (trace) {
    console.debug(`[AgenticRagReadDocFull] 读取 ${validResults.length}/${docs.length} 个文档完整 Markdown 内容`);
  }

  return validResults;
}
