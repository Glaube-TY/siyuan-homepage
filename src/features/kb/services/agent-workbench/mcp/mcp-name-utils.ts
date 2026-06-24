import { slugifyNotebrainId } from "../workspace/notebrain-workspace-paths";

function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

export function toMcpSafeName(value: string, fallback: string): string {
  return slugifyNotebrainId(value, fallback).replace(/-/g, "_");
}

export function buildMcpInternalToolName(serverId: string, originalName: string): string {
  const safeServer = toMcpSafeName(serverId, "server");
  const safeTool = toMcpSafeName(originalName, "tool");
  const base = `mcp__${safeServer}__${safeTool}`;
  if (base.length <= 128) return base;
  const hash = shortHash(base);
  return `${base.slice(0, 119)}_${hash}`;
}

