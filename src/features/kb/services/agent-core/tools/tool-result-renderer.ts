import type { ExecutionOutcome } from "../../agent-workbench/runtime/tool-executor";
import type { ToolExecutionResult } from "./native-tool";
import { stringifyToolResultContent } from "./tool-execution-result";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readStringArray(value: unknown, limit: number): string[] | undefined {
  const arr = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const out = arr
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
  return out.length > 0 ? out : undefined;
}

export function buildSafeTargetPreviewFromArgs(args: Record<string, unknown>, toolName: string): ToolExecutionResult["safeTargetPreview"] {
  const docIds = readStringArray(args.docIds ?? args.docId, 10);
  const blockIds = readStringArray(args.blockIds ?? args.blockId, 20);
  const titles = readStringArray(args.title, 10);
  const targetId = typeof args.targetId === "string" ? args.targetId.trim() : "";

  const docTargetTools = new Set([
    "get_doc_info", "read_docs", "rename_doc", "delete_doc", "create_doc", "replace_doc_content",
  ]);

  const safe = {
    targetDocIds: docIds,
    targetBlockIds: blockIds,
    targetTitles: titles,
  };

  if (targetId) {
    if (docTargetTools.has(toolName)) {
      safe.targetDocIds = [...(safe.targetDocIds ?? []), targetId].slice(0, 10);
    } else {
      safe.targetBlockIds = [...(safe.targetBlockIds ?? []), targetId].slice(0, 20);
    }
  }

  return safe.targetDocIds || safe.targetBlockIds || safe.targetTitles ? safe : undefined;
}

export function executionOutcomeToNativeResult(
  outcome: ExecutionOutcome,
  args: Record<string, unknown>,
): ToolExecutionResult {
  const content = asRecord(outcome.observation.content);
  const error = asRecord(content?.error);
  const data = outcome.observation.content;
  const safeTargetPreview = buildSafeTargetPreviewFromArgs(args, outcome.toolName);

  if (outcome.ok) {
    return {
      ok: true,
      summary: outcome.observation.summary ?? `Tool ${outcome.toolName} completed.`,
      content: stringifyToolResultContent({
        ok: true,
        toolName: outcome.toolName,
        data,
      }),
      data,
      safeTargetPreview,
    };
  }

  return {
    ok: false,
    summary: outcome.observation.summary ?? "Tool execution failed.",
    errorCode: outcome.observation.reasonCode ?? (typeof error?.code === "string" ? error.code : "tool_execution_failed"),
    content: stringifyToolResultContent({
      ok: false,
      toolName: outcome.toolName,
      code: (error && typeof error.code === "string" ? error.code : null) ?? outcome.observation.reasonCode ?? "tool_execution_failed",
      message: outcome.observation.summary ?? "Tool execution failed.",
    }),
    data,
    safeTargetPreview: {
      ...safeTargetPreview,
      reasonCode: outcome.observation.reasonCode,
    },
  };
}

