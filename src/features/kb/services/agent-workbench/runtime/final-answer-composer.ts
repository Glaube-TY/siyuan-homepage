/**
 * Final Answer Composer — streams the final answer from a Planner draft.
 *
 * This is NOT a Tool. It does NOT register in ToolRegistry.
 * It does NOT appear in the tool manifest.
 * It does NOT call tools or change references.
 *
 * It runs AFTER Planner has decided to answer, using streamModelText
 * to produce a truly streamed final response for the user.
 */

import { streamModelText } from "../../qa/kb-model-call";
import type { ObservationEntry } from "./observation-log";
import type { ChatModelSelection } from "../../../types/chat-model-selection";
import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import { pushAgentDebugEvent } from "../debug/workbench-debug";
import type { ThinkingMode } from "../../../types/session";

export interface FinalAnswerComposerParams {
  question: string;
  observations: readonly ObservationEntry[];
  draftBody: string;
  onChunk?: (event: { chunk: string; fullContent: string }) => void;
  onFinish?: (fullContent: string) => void;
  onWorkbenchEvent?: (event: AgentWorkbenchEvent) => void;
  /** Reasoning stream callback: only called when thinkingMode=on and model returns reasoning */
  onReasoningDelta?: (event: { type: "reasoning-start" | "reasoning-delta" | "reasoning-end"; delta?: string }) => void;
  abortSignal?: AbortSignal;
  chatModelSelection?: ChatModelSelection | null;
  thinkingMode?: ThinkingMode;
  /** 全局记忆内容（已截断处理） */
  globalMemory?: string;
}

export async function streamFinalAnswerFromDraft(params: FinalAnswerComposerParams): Promise<string> {
  const contentEvidenceResult = renderContentEvidenceFromObservations(params.observations);
  const candidateCluesResult = renderCandidateCluesFromObservations(params.observations);

  const readDocItemCount = params.observations.reduce((sum, obs) => {
    if (obs.toolName !== "read_docs") return sum;
    const content = obs.content as { items?: Array<Record<string, unknown>> } | undefined;
    const items = content?.items ?? [];
    return sum + items.filter((item) => typeof item.content === "string" && item.content.length > 0).length;
  }, 0);
  const attachedDocItemCount = params.observations.reduce((sum, obs) => {
    const content = obs.content as Record<string, unknown> | undefined;
    if (content?.source !== "attached_doc_hydration") return sum;
    const items = content?.items as Array<Record<string, unknown>> | undefined;
    return sum + (items?.filter((item) => typeof item.content === "string" && item.content.length > 0).length ?? 0);
  }, 0);
  const webPageItemCount = params.observations.filter((obs) => {
    if (obs.toolName !== "web_read_page" || obs.kind !== "tool_executed") return false;
    const content = obs.content as Record<string, unknown> | undefined;
    const url = typeof content?.url === "string" ? content.url : "";
    const text = typeof content?.text === "string" ? content.text : "";
    return url.length > 0 && text.length > 0;
  }).length;

  pushAgentDebugEvent("COMPOSER_EVIDENCE_DIAGNOSTICS_SAFE", {
    evidenceBlockCount: contentEvidenceResult.itemCount + candidateCluesResult.count,
    readDocItemCount,
    attachedDocItemCount,
    webPageItemCount,
    candidateSummaryCount: candidateCluesResult.count,
    evidenceChars: contentEvidenceResult.chars,
    truncated: contentEvidenceResult.truncated,
    contentEvidenceItemCount: contentEvidenceResult.itemCount,
    candidateClueCount: candidateCluesResult.count,
    contentEvidenceChars: contentEvidenceResult.chars,
  }, "info");

  const prompt = renderFinalAnswerComposePrompt(params, contentEvidenceResult.evidence, candidateCluesResult.clues);

  let fullContent = "";
  let textStarted = false;

  const userThinkingMode = params.thinkingMode ?? "off";

  try {
    await streamModelText(
      prompt,
      userThinkingMode,
      {
        onChunk: (event) => {
          fullContent = event.fullContent;
          params.onChunk?.(event);
        },
        onFinish: (content) => {
          fullContent = content;
          params.onFinish?.(content);
        },
        onStreamStatus: (event) => {
          if (!textStarted && (event.type === "reasoning-start" || event.type === "reasoning-delta")) {
            params.onWorkbenchEvent?.({
              type: "Notice",
              message: "正在组织回答...",
              at: Date.now(),
            });
          }
          if (event.type === "text-start") {
            textStarted = true;
          }
          // Forward reasoning events to onReasoningDelta (only when thinkingMode=on)
          if (params.onReasoningDelta && (event.type === "reasoning-start" || event.type === "reasoning-delta" || event.type === "reasoning-end")) {
            params.onReasoningDelta({ type: event.type, delta: event.type === "reasoning-delta" ? event.delta : undefined });
          }
        },
      },
      {
        purpose: "compose",
        temperature: 0.3,
        chatModelSelection: params.chatModelSelection,
        abortSignal: params.abortSignal,
      },
    );

    // Empty-output fallback: even on successful return, fullContent may be empty
    if (fullContent.trim().length > 0) {
      return fullContent;
    }
    const isAbort = params.abortSignal?.aborted;
    if (isAbort) {
      return "";
    }
    const hasContentEvidence = contentEvidenceResult.itemCount > 0;
    if (hasContentEvidence) {
      params.onChunk?.({ chunk: params.draftBody, fullContent: params.draftBody });
      params.onFinish?.(params.draftBody);
      return params.draftBody;
    }
    const safeFallback = "当前没有获得可靠正文来源，无法给出确定性结论。";
    params.onChunk?.({ chunk: safeFallback, fullContent: safeFallback });
    params.onFinish?.(safeFallback);
    return safeFallback;
  } catch (err) {
    const isAbort = (err as any)?.name === "AbortError" || params.abortSignal?.aborted;
    if (fullContent.trim().length > 0) {
      params.onFinish?.(fullContent);
      return fullContent;
    }
    if (isAbort) {
      return "";
    }
    // Fallback: if there is content evidence, draftBody is acceptable; otherwise return a safe notice
    const hasContentEvidence = contentEvidenceResult.itemCount > 0;
    if (hasContentEvidence) {
      params.onChunk?.({ chunk: params.draftBody, fullContent: params.draftBody });
      params.onFinish?.(params.draftBody);
      return params.draftBody;
    }
    const safeFallback = "当前没有获得可靠正文来源，无法给出确定性结论。";
    params.onChunk?.({ chunk: safeFallback, fullContent: safeFallback });
    params.onFinish?.(safeFallback);
    return safeFallback;
  }
}

