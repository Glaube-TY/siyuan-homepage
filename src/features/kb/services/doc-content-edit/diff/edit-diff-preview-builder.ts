/**
 * EditDiffPreview builder — assembles the full EditDiffPreview from
 * oldContent (local current state) and newContent (AI proposed change).
 */

import type {
  EditDiffPreview,
  EditBlockDiffEntry,
} from "../doc-content-edit-types";
import { collapseUnchangedContext, parseBlocks, matchBlocks } from "./block-diff";

const MAX_BLOCKS = 300;
const MAX_CONTENT_CHARS = 50000;
const DEFAULT_CONTEXT_BLOCKS = 3;

function normalizePreviewSource(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B\u200C\u200D]/g, "")
    .replace(/\r\n?/g, "\n");
}

export interface BuildEditDiffPreviewParams {
  title: string;
  oldContent: string;
  newContent: string;
  targetBlockIds?: string[];
  toolName: string;
}

export function buildEditDiffPreview(
  params: BuildEditDiffPreviewParams,
): EditDiffPreview {
  const { title, targetBlockIds, toolName } = params;
  // 保留思源 IAL 供分块器读取真实块 ID；IAL 本身不会进入可见文本。
  const oldContent = normalizePreviewSource(params.oldContent);
  const newContent = normalizePreviewSource(params.newContent);

  // Check for empty/no-change cases
  if (!oldContent && !newContent) {
    return createEmptyPreview(title, toolName);
  }

  let oldBlocks = parseBlocks(oldContent);
  let newBlocks = parseBlocks(newContent);
  let truncated = false;

  // Truncate large content
  if (oldBlocks.length > MAX_BLOCKS || newBlocks.length > MAX_BLOCKS) {
    oldBlocks = oldBlocks.slice(0, MAX_BLOCKS);
    newBlocks = newBlocks.slice(0, MAX_BLOCKS);
    truncated = true;
  }
  const totalChars = oldContent.length + newContent.length;
  if (totalChars > MAX_CONTENT_CHARS) {
    truncated = true;
  }

  const rawEntries = matchBlocks(oldBlocks, newBlocks, targetBlockIds);

  // 与 GitHub Diff 一致：变化前后保留固定数量的真实上下文块，远处内容折叠。
  const entries = collapseUnchangedContext(rawEntries, DEFAULT_CONTEXT_BLOCKS);

  // Compute stats
  const stats = computeStats(rawEntries);

  // Detect if no actual changes
  if (stats.modifiedBlocks === 0 && stats.addedBlocks === 0 && stats.removedBlocks === 0) {
    // All unchanged — return a special "no changes" preview
    return {
      mode: "block_diff",
      title,
      summary: `${title}：未检测到内容变化。`,
      entries: [],
      stats: {
        addedLines: 0,
        removedLines: 0,
        modifiedBlocks: 0,
        addedBlocks: 0,
        removedBlocks: 0,
      },
      displayOptions: {
        defaultView: "unified",
        collapseUnchanged: true,
        contextBlocks: DEFAULT_CONTEXT_BLOCKS,
      },
      truncated: false,
      noChanges: true,
    };
  }

  const summary = buildSummary(title, stats);

  return {
    mode: "block_diff",
    title,
    summary,
    entries,
    stats,
    displayOptions: {
      defaultView: "unified",
      collapseUnchanged: true,
      contextBlocks: DEFAULT_CONTEXT_BLOCKS,
    },
    truncated,
  };
}

function computeStats(entries: EditBlockDiffEntry[]): EditDiffPreview["stats"] {
  let addedLines = 0;
  let removedLines = 0;
  let modifiedBlocks = 0;
  let addedBlocks = 0;
  let removedBlocks = 0;

  for (const entry of entries) {
    switch (entry.status) {
      case "modified":
        modifiedBlocks++;
        {
          const changed = countChangedLines(entry.oldBlock?.text ?? "", entry.newBlock?.text ?? "");
          removedLines += changed.removed;
          addedLines += changed.added;
        }
        break;
      case "added":
        addedBlocks++;
        addedLines += (entry.newBlock?.text ?? "").split("\n").length;
        break;
      case "removed":
        removedBlocks++;
        removedLines += (entry.oldBlock?.text ?? "").split("\n").length;
        break;
    }
  }

  return { addedLines, removedLines, modifiedBlocks, addedBlocks, removedBlocks };
}

function countChangedLines(oldText: string, newText: string): { removed: number; added: number } {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    removed: oldLines.length - prefix - suffix,
    added: newLines.length - prefix - suffix,
  };
}

function buildSummary(
  toolName: string,
  stats: EditDiffPreview["stats"],
): string {
  const parts: string[] = [toolName];
  if (stats.modifiedBlocks > 0) parts.push(`修改 ${stats.modifiedBlocks} 块`);
  if (stats.addedBlocks > 0) parts.push(`新增 ${stats.addedBlocks} 块`);
  if (stats.removedBlocks > 0) parts.push(`删除 ${stats.removedBlocks} 块`);
  if (stats.addedLines > 0 || stats.removedLines > 0) {
    parts.push(`内容行 +${stats.addedLines} / -${stats.removedLines}`);
  }
  return parts.join(" · ");
}

function createEmptyPreview(title: string, _toolName: string): EditDiffPreview {
  return {
    mode: "block_diff",
    title,
    summary: `${title}：内容为空，无变化。`,
    entries: [],
    stats: {
      addedLines: 0,
      removedLines: 0,
      modifiedBlocks: 0,
      addedBlocks: 0,
      removedBlocks: 0,
    },
    displayOptions: {
      defaultView: "unified",
      collapseUnchanged: true,
      contextBlocks: DEFAULT_CONTEXT_BLOCKS,
    },
    truncated: false,
    noChanges: true,
  };
}
