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
  let currentId: string | undefined;
  let syntheticIdx = 0;

  function flushBlock() {
    const text = currentLines.join("\n").trim();
    if (text.length > 0 || (currentId && currentLines.length > 0)) {
      blocks.push({
        id: currentId,
        text,
        markdown: currentLines.join("\n"),
        order: blocks.length,
      });
    }
    currentLines = [];
    currentId = undefined;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect IAL — block boundary
    if (trimmed.startsWith("{:") && trimmed.endsWith("}")) {
      const idMatch = trimmed.match(/id="([^"]*)"/);
      const newId = idMatch ? idMatch[1] : undefined;

      if (currentId !== undefined || currentLines.length > 0) {
        // Flush previous block
        flushBlock();
      }
      currentId = newId ?? `synthetic_${syntheticIdx++}`;
      // IAL line is metadata, not content — skip
    } else {
      currentLines.push(line);
    }
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

  // Pass 2: Match by text similarity for unmatched blocks
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

  // Pass 3: Remaining old blocks are removed, new blocks are added
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

  // Build result with collapsed placeholders
  const result: EditBlockDiffEntry[] = [];
  let skipped = 0;
  for (let i = 0; i < entries.length; i++) {
    if (keepFlags[i]) {
      if (skipped > 0) {
        result.push(createCollapsedPlaceholder(skipped));
        skipped = 0;
      }
      result.push(entries[i]);
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    result.push(createCollapsedPlaceholder(skipped));
  }
  return result;
}

function createCollapsedPlaceholder(count: number): EditBlockDiffEntry {
  return {
    key: `collapsed_${count}`,
    status: "unchanged",
    oldBlock: {
      id: "__collapsed__",
      text: `... ${count} 个未变化块 ...`,
      markdown: "",
      order: -1,
    },
  };
}
