/**
 * Block-level diff — splits kramdown content into blocks, matches them,
 * and produces EditBlockDiffEntry[] with inline diff for modified blocks.
 */

import type {
  EditPreviewBlock,
  EditBlockDiffEntry,
} from "../doc-content-edit-types";
import { buildInlineDiffParts } from "./inline-diff";

/**
 * Parse kramdown content into EditPreviewBlock[].
 * Splits on block boundaries: `{: id="..." ...}` IAL lines.
 * Blocks without an explicit IAL get a synthetic key.
 */
export function parseBlocks(kramdown: string): EditPreviewBlock[] {
  const lines = kramdown.split("\n");
  const blocks: EditPreviewBlock[] = [];
  let currentLines: string[] = [];
  let currentStartLine = 1;
  let currentType: string | undefined;
  let fenceMarker: "```" | "~~~" | undefined;
  let visibleLineNumber = 0;

  function flushBlock(id?: string) {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      blocks.push({
        id,
        type: currentType,
        text,
        markdown: currentLines.join("\n"),
        order: blocks.length,
        startLine: currentStartLine,
      });
    }
    currentLines = [];
    currentType = undefined;
  }

  function pushEmptyBlock(id: string) {
    visibleLineNumber++;
    blocks.push({
      id,
      type: "paragraph",
      text: "",
      markdown: "",
      order: blocks.length,
      startLine: visibleLineNumber,
    });
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const fence = trimmed.startsWith("```") ? "```" : trimmed.startsWith("~~~") ? "~~~" : undefined;
    if (fenceMarker) {
      visibleLineNumber++;
      currentLines.push(line);
      if (fence === fenceMarker) fenceMarker = undefined;
      continue;
    }

    // 思源 IAL 属于它前面的块，不能归给下一个块。
    if (trimmed.startsWith("{:") && trimmed.endsWith("}")) {
      const idMatch = trimmed.match(/id="([^"]*)"/);
      const blockId = idMatch?.[1];
      const isDocumentIal = /(?:^|\s)type="doc"(?:\s|})/.test(trimmed);
      if (currentLines.length > 0) {
        flushBlock(blockId);
      } else if (blockId && !isDocumentIal) {
        // 思源真实空内容块只包含一条 IAL；它应占一个可见位置。
        pushEmptyBlock(blockId);
      }
      continue;
    }

    // Kramdown 会在块之间插入分隔空行；这不是思源中的内容块，不占可见行号。
    if (!trimmed) {
      flushBlock();
      continue;
    }

    const isHeading = /^#{1,6}\s+/.test(trimmed);
    if (isHeading && currentLines.length > 0) flushBlock();
    if (currentType === "heading" && !isHeading) flushBlock();

    if (currentLines.length === 0) {
      currentStartLine = visibleLineNumber + 1;
      currentType = isHeading
        ? "heading"
        : /^([-*+]\s+|\d+[.)]\s+)/.test(trimmed)
          ? "list"
          : /^>\s?/.test(trimmed)
            ? "quote"
            : fence
              ? "code"
              : "paragraph";
    }
    visibleLineNumber++;
    currentLines.push(line);
    if (fence) fenceMarker = fence;
  }
  flushBlock();

  return blocks;
}

/**
 * Match old blocks to new blocks.
 * Priority:
 * 1. Same block id (from IAL)
 * 2. LCS-based text similarity for blocks without id
 * 3. Order-based fallback
 */
