import {
  readNotebrainJson,
  writeNotebrainJson,
} from "../workspace/notebrain-workspace-fs";
import type { McpToolIndexEntry, McpToolIndexFile } from "./mcp-types";
import { buildMcpInternalToolName } from "./mcp-name-utils";
import { pushAgentDebugEvent } from "../debug/workbench-debug";

export const MCP_TOOL_INDEX_PATH = "mcp/tool-index.json";

/**
 * Conservative read-only heuristic for MCP tools without annotations.
 * Tool names matching these patterns are assumed read-only.
 */
const READ_ONLY_NAME_PATTERNS = [
  "list", "read", "get", "search", "fetch", "query",
  "directory_tree", "stat", "info", "count", "exists",
  "find", "browse", "ls", "cat", "head", "tail", "grep",
  "diff", "status", "log", "history", "version", "help",
  "ping", "whoami", "echo",
];

/**
 * Classify whether an MCP tool is read-only based on:
 * 1. MCP annotations (readOnlyHint, destructiveHint) if present
 * 2. Conservative heuristic on tool name patterns
 */
function classifyReadOnly(tool: any): { readOnly: boolean; canWrite: boolean } {
  const annotations = tool?.annotations;
  if (annotations && typeof annotations === "object") {
    // MCP spec: readOnlyHint=true means no side effects
    if (annotations.readOnlyHint === true) {
      return { readOnly: true, canWrite: false };
    }
    // destructiveHint=true or openWorldHint=true → definitely writable
    if (annotations.destructiveHint === true || annotations.openWorldHint === true) {
      return { readOnly: false, canWrite: true };
    }
    // readOnlyHint=false → writable
    if (annotations.readOnlyHint === false) {
      return { readOnly: false, canWrite: true };
    }
  }
  // No annotations — use heuristic on tool name
  const name = String(tool?.name ?? "").toLowerCase();
  // Check if any read-only pattern appears as a word boundary match
  for (const pattern of READ_ONLY_NAME_PATTERNS) {
    // Match at start of name or after underscore/hyphen
    if (name === pattern || name.startsWith(pattern + "_") || name.startsWith(pattern + "-")
      || name.includes("_" + pattern + "_") || name.includes("_" + pattern + "-")
      || name.endsWith("_" + pattern) || name.endsWith("-" + pattern)) {
      return { readOnly: true, canWrite: false };
    }
  }
  // Default: assume writable (conservative — safer to require confirmation)
  return { readOnly: false, canWrite: true };
}

export function createEmptyMcpToolIndex(): McpToolIndexFile {
  return { version: 1, updatedAt: 0, tools: [] };
}

export async function loadMcpToolIndex(): Promise<McpToolIndexFile> {
  const file = await readNotebrainJson<McpToolIndexFile>(MCP_TOOL_INDEX_PATH, createEmptyMcpToolIndex());
  const tools = Array.isArray(file.tools)
    ? file.tools.filter((tool) => !!tool?.serverId && !!tool?.internalName)
    : [];
  // Backfill readOnly/canWrite for old entries that predate this field
  for (const tool of tools) {
    if (typeof tool.readOnly !== "boolean") {
      // Conservative default: assume writable (safer for confirmation flow)
      tool.readOnly = false;
      tool.canWrite = true;
    }
    if (typeof tool.canWrite !== "boolean") {
      tool.canWrite = !tool.readOnly;
    }
  }
  return { version: 1, updatedAt: Number(file.updatedAt) || 0, tools };
}

export async function saveMcpToolIndex(index: McpToolIndexFile): Promise<void> {
  await writeNotebrainJson(MCP_TOOL_INDEX_PATH, {
    version: 1,
    updatedAt: index.updatedAt || Date.now(),
    tools: index.tools,
  });
}

export function normalizeMcpToolEntry(params: {
  serverId: string;
  tool: any;
  trusted: boolean;
  now?: number;
}): McpToolIndexEntry {
  const originalName = String(params.tool?.name ?? "").trim();
  const { readOnly, canWrite } = classifyReadOnly(params.tool);
  return {
    serverId: params.serverId,
    originalName,
    internalName: buildMcpInternalToolName(params.serverId, originalName),
    title: typeof params.tool?.title === "string" ? params.tool.title : undefined,
    description: typeof params.tool?.description === "string" ? params.tool.description : undefined,
    inputSchema: params.tool?.inputSchema && typeof params.tool.inputSchema === "object"
      ? params.tool.inputSchema
      : { type: "object", properties: {}, additionalProperties: true },
    outputSchema: params.tool?.outputSchema,
    enabled: true,
    trusted: params.trusted,
    riskLevel: params.trusted ? "low" : "medium",
    readOnly,
    canWrite,
    lastSyncedAt: params.now ?? Date.now(),
  };
}

export async function replaceMcpToolsForServer(
  serverId: string,
  tools: McpToolIndexEntry[],
): Promise<McpToolIndexFile> {
  const current = await loadMcpToolIndex();
  const next: McpToolIndexFile = {
    version: 1,
    updatedAt: Date.now(),
    tools: [
      ...current.tools.filter((entry) => entry.serverId !== serverId),
      ...tools,
    ].sort((a, b) => a.internalName.localeCompare(b.internalName)),
  };
  await saveMcpToolIndex(next);
  return next;
}

/**
 * Remove all tool index entries whose serverId is not in the given set.
 * Used to clean up stale tools from deleted or renamed servers.
 */
export async function removeStaleServerTools(
  validServerIds: Set<string>,
): Promise<McpToolIndexFile> {
  const current = await loadMcpToolIndex();
  const before = current.tools.length;
  const filtered = current.tools.filter((tool) => validServerIds.has(tool.serverId));
  if (filtered.length === before) return current; // No change needed
  const removedCount = before - filtered.length;
  // Debug event
  pushAgentDebugEvent("MCP_STALE_TOOLS_REMOVED", {
    removedCount,
    remainingCount: filtered.length,
  }, "info");
  const next: McpToolIndexFile = {
    version: 1,
    updatedAt: Date.now(),
    tools: filtered.sort((a, b) => a.internalName.localeCompare(b.internalName)),
  };
  await saveMcpToolIndex(next);
  return next;
}

/**
 * Remove all tool index entries for a specific serverId.
 * Returns the number of removed entries and remaining count.
 */
export async function removeMcpToolsForServer(
  serverId: string,
): Promise<{ removedCount: number; remainingCount: number }> {
  const current = await loadMcpToolIndex();
  const before = current.tools.length;
  const filtered = current.tools.filter((tool) => tool.serverId !== serverId);
  const removedCount = before - filtered.length;
  if (removedCount === 0) {
    return { removedCount: 0, remainingCount: filtered.length };
  }
  const next: McpToolIndexFile = {
    version: 1,
    updatedAt: Date.now(),
    tools: filtered.sort((a, b) => a.internalName.localeCompare(b.internalName)),
  };
  await saveMcpToolIndex(next);
  return { removedCount, remainingCount: filtered.length };
}

/** Get all internalName and originalName values for a serverId. Used for settings cleanup. */
export async function getMcpToolNamesForServer(serverId: string): Promise<{ internalNames: string[]; originalNames: string[] }> {
  const index = await loadMcpToolIndex();
  const serverTools = index.tools.filter((t) => t.serverId === serverId);
  const internalNames: string[] = [];
  const originalNames: string[] = [];
  for (const t of serverTools) {
    if (t.internalName) internalNames.push(t.internalName);
    if (t.originalName) originalNames.push(t.originalName);
  }
  return { internalNames, originalNames };
}

