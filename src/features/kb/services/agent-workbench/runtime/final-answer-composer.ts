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
import {
  renderContentEvidenceFromObservations,
  renderCandidateCluesFromObservations,
} from "./final-answer-evidence";

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
  blocks.push("2. 用户显式提供的资料和已读取的正文证据优先；未读取正文的候选线索不能作为确定性结论的唯一依据。");
  blocks.push("3. 候选线索（搜索候选、网页候选）不是已读取正文，不能作为确定性结论的唯一依据。");
  blocks.push("4. 没有正文证据时，应明确说明缺少可引用的正文来源，不要基于候选线索或工具摘要写确定性结论。");
  blocks.push("5. 不要编造来源，不要新增 references。");
  blocks.push("6. 如果资料不足，如实说明。");
  blocks.push("7. 保持中文回答。");
  blocks.push("8. 直接输出最终回答正文，不输出思考过程、推理过程、计划、JSON、Markdown 代码块标记或工具调用说明。");
  blocks.push("9. 涉及写入、删除、整理、修改类操作时，必须根据本轮工具结果摘要判断是否真的完成。如果工具失败或返回用户拒绝，应如实说明。如果本轮只有 edit_global_memory 的 list 或没有 edit_global_memory 成功变更结果，不要声称已整理、已删除或已更新。");
  blocks.push("10. 如果本轮工具结果摘要中存在写入/删除/修改/重命名类工具返回 failed 或 rejected，或摘要明确包含“未创建/未替换/未删除/未重命名/失败/拒绝”，最终回答必须说明该操作未完成或部分完成，不能只称全部完成。");

  return blocks.join("\n");
}
