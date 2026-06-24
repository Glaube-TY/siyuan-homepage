import {
  readNotebrainJson,
  writeNotebrainJson,
} from "../workspace/notebrain-workspace-fs";
import { slugifyNotebrainId } from "../workspace/notebrain-workspace-paths";
import type { McpServerConfig, McpServerConfigFile } from "./mcp-types";

export const MCP_SERVERS_PATH = "mcp/servers.json";

export function createEmptyMcpServerConfigFile(): McpServerConfigFile {
  return { version: 1, updatedAt: 0, servers: [] };
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

function normalizeEnv(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (typeof raw === "string") out[key.trim()] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeMcpServerConfig(raw: unknown): McpServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = slugifyNotebrainId(value.id || value.title || value.command || value.url, "mcp-server");
  const transport = value.transport === "stdio" || value.transport === "http" || value.transport === "sse"
    ? value.transport
    : "http";
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : id;
  const command = typeof value.command === "string" ? value.command.trim() : undefined;
  const url = typeof value.url === "string" ? value.url.trim() : undefined;
  if (transport === "stdio" && !command) return null;
  if ((transport === "http" || transport === "sse") && !url) return null;
  return {
    id,
    title,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    transport,
    ...(command ? { command } : {}),
    ...(url ? { url } : {}),
    ...(normalizeStringArray(value.args) ? { args: normalizeStringArray(value.args) } : {}),
    ...(normalizeEnv(value.env) ? { env: normalizeEnv(value.env) } : {}),
    timeoutMs: typeof value.timeoutMs === "number" && Number.isFinite(value.timeoutMs)
      ? Math.max(5000, Math.min(Math.round(value.timeoutMs), 600000))
      : 60000,
    trusted: typeof value.trusted === "boolean" ? value.trusted : false,
    ...(typeof value.cwd === "string" && value.cwd.trim() ? { cwd: value.cwd.trim() } : {}),
  };
}

export async function loadMcpServers(): Promise<McpServerConfigFile> {
  const file = await readNotebrainJson<McpServerConfigFile>(MCP_SERVERS_PATH, createEmptyMcpServerConfigFile());
  const servers = Array.isArray(file.servers)
    ? file.servers.map(normalizeMcpServerConfig).filter((item): item is McpServerConfig => item !== null)
    : [];
  return { version: 1, updatedAt: Number(file.updatedAt) || 0, servers };
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<McpServerConfigFile> {
  const file = {
    version: 1 as const,
    updatedAt: Date.now(),
    servers: servers.map(normalizeMcpServerConfig).filter((item): item is McpServerConfig => item !== null),
  };
  await writeNotebrainJson(MCP_SERVERS_PATH, file);
  return file;
}

export async function upsertMcpServer(server: McpServerConfig): Promise<McpServerConfigFile> {
  const current = await loadMcpServers();
  const normalized = normalizeMcpServerConfig(server);
  if (!normalized) throw new Error("MCP Server 配置不完整。");
  const next = [
    ...current.servers.filter((item) => item.id !== normalized.id),
    normalized,
  ].sort((a, b) => a.id.localeCompare(b.id));
  return saveMcpServers(next);
}

