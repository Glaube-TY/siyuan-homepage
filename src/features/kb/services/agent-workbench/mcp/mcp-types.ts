export type McpTransportType = "stdio" | "http" | "sse";
export type McpRiskLevel = "low" | "medium" | "high";
export type McpAuthType = "none" | "bearer" | "apiKey" | "customHeaders" | "oauth2";

export interface McpOAuthConfig {
  clientId?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  scopes?: string[];
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface McpAuthConfig {
  type: McpAuthType;
  bearerToken?: string;
  apiKey?: string;
  apiKeyHeaderName?: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
}

export interface McpServerConfig {
  id: string;
  title: string;
  enabled: boolean;
  transport: McpTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  timeoutMs?: number;
  trusted?: boolean;
  /** Optional explicit working directory for stdio subprocess (resolved at save time). */
  cwd?: string;
  /** Remote MCP auth configuration (HTTP/SSE only; stdio uses env). */
  auth?: McpAuthConfig;
}

export interface McpServerConfigFile {
  version: 1;
  updatedAt: number;
  servers: McpServerConfig[];
}

/** CWD info returned with sync result for display/debug. */
export interface McpServerCwdInfo {
  /** The actual working directory used for the stdio process. */
  cwd: string;
  /** Notebrain root absolute path (resolved). */
  notebrainRoot: string;
  /** For filesystem preset with "." arg, this is the effective allowed directory. */
  allowedDirHint: string;
}

export interface McpToolIndexEntry {
  serverId: string;
  originalName: string;
  internalName: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  enabled: boolean;
  trusted: boolean;
  riskLevel: McpRiskLevel;
  /** Whether this tool is read-only (no side effects). Derived from MCP annotations or heuristic. */
  readOnly: boolean;
  /** Whether this tool can write/modify state. Inverse of readOnly in practice. */
  canWrite: boolean;
  lastSyncedAt: number;
}

export interface McpToolIndexFile {
  version: 1;
  updatedAt: number;
  tools: McpToolIndexEntry[];
}

