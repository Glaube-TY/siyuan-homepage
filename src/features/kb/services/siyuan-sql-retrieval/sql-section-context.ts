/**
 * SQL Section Context 扩展模块
 *
 * 职责：
 * - 使用 SQL 从 blocks 表读取文档块内容
 * - 实现 section expansion
 * - 命中 heading 时扩展到下一个同级/更高级 heading 前
 * - 命中普通块时找到前置最近 heading，再扩该 section
 * - 使用 escapeSqlString 防止 SQL 注入
 */

import { sql } from "@/api";
import { escapeSqlString } from "./sql-utils";

/**
 * Block 基础信息
 */
interface BlockInfo {
  id: string;
  type: string;
  subtype?: string;
  content: string;
  sort: number;
  parent_id?: string;
}

/**
 * Section 扩展结果
 */
export interface SectionExpansionResult {
  sectionTitle: string;
  headingPath: string[];
  blocks: Array<{ blockId: string; content: string; docOrder: number }>;
  expansionSource: string;
}

/**
 * 从 SQL 加载文档的所有块
 * @param docId 文档 ID
 * @returns BlockInfo[]
 */
async function loadDocBlocks(docId: string): Promise<BlockInfo[]> {
  const safeDocId = escapeSqlString(docId);
  const sqlStmt = `
    SELECT id, type, subtype, content, sort, parent_id
    FROM blocks
    WHERE root_id = '${safeDocId}'
    ORDER BY sort ASC
  `;

  try {
    const rows = await sql(sqlStmt);
    if (!Array.isArray(rows)) return [];

    return rows.map((r: any) => ({
      id: r.id || "",
      type: r.type || "",
      subtype: r.subtype || undefined,
      content: r.content || "",
      sort: r.sort || 0,
      parent_id: r.parent_id || undefined,
    }));
  } catch (e) {
    console.error("[loadDocBlocks] SQL error:", e);
    return [];
  }
}

/**
 * 查找块的层级（基于 heading 级别）
 * @param block 块信息
 * @returns heading 级别（1-6），非 heading 返回 0
 */
