import type { NativeTool } from "../tools/native-tool";
import type { ToolPermissionPreview } from "./tool-preview";

const HIGH_RISK_NAMES = new Set([
  "delete_doc",
  "delete_blocks",
  "replace_doc_content",
]);

const SAFE_ARG_KEYS = new Set([
  "docId",
  "docIds",
  "blockId",
  "blockIds",
  "targetId",
  "title",
  "name",
  "mode",
]);

function compactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(compactValue);
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }
  return "[object]";
}

export function buildToolPermissionPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const argsPreview: Record<string, unknown> = {};
  const safeParts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (SAFE_ARG_KEYS.has(key)) {
      argsPreview[key] = compactValue(value);
      safeParts.push(`${key}=${compactValue(value)}`);
    }
  }
  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: tool.readOnly,
    risk: tool.readOnly ? "low" : HIGH_RISK_NAMES.has(tool.name) ? "high" : "medium",
    argsPreview,
    summary: safeParts.length > 0 ? safeParts.join(", ") : undefined,
  };
}

