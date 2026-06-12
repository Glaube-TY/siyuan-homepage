/**
 * EditDiffPreview builder — assembles the full EditDiffPreview from
 * oldContent (local current state) and newContent (AI proposed change).
 */

import type {
  EditDiffPreview,
  EditBlockDiffEntry,
} from "../doc-content-edit-types";
import { parseBlocks, matchBlocks, collapseUnchangedContext } from "./block-diff";

const MAX_BLOCKS = 300;
const MAX_CONTENT_CHARS = 50000;
const DEFAULT_CONTEXT_BLOCKS = 3;

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
  const { title, oldContent, newContent, targetBlockIds, toolName } = params;

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

  // Collapse unchanged blocks away from changes
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
        if (entry.oldParts) {
          for (const p of entry.oldParts) {
            if (p.kind === "removed") removedLines += p.text.split("\n").length;
          }
        }
        if (entry.newParts) {
          for (const p of entry.newParts) {
            if (p.kind === "added") addedLines += p.text.split("\n").length;
          }
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

function buildSummary(
  toolName: string,
  stats: EditDiffPreview["stats"],
): string {
  const parts: string[] = [toolName];
  if (stats.modifiedBlocks > 0) parts.push(`修改 ${stats.modifiedBlocks} 块`);
  if (stats.addedBlocks > 0) parts.push(`新增 ${stats.addedBlocks} 块`);
  if (stats.removedBlocks > 0) parts.push(`删除 ${stats.removedBlocks} 块`);
  if (stats.addedLines > 0) parts.push(`+${stats.addedLines} 行`);
  if (stats.removedLines > 0) parts.push(`-${stats.removedLines} 行`);
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
