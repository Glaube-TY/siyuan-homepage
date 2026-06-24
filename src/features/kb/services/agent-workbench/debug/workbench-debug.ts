/**
 * Agent Workbench Debug Helper
 *
 * SILENT by default. All debug data is stored to in-memory ring buffers.
 * No automatic console output in normal user sessions.
 *
 * Enable console output:
 *   localStorage.KB_AGENT_WORKBENCH_DEBUG = "1"
 *
 * Single manual entry point (returns data for developer to inspect/copy):
 *   window.__kbAgentDebug("all")   → full debug object
 *   window.__kbAgentDebug("json")  → JSON string of full debug data
 *   window.__kbAgentDebug("status")→ status summary
 *   window.__kbAgentDebug("clear") → clear all debug data
 */

import {
  getLastTurnTrace,
  getRecentTurnTraces,
  clearTurnTraces,
} from "../runtime/turn-trace-store";
import { getLastSecretDiagnostics } from "../../settings/kb-settings-service";

function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem("KB_AGENT_WORKBENCH_DEBUG") === "1";
  } catch {
    return false;
  }
}

function isVerboseStreamDebugEnabled(): boolean {
  try {
    return localStorage.getItem("KB_AGENT_WORKBENCH_VERBOSE_STREAM_DEBUG") === "1";
  } catch {
    return false;
  }
}

let debugEnabled = false;

export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

export function getIsVerboseStreamDebugEnabled(): boolean {
  return isVerboseStreamDebugEnabled();
}

const VERBOSE_STREAM_CHUNK_INTERVAL = 10;

// ─── Text Sanitization ───────────────────────────────────────────────────────

const TEXT_REDACT_KEYS = new Set([
  "question", "query", "text", "keyword", "targetCanonicalText", "primaryQuery",
  "title", "docTitle", "titlePath", "headingPath",
  "content", "preview", "snippet", "raw", "answerText", "sourceQuery",
]);

const ID_REDACT_KEYS = new Set([
  "id", "ids", "docId", "docIds", "blockId", "blockIds", "sourceBlockIds",
  "candidateDocIds", "previousReferenceDocIds", "finalReferenceDocIds",
  "usedReferenceDocIds", "rejectedDocIds", "rejectedBlockIds",
  "inputDocIds", "inputBlockIds", "allowedDocIds", "allowedBlockIds",
  "allowedDocIdSamples", "allowedBlockIdSamples",
  "attemptedDocIds", "failedDocIds",
  "referenceSeedDocIds", "droppedReferenceDocIds",
  "candidateButUnusedDocIds", "targetPreviousDocIds",
  "root_id", "rootId", "parent_id", "parentId",
  "sourceBlockId", "targetBlockId", "refBlockId", "defBlockId",
]);

export function stableShortHash(text: string, maxLen = 8): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `h${Math.abs(hash).toString(36).slice(0, maxLen)}`;
}

export interface SafeTextMeta {
  hasText: boolean;
  chars: number;
  hash?: string;
}

export function safeTextMeta(text: string | undefined | null): SafeTextMeta {
  if (!text || text.length === 0) return { hasText: false, chars: 0 };
  return { hasText: true, chars: text.length, hash: stableShortHash(text) };
}

export function sanitizeDebugPayload(payload: unknown): unknown {
  return safeCloneForDebug(payload, new WeakSet(), TEXT_REDACT_KEYS);
}

