import {
  readNotebrainJson,
  writeNotebrainJson,
} from "../workspace/notebrain-workspace-fs";
import { slugifyNotebrainId } from "../workspace/notebrain-workspace-paths";
import {
  decryptSecretCipherText,
  encryptSecretPlainText,
  isEncryptedSecret,
} from "../../settings/kb-sensitive-secret-crypto";
import type { McpAuthConfig, McpAuthType, McpOAuthConfig, McpServerConfig, McpServerConfigFile } from "./mcp-types";

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

function normalizeMcpOAuth(raw: unknown): McpOAuthConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const result: McpOAuthConfig = {};
  if (typeof o.clientId === "string") result.clientId = o.clientId;
  if (typeof o.authorizationEndpoint === "string") result.authorizationEndpoint = o.authorizationEndpoint;
  if (typeof o.tokenEndpoint === "string") result.tokenEndpoint = o.tokenEndpoint;
  if (Array.isArray(o.scopes)) result.scopes = o.scopes.filter((s): s is string => typeof s === "string");
  if (typeof o.accessToken === "string") result.accessToken = o.accessToken;
  if (typeof o.refreshToken === "string") result.refreshToken = o.refreshToken;
  if (typeof o.expiresAt === "number") result.expiresAt = o.expiresAt;
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeMcpAuth(auth: unknown): McpAuthConfig | undefined {
  if (!auth || typeof auth !== "object") return undefined;
  const raw = auth as Record<string, unknown>;
  const authType = String(raw.type ?? "none");
  if (!["none", "bearer", "apiKey", "customHeaders", "oauth2"].includes(authType)) return undefined;
  const oauth = normalizeMcpOAuth(raw.oauth);
  return {
    type: authType as McpAuthType,
    ...(typeof raw.bearerToken === "string" && raw.bearerToken ? { bearerToken: raw.bearerToken } : {}),
    ...(typeof raw.apiKey === "string" && raw.apiKey ? { apiKey: raw.apiKey } : {}),
    ...(typeof raw.apiKeyHeaderName === "string" && raw.apiKeyHeaderName ? { apiKeyHeaderName: raw.apiKeyHeaderName } : {}),
    ...(normalizeHeaders(raw.headers) ? { headers: normalizeHeaders(raw.headers) } : {}),
    ...(oauth ? { oauth } : {}),
  };
}

function normalizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const headers = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (!key || !key.trim()) continue;
    if (key.includes("\r") || key.includes("\n")) continue;
    if (typeof val !== "string") continue;
    if (val.includes("\r") || val.includes("\n")) continue;
    result[key.trim()] = val;
  }
  return Object.keys(result).length > 0 ? result : undefined;
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
    ...(normalizeMcpAuth(value.auth) ? { auth: normalizeMcpAuth(value.auth) } : {}),
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
  const encrypted = await Promise.all(servers.map(encryptMcpServerSecrets));
  const file = {
    version: 1 as const,
    updatedAt: Date.now(),
    servers: encrypted.map(normalizeMcpServerConfig).filter((item): item is McpServerConfig => item !== null),
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

// ==================== Encryption helpers ====================

const SENSITIVE_KEY_PATTERN = /(key|token|secret|password|authorization)/i;

function isSensitiveEnvKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function isSensitiveHeaderKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/** Encrypt sensitive auth/env fields before saving. Returns a deep copy. */
export async function encryptMcpServerSecrets(
  server: McpServerConfig,
): Promise<McpServerConfig> {
  const copy = JSON.parse(JSON.stringify(server)) as McpServerConfig;

  // Encrypt auth fields if present
  if (copy.auth) {
    if (copy.auth.bearerToken && !isEncryptedSecret(copy.auth.bearerToken)) {
      copy.auth.bearerToken = await encryptSecretPlainText(copy.auth.bearerToken);
    }
    if (copy.auth.apiKey && !isEncryptedSecret(copy.auth.apiKey)) {
      copy.auth.apiKey = await encryptSecretPlainText(copy.auth.apiKey);
    }
    if (copy.auth.headers && typeof copy.auth.headers === "object") {
      const encHeaders: Record<string, string> = {};
      for (const [key, val] of Object.entries(copy.auth.headers)) {
        if (isSensitiveHeaderKey(key)) {
          encHeaders[key] = isEncryptedSecret(val) ? val : await encryptSecretPlainText(val);
        } else {
          encHeaders[key] = val;
        }
      }
      copy.auth.headers = encHeaders;
    }
    if (copy.auth.oauth?.accessToken && !isEncryptedSecret(copy.auth.oauth.accessToken)) {
      copy.auth.oauth.accessToken = await encryptSecretPlainText(copy.auth.oauth.accessToken);
    }
    if (copy.auth.oauth?.refreshToken && !isEncryptedSecret(copy.auth.oauth.refreshToken)) {
      copy.auth.oauth.refreshToken = await encryptSecretPlainText(copy.auth.oauth.refreshToken);
    }
  }

  // Encrypt sensitive env values (works for stdio servers without auth field)
  if (copy.env) {
    const encEnv: Record<string, string> = {};
    for (const [key, val] of Object.entries(copy.env)) {
      if (isSensitiveEnvKey(key)) {
        encEnv[key] = isEncryptedSecret(val) ? val : await encryptSecretPlainText(val);
      } else {
        encEnv[key] = val;
      }
    }
    copy.env = encEnv;
  }
  return copy;
}

function createMcpSecretDecryptError(fieldPath: string): Error {
  return Object.assign(
    new Error("已保存的 MCP 密钥无法解密，请在 MCP Server 编辑页重新填写。"),
    { code: "mcp_secret_decrypt_failed", fieldPath }
  );
}

/** Decrypt all enc:v1 fields for runtime use. Returns a deep copy with plaintext values. */
export async function decryptMcpServerSecrets(
  server: McpServerConfig,
): Promise<McpServerConfig> {
  const copy = JSON.parse(JSON.stringify(server)) as McpServerConfig;

  // Decrypt auth fields if present — any failure throws
  if (copy.auth) {
    if (copy.auth.bearerToken && isEncryptedSecret(copy.auth.bearerToken)) {
      try { copy.auth.bearerToken = await decryptSecretCipherText(copy.auth.bearerToken); }
      catch { throw createMcpSecretDecryptError("auth.bearerToken"); }
    }
    if (copy.auth.apiKey && isEncryptedSecret(copy.auth.apiKey)) {
      try { copy.auth.apiKey = await decryptSecretCipherText(copy.auth.apiKey); }
      catch { throw createMcpSecretDecryptError("auth.apiKey"); }
    }
    if (copy.auth.headers) {
      for (const [key, val] of Object.entries(copy.auth.headers)) {
        if (isEncryptedSecret(val)) {
          try { copy.auth.headers[key] = await decryptSecretCipherText(val); }
          catch { throw createMcpSecretDecryptError(`auth.headers.${key}`); }
        }
      }
    }
    if (copy.auth.oauth?.accessToken && isEncryptedSecret(copy.auth.oauth.accessToken)) {
      try { copy.auth.oauth.accessToken = await decryptSecretCipherText(copy.auth.oauth.accessToken); }
      catch { throw createMcpSecretDecryptError("auth.oauth.accessToken"); }
    }
    if (copy.auth.oauth?.refreshToken && isEncryptedSecret(copy.auth.oauth.refreshToken)) {
      try { copy.auth.oauth.refreshToken = await decryptSecretCipherText(copy.auth.oauth.refreshToken); }
      catch { throw createMcpSecretDecryptError("auth.oauth.refreshToken"); }
    }
  }

  // Decrypt env values — any failure throws
  if (copy.env) {
    for (const [key, val] of Object.entries(copy.env)) {
      if (isEncryptedSecret(val)) {
        try { copy.env[key] = await decryptSecretCipherText(val); }
        catch { throw createMcpSecretDecryptError(`env.${key}`); }
      }
    }
  }
  return copy;
}