export function matchBlocks(
  oldBlocks: EditPreviewBlock[],
  newBlocks: EditPreviewBlock[],
  _targetBlockIds?: string[],
): EditBlockDiffEntry[] {
  const entries: EditBlockDiffEntry[] = [];
  const usedNew = new Set<number>();
  const usedOld = new Set<number>();

  // Pass 1: Match by block id
  const oldById = new Map<string, number>();
  for (let i = 0; i < oldBlocks.length; i++) {
    if (oldBlocks[i].id) oldById.set(oldBlocks[i].id, i);
  }
  const newById = new Map<string, number>();
  for (let j = 0; j < newBlocks.length; j++) {
    if (newBlocks[j].id) newById.set(newBlocks[j].id, j);
  }

  for (const [id, oldIdx] of oldById) {
    const newIdx = newById.get(id);
    if (newIdx !== undefined) {
      usedOld.add(oldIdx);
      usedNew.add(newIdx);
      const oldBlock = oldBlocks[oldIdx];
      const newBlock = newBlocks[newIdx];

      if (oldBlock.text === newBlock.text) {
        entries.push({
          key: id,
          status: "unchanged",
          oldBlock,
          newBlock,
        });
      } else {
        const { oldParts, newParts } = buildInlineDiffParts(oldBlock.text, newBlock.text);
        entries.push({
          key: id,
          status: "modified",
          oldBlock,
          newBlock,
          oldParts,
          newParts,
        });
      }
    }
  }

  // Pass 2: 精确文本优先，保证未变化段落稳定成为上下文。
  for (let i = 0; i < oldBlocks.length; i++) {
    if (usedOld.has(i)) continue;
    const newIdx = newBlocks.findIndex((block, index) => (
      !usedNew.has(index) && block.text === oldBlocks[i].text
    ));
    if (newIdx < 0) continue;
    usedOld.add(i);
    usedNew.add(newIdx);
    entries.push({
      key: oldBlocks[i].id ?? newBlocks[newIdx].id ?? `unchanged_${i}_${newIdx}`,
      status: "unchanged",
      oldBlock: oldBlocks[i],
      newBlock: newBlocks[newIdx],
    });
  }

  // Pass 3: Match by text similarity for unmatched blocks
  const unmatchedOld: number[] = [];
  for (let i = 0; i < oldBlocks.length; i++) {
    if (!usedOld.has(i)) unmatchedOld.push(i);
  }
  const unmatchedNew: number[] = [];
  for (let j = 0; j < newBlocks.length; j++) {
    if (!usedNew.has(j)) unmatchedNew.push(j);
  }

  // Greedy similarity match
  for (const oi of [...unmatchedOld]) {
    let bestJ = -1;
    let bestScore = 0;
    for (const nj of unmatchedNew) {
      if (usedNew.has(nj)) continue;
      const score = textSimilarity(oldBlocks[oi].text, newBlocks[nj].text);
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestJ = nj;
      }
    }
    if (bestJ >= 0) {
      usedOld.add(oi);
      usedNew.add(bestJ);
      const oldBlock = oldBlocks[oi];
      const newBlock = newBlocks[bestJ];
      const key = oldBlock.id ?? newBlock.id ?? `matched_${oi}_${bestJ}`;

      if (oldBlock.text === newBlock.text) {
        entries.push({ key, status: "unchanged", oldBlock, newBlock });
      } else {
        const { oldParts, newParts } = buildInlineDiffParts(oldBlock.text, newBlock.text);
        entries.push({
          key,
          status: "modified",
          oldBlock,
          newBlock,
          oldParts,
          newParts,
        });
      }
    }
  }

  // Pass 4: 用位置兜底识别“整段改写”。普通中文短段可能没有相同词，
  // 但在前后未变化段落已经锚定后，同一位置附近的剩余块仍应视为修改。
  for (let i = 0; i < oldBlocks.length; i++) {
    if (usedOld.has(i)) continue;
    let bestNewIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let j = 0; j < newBlocks.length; j++) {
      if (usedNew.has(j)) continue;
      const distance = Math.abs(oldBlocks[i].order - newBlocks[j].order);
      if (distance <= 1 && distance < bestDistance) {
        bestNewIndex = j;
        bestDistance = distance;
      }
    }
    if (bestNewIndex < 0) continue;
    usedOld.add(i);
    usedNew.add(bestNewIndex);
    const oldBlock = oldBlocks[i];
    const newBlock = newBlocks[bestNewIndex];
    const { oldParts, newParts } = buildInlineDiffParts(oldBlock.text, newBlock.text);
    entries.push({
      key: oldBlock.id ?? newBlock.id ?? `position_${i}_${bestNewIndex}`,
      status: "modified",
      oldBlock,
      newBlock,
      oldParts,
      newParts,
    });
  }

  // Pass 5: Remaining old blocks are removed, new blocks are added
  for (let i = 0; i < oldBlocks.length; i++) {
    if (!usedOld.has(i)) {
      const block = oldBlocks[i];
      entries.push({
        key: block.id ?? `removed_${i}`,
        status: "removed",
        oldBlock: block,
      });
    }
  }
  for (let j = 0; j < newBlocks.length; j++) {
    if (!usedNew.has(j)) {
      const block = newBlocks[j];
      entries.push({
        key: block.id ?? `added_${j}`,
        status: "added",
        newBlock: block,
      });
    }
  }

  // Sort: entries are added in order by their position in oldBlocks/newBlocks
  return sortEntries(entries, oldBlocks, newBlocks);
}

