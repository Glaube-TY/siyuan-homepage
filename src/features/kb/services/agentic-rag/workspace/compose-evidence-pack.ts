/**
 * Compose Evidence Pack
 *
 * 为最终回答阶段生成预算安全的证据包摘录视图。
 *
 * 职责：
 * - 不修改原始 evidencePack
 * - 只构造 promptEvidencePack 供 buildFinalAnswerPrompt 使用
 * - 确定性摘录策略，不调用额外大模型
 * - 控制总 promptContentChars 在 maxTotalChars 内
 * - 保持原顺序、原 docId、原 docTitle、原 readLevel、原 id
 * - 遵守"代码不理解自然语言"：不做 tokenization、不做语义打分
 */

import type { AgenticEvidenceItem, AgenticEvidencePack } from "../evidence/evidence-types";

export interface BuildComposeEvidencePackParams {
  evidencePack: AgenticEvidencePack;
  question: string;
  maxTotalChars: number;
  maxCharsPerItem?: number;
  trace?: boolean;
}

export interface ComposeEvidencePackResult {
  promptEvidencePack: AgenticEvidencePack;
  compacted: boolean;
  originalContentChars: number;
  promptContentChars: number;
  truncatedItemCount: number;
  droppedEvidenceItemCount: number;
  promptVisibleEvidenceCount: number;
  warnings: string[];
  rawMaxTotalChars: number;
  effectiveMaxTotalChars: number;
  effectiveMaxCharsPerItem: number;
}

const DEFAULT_MAX_CHARS_PER_ITEM = 1500;
const MIN_MAX_TOTAL_CHARS = 6000;
const MAX_MAX_TOTAL_CHARS = 8000;

function clampMaxTotalChars(raw: number): number {
  if (!Number.isFinite(raw) || raw < MIN_MAX_TOTAL_CHARS) return MIN_MAX_TOTAL_CHARS;
  return Math.min(raw, MAX_MAX_TOTAL_CHARS);
}

function buildCompactedContent(originalContent: string, maxChars: number, docTitle: string, readLevel: string): string {
  const header = `[${docTitle} | 读取级别: ${readLevel}]\n（该证据已完整读取，以下为最终回答阶段预算摘录）\n\n`;

  if (originalContent.length <= maxChars) {
    return header + originalContent;
  }

  const headRatio = 0.45;
  const middleRatio = 0.25;
  const tailRatio = 0.25;

  const headChars = Math.floor(maxChars * headRatio);
  const middleChars = Math.floor(maxChars * middleRatio);
  const tailChars = Math.floor(maxChars * tailRatio);

  const head = originalContent.substring(0, headChars);
  const middleStart = Math.floor((originalContent.length - middleChars) / 2);
  const middle = originalContent.substring(middleStart, middleStart + middleChars);
  const tail = originalContent.substring(originalContent.length - tailChars);

  const result = header + head + "\n\n... 此处因预算省略部分内容 ...\n\n" + middle + "\n\n... 此处因预算省略部分内容 ...\n\n" + tail;

  if (result.length > maxChars) {
    return result.substring(0, maxChars - 3) + "...";
  }

  return result;
}

export function buildComposeEvidencePack(params: BuildComposeEvidencePackParams): ComposeEvidencePackResult {
  const { evidencePack, maxTotalChars, maxCharsPerItem, trace } = params;

  const effectiveMaxTotalChars = clampMaxTotalChars(maxTotalChars);
  const effectiveMaxCharsPerItem = maxCharsPerItem ?? DEFAULT_MAX_CHARS_PER_ITEM;

  const originalContentChars = evidencePack.items.reduce((sum, item) => sum + (item.content?.length ?? 0), 0);

  if (originalContentChars <= effectiveMaxTotalChars) {
    if (trace) {
      console.info("[KB-AGENT | COMPOSE_EVIDENCE_FULLTEXT_USED_SAFE]", {
        itemCount: evidencePack.items.length,
        totalContentChars: originalContentChars,
      });
    }

    return {
      promptEvidencePack: evidencePack,
      compacted: false,
      originalContentChars,
      promptContentChars: originalContentChars,
      truncatedItemCount: 0,
      droppedEvidenceItemCount: 0,
      promptVisibleEvidenceCount: evidencePack.items.length,
      warnings: [],
      rawMaxTotalChars: maxTotalChars,
      effectiveMaxTotalChars,
      effectiveMaxCharsPerItem,
    };
  }

  const warnings: string[] = [];
  let truncatedItemCount = 0;
  let totalPromptChars = 0;
  let droppedEvidenceItemCount = 0;
  let promptVisibleEvidenceCount = 0;

  const compactedItems: AgenticEvidenceItem[] = [];

  const perItemBudget = Math.floor(effectiveMaxTotalChars / evidencePack.items.length);
  const effectivePerItemBudget = Math.min(perItemBudget, effectiveMaxCharsPerItem);

  for (const item of evidencePack.items) {
    const originalContent = item.content ?? "";
    const compactedContent = buildCompactedContent(
      originalContent,
      effectivePerItemBudget,
      item.docTitle,
      item.readLevel,
    );

    const remainingBudget = effectiveMaxTotalChars - totalPromptChars;
    if (remainingBudget <= 0) {
      droppedEvidenceItemCount++;
      truncatedItemCount++;
      continue;
    }

    const usableContent = compactedContent.length > remainingBudget
      ? compactedContent.substring(0, remainingBudget - 3) + "..."
      : compactedContent;

    if (usableContent.length < compactedContent.length) {
      truncatedItemCount++;
    }

    compactedItems.push({
      ...item,
      content: usableContent,
      metadata: {
        ...item.metadata,
        composeCompacted: true,
      },
      truncated: true,
    });

    totalPromptChars += usableContent.length;
    promptVisibleEvidenceCount++;
  }

  const promptEvidencePack: AgenticEvidencePack = {
    items: compactedItems,
    coverage: {
      ...evidencePack.coverage,
    },
    evidenceMode: evidencePack.evidenceMode,
  };

  if (trace) {
    console.info("[KB-AGENT | COMPOSE_EVIDENCE_COMPACTED_SAFE]", {
      originalEvidenceItemCount: evidencePack.items.length,
      promptVisibleEvidenceCount,
      droppedEvidenceItemCount,
      truncatedItemCount,
      originalContentChars,
      promptContentChars: totalPromptChars,
      maxTotalChars: effectiveMaxTotalChars,
      strategy: "equal_budget_order_preserving",
    });
  }

  warnings.push("最终回答阶段已使用预算摘录视图，完整证据仍保留在 Evidence Pack。");

  return {
    promptEvidencePack,
    compacted: true,
    originalContentChars,
    promptContentChars: totalPromptChars,
    truncatedItemCount,
    droppedEvidenceItemCount,
    promptVisibleEvidenceCount,
    warnings,
    rawMaxTotalChars: maxTotalChars,
    effectiveMaxTotalChars,
    effectiveMaxCharsPerItem,
  };
}
