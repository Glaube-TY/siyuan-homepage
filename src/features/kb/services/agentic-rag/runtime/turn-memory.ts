/**
 * Agentic RAG Turn Memory
 *
 * Agentic memory 只保存最终回答可见引用，不保存隐藏 Evidence Pack / 检索结果 / 全文。
 *
 * 职责：
 * - 记录 turn 基本信息、scope、answerSummary
 * - 记录 action trace 摘要（toolNames、searchQueries、read counts）
 * - 记录 footer references（最终回答底部显示的参考资料）
 * - 记录 answerItems（结构化回答条目）
 * - 不保存证据正文、Markdown 全文、完整 prompt、完整 observation
 * - 不保存隐藏 Evidence Pack、readEvidenceRefs、evidenceReferences
 */

import type { AgenticRagTurnResult } from "../run-agentic-rag-turn";

export interface AnswerItem {
  itemIndex: number;
  itemText: string;
  usedEvidenceHandles: string[];
}

export interface AgenticRagTurnMemory {
  turnId: string;
  createdAt: number;
  userQuestion: string;
  scope?: {
    type: string;
    docId?: string;
    rootDocId?: string;
    notebookId?: string;
    docIds?: string[];
  };
  answerSummary: string;
  answerItems: AnswerItem[];
  actionTraceSummary: {
    toolNames: string[];
  };
  footerReferenceDocIds: string[];
  footerReferenceTitles: string[];
  workspaceSummary?: {
    candidateDocCount: number;
    candidateBlockCount: number;
    outlineCount: number;
    warnings: string[];
  };
}

export interface BuildAgenticRagTurnMemoryParams {
  turnId: string;
  userQuestion: string;
  answer: string;
  result: AgenticRagTurnResult;
  maxAnswerSummaryChars?: number;
}

function parseAnswerItems(
  answerText: string,
): AnswerItem[] {
  if (!answerText || answerText.trim().length === 0) return [];

  const lines = answerText.split("\n");
  const items: AnswerItem[] = [];
  let currentItem: { index: number; lines: string[]; itemNumber?: number } | null = null;

  for (const line of lines) {
    const numberedMatch = line.match(/^(\d+)[.、)\s]\s*(.*)/);
    const bulletMatch = line.match(/^[-*+]\s+(.*)/);

    if (numberedMatch || bulletMatch) {
      if (currentItem && currentItem.lines.length > 0) {
        items.push({
          itemIndex: items.length,
          itemText: currentItem.lines.join("\n").trim().slice(0, 200),
          usedEvidenceHandles: [],
        });
      }
      const content = numberedMatch ? numberedMatch[2] : bulletMatch[1];
      const itemNumber = numberedMatch ? parseInt(numberedMatch[1], 10) : undefined;
      currentItem = { index: items.length, lines: [content], itemNumber };
    } else if (currentItem && line.trim().length > 0) {
      currentItem.lines.push(line);
    }
  }

  if (currentItem && currentItem.lines.length > 0) {
    items.push({
      itemIndex: items.length,
      itemText: currentItem.lines.join("\n").trim().slice(0, 200),
      usedEvidenceHandles: [],
    });
  }

  if (items.length === 0 && answerText.trim().length > 0) {
    items.push({
      itemIndex: 0,
      itemText: answerText.trim().slice(0, 200),
      usedEvidenceHandles: [],
    });
  }

  return items;
}

export function buildAgenticRagTurnMemory(params: BuildAgenticRagTurnMemoryParams): AgenticRagTurnMemory {
  const { turnId, userQuestion, answer, result, maxAnswerSummaryChars = 300 } = params;

  const answerSummary = answer.length <= maxAnswerSummaryChars
    ? answer
    : answer.slice(0, maxAnswerSummaryChars) + "...";

  const toolNames = (result.actionHistory ?? []).map((a) => a.type);

  const footerReferenceDocIds: string[] = [];
  const footerReferenceTitles: string[] = [];
  for (const ref of result.footerReferences ?? []) {
    if (ref.docId) {
      footerReferenceDocIds.push(ref.docId);
    }
    if (ref.docTitle) {
      footerReferenceTitles.push(ref.docTitle);
    }
  }

  const answerItems = parseAnswerItems(answer);

  const workspace = result.workspace;
  const workspaceSummary = workspace
    ? {
        candidateDocCount: workspace.candidateDocs?.length ?? 0,
        candidateBlockCount: workspace.candidateBlocks?.length ?? 0,
        outlineCount: workspace.docOutlines?.length ?? 0,
        warnings: workspace.warnings?.slice(0, 5) ?? [],
      }
    : undefined;

  return {
    turnId,
    createdAt: Date.now(),
    userQuestion,
    scope: result.scope
      ? {
          type: result.scope.type,
          docId: (result.scope as any).docId,
          rootDocId: (result.scope as any).rootDocId,
          notebookId: (result.scope as any).notebookId,
          docIds: (result.scope as any).docIds,
        }
      : undefined,
    answerSummary,
    answerItems,
    actionTraceSummary: {
      toolNames,
    },
    footerReferenceDocIds,
    footerReferenceTitles,
    workspaceSummary,
  };
}