/**
 * Crude text similarity score (0-1) using token overlap.
 */
function textSimilarity(a: string, b: string): number {
  const aTokens = new Set(tokenizeSimple(a));
  const bTokens = new Set(tokenizeSimple(b));
  if (aTokens.size === 0 && bTokens.size === 0) return 1;
  let intersection = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) intersection++;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenizeSimple(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?，。；：！？、""''（）\(\)\[\]【】\n\r]+/)
    .filter((t) => t.length > 0);
}

function sortEntries(
  entries: EditBlockDiffEntry[],
  oldBlocks: EditPreviewBlock[],
  newBlocks: EditPreviewBlock[],
): EditBlockDiffEntry[] {
  const oldOrder = new Map<string, number>();
  for (let i = 0; i < oldBlocks.length; i++) {
    if (oldBlocks[i].id) oldOrder.set(oldBlocks[i].id!, i);
  }
  const newOrder = new Map<string, number>();
  for (let j = 0; j < newBlocks.length; j++) {
    if (newBlocks[j].id) newOrder.set(newBlocks[j].id!, j);
  }

  return entries.sort((a, b) => {
    const aPos = getPosition(a, oldOrder, newOrder);
    const bPos = getPosition(b, oldOrder, newOrder);
    return aPos - bPos;
  });
}

function getPosition(
  entry: EditBlockDiffEntry,
  oldOrder: Map<string, number>,
  newOrder: Map<string, number>,
): number {
  if (entry.oldBlock?.id && oldOrder.has(entry.oldBlock.id)) return oldOrder.get(entry.oldBlock.id)!;
  if (entry.newBlock?.id && newOrder.has(entry.newBlock.id)) return newOrder.get(entry.newBlock.id)!;
  return entry.oldBlock?.order ?? entry.newBlock?.order ?? 0;
}

/**
 * Filter entries to only keep changed blocks + context.
 * contextBlocks = number of unchanged blocks to keep before/after changes.
 */
export function collapseUnchangedContext(
  entries: EditBlockDiffEntry[],
  contextBlocks: number,
): EditBlockDiffEntry[] {
  if (entries.length === 0) return entries;

  const keepFlags = new Array(entries.length).fill(false);

  for (let i = 0; i < entries.length; i++) {
    if (entries[i].status !== "unchanged") {
      // Mark context before
      for (let c = Math.max(0, i - contextBlocks); c <= i; c++) {
        keepFlags[c] = true;
      }
      // Mark context after
      for (let c = i; c <= Math.min(entries.length - 1, i + contextBlocks); c++) {
        keepFlags[c] = true;
      }
    }
  }

  // 文档级 Diff 始终保留第 1 行标题，作为用户辨认正文位置的稳定锚点。
  const firstBlock = entries[0]?.oldBlock ?? entries[0]?.newBlock;
  if (firstBlock?.startLine === 1) keepFlags[0] = true;

  // Build result with collapsed placeholders
  const result: EditBlockDiffEntry[] = [];
  let skipped: EditBlockDiffEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (keepFlags[i]) {
      if (skipped.length > 0) {
        result.push(createCollapsedPlaceholder(skipped));
        skipped = [];
      }
      result.push(entries[i]);
    } else {
      skipped.push(entries[i]);
    }
  }
  if (skipped.length > 0) {
    result.push(createCollapsedPlaceholder(skipped));
  }
  return result;
}

function createCollapsedPlaceholder(entries: EditBlockDiffEntry[]): EditBlockDiffEntry {
  const first = entries[0]?.oldBlock ?? entries[0]?.newBlock;
  const lastEntry = entries[entries.length - 1];
  const last = lastEntry?.oldBlock ?? lastEntry?.newBlock;
  const startLine = first?.startLine;
  const lastLineCount = last?.text.split("\n").length ?? 1;
  const endLine = last?.startLine ? last.startLine + lastLineCount - 1 : undefined;
  const range = startLine && endLine ? `，原文第 ${startLine}–${endLine} 行` : "";
  return {
    key: `collapsed_${startLine ?? "unknown"}_${entries.length}`,
    status: "unchanged",
    oldBlock: {
      id: "__collapsed__",
      text: `已折叠 ${entries.length} 个未变化块${range}`,
      markdown: "",
      order: -1,
      startLine,
    },
  };
}