const CONTENT_EVIDENCE_BUDGET = 20000;
const CANDIDATE_CLUE_BUDGET = 5000;



function renderContentEvidenceFromObservations(observations: readonly ObservationEntry[]): { evidence: string; itemCount: number; chars: number; truncated: boolean } {
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

function renderCandidateCluesFromObservations(observations: readonly ObservationEntry[]): { clues: string; count: number } {
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

function renderFinalAnswerComposePrompt(params: FinalAnswerComposerParams, contentEvidence: string, candidateClues: string): string {
  const blocks: string[] = [];

  blocks.push("你是运行在思源笔记中的 AI 助手。请根据以下信息，生成一个完整、连贯、自然的最终回答，直接呈现给用户。");
  blocks.push("");

  blocks.push("# 用户问题");
  blocks.push(params.question);
  blocks.push("");

  if (params.globalMemory && params.globalMemory.length > 0) {
    blocks.push("# 用户长期偏好 / 全局记忆");
    blocks.push(params.globalMemory);
    blocks.push("");
  }

  if (contentEvidence) {
    blocks.push(contentEvidence);
    blocks.push("");
  }

  if (candidateClues) {
    blocks.push(candidateClues);
    blocks.push("");
  }

  if (params.observations.length > 0) {
    blocks.push("# 本轮工具结果摘要");
    for (const obs of params.observations) {
      if (obs.toolName && obs.toolName !== "final_answer") {
        const summary = obs.summary ?? "(无摘要)";
        blocks.push(`- ${obs.toolName}: ${summary}`);
      } else if (!obs.toolName && obs.summary) {
        blocks.push(`- 系统: ${obs.summary}`);
      }
    }
    blocks.push("");
  }

  blocks.push("# 回答草稿/要点");
  blocks.push(params.draftBody);
  blocks.push("");

  blocks.push("要求：");
  blocks.push("1. 基于回答草稿和当前轮正文证据，生成完整、流畅、可直接呈现给用户的最终回答正文。工具结果摘要只是运行状态概览，不能作为正文证据。");
  blocks.push("2. 候选线索（搜索/网页候选）不是正文证据，不能作为确定性结论的唯一依据。");
  blocks.push("3. 没有正文证据时，应明确说明缺少可引用的正文来源，不要基于候选线索或工具摘要写确定性结论。");
  blocks.push("4. 不要编造来源，不要新增 references。");
  blocks.push("5. 如果资料不足，如实说明。");
  blocks.push("6. 保持中文回答。");
  blocks.push("7. 直接输出最终回答正文，不输出思考过程、推理过程、计划、JSON、Markdown 代码块标记或工具调用说明。");
  blocks.push("8. 涉及写入、删除、整理、修改类操作时，必须根据本轮工具结果摘要判断是否真的完成。如果本轮只有 edit_global_memory 的 list 或没有 edit_global_memory 成功变更结果，不要声称已整理、已删除或已更新。如果工具失败，应如实说明失败或需要用户继续确认。");

  return blocks.join("\n");
}