function getHeadingLevel(block: BlockInfo): number {
  if (block.type !== "h") return 0;
  // subtype 可能是 "h1", "h2" 等
  const match = block.subtype?.match(/h(\d)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * 查找指定块前置最近的 heading
 * @param blocks 所有块
 * @param targetIndex 目标块索引
 * @returns 最近 heading 的索引，找不到返回 -1
 */
function findPreviousHeadingIndex(blocks: BlockInfo[], targetIndex: number): number {
  for (let i = targetIndex - 1; i >= 0; i--) {
    if (blocks[i].type === "h") {
      return i;
    }
  }
  return -1;
}

/**
 * 扩展 heading section（从当前 heading 到下一个同级或更高级 heading 前）
 * @param blocks 所有块
 * @param headingIndex 当前 heading 索引
 * @returns 扩展的块范围 [start, end)
 */
function expandHeadingSection(blocks: BlockInfo[], headingIndex: number): [number, number] {
  const startLevel = getHeadingLevel(blocks[headingIndex]);
  let endIndex = blocks.length;

  // 从下一个块开始找，直到遇到同级或更高级的 heading
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    if (blocks[i].type === "h") {
      const level = getHeadingLevel(blocks[i]);
      if (level <= startLevel) {
        endIndex = i;
        break;
      }
    }
  }

  return [headingIndex, endIndex];
}

/**
 * 扩展 section context
 *
 * @param docId 文档 ID
 * @param hitBlockId 命中的块 ID
 * @param hitBlockType 命中的块类型
 * @param options 选项
 * @returns SectionExpansionResult
 */
export async function expandSectionContext(
  docId: string,
  hitBlockId: string,
  hitBlockType: "heading" | "paragraph" | "listItem" | "quote" | "code" | "math" | "table" | "html" | string,
  options: { maxSectionLength?: number } = {}
): Promise<SectionExpansionResult> {
  const { maxSectionLength = 8000 } = options;

  // 加载文档所有块
  const blocks = await loadDocBlocks(docId);
  if (blocks.length === 0) {
    return {
      sectionTitle: "",
      headingPath: [],
      blocks: [],
      expansionSource: "无文档块",
    };
  }

  // 查找命中块的位置
  const hitIndex = blocks.findIndex(b => b.id === hitBlockId);
  if (hitIndex === -1) {
    return {
      sectionTitle: "",
      headingPath: [],
      blocks: [],
      expansionSource: "未找到命中块",
    };
  }

  const hitBlock = blocks[hitIndex];
  let startIndex: number;
  let endIndex: number;
  let sectionTitle: string;
  let headingPath: string[];

  if (hitBlockType === "heading" || hitBlock.type === "h") {
    // 命中 heading，扩展到下一个同级/更高级 heading 前
    [startIndex, endIndex] = expandHeadingSection(blocks, hitIndex);
    sectionTitle = hitBlock.content;
    headingPath = [hitBlock.content];
  } else {
    // 命中普通块，找到前置最近 heading
    const headingIdx = findPreviousHeadingIndex(blocks, hitIndex);
    if (headingIdx === -1) {
      // 没有前置 heading，只包含命中块
      startIndex = hitIndex;
      endIndex = Math.min(hitIndex + 1, blocks.length);
      sectionTitle = "文档开头";
      headingPath = ["文档开头"];
    } else {
      // 从 heading 开始扩展
      [startIndex, endIndex] = expandHeadingSection(blocks, headingIdx);
      sectionTitle = blocks[headingIdx].content;
      headingPath = [blocks[headingIdx].content];
    }
  }

  // 收集范围内的块
  const sectionBlocks: Array<{ blockId: string; content: string; docOrder: number }> = [];
  let totalLength = 0;

  for (let i = startIndex; i < endIndex; i++) {
    const block = blocks[i];
    const content = block.content || "";

    // 检查长度限制
    if (totalLength + content.length > maxSectionLength && sectionBlocks.length > 0) {
      break;
    }

    sectionBlocks.push({
      blockId: block.id,
      content: content,
      docOrder: block.sort,
    });
    totalLength += content.length;
  }

  return {
    sectionTitle,
    headingPath,
    blocks: sectionBlocks,
    expansionSource: `SQL section expansion: ${hitBlockType} -> ${sectionBlocks.length} blocks`,
  };
}

/**
 * 为文档构建完整上下文（用于 doc 类型）
 * @param docId 文档 ID
 * @param maxLength 最大长度
 * @returns 文档上下文
 */
export async function buildDocContext(
  docId: string,
  maxLength: number
): Promise<{ blocks: Array<{ blockId: string; content: string; docOrder: number; type?: string; subtype?: string }>; expansionSource: string }> {
  const blocks = await loadDocBlocks(docId);

  if (blocks.length === 0) {
    return { blocks: [], expansionSource: "无文档块" };
  }

  const result: Array<{ blockId: string; content: string; docOrder: number; type?: string; subtype?: string }> = [];
  let totalLength = 0;

  // 优先加载 headings
  const headings = blocks.filter(b => b.type === "h");
  for (const h of headings) {
    if (totalLength + h.content.length > maxLength && result.length > 0) {
      break;
    }
    result.push({
      blockId: h.id,
      content: h.content,
      docOrder: h.sort,
      type: h.type,
      subtype: h.subtype,
    });
    totalLength += h.content.length;
  }

  // 然后加载 paragraphs 和其他块
  const others = blocks.filter(b => b.type !== "h");
  for (const b of others) {
    if (totalLength + b.content.length > maxLength && result.length > 0) {
      break;
    }
    result.push({
      blockId: b.id,
      content: b.content,
      docOrder: b.sort,
      type: b.type,
      subtype: b.subtype,
    });
    totalLength += b.content.length;
  }

  // 按 sort 排序
  result.sort((a, b) => a.docOrder - b.docOrder);

  return {
    blocks: result,
    expansionSource: `SQL doc context: ${result.length} blocks`,
  };
}
