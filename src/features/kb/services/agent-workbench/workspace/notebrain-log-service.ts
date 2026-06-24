import { writeNotebrainJson } from "./notebrain-workspace-fs";
import { joinNotebrainRelativePath } from "./notebrain-workspace-paths";
import type { NotebrainLogRecord, NotebrainLogType } from "./notebrain-workspace-types";

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|authorization|cookie|token|secret|password)/i;

export function createNotebrainLogId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

export function sanitizeNotebrainLogValue(value: unknown, maxChars = 600): unknown {
  if (typeof value === "string") {
    return value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeNotebrainLogValue(item, maxChars));
  }
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[redacted]"
      : sanitizeNotebrainLogValue(child, maxChars);
  }
  return out;
}

export async function appendNotebrainLog(record: NotebrainLogRecord): Promise<string> {
  const safeRecord = sanitizeNotebrainLogValue(record, 1200) as NotebrainLogRecord;
  const folderByType: Record<NotebrainLogType, string> = {
    command: "commands",
    skill_install: "skills",
    mcp_call: "mcp",
    workspace_file: "tools",
    tool: "tools",
  };
  const dir = folderByType[record.type] ?? "tools";
  const path = joinNotebrainRelativePath("logs", dir, `${record.id}.json`);
  await writeNotebrainJson(path, safeRecord);
  return path;
}

