/**
 * Final Answer Evidence — extracts content evidence and candidate clues from observations.
 *
 * Pure helper functions used by final-answer-composer.ts.
 * No side effects. No model calls. No runtime logic.
 */

import type { ObservationEntry } from "./observation-log";

export const CONTENT_EVIDENCE_BUDGET = 20000;
export const CANDIDATE_CLUE_BUDGET = 5000;

export interface EvidenceResult {
  evidence: string;
  itemCount: number;
  chars: number;
  truncated: boolean;
}

export interface ClueResult {
  clues: string;
  count: number;
}

export function renderContentEvidenceFromObservations(observations: readonly ObservationEntry[]): EvidenceResult {
  const blocks: string[] = [];
  let usedChars = 0;
  let truncated = false;
  let itemCount = 0;

  for (const obs of observations) {
    if (obs.toolName === "final_answer") continue;

    const isAttachedDocHydration = (obs.content as Record<string, unknown> | undefined)?.source === "attached_doc_hydration";
    if (obs.toolName === "read_docs" || isAttachedDocHydration) {
      const content = obs.content as { items?: Array<Record<string, unknown>> } | undefined;
      if (content?.items && Array.isArray(content.items)) {
        for (const item of content.items) {
          const text = typeof item.content === "string" ? item.content : "";
          if (text.length === 0) continue;
          itemCount++;
          const title = typeof item.title === "string" ? item.title : "";
          const docId = typeof item.docId === "string" ? item.docId : "";
          const blockId = typeof item.blockId === "string" ? item.blockId : undefined;
          const chunkIndex = typeof item.chunkIndex === "number" ? item.chunkIndex : undefined;
          const chunkCount = typeof item.chunkCount === "number" ? item.chunkCount : undefined;

          const header = `## 文档${blockId ? `（blockId=${blockId}）` : ""}: ${title} [docId=${docId}]` +
            (chunkIndex !== undefined && chunkCount !== undefined ? ` 第 ${chunkIndex}/${chunkCount} 块` : "");
          const entry = `${header}\n${text}\n`;
          if (usedChars + entry.length > CONTENT_EVIDENCE_BUDGET) {
            truncated = true;
            break;
          }
          blocks.push(entry);
          usedChars += entry.length;
        }
      }
    } else if (obs.toolName === "web_read_page" && obs.kind === "tool_executed") {
      const content = obs.content as Record<string, unknown> | undefined;
      const url = typeof content?.url === "string" ? content.url : "";
      const text = typeof content?.text === "string" ? content.text : "";
      if (content && url.length > 0 && text.length > 0) {
        itemCount++;
        const title = typeof content.title === "string" ? content.title : "";
        const sourceName = typeof content.sourceName === "string" ? content.sourceName : undefined;
        const chunkIndex = typeof content.chunkIndex === "number" ? content.chunkIndex : undefined;
        const chunkCount = typeof content.chunkCount === "number" ? content.chunkCount : undefined;

        const header = `## 网页${sourceName ? ` [${sourceName}]` : ""}: ${title} [URL=${url}]` +
          (chunkIndex !== undefined && chunkCount !== undefined ? ` 第 ${chunkIndex}/${chunkCount} 块` : "");
        const entry = `${header}\n${text}\n`;
        if (usedChars + entry.length > CONTENT_EVIDENCE_BUDGET) {
          truncated = true;
          break;
        }
        blocks.push(entry);
        usedChars += entry.length;
      }
    }

    if (truncated) break;
  }

  if (blocks.length === 0) {
    return { evidence: "", itemCount: 0, chars: 0, truncated: false };
  }
  let result = "# 当前轮正文证据\n" + blocks.join("\n");
  if (truncated) {
    result += "\n（正文证据已截断）\n";
  }
  return { evidence: result, itemCount, chars: usedChars, truncated };
}

export function renderCandidateCluesFromObservations(observations: readonly ObservationEntry[]): ClueResult {
  const blocks: string[] = [];
  let usedChars = 0;
  let count = 0;

  for (const obs of observations) {
    if (!obs.toolName || obs.toolName === "final_answer") continue;
    if (obs.toolName !== "search_scope" && obs.toolName !== "web_search") continue;
    if (obs.kind !== "tool_executed") continue;

    const content = obs.content as Record<string, unknown> | undefined;
    let hasRealCandidates = false;
    if (obs.toolName === "web_search") {
      const results = content?.results;
      hasRealCandidates = Array.isArray(results) && results.length > 0;
    } else if (obs.toolName === "search_scope") {
      const candidates = content?.candidates;
      hasRealCandidates = Array.isArray(candidates) && candidates.length > 0;
      if (!hasRealCandidates) {
        const results = content?.results;
        hasRealCandidates = Array.isArray(results) && results.length > 0;
      }
    }

    if (!hasRealCandidates) continue;

    count++;
    const summary = obs.summary ?? "";
    const entry = `## 候选线索 (${obs.toolName}): ${summary}\n`;
    if (usedChars + entry.length > CANDIDATE_CLUE_BUDGET) {
      blocks.push("（候选线索已截断）\n");
      break;
    }
    blocks.push(entry);
    usedChars += entry.length;
  }

  if (blocks.length === 0) {
    return { clues: "", count: 0 };
  }
  return { clues: "# 候选线索（非正文证据）\n" + blocks.join("\n"), count };
}
