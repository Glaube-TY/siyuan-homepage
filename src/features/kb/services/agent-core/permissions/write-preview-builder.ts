import type { NativeTool } from "../tools/native-tool";
import type { ToolPermissionPreview } from "./tool-preview";

const HIGH_RISK_NAMES = new Set([
  "delete_doc",
  "delete_blocks",
  "replace_doc_content",
  "edit_global_memory",
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

function buildEditGlobalMemoryPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  const memory = typeof args.memory === "string" ? args.memory : "";
  const normalized = memory.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const memoryChars = normalized.length;
  const memoryLineCount = normalized ? normalized.split("\n").filter((l) => l.trim()).length : 0;

  const previewParts: string[] = [];
  if (!normalized) {
    previewParts.push("将清空全局记忆");
  } else {
    previewParts.push(`将全量替换全局记忆`);
    previewParts.push(`新记忆：${memoryChars} 字符，${memoryLineCount} 条`);
    const preview = normalized.length > 400 ? `${normalized.slice(0, 397)}...` : normalized;
    previewParts.push(`预览：${preview}`);
  }

  return {
    toolName: tool.name,
    title: tool.title,
    readOnly: false,
    risk: "high",
    argsPreview: { memory: memoryChars > 0 ? `(${memoryChars} 字符)` : "(清空)" },
    summary: previewParts.join("\n"),
  };
}

export function buildToolPermissionPreview(tool: NativeTool, args: Record<string, unknown>): ToolPermissionPreview {
  if (tool.name === "edit_global_memory") {
    return buildEditGlobalMemoryPreview(tool, args);
  }

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

