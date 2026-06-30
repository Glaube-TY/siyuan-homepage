/**
 * Build a safe turn stage summary for context compression.
 *
 * This summary is generated at runtime from lightweight turn metadata.
 * It does NOT rely on model-output JSON control flow, planner, or tools.
 * It does NOT contain tool observation raw data, document bodies,
 * markdown/kramdown, snapshots, confirmationId, internal paths, or secrets.
 */

import type { ReferenceItem } from "../../../types/chat";
import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import type { AgentScopeSummary } from "../scope/types";
import { sanitizePersistedSummaryText } from "../../session/persisted-summary-sanitizer";

export interface BuildSafeTurnStageSummaryParams {
  userQuestion: string;
  answer: string;
  footerReferences: ReferenceItem[];
  events: AgentWorkbenchEvent[];
  scopeSummary: AgentScopeSummary;
}

const MAX_STAGE_SUMMARY_CHARS = 1200;
const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_CHARS = 400;
const MAX_TOOL_SUMMARY_CHARS = 150;
const MAX_FOOTER_REFS = 10;

function truncateText(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
}

function formatScopeSummary(scopeSummary: AgentScopeSummary): string {
  const parts: string[] = [scopeSummary.title];
  if (scopeSummary.docCount && scopeSummary.docCount > 0) {
    parts.push(`约${scopeSummary.docCount}篇文档`);
  }
  return `范围：${parts.join("，")}`;
}

function formatToolResults(events: AgentWorkbenchEvent[]): string[] {
  const lines: string[] = [];
  for (const event of events) {
    if (event.type !== "tool_result") continue;
    const summary = sanitizePersistedSummaryText(event.result.summary, MAX_TOOL_SUMMARY_CHARS) ?? "";
    const status = event.result.ok ? "成功" : "失败";
    lines.push(`- ${event.toolName}: ${status}${summary ? `，${summary}` : ""}`);
  }
  return lines;
}

function formatFooterReferences(refs: ReferenceItem[]): string[] {
  const lines: string[] = [];
  for (const ref of refs.slice(0, MAX_FOOTER_REFS)) {
    const title = ref.docTitle?.trim() || ref.displayTitle?.trim() || "未命名";
    lines.push(`- ${title}${ref.docId ? ` (${ref.docId})` : ""}`);
  }
  return lines;
}

export function buildSafeTurnStageSummary(
  params: BuildSafeTurnStageSummaryParams,
): { summary: string } | undefined {
  const answerTrimmed = params.answer.trim();
  if (!answerTrimmed) return undefined;

  const parts: string[] = [];

  parts.push(`用户问题：${truncateText(params.userQuestion, MAX_QUESTION_CHARS)}`);
  parts.push(`助手回答：${truncateText(answerTrimmed, MAX_ANSWER_CHARS)}`);
  parts.push(formatScopeSummary(params.scopeSummary));

  const toolLines = formatToolResults(params.events);
  if (toolLines.length > 0) {
    parts.push(`工具执行：\n${toolLines.join("\n")}`);
  }

  const refLines = formatFooterReferences(params.footerReferences);
  if (refLines.length > 0) {
    parts.push(`参考来源：\n${refLines.join("\n")}`);
  }

  let summary = parts.join("\n\n");
  if (summary.length > MAX_STAGE_SUMMARY_CHARS) {
    summary = `${summary.slice(0, MAX_STAGE_SUMMARY_CHARS - 3)}...`;
  }

  if (summary.trim().length < 10) return undefined;

  return { summary };
}