function safeCloneForDebug(value: unknown, seen: WeakSet<object>, textRedactKeys: Set<string>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "function") return "[Function]";
  if (typeof value !== "object") return value;

  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Set) {
    return Array.from(value).map((item) => safeCloneForDebug(item, seen, textRedactKeys));
  }
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => { obj[String(k)] = safeCloneForDebug(v, seen, textRedactKeys); });
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeCloneForDebug(item, seen, textRedactKeys));
  }

  const cloned: Record<string, unknown> = {};
  for (const key of Object.keys(value as object)) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && (
      key.toLowerCase().includes("apikey") || key.toLowerCase().includes("api_key") ||
      key.toLowerCase().includes("secret") || key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("authorization") || key.toLowerCase().includes("credential") ||
      key.toLowerCase().includes("password") || key.toLowerCase().includes("private_key") ||
      key.toLowerCase().includes("access_token") || key.toLowerCase().includes("bearer")
    )) {
      cloned[key] = "[REDACTED]";
    } else if (ID_REDACT_KEYS.has(key)) {
      if (Array.isArray(v)) { cloned[key] = { count: v.length }; }
      else if (typeof v === "string") { cloned[key] = "[REDACTED_ID]"; }
      else { cloned[key] = safeCloneForDebug(v, seen, textRedactKeys); }
    } else if (textRedactKeys.has(key)) {
      cloned[key] = safeTextMeta(v as string);
    } else {
      cloned[key] = safeCloneForDebug(v, seen, textRedactKeys);
    }
  }
  return cloned;
}

export function debugStreamChunkIfNeeded(
  _trace: boolean | undefined,
  chunkCount: number,
  fullContentLength: number,
  label: string
): void {
  if (!isVerboseStreamDebugEnabled()) return;
  if (chunkCount % VERBOSE_STREAM_CHUNK_INTERVAL !== 0) return;
  console.info(`[KB-AGENT | ${label}]`, { chunkCount, fullContentLength });
}

// ─── Agent Trace Event Ring Buffer ───────────────────────────────────────────

interface AgentTraceEvent {
  time: string;
  label: string;
  level: "debug" | "info" | "warn" | "error";
  payload: unknown;
}

const MAX_TRACE_EVENTS = 200;
let _lifecycleEvents: AgentTraceEvent[] | null = null;

function getLifecycleEvents(): AgentTraceEvent[] {
  if (!_lifecycleEvents) _lifecycleEvents = [];
  return _lifecycleEvents;
}

export function pushAgentDebugEvent(label: string, payload: unknown, level: "debug" | "info" | "warn" | "error" = "info"): void {
  const events = getLifecycleEvents();
  if (events.length >= MAX_TRACE_EVENTS) {
    events.splice(0, events.length - MAX_TRACE_EVENTS + 1);
  }
  events.push({
    time: new Date().toISOString(),
    label,
    level,
    payload: sanitizeDebugPayload(payload),
  });

  // Only console-print when explicitly enabled
  if (debugEnabled || isDebugEnabled()) {
    const safePayload = sanitizeDebugPayload(payload);
    if (level === "error") console.error(`[KB-AGENT | ${label}]`, safePayload);
    else if (level === "warn") console.warn(`[KB-AGENT | ${label}]`, safePayload);
    else console.info(`[KB-AGENT | ${label}]`, safePayload);
  }
}

export function logKbAgentSafe(label: string, payload: unknown, level: "debug" | "info" | "warn" | "error" = "info"): void {
  pushAgentDebugEvent(label, payload, level);
}

// ─── Data accessors for __kbAgentDebug ───────────────────────────────────────

export interface SchemaSanityResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

let _schemaSanityResult: SchemaSanityResult | null = null;

export function getLifecycleEventCount(): number {
  return getLifecycleEvents().length;
}

export function getLifecycleEventsSnapshot(): AgentTraceEvent[] {
  return getLifecycleEvents().slice();
}

export function clearLifecycleEvents(): void {
  getLifecycleEvents().length = 0;
}

export function setSchemaSanityResult(result: SchemaSanityResult): void {
  _schemaSanityResult = result;
}

export function getSchemaSanityResult(): SchemaSanityResult | null {
  return _schemaSanityResult;
}

export function clearSchemaSanity(): void {
  _schemaSanityResult = null;
}

// ─── MCP Debug Event Ring Buffer ────────────────────────────────────────────

