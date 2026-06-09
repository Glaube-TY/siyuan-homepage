/**
 * 快捷提示语文档服务
 * 管理快捷提示语文档下的顶层段落块
 * 不注册 Tool，不放进 Agent Workbench
 */

import { getChildBlocks, appendBlock, updateBlock, deleteBlock, moveBlock, sql } from "@/api";

export interface QuickPromptItem {
  /** 块 ID */
  id: string;
  /** 纯文本内容 */
  text: string;
  /** Markdown 内容 */
  markdown: string;
  /** 当前顺序索引 */
  index: number;
}

/**
 * 验证快捷提示语文档 ID 是否有效
 * 直接 SQL 查询 blocks 表
 */
export async function validateQuickPromptsDocId(docId: string): Promise<{ valid: boolean }> {
  if (!docId || typeof docId !== "string") {
    return { valid: false };
  }
  const safeId = docId.replace(/'/g, "''");
  try {
    const result = await sql(`select id from blocks where id = '${safeId}' and type = 'd' limit 1`);
    const rows = Array.isArray(result) ? result : [];
    return { valid: rows.length > 0 && rows[0]?.id === docId };
  } catch {
    return { valid: false };
  }
}

/**
 * 列出文档下的顶层段落记忆
 */
export async function listQuickPromptItems(docId: string): Promise<QuickPromptItem[]> {
  if (!docId) return [];
  try {
    const children = await getChildBlocks(docId);
    if (!Array.isArray(children)) return [];
    const items: QuickPromptItem[] = [];
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
 * 创建段落提示语
 * @param docId 文档 ID
 * @param text 文本
 * @returns 新块 ID 或 null
 */
export async function createQuickPromptItem(docId: string, text: string): Promise<string | null> {
  if (!docId || !text) return null;
  const trimmed = text.trim().replace(/\n+/g, " ");
  if (!trimmed) return null;
  try {
    const result = await appendBlock("markdown", trimmed, docId);
    if (Array.isArray(result) && result.length > 0 && result[0].doOperations?.length > 0) {
      return result[0].doOperations[0].id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 更新段落提示语
 * @param itemId 段落块 ID
 * @param text 新文本
 * @returns 是否成功
 */
export async function updateQuickPromptItem(itemId: string, text: string): Promise<boolean> {
  if (!itemId || !text) return false;
  const trimmed = text.trim().replace(/\n+/g, " ");
  if (!trimmed) return false;
  try {
    await updateBlock("markdown", trimmed, itemId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 删除段落提示语
 * @param itemId 段落块 ID
 * @returns 是否成功
 */
export async function deleteQuickPromptItem(itemId: string): Promise<boolean> {
  if (!itemId) return false;
  try {
    await deleteBlock(itemId);
    return true;
  } catch {
    return false;
  }
}

/**
 * 在指定文档下安全更新段落提示语（先校验归属）
 * @param docId 文档 ID
 * @param itemId 段落块 ID
 * @param text 新文本
 * @returns 是否成功
 */
export async function updateQuickPromptItemInDoc(docId: string, itemId: string, text: string): Promise<boolean> {
  const items = await listQuickPromptItems(docId);
  if (!items.some((i) => i.id === itemId)) return false;
  return updateQuickPromptItem(itemId, text);
}

/**
 * 在指定文档下安全删除段落提示语（先校验归属）
 * @param docId 文档 ID
 * @param itemId 段落块 ID
 * @returns 是否成功
 */
export async function deleteQuickPromptItemInDoc(docId: string, itemId: string): Promise<boolean> {
  const items = await listQuickPromptItems(docId);
  if (!items.some((i) => i.id === itemId)) return false;
  return deleteQuickPromptItem(itemId);
}

/**
 * 移动段落提示语顺序
 * @param docId 文档 ID
 * @param itemId 要移动的段落块 ID
 * @param position 移动方向 top | bottom | before
 * @param targetId 参考块 ID（position=before 时必填）
 * @returns 是否成功
 */
export async function moveQuickPromptItem(
  docId: string,
  itemId: string,
  position: "top" | "bottom" | "before",
  targetId?: string
): Promise<boolean> {
  if (!docId || !itemId) return false;

  // 校验归属
  const items = await listQuickPromptItems(docId);
  if (!items.some((i) => i.id === itemId)) return false;
  if (position === "before" && (!targetId || !items.some((i) => i.id === targetId))) {
    return false;
  }

  try {
    if (position === "top") {
      await moveBlock(itemId, undefined, docId);
      return true;
    }

    if (position === "bottom") {
      const otherItems = items.filter((i) => i.id !== itemId);
      if (otherItems.length === 0) return true;
      const lastId = otherItems[otherItems.length - 1].id;
      await moveBlock(itemId, lastId);
      return true;
    }

    if (position === "before" && targetId) {
      const targetIndex = items.findIndex((i) => i.id === targetId);
      if (targetIndex <= 0) {
        await moveBlock(itemId, undefined, docId);
      } else {
        const prevId = items[targetIndex - 1].id;
        await moveBlock(itemId, prevId);
      }
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
