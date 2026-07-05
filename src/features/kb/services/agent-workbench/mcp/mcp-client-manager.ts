import type { McpServerConfig, McpServerCwdInfo, McpToolIndexEntry } from "./mcp-types";
import { normalizeMcpToolEntry, replaceMcpToolsForServer } from "./mcp-tool-index";
import { redactMcpSyncError } from "./mcp-result-normalizer";
import { appendNotebrainLog, createNotebrainLogId } from "../workspace/notebrain-log-service";
import { resolveForSpawn } from "../runtime-tools/runtime-tool-resolver";
import { quoteWindowsCmdArg } from "../runtime-tools/runtime-tool-detector";
import type { RuntimeToolsSettings } from "../../../types/settings";
import { pushMcpDebugEvent } from "../debug/workbench-debug";
import { resolveNotebrainCommandCwd } from "../workspace/notebrain-runtime-env";
import { decryptMcpServerSecrets } from "./mcp-config-store";
import {
  decryptSecretCipherText,
  isEncryptedSecret,
} from "../../settings/kb-sensitive-secret-crypto";

const JSONRPC_VERSION = "2.0";
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-03-26", "2024-11-05"];

// ==================== Runtime settings injection ====================

let _injectedRuntimeSettings: RuntimeToolsSettings | undefined;

/** Inject runtime tools settings (call once at turn start). */
export function setMcpRuntimeSettings(settings: RuntimeToolsSettings): void {
  _injectedRuntimeSettings = settings;
}

function getRuntimeSettings(): RuntimeToolsSettings | undefined {
  return _injectedRuntimeSettings;
}

type JsonRpcId = number | string;

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: any;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

interface MinimalMcpConnection {
  request(method: string, params?: Record<string, unknown>): Promise<any>;
  notify(method: string, params?: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

function createJsonRpcRequest(id: JsonRpcId, method: string, params?: Record<string, unknown>) {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    method,
    ...(params ? { params } : {}),
  };
}

function createJsonRpcNotification(method: string, params?: Record<string, unknown>) {
  return {
    jsonrpc: JSONRPC_VERSION,
    method,
    ...(params ? { params } : {}),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Validate and sanitize MCP auth headers before sending.
 * - Empty keys are removed
 * - Keys/values with \\r or \\n are removed (header injection protection)
 * - Content-type, accept, mcp-protocol-version, mcp-session-id cannot be overridden
 */
function sanitizeMcpAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  const forbiddenKeys = new Set(["content-type", "accept", "mcp-protocol-version", "mcp-session-id"]);
  for (const [key, value] of Object.entries(headers)) {
    if (!key || !key.trim()) continue;
    const lower = key.toLowerCase();
    if (forbiddenKeys.has(lower)) continue;
    if (key.includes("\r") || key.includes("\n")) continue;
    if (value.includes("\r") || value.includes("\n")) continue;
    result[key] = value;
  }
  return result;
}

function hasHeaderCaseInsensitive(headers: Record<string, string>, key: string): boolean {
  const lowerKey = key.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lowerKey);
}

async function resolveMcpAuthHeaders(server: McpServerConfig): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const auth = server.auth;
  if (!auth || auth.type === "none") return headers;

  // Decrypt first — decrypt failure produces empty string, not enc:v1
  const decrypted = await decryptMcpServerSecrets(server);
  const effectiveAuth = decrypted.auth;
  if (!effectiveAuth) return headers;

  switch (effectiveAuth.type) {
    case "bearer":
      if (effectiveAuth.bearerToken) {
        headers["authorization"] = `Bearer ${effectiveAuth.bearerToken}`;
      }
      break;
    case "apiKey":
      if (effectiveAuth.apiKey) {
        const headerName = effectiveAuth.apiKeyHeaderName || "X-API-Key";
        headers[headerName] = effectiveAuth.apiKey;
      }
      break;
    case "oauth2":
      if (effectiveAuth.oauth?.accessToken) {
        headers["authorization"] = `Bearer ${effectiveAuth.oauth.accessToken}`;
      }
      break;
  }

  // Merge additional auth.headers for all types
  // For bearer/apiKey/oauth2, don't let extra headers override the primary auth
  if (effectiveAuth.headers) {
    for (const [key, value] of Object.entries(effectiveAuth.headers)) {
      const lower = key.toLowerCase();
      if (effectiveAuth.type !== "customHeaders") {
        if (lower === "authorization" || lower === (effectiveAuth.apiKeyHeaderName || "x-api-key").toLowerCase()) {
          continue;
        }
      }
      headers[key] = value;
    }
  }