/** Parameters for pushMcpDebugEvent — time is auto-set. */
export interface McpDebugEventParams {
  action: "spawn" | "spawn_error" | "initialize" | "initialize_error" | "tools_list" | "tools_list_error" | "tool_call" | "tool_call_error" | "close";
  serverId?: string;
  transport?: string;
  command?: string;
  resolvedCommand?: string;
  argsPreview?: string[];
  spawnExecutable?: string;
  spawnArgsPreview?: string[];
  exitCode?: number | null;
  stderrPreview?: string;
  toolsCount?: number;
  toolName?: string;
  argumentsPreview?: unknown;
  rawError?: string;
  logPath?: string;
  durationMs?: number;
  /** Working directory used for stdio spawn. */
  cwd?: string;
  /** Notebrain root absolute path resolved for cwd. */
  notebrainRootAbsolutePath?: string;
  /** First entry of PATH env (to confirm which npx/node is used). */
  envPathHead?: string;
}

export interface McpDebugEvent extends McpDebugEventParams {
  time: string;
}

const MAX_MCP_EVENTS = 100;
let _mcpEvents: McpDebugEvent[] | null = null;

function getMcpEvents(): McpDebugEvent[] {
  if (!_mcpEvents) _mcpEvents = [];
  return _mcpEvents;
}

export function pushMcpDebugEvent(params: McpDebugEventParams): void {
  const events = getMcpEvents();
  if (events.length >= MAX_MCP_EVENTS) {
    events.splice(0, events.length - MAX_MCP_EVENTS + 1);
  }
  // Sanitize argumentsPreview — may contain sensitive headers/keys from MCP tool args
  const safeArgs = params.argumentsPreview !== undefined
    ? sanitizeDebugPayload(params.argumentsPreview)
    : undefined;
  const event: McpDebugEvent = { ...params, argumentsPreview: safeArgs, time: new Date().toISOString() };
  events.push(event);

  // Only console-print when explicitly enabled
  if (debugEnabled || isDebugEnabled()) {
    console.info(`[KB-AGENT | MCP ${event.action}]`, sanitizeDebugPayload(event));
  }
}

export function getMcpEventsSnapshot(): McpDebugEvent[] {
  return getMcpEvents().slice();
}

export function clearMcpEvents(): void {
  if (_mcpEvents) _mcpEvents.length = 0;
}

// ─── Web API Debug Event Ring Buffer ────────────────────────────────────────

/** Parameters for pushWebApiDebugEvent — time is auto-set. */
export interface WebApiDebugEventParams {
  method: string;
  urlHost: string;
  path: string;
  status: number;
  durationMs: number;
  responseMode?: string;
  bodyPreview?: string;
  errorCode?: string;
}

export interface WebApiDebugEvent extends WebApiDebugEventParams {
  time: string;
}

const MAX_WEB_API_EVENTS = 100;
let _webApiEvents: WebApiDebugEvent[] | null = null;

function getWebApiEvents(): WebApiDebugEvent[] {
  if (!_webApiEvents) _webApiEvents = [];
  return _webApiEvents;
}

export function pushWebApiDebugEvent(params: WebApiDebugEventParams): void {
  const events = getWebApiEvents();
  if (events.length >= MAX_WEB_API_EVENTS) {
    events.splice(0, events.length - MAX_WEB_API_EVENTS + 1);
  }
  const event: WebApiDebugEvent = { ...params, time: new Date().toISOString() };
  events.push(event);

  if (debugEnabled || isDebugEnabled()) {
    console.info(`[KB-AGENT | WEB_API]`, sanitizeDebugPayload(event));
  }
}

export function getWebApiEventsSnapshot(): WebApiDebugEvent[] {
  return getWebApiEvents().slice();
}

export function clearWebApiEvents(): void {
  if (_webApiEvents) _webApiEvents.length = 0;
}

// ─── Runtime Capability Summary (non-PC filtered/disabled capabilities) ──────

export interface RuntimeCapabilitySummary {
  /** Whether the current environment is PC/Electron. */
  isPcElectron: boolean | null;
  /** Count of lifecycle events tagged as runtime-capability related. */
  runtimeCapabilityEventCount: number;
  /** Labels of runtime-capability related events (e.g. MCP_STDIO_TOOLS_FILTERED). */
  runtimeCapabilityEventLabels: string[];
  /** Total filtered stdio server count across all MCP_STDIO_TOOLS_FILTERED events. */
  totalFilteredStdioServers: number;
  /** Total filtered stdio tool count across all MCP_STDIO_TOOLS_FILTERED events. */
  totalFilteredStdioTools: number;
}

