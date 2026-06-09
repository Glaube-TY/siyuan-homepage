/**
 * 全局记忆文档服务（段落块级管理）
 * 每条记忆对应记忆文档下的一个顶层段落块 type === "p"
 */

import { getChildBlocks, appendBlock, updateBlock, deleteBlock, moveBlock, sql } from "@/api";
import type { GlobalMemoryContent, GlobalMemoryItem } from "./global-memory-types";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function squashToOneParagraph(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * 列出全局记忆文档下的所有段落记忆
 * @param docId 记忆文档 ID
 * @returns GlobalMemoryItem[]
 */
export async function listGlobalMemoryItems(docId: string): Promise<GlobalMemoryItem[]> {
  if (!docId) return [];
  try {
    const children = await getChildBlocks(docId);
    if (!Array.isArray(children)) return [];
    const items: GlobalMemoryItem[] = [];
    let idx = 0;
    for (const child of children) {
      if (child.type === "p" && child.markdown && child.markdown.trim()) {
        items.push({
          id: child.id,
          text: child.markdown.trim(),
          markdown: child.markdown.trim(),
          index: idx++,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * 读取全局记忆文档内容（按段落顺序拼接）
 * @param docId 记忆文档 ID
 * @param maxChars 最大读取字符数
 * @returns GlobalMemoryContent
 */
export async function readGlobalMemory(docId: string, maxChars: number): Promise<GlobalMemoryContent> {
  if (!docId) {
    return { content: "", truncated: false, docId: "" };
  }
  const items = await listGlobalMemoryItems(docId);
  if (items.length === 0) {
    return { content: "", truncated: false, docId };
  }
  const fullText = items.map((it) => it.text).join("\n");
  const truncated = fullText.length > maxChars;
  const content = truncated ? fullText.slice(0, maxChars) : fullText;
  return { content, truncated, docId };
}

/**
 * 验证全局记忆文档 ID 是否有效
 * 使用轻量 SQL 查询，带 3 秒超时兜底
 * @param docId 记忆文档 ID
 * @returns { valid: boolean; reason?: string }
 */
export async function validateGlobalMemoryDocId(docId: string): Promise<{ valid: boolean; reason?: string }> {
  const id = docId.trim();
  if (!id) {
    return { valid: false, reason: "empty" };
  }

  try {
    const escaped = id.replace(/'/g, "''");
    const rows = await withTimeout(
      sql(`select id from blocks where id = '${escaped}' and type = 'd' limit 1`),
      3000,
    );
    if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id === id) {
      return { valid: true };
    }
    return { valid: false, reason: "invalid_doc" };
  } catch (err: any) {
    if (err?.message === "timeout") {
      return { valid: false, reason: "timeout" };
    }
    return { valid: false, reason: "query_failed" };
  }
}

/**
 * 创建新段落记忆
 * @param docId 记忆文档 ID
 * @param text 记忆文本
 * @returns 新块 ID 或 null
 */
export async function createGlobalMemoryItem(docId: string, text: string): Promise<string | null> {
  if (!docId || !text) return null;
  const note = squashToOneParagraph(text);
  if (!note) return null;
  try {
    const ops = await appendBlock("markdown", note, docId);
    if (Array.isArray(ops) && ops.length > 0 && ops[0].doOperations?.length > 0) {
      return ops[0].doOperations[0].id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 查找全局记忆文档中的指定段落记忆
 * @param docId 记忆文档 ID
 * @param itemId 段落块 ID
 * @returns GlobalMemoryItem | undefined
 */
export async function findGlobalMemoryItem(docId: string, itemId: string): Promise<GlobalMemoryItem | undefined> {
  if (!docId || !itemId) return undefined;
  const items = await listGlobalMemoryItems(docId);
  return items.find((i) => i.id === itemId);
}

/**
 * 在指定文档下安全更新段落记忆（先校验归属）
 * @param docId 记忆文档 ID
 * @param itemId 段落块 ID
 * @param text 新文本
 * @returns 是否成功
 */
export async function updateGlobalMemoryItemInDoc(docId: string, itemId: string, text: string): Promise<boolean> {
  const item = await findGlobalMemoryItem(docId, itemId);
  if (!item) return false;
  return updateGlobalMemoryItem(itemId, text);
}

/**
 * 更新段落记忆内容
 * @param itemId 段落块 ID
 * @param text 新文本
 * @returns 是否成功
 */
export async function updateGlobalMemoryItem(itemId: string, text: string): Promise<boolean> {
  if (!itemId || !text) return false;
  const note = squashToOneParagraph(text);
  if (!note) return false;
  try {
    await updateBlock("markdown", note, itemId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 在指定文档下安全删除段落记忆（先校验归属）
 * @param docId 记忆文档 ID
 * @param itemId 段落块 ID
 * @returns 是否成功
 */
export async function deleteGlobalMemoryItemInDoc(docId: string, itemId: string): Promise<boolean> {
  const item = await findGlobalMemoryItem(docId, itemId);
  if (!item) return false;
  return deleteGlobalMemoryItem(itemId);
}

/**
 * 删除段落记忆
 * @param itemId 段落块 ID
 * @returns 是否成功
 */
export async function deleteGlobalMemoryItem(itemId: string): Promise<boolean> {
  if (!itemId) return false;
  try {
    await deleteBlock(itemId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 移动段落记忆位置
 * @param docId 记忆文档 ID
 * @param itemId 要移动的段落块 ID
 * @param position 目标位置
 * @param targetId 参考块 ID（before/after 时必填）
 * @returns 是否成功
 */
export async function moveGlobalMemoryItem(
  docId: string,
  itemId: string,
  position: "top" | "bottom" | "before" | "after",
  targetId?: string,
): Promise<boolean> {
  if (!docId || !itemId) return false;

  // 安全校验：确认 itemId 和 targetId 都属于当前文档的段落记忆
  const items = await listGlobalMemoryItems(docId);
  const itemIds = items.map((i) => i.id);
  if (!itemIds.includes(itemId)) return false;
  if ((position === "before" || position === "after") && (!targetId || !itemIds.includes(targetId))) {
    return false;
  }

  try {
    if (position === "top") {
      await moveBlock(itemId, undefined, docId);
      return true;
    }

    if (position === "after") {
      await moveBlock(itemId, targetId!);
      return true;
    }

    if (position === "before") {
      const targetIndex = items.findIndex((i) => i.id === targetId);
      if (targetIndex <= 0) {
        // target 是第一个，移到文档顶部
        await moveBlock(itemId, undefined, docId);
      } else {
        const prevId = items[targetIndex - 1].id;
        await moveBlock(itemId, prevId);
      }
      return true;
    }

    if (position === "bottom") {
      const otherItems = items.filter((i) => i.id !== itemId);
      if (otherItems.length === 0) {
        // 只有自身，无需移动
        return true;
      }
      const lastId = otherItems[otherItems.length - 1].id;
      await moveBlock(itemId, lastId);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