  return sanitizeMcpAuthHeaders(headers);
}

/**
 * Redact sensitive command-line arguments for debug logging.
 * Flags like --token, --api-key, --key, --secret, --password lose their values.
 * KEY=VALUE pairs with sensitive key names also get redacted values.
 */
function redactMcpArgsPreview(args: string[]): string[] {
  const sensitiveFlags = new Set(["--token", "--api-key", "--apikey", "--key", "--secret", "--password", "-t", "-k"]);
  const result: string[] = [];
  let nextRedacted = false;
  for (const arg of args) {
    if (nextRedacted) {
      result.push("***");
      nextRedacted = false;
      continue;
    }
    if (sensitiveFlags.has(arg.toLowerCase())) {
      result.push(arg);
      nextRedacted = true;
      continue;
    }
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 0) {
      const key = arg.slice(0, eqIdx);
      if (/key|token|secret|password|authorization/i.test(key)) {
        result.push(`${key}=***`);
        continue;
      }
    }
    result.push(arg);
  }
  return result;
}

/**
 * Redact sensitive text for debug/log output.
 * Covers Authorization: Bearer xxx, token=xxx, KEY=VALUE patterns, etc.
 */
function redactMcpSecretText(text: string): string {
  if (!text) return text;
  return text
    .replace(/(["']?\s*Authorization\s*:\s*Bearer\s+)\S+/gi, "$1***")
    .replace(/(["']?\s*X-API-Key\s*:\s*)\S+/gi, "$1***")
    .replace(/(["']?\s*Bearer\s+)\S+/gi, "$1***")
    .replace(/(\b(token|api[_-]?key|apiKey|secret|password|access_token|refresh_token|client_secret|accessToken|refreshToken|clientSecret)\s*[:=]\s*)([^\s,;"'}]+)/gi, "$1***")
    .replace(/enc:v1:[A-Za-z0-9+/=]+/g, "enc:v1:***");
}

/** Redact a local absolute path for debug output. Keeps empty string unchanged. */
function redactLocalPath(value: string): string {
  return value ? "[已脱敏]" : "";
}

/**
 * Redact a debug value that may contain object/array/string.
 * For strings, applies redactMcpSyncError. For objects/arrays, redacts recursively.
 */
function redactMcpDebugValue(value: unknown): unknown {
  if (typeof value === "string") return redactMcpSyncError(value);
  if (Array.isArray(value)) return value.map(redactMcpDebugValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/key|token|secret|password|authorization/i.test(k)) {
        out[k] = "***";
      } else {
        out[k] = redactMcpDebugValue(v);
      }
    }
    return out;
  }
  return value;
}

function getWindowRequire(): ((id: string) => any) | null {
  const req = (globalThis as any)?.require ?? (globalThis as any)?.window?.require;
  return typeof req === "function" ? req : null;
}

function parseEventStreamPayload(text: string): any {
  const dataLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  const payload = dataLines.join("\n").trim();
  return payload ? JSON.parse(payload) : null;
}

function takeResponseResult(response: JsonRpcResponse): any {
  if ("error" in response && response.error) {
    throw new Error(response.error.message || `MCP JSON-RPC error ${response.error.code}`);
  }
  return (response as JsonRpcSuccess).result;
}

function normalizeHttpUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error("MCP Server URL 无效。");
  }
}

// ==================== Stdio command resolution helpers ====================

function buildSpawnError(err: any, command: string, hint: string): Error {
  const code = err?.code ?? "";
  const rawMessage = err instanceof Error ? err.message : String(err);
  let message: string;

  if (code === "ENOENT" || rawMessage.includes("ENOENT")) {
    message = `找不到 MCP stdio 命令 "${command}"。${hint}`;
  } else if (code === "EACCES") {
    message = `MCP stdio 命令 "${command}" 无执行权限。${hint}`;
  } else {
    message = `MCP stdio 命令 "${command}" 启动失败: ${rawMessage}`;
  }

  const error = new Error(message);
  (error as any).code = code === "ENOENT" ? "mcp_stdio_command_not_found" : "mcp_stdio_spawn_failed";
  (error as any).originalCode = code;
  return error;
}

/**
 * On Windows, .cmd/.bat files cannot be passed directly to child_process.spawn.
 * They must be invoked via cmd.exe /d /s /c with the command quoted.
 * Returns { executable, args } ready for spawn, or null if no wrapping needed.
 */
function wrapForWindowsSpawn(
  resolvedPath: string,
  originalArgs: string[],
  platform: string,
): { executable: string; args: string[] } | null {
  if (platform !== "win32") return null;
  const lower = resolvedPath.toLowerCase();
  const needsWrap = lower.endsWith(".cmd") || lower.endsWith(".bat");
  if (!needsWrap) return null;

  // Quote each argument individually to handle spaces, quotes, backslashes, @scope/package
  const quotedCmd = quoteWindowsCmdArg(resolvedPath);
  const quotedArgs = originalArgs.map((a) => quoteWindowsCmdArg(a));
  const fullCmd = [quotedCmd, ...quotedArgs].join(" ");

  // cmd.exe /d /s /c "command args"
  // The /s flag tells cmd.exe to handle the outer quotes correctly
  return {
    executable: "cmd.exe",
    args: ["/d", "/s", "/c", fullCmd],
  };
}

class HttpMcpConnection implements MinimalMcpConnection {
  private nextId = 1;
  private sessionId = "";
  private protocolVersion = PROTOCOL_VERSIONS[0];

  constructor(
    private readonly url: URL,
    private readonly timeoutMs: number,
    private readonly resolvedHeaders: Record<string, string> = {},
  ) {}

  setProtocolVersion(version: string) {
    this.protocolVersion = version;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "mcp-protocol-version": this.protocolVersion,
      ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
    };
    // Merge user auth headers LAST so they cannot override MCP protocol headers
    for (const [key, value] of Object.entries(this.resolvedHeaders)) {
      const lower = key.toLowerCase();
      if (lower === "content-type" || lower === "accept" || lower === "mcp-protocol-version" || lower === "mcp-session-id") continue;
      headers[key] = value;
    }
    return headers;
  }

  async request(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    const response = await withTimeout(fetch(this.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(createJsonRpcRequest(id, method, params)),
    }), this.timeoutMs, `MCP ${method}`);
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("text/event-stream")
      ? parseEventStreamPayload(await response.text())
      : await response.json();
    return takeResponseResult(payload as JsonRpcResponse);
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const response = await withTimeout(fetch(this.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(createJsonRpcNotification(method, params)),
    }), this.timeoutMs, `MCP ${method}`);
    if (!response.ok && response.status !== 202) {
      throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
    }
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await fetch(this.url, {
        method: "DELETE",
        headers: this.buildHeaders(),
      });
    } catch {
      // Ignore close failures.
    }
  }
}

class SseMcpConnection implements MinimalMcpConnection {
  private nextId = 1;
  private eventSource: EventSource | null = null;
  private endpointUrl = "";
  private pending = new Map<JsonRpcId, {
    resolve: (value: any) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(
    private readonly url: URL,
    private readonly timeoutMs: number,
    private readonly resolvedHeaders: Record<string, string> = {},
  ) {}

  async start(): Promise<void> {
    const hasAuthHeaders = Object.keys(this.resolvedHeaders).length > 0;

    if (hasAuthHeaders && typeof fetch !== "undefined") {
      await this.startWithFetch();
    } else if (hasAuthHeaders) {
      throw new Error("SSE + 认证 headers 需要 fetch API 支持（当前环境不可用）。建议改用 Streamable HTTP transport 或移除认证配置。");
    } else {
      await this.startWithNativeEventSource();
    }
  }

  private async startWithNativeEventSource(): Promise<void> {
    if (typeof EventSource === "undefined") {
      throw new Error("当前环境不支持 SSE EventSource。");
    }
    await withTimeout(new Promise<void>((resolve, reject) => {
      const es = new EventSource(this.url.href);
      this.eventSource = es;
      es.addEventListener("endpoint", (event) => {
        const data = (event as MessageEvent).data;
        this.endpointUrl = new URL(data, this.url).href;
        resolve();
      });
      es.addEventListener("message", (event) => {
        this.handleServerMessage((event as MessageEvent).data);
      });
      es.onerror = () => {
        if (!this.endpointUrl) reject(new Error("MCP SSE 连接失败。"));
      };
    }), this.timeoutMs, "MCP SSE connect");
  }

  private async startWithFetch(): Promise<void> {
    const response = await withTimeout(
      fetch(this.url.href, {
        method: "GET",
        headers: {
          ...this.resolvedHeaders,
          accept: "text/event-stream",
        },
      }),
      this.timeoutMs,
      "MCP SSE connect",
    );
    if (!response.ok) {
      throw new Error(`MCP SSE 连接返回 ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("MCP SSE 无法读取响应流。");

    const decoder = new TextDecoder();
    let buffer = "";
    let endpointResolved = false;

    const processLine = (line: string) => {
      if (line.startsWith("event: endpoint")) return;
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (!data) return;
        if (!endpointResolved) {
          this.endpointUrl = new URL(data, this.url).href;
          endpointResolved = true;
        } else {
          this.handleServerMessage(data);
        }
      }
    };

    void (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n");
        while (idx >= 0) {
          processLine(buffer.slice(0, idx).trim());
          buffer = buffer.slice(idx + 1);
          idx = buffer.indexOf("\n");
        }
      }
    })();

    await withTimeout(new Promise<void>((resolve, reject) => {
      const check = () => {
        if (this.endpointUrl) { resolve(); return; }
        setTimeout(check, 80);
      };
      setTimeout(check, 80);
      setTimeout(() => reject(new Error("MCP SSE endpoint 未在预期时间内建立。")), this.timeoutMs);
    }), this.timeoutMs, "MCP SSE endpoint");
  }

  private handleServerMessage(data: string) {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(data);
    } catch {
      return;
    }
    if (!("id" in response)) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    try {
      pending.resolve(takeResponseResult(response));
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error("MCP SSE 响应错误。"));
    }
  }

  private async post(message: Record<string, unknown>): Promise<void> {
    if (!this.endpointUrl) throw new Error("MCP SSE endpoint 尚未建立。");
    const response = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.resolvedHeaders,
      },
      body: JSON.stringify(message),
    });
    if (!response.ok && response.status !== 202) {
      throw new Error(`MCP SSE POST ${response.status}`);
    }
  }

  async request(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    const result = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    await this.post(createJsonRpcRequest(id, method, params));
    return result;
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.post(createJsonRpcNotification(method, params));
  }

  async close(): Promise<void> {
    const closeErr = new Error("MCP SSE connection closed.");
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      try { pending.reject(closeErr); } catch { /* Ignore double-reject */ }
      this.pending.delete(id);
    }
    this.eventSource?.close();
    this.eventSource = null;
  }
}

class StdioMcpConnection implements MinimalMcpConnection {
  private nextId = 1;
  private child: any;
  private buffer = "";
  private stderr = "";
  private spawnError: Error | null = null;
  private closed = false;
  private pending = new Map<JsonRpcId, {
    resolve: (value: any) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(
    private readonly config: McpServerConfig,
    private readonly timeoutMs: number,
    private readonly runtimeTools?: RuntimeToolsSettings,
  ) {}

  async start(): Promise<void> {
    const req = getWindowRequire();
    if (!req) {
      throw new Error("stdio MCP 仅支持 PC/Electron 且需要 Node require。");
    }
    const childProcess = req("node:child_process");
    const processModule = req("node:process");

    const rawCommand = this.config.command ?? "";
    // Use explicit runtimeTools if provided, otherwise fall back to global injection
    const runtimeSettings = this.runtimeTools ?? getRuntimeSettings();

    // Resolve notebrain root as cwd for stdio MCP subprocess.
    // Without explicit cwd, subprocess inherits SiYuan's install directory
    // (e.g. C:\APP\SiYuan), which breaks "." args and creates confusion.
    let resolvedCwd: string | null = null;
    try {
      const cwdResult = await resolveNotebrainCommandCwd(".");
      if (cwdResult.ok && cwdResult.absolutePath) {
        resolvedCwd = cwdResult.absolutePath;
      }
    } catch {
      // Fall through — cwd is optional for non-notebrain servers
    }
    if (!resolvedCwd) {
      pushMcpDebugEvent({
        action: "spawn_error",
        serverId: this.config.id,
        transport: "stdio",
        command: rawCommand,
        rawError: "cannot_resolve_notebrain_root_cwd",
      });
    }

    // Use unified resolver to find the actual executable and merged PATH
    const resolved = resolveForSpawn(rawCommand, runtimeSettings);
    const resolvedPath = resolved?.resolvedPath ?? rawCommand;
    const mergedPATH = resolved?.envPATH ?? "";

    // Build spawn env: process.env + merged PATH + server.env
    // server.env takes highest priority, but PATH/Path must use merged version
    const baseEnv = { ...processModule.env };
    if (mergedPATH) {
      baseEnv.PATH = mergedPATH;
      if (processModule.platform === "win32") baseEnv.Path = mergedPATH;
    }
    // Merge server.env on top (but preserve merged PATH)
    const serverEnv = this.config.env ?? {};
    const spawnEnv = { ...baseEnv, ...serverEnv };
    if (mergedPATH) {
      spawnEnv.PATH = mergedPATH;
      if (processModule.platform === "win32") spawnEnv.Path = mergedPATH;
    }

    // Decrypt encrypted env values
    try {
      let decryptFailed = false;
      for (const [key, val] of Object.entries(spawnEnv)) {
        if (typeof val === "string" && isEncryptedSecret(val)) {
          try {
            spawnEnv[key] = await decryptSecretCipherText(val);
          } catch {
            decryptFailed = true;
            pushMcpDebugEvent({
              action: "spawn_error",
              serverId: this.config.id,
              transport: "stdio",
              command: rawCommand,
              rawError: `env_decrypt_failed:${key}`,
            });
          }
        }
        // Also check if value is still enc:v1 (decrypt skipped due to isEncryptedSecret returning false for mutated string)
        if (typeof spawnEnv[key] === "string" && spawnEnv[key].startsWith("enc:v1:")) {
          decryptFailed = true;
          pushMcpDebugEvent({
            action: "spawn_error",
            serverId: this.config.id,
            transport: "stdio",
            command: rawCommand,
            rawError: `env_still_encrypted:${key}`,
          });
        }
      }
      if (decryptFailed) {
        throw Object.assign(
          new Error("已保存的 MCP 密钥无法解密，请在 MCP Server 编辑页重新填写。"),
          { code: "mcp_secret_decrypt_failed" }
        );
      }
    } catch (e: any) {
      if (e?.code === "mcp_secret_decrypt_failed") throw e;
      /* crypto not available, proceed without decryption */
    }

    const originalArgs = this.config.args ?? [];
    const hint = resolved
      ? ""
      : `命令 "${rawCommand}" 未在 PATH 中找到。请在设置 > 本机运行时工具 中配置命令完整路径，或将其所在目录加入 extraPathDirs。`;

    // Windows .cmd/.bat must be spawned via cmd.exe /d /s /c
    const wrapped = wrapForWindowsSpawn(resolvedPath, originalArgs, processModule.platform);
    const spawnCmd = wrapped ? wrapped.executable : resolvedPath;
    const spawnArgs = wrapped ? wrapped.args : originalArgs;

    // Record spawn attempt for debug
    pushMcpDebugEvent({
      action: "spawn",
      serverId: this.config.id,
      transport: "stdio",
      command: rawCommand,
      resolvedCommand: redactLocalPath(resolvedPath),
      argsPreview: redactMcpArgsPreview(originalArgs),
      spawnExecutable: redactLocalPath(spawnCmd),
      spawnArgsPreview: redactMcpArgsPreview(spawnArgs.slice(0, 5)),
      cwd: redactLocalPath(resolvedCwd ?? ""),
      notebrainRootAbsolutePath: redactLocalPath(resolvedCwd ?? ""),
      envPathHead: redactLocalPath((mergedPATH || "").split(/[;:]/)[0] ?? ""),
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let exitBeforeSpawn = false;
      let exitCode: number | null = null;
      let exitStderr = "";

      const child = childProcess.spawn(spawnCmd, spawnArgs, {
        cwd: resolvedCwd ?? undefined,
        env: spawnEnv,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      this.child = child;

      child.stdout?.setEncoding?.("utf8");
      child.stderr?.setEncoding?.("utf8");

      // Collect stderr for error reporting
      child.stderr?.on?.("data", (chunk: string) => {
        this.stderr = `${this.stderr}${String(chunk)}`.slice(-4000);
        exitStderr = this.stderr;
      });

      // Parse stdout for JSON-RPC responses (not used for start resolution)
      child.stdout?.on?.("data", (chunk: string) => {
        this.handleStdout(String(chunk));
      });

      // Resolve on spawn event — process is alive
      child.on?.("spawn", () => {
        if (settled) return;
        // Give the process a brief moment to confirm it doesn't exit immediately
        // This catches cases like "command not found" on some Windows shells
        setTimeout(() => {
          if (settled) return;
          // Check if process already exited (killed or errored)
          if (exitBeforeSpawn) {
            settled = true;
            const errMsg = exitStderr
              ? `MCP stdio 进程启动后立即退出，code=${exitCode ?? "null"}，stderr=${redactMcpSyncError(exitStderr)}`
              : `MCP stdio 进程启动后立即退出，code=${exitCode ?? "null"}`;
            reject(new Error(errMsg));
            return;
          }
          settled = true;
          resolve();
        }, 150); // 150ms grace period for immediate exit detection
      });

      child.on?.("error", (err: any) => {
        this.spawnError = buildSpawnError(err, rawCommand, hint);
        pushMcpDebugEvent({
          action: "spawn_error",
          serverId: this.config.id,
          transport: "stdio",
          command: rawCommand,
          resolvedCommand: redactLocalPath(resolvedPath),
          rawError: redactMcpSyncError(this.spawnError.message),
        });
        if (!settled) {
          settled = true;
          reject(this.spawnError);
        }
      });

      child.on?.("exit", (code: number | null) => {
        exitCode = code;
        exitBeforeSpawn = !settled;
        if (code !== 0 && code !== null) {
          pushMcpDebugEvent({
            action: "spawn_error",
            serverId: this.config.id,
            transport: "stdio",
            command: rawCommand,
            exitCode: code,
            stderrPreview: redactMcpSyncError(this.stderr.slice(-500)),
          });
        }
        const exitErr = this.spawnError
          ?? new Error(`MCP stdio 进程已退出，code=${code ?? "null"}${this.stderr ? `，stderr=${redactMcpSyncError(this.stderr.slice(-500))}` : ""}`);
        // Reject all pending requests
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(exitErr);
          this.pending.delete(id);
        }
        if (!settled) {
          settled = true;
          reject(exitErr);
        }
      });

      // Safety timeout: if spawn event never fires within 5s
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(buildSpawnError(
            { code: "UNKNOWN", message: "进程启动后无响应" },
            rawCommand,
            hint,
          ));
        }
      }, 5000);
    });
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.handleLine(line);
      index = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string) {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    if (!("id" in response)) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    try {
      pending.resolve(takeResponseResult(response));
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error("MCP stdio 响应错误。"));
    }
  }

  private write(message: Record<string, unknown>) {
    if (this.closed) throw new Error("MCP stdio connection closed.");
    if (!this.child?.stdin?.writable) throw new Error("MCP stdio stdin 不可写。");
    this.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  async request(method: string, params?: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    const result = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timeout after ${this.timeoutMs}ms${this.stderr ? `，stderr=${redactMcpSyncError(this.stderr)}` : ""}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.write(createJsonRpcRequest(id, method, params));
    return result;
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    this.write(createJsonRpcNotification(method, params));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const closeErr = new Error("MCP stdio connection closed.");
    // Reject pending requests safely — wrap in try/catch to avoid
    // unhandled promise rejection if consumer already settled
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      try { pending.reject(closeErr); } catch { /* Ignore double-reject */ }
      this.pending.delete(id);
    }
    try {
      this.child?.stdin?.end?.();
    } catch {
      // Ignore close failures.
    }
    try {
      this.child?.kill?.();
    } catch {
      // Ignore close failures.
    }
  }
}

async function createConnection(config: McpServerConfig, runtimeTools?: RuntimeToolsSettings): Promise<MinimalMcpConnection> {
  const timeoutMs = config.timeoutMs ?? 60000;
  if (config.transport === "stdio") {
    const connection = new StdioMcpConnection(config, timeoutMs, runtimeTools);
    await connection.start();
    return connection;
  }
  const authHeaders = await resolveMcpAuthHeaders(config);

  // Check for decrypt failure: auth type requires a token but we got none
  const auth = config.auth;
  if (auth && auth.type !== "none") {
    if ((auth.type === "bearer" && !hasHeaderCaseInsensitive(authHeaders, "authorization")) ||
        (auth.type === "apiKey" && !hasHeaderCaseInsensitive(authHeaders, auth.apiKeyHeaderName || "X-API-Key")) ||
        (auth.type === "oauth2" && !hasHeaderCaseInsensitive(authHeaders, "authorization"))) {
      pushMcpDebugEvent({
        action: "auth_decrypt_failed",
        serverId: config.id,
        authType: auth.type,
      });
      throw Object.assign(
        new Error("已保存的 MCP 密钥无法解密，请在 MCP Server 编辑页重新填写。"),
        { code: "mcp_secret_decrypt_failed" }
      );
    }
  }

  if (config.transport === "sse") {
    const connection = new SseMcpConnection(normalizeHttpUrl(config.url || ""), timeoutMs, authHeaders);
    await connection.start();
    return connection;
  }
  return new HttpMcpConnection(normalizeHttpUrl(config.url || ""), timeoutMs, authHeaders);
}

async function initializeConnection(connection: MinimalMcpConnection): Promise<void> {
  if (connection instanceof StdioMcpConnection) {
    // Stdio: only try the default protocol version.
    // Transport errors (spawn EINVAL, stdin not writable, process exit) cannot be
    // recovered by retrying a different version on the same dead connection.
    try {
      await connection.request("initialize", {
        protocolVersion: PROTOCOL_VERSIONS[0],
        capabilities: {},
        clientInfo: {
          name: "siyuan-homepage-notebrain",
          version: "1.0.0",
        },
      });
      await connection.notify("notifications/initialized");
      return;
    } catch (err) {
      // Re-throw original error — don't let close() or cleanup mask it
      throw err instanceof Error ? err : new Error("MCP initialize failed.");
    }
  }

  // HTTP/SSE: can safely retry multiple protocol versions
  let lastError: unknown;
  for (const protocolVersion of PROTOCOL_VERSIONS) {
    try {
      if (connection instanceof HttpMcpConnection) {
        connection.setProtocolVersion(protocolVersion);
      }
      await connection.request("initialize", {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: "siyuan-homepage-notebrain",
          version: "1.0.0",
        },
      });
      await connection.notify("notifications/initialized");
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("MCP initialize failed.");
}

export async function connectMcpServer(config: McpServerConfig, runtimeTools?: RuntimeToolsSettings): Promise<MinimalMcpConnection> {
  let connection: MinimalMcpConnection | null = null;
  try {
    connection = await createConnection(config, runtimeTools);
    await initializeConnection(connection);
    return connection;
  } catch (err) {
    // Preserve original error — close() must not overwrite it
    if (connection) {
      try { await connection.close(); } catch { /* Ignore close errors */ }
    }
    throw err;
  }
}

export async function listMcpServerTools(config: McpServerConfig, runtimeTools?: RuntimeToolsSettings): Promise<McpToolIndexEntry[]> {
  const connection = await connectMcpServer(config, runtimeTools);
  try {
    const allTools: any[] = [];
    let cursor: string | undefined;
    do {
      const page = await withTimeout(
        connection.request("tools/list", cursor ? { cursor } : undefined),
        config.timeoutMs ?? 60000,
        "MCP tools/list",
      );
      allTools.push(...(Array.isArray(page?.tools) ? page.tools : []));
      cursor = typeof page?.nextCursor === "string" ? page.nextCursor : undefined;
    } while (cursor);
    pushMcpDebugEvent({
      action: "tools_list",
      serverId: config.id,
      transport: config.transport,
      toolsCount: allTools.length,
    });
    return allTools
      .filter((tool) => typeof tool?.name === "string" && tool.name.trim())
      .map((tool) => normalizeMcpToolEntry({
        serverId: config.id,
        tool,
        trusted: config.trusted === true,
      }));
  } finally {
    // close() must not overwrite the real error — swallow close failures
    try { await connection.close(); } catch { /* Ignore close errors */ }
  }
}

export async function syncMcpServerTools(
  config: McpServerConfig,
  runtimeTools?: RuntimeToolsSettings,
): Promise<{
  serverId: string;
  synced: number;
  indexUpdatedAt: number;
  tools: McpToolIndexEntry[];
  cwdInfo?: McpServerCwdInfo;
}> {
  const tools = await listMcpServerTools(config, runtimeTools);

  // Resolve cwd info for the sync result (displayed in UI and debug)
  let cwdInfo: McpServerCwdInfo | undefined;
  if (config.transport === "stdio") {
    try {
      const cwdResult = await resolveNotebrainCommandCwd(".");
      if (cwdResult.ok && cwdResult.absolutePath) {
        cwdInfo = {
          cwd: cwdResult.absolutePath,
          notebrainRoot: cwdResult.rootAbsolutePath ?? cwdResult.absolutePath,
          allowedDirHint: config.args?.includes(".") ? cwdResult.absolutePath : "(see server args)",
        };
      }
    } catch { /* cwd info is best-effort */ }
  }

  const index = await replaceMcpToolsForServer(config.id, tools);
  return {
    serverId: config.id,
    synced: tools.length,
    indexUpdatedAt: index.updatedAt,
    tools,
    ...(cwdInfo ? { cwdInfo } : {}),
  };
}

/**
 * Lightweight diagnostic: check if a stdio command is reachable.
 * Returns null if OK, or a human-readable error string if not.
 * Does NOT spawn the process — only checks PATH and file existence.
 */
export function diagnoseStdioCommand(command: string, runtimeTools?: RuntimeToolsSettings): string | null {
  const req = getWindowRequire();
  if (!req) return "当前环境不支持 stdio MCP（需要 PC/Electron）。";
  try {
    const resolved = resolveForSpawn(command, runtimeTools ?? getRuntimeSettings());
    if (!resolved) {
      return `命令 "${command}" 未在 PATH 中找到。请在设置 > 本机运行时工具 中配置命令完整路径。`;
    }
    return null;
  } catch {
    return `无法诊断命令 "${command}" 的可用性。`;
  }
}

/**
 * Get the resolved path and spawn info for a stdio command.
 * Used by settings UI to display resolved command details.
 */
export function getStdioCommandResolvedInfo(command: string, runtimeTools?: RuntimeToolsSettings): {
  resolvedPath: string;
  usesCmdExe: boolean;
} | null {
  const req = getWindowRequire();
  if (!req) return null;
  try {
    const processModule = req("node:process");
    const resolved = resolveForSpawn(command, runtimeTools ?? getRuntimeSettings());
    if (!resolved) return null;
    const wrapped = wrapForWindowsSpawn(resolved.resolvedPath, [], processModule.platform);
    return {
      resolvedPath: resolved.resolvedPath,
      usesCmdExe: !!wrapped,
    };
  } catch {
    return null;
  }
}

export async function callMcpTool(params: {
  server: McpServerConfig;
  tool: McpToolIndexEntry;
  args: Record<string, unknown>;
}, runtimeTools?: RuntimeToolsSettings): Promise<any> {
  const startedAt = Date.now();
  const logId = createNotebrainLogId("mcp-call");
  const connection = await connectMcpServer(params.server, runtimeTools);
  pushMcpDebugEvent({
    action: "tool_call",
    serverId: params.server.id,
    transport: params.server.transport,
    toolName: params.tool.originalName,
    argumentsPreview: redactMcpDebugValue(params.args),
  });
  try {
    const result = await withTimeout(
      connection.request("tools/call", {
        name: params.tool.originalName,
        arguments: params.args,
      }),
      params.server.timeoutMs ?? 60000,
      "MCP tools/call",
    );
    await appendNotebrainLog({
      id: logId,
      type: "mcp_call",
      startedAt,
      finishedAt: Date.now(),
      ok: !result?.isError,
      toolName: params.tool.internalName,
      source: params.server.id,
      durationMs: Date.now() - startedAt,
      summary: result?.isError ? "MCP 工具返回错误。" : "MCP 工具调用成功。",
      errorCode: result?.isError ? "mcp_tool_error" : undefined,
    });
    // Enhanced debug: record result
    pushMcpDebugEvent({
      action: result?.isError ? "tool_call_error" : "tool_call",
      serverId: params.server.id,
      transport: params.server.transport,
      toolName: params.tool.originalName,
      argumentsPreview: redactMcpDebugValue(params.args),
      durationMs: Date.now() - startedAt,
      rawError: result?.isError ? redactMcpSecretText(JSON.stringify(result).slice(0, 500)) : undefined,
    });
    return result;
  } catch (err) {
    pushMcpDebugEvent({
      action: "tool_call_error",
      serverId: params.server.id,
      transport: params.server.transport,
      toolName: params.tool.originalName,
      rawError: redactMcpSecretText(err instanceof Error ? err.message : String(err)),
      durationMs: Date.now() - startedAt,
    });
    await appendNotebrainLog({
      id: logId,
      type: "mcp_call",
      startedAt,
      finishedAt: Date.now(),
      ok: false,
      toolName: params.tool.internalName,
      source: params.server.id,
      durationMs: Date.now() - startedAt,
      summary: err instanceof Error ? redactMcpSecretText(err.message) : "MCP 工具调用失败。",
      errorCode: "mcp_call_failed",
    });
    // Re-throw with redacted message to prevent token leakage in ToolResult
    const safeMessage = err instanceof Error ? redactMcpSecretText(err.message) : "MCP 工具调用失败。";
    const safeError = new Error(safeMessage);
    if (err instanceof Error && (err as any).code) {
      (safeError as any).code = (err as any).code;
    }
    throw safeError;
  } finally {
    // close() must not overwrite the real error — swallow close failures
    try { await connection.close(); } catch { /* Ignore close errors */ }
  }
}