const RUNTIME_CAPABILITY_EVENT_LABELS = new Set([
  "MCP_STDIO_TOOLS_FILTERED",
  "MCP_SYNC_ALL_STDIO_SKIPPED",
  "RUNTIME_TOOLS_DETECTION_SKIPPED",
  "SECRET_DECRYPT_FAILURE",
  "SECRET_CIPHER_PRESERVED",
  "SECRET_CLEAR_REQUESTED",
]);

function buildRuntimeCapabilitySummary(): RuntimeCapabilitySummary {
  const events = getLifecycleEventsSnapshot();
  const capabilityEvents = events.filter((e) => RUNTIME_CAPABILITY_EVENT_LABELS.has(e.label));
  let totalFilteredServers = 0;
  let totalFilteredTools = 0;
  for (const e of capabilityEvents) {
    if (e.label === "MCP_STDIO_TOOLS_FILTERED") {
      const payload = e.payload as Record<string, unknown> | null;
      const sc = typeof payload?.filteredServerCount === "number" ? payload.filteredServerCount : 0;
      const tc = typeof payload?.filteredToolCount === "number" ? payload.filteredToolCount : 0;
      totalFilteredServers += sc;
      totalFilteredTools += tc;
    }
  }
  return {
    isPcElectron: null,
    runtimeCapabilityEventCount: capabilityEvents.length,
    runtimeCapabilityEventLabels: [...new Set(capabilityEvents.map((e) => e.label))],
    totalFilteredStdioServers: totalFilteredServers,
    totalFilteredStdioTools: totalFilteredTools,
  };
}

// ─── Unified Debug Entry Point ───────────────────────────────────────────────

type KbAgentDebugCommand = "all" | "json" | "status" | "clear";

/**
 * Single debug entry point. Call from browser console:
 *   window.__kbAgentDebug()          → full debug object (same as "all")
 *   window.__kbAgentDebug("all")     → full debug object
 *   window.__kbAgentDebug("json")    → JSON string of full debug data
 *   window.__kbAgentDebug("status")  → status summary
 *   window.__kbAgentDebug("clear")   → clear all debug data
 *
 * No console output — browser console shows return value directly.
 */
export function setupAgentDebug(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;

  w.__kbAgentDebug = (command?: KbAgentDebugCommand): unknown => {
    const cmd = command ?? "all";

    if (cmd === "clear") {
      clearTurnTraces();
      clearLifecycleEvents();
      clearSchemaSanity();
      clearMcpEvents();
      clearWebApiEvents();
      return { cleared: true };
    }

    const status = {
      debugEnabled: debugEnabled || isDebugEnabled(),
      verboseStreamDebugEnabled: isVerboseStreamDebugEnabled(),
      lifecycleEventCount: getLifecycleEventCount(),
      recentTurnTraceCount: getRecentTurnTraces().length,
      mcpEventCount: getMcpEventsSnapshot().length,
      webApiEventCount: getWebApiEventsSnapshot().length,
      hasSchemaSanity: _schemaSanityResult !== null,
      lastTurnStatus: getLastTurnTrace()?.status,
      lastTurnSteps: getLastTurnTrace()?.steps,
      runtimeCapabilityEventCount: buildRuntimeCapabilitySummary().runtimeCapabilityEventCount,
    };

    if (cmd === "status") return status;

    const data = {
      status,
      schemaSanity: _schemaSanityResult,
      lastTurnTrace: getLastTurnTrace(),
      recentTurnTraces: getRecentTurnTraces(),
      lifecycleEvents: getLifecycleEventsSnapshot(),
      mcpEvents: getMcpEventsSnapshot(),
      webApiEvents: getWebApiEventsSnapshot(),
      secretDiagnostics: getLastSecretDiagnostics(),
      runtimeCapability: buildRuntimeCapabilitySummary(),
    };

    if (cmd === "json") return JSON.stringify(data, null, 2);
    return data;
  };
}
