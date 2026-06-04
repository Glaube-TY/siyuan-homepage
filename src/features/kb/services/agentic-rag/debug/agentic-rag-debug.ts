/**
 * Agentic RAG Debug Helper
 *
 * 轻量调试日志输出，只在 trace=true 或 localStorage KB_AGENTIC_RAG_DEBUG="1" 时生效。
 *
 * 职责：
 * - 每条日志带 turnId / loopIndex / phase
 * - 不输出完整 prompt、完整正文、完整 markdown、API key、模型密钥
 * - 只输出计数、action type、原因摘要
 * - 不输出真实 docId/blockId，只输出数量
 * - 关键日志使用 console.info 确保默认可见，低价值细节用 console.debug
 */

function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem("KB_AGENTIC_RAG_DEBUG") === "1";
  } catch {
    return false;
  }
}

function isVerboseStreamDebugEnabled(): boolean {
  try {
    return localStorage.getItem("KB_AGENTIC_RAG_VERBOSE_STREAM_DEBUG") === "1";
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

// ─── Text Sanitization for Debug/Trace ───────────────────────────────────────

const TEXT_REDACT_KEYS = new Set([
  "question", "query", "text", "keyword", "targetCanonicalText", "primaryQuery",
  "title", "docTitle", "titlePath", "headingPath",
  "content", "preview", "snippet", "raw", "answerText", "sourceQuery",
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
  if (!text || text.length === 0) {
    return { hasText: false, chars: 0 };
  }
  return {
    hasText: true,
    chars: text.length,
    hash: stableShortHash(text),
  };
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
    value.forEach((v, k) => {
      obj[String(k)] = safeCloneForDebug(v, seen, textRedactKeys);
    });
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeCloneForDebug(item, seen, textRedactKeys));
  }

  const cloned: Record<string, unknown> = {};
  for (const key of Object.keys(value as object)) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && (key.toLowerCase().includes("apikey") || key.toLowerCase().includes("secret") || key.toLowerCase().includes("token"))) {
      cloned[key] = "[REDACTED]";
    } else if (ID_REDACT_KEYS.has(key)) {
      if (Array.isArray(v)) {
        cloned[key] = { count: v.length };
      } else if (typeof v === "string") {
        cloned[key] = "[REDACTED_ID]";
      } else {
        cloned[key] = safeCloneForDebug(v, seen, textRedactKeys);
      }
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
  console.info(`[KB-AGENT | ${label}]`, {
    chunkCount,
    fullContentLength,
  });
}

function shouldLog(trace?: boolean): boolean {
  return debugEnabled || trace === true || isDebugEnabled();
}

function tag(loopIndex?: number, phase?: string): string {
  const parts: string[] = ["KB-AGENT"];
  if (loopIndex !== undefined) parts.push(`L${loopIndex}`);
  if (phase) parts.push(phase);
  return `[${parts.join(" | ")}]`;
}

function shortText(text: string, maxLen = 80): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

// ─── Agent Trace Dump ────────────────────────────────────────────────────────

interface AgentTraceEvent {
  time: string;
  label: string;
  level: "debug" | "info" | "warn" | "error";
  payload: unknown;
}

const MAX_TRACE_EVENTS = 500;

function getTraceEvents(): AgentTraceEvent[] {
  if (typeof window === "undefined") return [];
  const w = window as unknown as Record<string, unknown>;
  if (!w.__KB_AGENT_TRACE_EVENTS) {
    w.__KB_AGENT_TRACE_EVENTS = [];
  }
  return w.__KB_AGENT_TRACE_EVENTS as AgentTraceEvent[];
}

const ID_REDACT_KEYS = new Set([
  "id", "ids",
  "docId", "docIds",
  "blockId", "blockIds",
  "sourceBlockIds",
  "candidateDocIds",
  "previousReferenceDocIds",
  "finalReferenceDocIds",
  "usedReferenceDocIds",
  "rejectedDocIds",
  "rejectedBlockIds",
  "inputDocIds",
  "inputBlockIds",
  "allowedDocIds",
  "allowedBlockIds",
  "allowedDocIdSamples",
  "allowedBlockIdSamples",
  "attemptedDocIds",
  "failedDocIds",
  "referenceSeedDocIds",
  "previousReferenceDocIds",
  "droppedReferenceDocIds",
  "candidateButUnusedDocIds",
  "targetPreviousDocIds",
  "root_id", "rootId",
  "parent_id", "parentId",
  "sourceBlockId", "targetBlockId",
  "refBlockId", "defBlockId",
]);

export function pushAgentDebugEvent(label: string, payload: unknown, level: "debug" | "info" | "warn" | "error" = "info"): void {
  if (typeof window === "undefined") return;
  const events = getTraceEvents();
  if (events.length >= MAX_TRACE_EVENTS) {
    events.splice(0, events.length - MAX_TRACE_EVENTS + 1);
  }
  events.push({
    time: new Date().toISOString(),
    label,
    level,
    payload: sanitizeDebugPayload(payload),
  });

  exposeWindowDebugMethods();

  if (debugEnabled || isDebugEnabled()) {
    const safePayload = sanitizeDebugPayload(payload);
    console.info(`[KB-AGENT | ${label}]`, safePayload);
  }
}

export function logKbAgentSafe(label: string, payload: unknown, level: "debug" | "info" | "warn" | "error" = "info", trace?: boolean): void {
  const safePayload = sanitizeDebugPayload(payload);
  if (level === "error" || level === "warn") {
    if (level === "error") {
      console.error(`[KB-AGENT | ${label}]`, safePayload);
    } else {
      console.warn(`[KB-AGENT | ${label}]`, safePayload);
    }
    pushAgentDebugEvent(label, payload, level);
    return;
  }
  if (!shouldLog(trace)) return;
  if (level === "debug") {
    console.debug(`[KB-AGENT | ${label}]`, safePayload);
  } else {
    console.info(`[KB-AGENT | ${label}]`, safePayload);
  }
  pushAgentDebugEvent(label, payload, level);
}

function exposeWindowDebugMethods(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;

  w.__KB_AGENT_TRACE_EVENTS = w.__KB_AGENT_TRACE_EVENTS || [];

  if (!w.__kbAgentDumpTrace) {
    w.__kbAgentDumpTrace = () => (w.__KB_AGENT_TRACE_EVENTS as AgentTraceEvent[]);
  }

  // ── __kbAgentCopyTrace: 默认复制最近一次 V3 turn 结构化 trace ──
  if (!w.__kbAgentCopyTrace) {
    w.__kbAgentCopyTrace = async () => {
      const v3Turn = w.__kbAgentLastV3Turn as {
        turnId?: string;
        finalStatus?: string;
        plannerDecisions?: unknown[];
        toolExecutions?: unknown[];
        observations?: unknown[];
        turnDiagnostics?: Record<string, unknown>;
      } | null;

      if (!v3Turn) {
        console.info("[KB-AGENT] 没有可用的 V3 turn 数据");
        return null;
      }

      const diagnostics = {
        llmPlannerCallCount: (v3Turn.turnDiagnostics?.llmPlannerCallCount as number) ?? 0,
        progressAnswerCount: (v3Turn.turnDiagnostics?.progressAnswerCount as number) ?? 0,
        searchCallCount: (v3Turn.turnDiagnostics?.searchCallCount as number) ?? 0,
        listMapCallCount: (v3Turn.turnDiagnostics?.listMapCallCount as number) ?? 0,
        readCandidateDocsExecuteCount: (v3Turn.turnDiagnostics?.readCandidateDocsExecuteCount as number) ?? 0,
        readSuccessItemCount: (v3Turn.turnDiagnostics?.readSuccessItemCount as number) ?? 0,
        emptyContentCount: (v3Turn.turnDiagnostics?.emptyContentCount as number) ?? 0,
        containerWithoutContentCount: (v3Turn.turnDiagnostics?.containerWithoutContentCount as number) ?? 0,
        finalAnswerDecisionCount: (v3Turn.turnDiagnostics?.finalAnswerDecisionCount as number) ?? 0,
        docIdCount: (v3Turn.turnDiagnostics?.docIdCount as number) ?? 0,
        blockIdCount: (v3Turn.turnDiagnostics?.blockIdCount as number) ?? 0,
        resolvedDocCount: (v3Turn.turnDiagnostics?.resolvedDocCount as number) ?? 0,
        resolvedBlockCount: (v3Turn.turnDiagnostics?.resolvedBlockCount as number) ?? 0,
        resourceMismatchCount: (v3Turn.turnDiagnostics?.resourceMismatchCount as number) ?? 0,
      };

      const traceData = {
        turnId: v3Turn.turnId || "",
        finalStatus: v3Turn.finalStatus || "",
        plannerDecisions: v3Turn.plannerDecisions || [],
        toolExecutions: v3Turn.toolExecutions || [],
        observations: v3Turn.observations || [],
        diagnostics,
      };

      const json = JSON.stringify(traceData, null, 2);
      w.__kbAgentLastTurnTraceJson = json;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(json);
          console.info("[KB-AGENT] 已复制最近一次 V3 turn trace JSON 到剪贴板", diagnostics);
        } else {
          console.info("[KB-AGENT] clipboard 不可用，JSON 已写入 window.__kbAgentLastTurnTraceJson");
        }
      } catch (e) {
        w.__kbAgentLastTurnTraceJson = json;
        console.log(json);
        console.info("[KB-AGENT] 复制失败，JSON 已写入 window.__kbAgentLastTurnTraceJson 并输出到 console");
      }
      return json;
    };
  }

  // ── __kbAgentCopyLifecycleTrace: 复制完整生命周期 trace ──
  if (!w.__kbAgentCopyLifecycleTrace) {
    w.__kbAgentCopyLifecycleTrace = async () => {
      const v3Turn = w.__kbAgentLastV3Turn;
      const traceData = {
        lifecycleEvents: w.__KB_AGENT_TRACE_EVENTS,
        v3Turn: v3Turn || null,
      };
      const json = JSON.stringify(traceData, null, 2);
      w.__kbAgentLifecycleTraceJson = json;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(json);
          console.info("[KB-AGENT] 已复制完整生命周期 trace JSON 到剪贴板", {
            lifecycleEvents: (w.__KB_AGENT_TRACE_EVENTS as AgentTraceEvent[]).length,
            hasV3Turn: !!v3Turn,
            v3Steps: v3Turn ? (v3Turn as { plannerDecisions?: unknown[] }).plannerDecisions?.length : 0,
          });
        } else {
          console.info("[KB-AGENT] clipboard 不可用，JSON 已写入 window.__kbAgentLifecycleTraceJson");
        }
      } catch {
        console.info("[KB-AGENT] 复制失败，JSON 已写入 window.__kbAgentLifecycleTraceJson");
      }
      return json;
    };
  }

  // ── __kbAgentCopyLastTurnTrace: 与 __kbAgentCopyTrace 输出一致 ──
  if (!w.__kbAgentCopyLastTurnTrace) {
    w.__kbAgentCopyLastTurnTrace = async () => {
      // 委托给 __kbAgentCopyTrace
      return await (w.__kbAgentCopyTrace as () => Promise<string | null>)();
    };
  }

  if (!w.__kbAgentDownloadTrace) {
    w.__kbAgentDownloadTrace = () => {
      const json = JSON.stringify(w.__KB_AGENT_TRACE_EVENTS, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `kb-agent-trace-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.info("[KB-AGENT] 已下载 trace 文件，共", (w.__KB_AGENT_TRACE_EVENTS as AgentTraceEvent[]).length, "条事件");
    };
  }

  if (!w.__kbAgentClearTrace) {
    w.__kbAgentClearTrace = () => {
      (w.__KB_AGENT_TRACE_EVENTS as AgentTraceEvent[]).length = 0;
      console.info("[KB-AGENT] 已清空 trace 事件");
    };
  }
}

let traceHintShown = false;

function showTraceHintOnce(): void {
  if (traceHintShown) return;
  traceHintShown = true;
  console.info("[KB-AGENT] 调试日志已启用。可运行 window.__kbAgentCopyTrace() 复制最近一次 V3 turn JSON，或 window.__kbAgentCopyLifecycleTrace() 复制完整生命周期 JSON。");
  exposeWindowDebugMethods();
}

// ─── End Agent Trace Dump ────────────────────────────────────────────────────

export function buildSearchScopeArgsSummary(args: Record<string, unknown> | undefined): object | undefined {
  if (!args) return undefined;
  const queries = args.queries as Array<{ text?: string; mode?: string; keywordQuery?: string; fuzzyQuery?: string }> | undefined;
  const includeDocIds = args.includeDocIds as string[] | undefined;
  return {
    queries: (queries ?? []).slice(0, 3).map((q) => ({
      text: q.text ? safeTextMeta(q.text) : undefined,
      mode: q.mode,
      keywordQuery: q.keywordQuery ? safeTextMeta(q.keywordQuery) : undefined,
      fuzzyQuery: q.fuzzyQuery ? safeTextMeta(q.fuzzyQuery) : undefined,
    })),
    limit: args.limit,
    includeDocIdCount: includeDocIds?.length ?? 0,
    excludeAlreadyRead: args.excludeAlreadyRead,
  };
}

export function buildReadDocsArgsSummary(args: Record<string, unknown> | undefined): object | undefined {
  if (!args) return undefined;
  const docIds = args.docIds as string[] | undefined;
  return { docIdCount: docIds?.length ?? 0 };
}

export function buildListScopeDocsArgsSummary(args: Record<string, unknown> | undefined): object | undefined {
  if (!args) return undefined;
  return { query: args.query ? safeTextMeta(String(args.query)) : undefined, limit: args.limit };
}

export function debugLog(trace: boolean | undefined, loopIndex: number | undefined, phase: string, ...args: unknown[]): void {
  if (!shouldLog(trace)) return;
  console.debug(tag(loopIndex, phase), ...args);
}

export function debugWarn(trace: boolean | undefined, loopIndex: number | undefined, phase: string, ...args: unknown[]): void {
  if (!shouldLog(trace)) return;
  console.warn(tag(loopIndex, phase), ...args);
}

export function debugTurnStart(trace: boolean | undefined, question: string, mode: string, scopeType: string, maxSteps: number): void {
  if (!shouldLog(trace)) return;
  const qMeta = safeTextMeta(question);
  const payload = {
    hasQuestion: qMeta.hasText,
    questionChars: qMeta.chars,
    questionHash: qMeta.hash,
    mode,
    scopeType,
    maxSteps,
  };
  console.info("[KB-AGENT | TURN_START]", payload);
  pushAgentDebugEvent("TURN_START", payload, "info");
  showTraceHintOnce();
}

export function debugDecideStart(trace: boolean | undefined, loopIndex: number): void {
  if (!shouldLog(trace)) return;
  console.debug(tag(loopIndex, "DECIDE_START"));
}

export function debugDecideEnd(trace: boolean | undefined, loopIndex: number, actionType: string, reason: string): void {
  if (!shouldLog(trace)) return;
  const payload = { actionType, reason: shortText(reason) };
  console.info(tag(loopIndex, "DECIDE_END"), payload);
  pushAgentDebugEvent("DECIDE_END", payload, "info");
}

export function debugValidate(trace: boolean | undefined, loopIndex: number, success: boolean, actionType: string): void {
  if (!shouldLog(trace)) return;
  console.debug(tag(loopIndex, "VALIDATE"), { success, actionType });
}

export function debugExecStart(trace: boolean | undefined, loopIndex: number, toolName: string): void {
  if (!shouldLog(trace)) return;
  const payload = { toolName };
  console.info(tag(loopIndex, "EXEC_START"), payload);
  pushAgentDebugEvent("EXEC_START", payload, "info");
}

export function debugExecEnd(trace: boolean | undefined, loopIndex: number, toolName: string, durationMs: number, success: boolean, counts?: Record<string, number>, detail?: { error?: string; warning?: string; argsSummary?: object; documentsCount?: number; failedDocIds?: string[]; attemptedDocIds?: string[]; candidateDocCount?: number; candidateBlockCount?: number }): void {
  if (!shouldLog(trace)) return;

  const base = { toolName, durationMs, success, counts, error: detail?.error, warning: detail?.warning };

  let payload: Record<string, unknown>;
  if (toolName === "search_scope") {
    const args = detail?.argsSummary as Record<string, unknown> | undefined;
    const queries = (args?.queries as Array<Record<string, unknown>> | undefined) ?? [];
    const queryCount = queries.length;
    let hasQuery = false;
    let queryChars = 0;
    let queryHash: string | undefined;
    for (const q of queries) {
      const textMeta = q.text as SafeTextMeta | undefined;
      const kwMeta = q.keywordQuery as SafeTextMeta | undefined;
      const fuzzyMeta = q.fuzzyQuery as SafeTextMeta | undefined;
      if (textMeta?.hasText || kwMeta?.hasText || fuzzyMeta?.hasText) {
        hasQuery = true;
      }
      const chars = (textMeta?.chars ?? 0) + (kwMeta?.chars ?? 0) + (fuzzyMeta?.chars ?? 0);
      queryChars += chars;
      if (!queryHash && (textMeta?.hash || kwMeta?.hash || fuzzyMeta?.hash)) {
        queryHash = textMeta?.hash || kwMeta?.hash || fuzzyMeta?.hash;
      }
    }
    payload = {
      ...base,
      queryCount,
      hasQuery,
      queryChars,
      queryHash,
      candidateDocCount: detail?.candidateDocCount ?? counts?.candidateDocCount ?? 0,
      candidateBlockCount: detail?.candidateBlockCount ?? counts?.candidateBlockCount ?? 0,
    };
  } else {
    payload = base;
  }

  console.info(tag(loopIndex, "EXEC_END"), payload);
  pushAgentDebugEvent("EXEC_END", payload, success ? "info" : "warn");
}

export function debugCandidateDocs(trace: boolean | undefined, loopIndex: number, docs: Array<{ docId: string; title: string; titlePath?: string; provenance?: string; sourceQueryMeta?: SafeTextMeta; inventoryOnly?: boolean; relevanceScore?: number }>): void {
  if (!shouldLog(trace)) return;
  const previews = docs.slice(0, 10).map((d) => ({
    titleHash: stableShortHash(d.title),
    provenance: d.provenance,
    queryMeta: d.sourceQueryMeta,
    inventoryOnly: d.inventoryOnly,
    relevanceScore: d.relevanceScore,
  }));
  const payload = {
    totalCount: docs.length,
    previews,
  };
  console.info(tag(loopIndex, "CANDIDATE_DOCS"), payload);
  pushAgentDebugEvent("CANDIDATE_DOCS", payload, "info");
}

export interface CandidateDocDetail {
  index: number;
  docId: string;
  title: string;
  titlePath?: string;
  parentTitles?: string[];
  score?: number;
  source?: string;
  preview?: string;
}

export function debugCandidateDocsDetail(trace: boolean | undefined, loopIndex: number, docs: CandidateDocDetail[]): void {
  if (!shouldLog(trace)) return;
  const maxCount = Math.min(docs.length, 8);
  const details = docs.slice(0, maxCount).map((d) => ({
    index: d.index,
    titleHash: stableShortHash(d.title),
    score: d.score,
    source: d.source,
    preview: safeTextMeta(d.preview),
    hasValidDocId: d.docId.length > 0 && !d.docId.includes(" ") && !/[\u4e00-\u9fff]/.test(d.docId),
  }));
  const payload = {
    totalCount: docs.length,
    details,
  };
  console.info(tag(loopIndex, "CANDIDATE_DOCS_DETAIL"), payload);
  pushAgentDebugEvent("CANDIDATE_DOCS_DETAIL", payload, "info");
}

export function debugReadDocsPlan(trace: boolean | undefined, loopIndex: number, docIds: string[], docMeta?: Array<{ docId: string; title: string; provenance?: string; inventoryOnly?: boolean }>): void {
  if (!shouldLog(trace)) return;
  const meta = (docMeta ?? []).slice(0, 5).map((d) => ({
    titleHash: stableShortHash(d.title),
    provenance: d.provenance,
    inventoryOnly: d.inventoryOnly,
  }));
  console.info(tag(loopIndex, "READ_DOCS_PLAN"), {
    docIdCount: docIds.length,
    meta,
  });
}

export function debugReadDocsResult(trace: boolean | undefined, loopIndex: number, docs: Array<{ docId: string; title: string; contentChars: number; failed?: boolean }>): void {
  if (!shouldLog(trace)) return;
  const results = docs.map((d) => ({
    titleHash: stableShortHash(d.title),
    contentChars: d.contentChars,
    failed: d.failed,
  }));
  console.info(tag(loopIndex, "READ_DOCS_RESULT"), { docIdCount: docs.length, results });
}

export function debugReadDocStart(trace: boolean | undefined, loopIndex: number, _docId: string, title: string): void {
  if (!shouldLog(trace)) return;
  console.debug(tag(loopIndex, "READ_DOC_START"), { titleHash: stableShortHash(title, 8) });
}

export function debugReadDocEnd(trace: boolean | undefined, loopIndex: number, _docId: string, durationMs: number, contentChars: number, failed: boolean): void {
  if (!shouldLog(trace)) return;
  console.debug(tag(loopIndex, "READ_DOC_END"), { durationMs, contentChars, failed });
}

export function debugFooterReferences(trace: boolean | undefined, loopIndex: number, refs: Array<{ index: number; docTitle: string; docId: string }>): void {
  if (!shouldLog(trace)) return;
  const previews = refs.map((r) => ({
    index: r.index,
    docTitleHash: stableShortHash(r.docTitle),
  }));
  const payload = { count: refs.length, refs: previews };
  console.info(tag(loopIndex, "FOOTER_REFERENCES"), payload);
  pushAgentDebugEvent("FOOTER_REFERENCES", payload, "info");
}

export function debugComposeStart(trace: boolean | undefined, loopIndex: number): void {
  if (!shouldLog(trace)) return;
  const payload = {};
  console.info(tag(loopIndex, "COMPOSE_START"), payload);
  pushAgentDebugEvent("COMPOSE_START", payload, "info");
}

export function debugComposeEnd(trace: boolean | undefined, loopIndex: number, answerChars: number): void {
  if (!shouldLog(trace)) return;
  const payload = { answerChars };
  console.info(tag(loopIndex, "COMPOSE_END"), payload);
  pushAgentDebugEvent("COMPOSE_END", payload, "info");
}

export function debugStepCountIncrement(trace: boolean | undefined, loopIndex: number, node: string, newStepCount: number): void {
  if (!shouldLog(trace)) return;
  const payload = { node, newStepCount };
  console.debug(tag(loopIndex, "STEP_COUNT"), payload);
  pushAgentDebugEvent("STEP_COUNT", payload, "debug");
}

export interface CandidateDocTableRow {
  index: number;
  docId: string;
  title: string;
  titlePath?: string;
  score?: number;
  source?: string;
  preview?: string;
}

export function debugCandidateDocsTable(trace: boolean | undefined, loopIndex: number, rows: CandidateDocTableRow[]): void {
  if (!shouldLog(trace)) return;
  const maxCount = Math.min(rows.length, 8);
  const table = rows.slice(0, maxCount).map((r) => ({
    index: r.index,
    titleHash: stableShortHash(r.title),
    titlePath: r.titlePath ? safeTextMeta(r.titlePath) : undefined,
    score: r.score,
    source: r.source,
    preview: r.preview ? safeTextMeta(r.preview) : undefined,
    hasValidDocId: r.docId.length > 0 && !r.docId.includes(" ") && !/[\u4e00-\u9fff]/.test(r.docId),
  }));
  const payload = {
    totalCount: rows.length,
    table,
  };
  console.info(tag(loopIndex, "CANDIDATE_DOCS_TABLE"), payload);
  pushAgentDebugEvent("CANDIDATE_DOCS_TABLE", payload, "info");
}

export interface ActionIdGuardDebugInfo {
  actionType: string;
  inputDocIds: string[];
  allowedDocIds: string[];
  allowedDocIdsCount: number;
  rejectedDocIds: string[];
  inputBlockIds: string[];
  allowedBlockIds: string[];
  allowedBlockIdsCount: number;
  rejectedBlockIds: string[];
  allowed: boolean;
  reason?: string;
}

function looksLikePlaceholder(id: string): boolean {
  if (id.includes("候选")) return true;
  if (id === "docId" || id === "docId1" || id === "docId2" || id === "docId3") return true;
  if (id.includes(" ")) return true;
  if (/[\u4e00-\u9fff]/.test(id)) return true;
  if (id === "blockId" || id === "blockId1" || id === "blockId2" || id === "blockId3") return true;
  if (id.includes("占位") || id.includes("placeholder") || id.includes("实际")) return true;
  return false;
}

export function debugActionIdGuard(
  trace: boolean | undefined,
  loopIndex: number | undefined,
  info: ActionIdGuardDebugInfo
): void {
  if (!shouldLog(trace)) return;
  const rejectedLooksLikePlaceholder = info.rejectedDocIds.some(looksLikePlaceholder);
  const payload = {
    actionType: info.actionType,
    inputDocIdCount: info.inputDocIds.length,
    allowedDocIdsCount: info.allowedDocIdsCount,
    rejectedDocIdCount: info.rejectedDocIds.length,
    rejectedLooksLikePlaceholder,
    inputBlockIdCount: info.inputBlockIds.length,
    allowedBlockIdsCount: info.allowedBlockIdsCount,
    rejectedBlockIdCount: info.rejectedBlockIds.length,
    allowed: info.allowed,
    reason: info.reason ? shortText(info.reason, 120) : undefined,
  };
  if (info.allowed) {
    console.debug(tag(loopIndex, "ACTION_ID_GUARD"), payload);
    pushAgentDebugEvent("ACTION_ID_GUARD", payload, "debug");
  } else {
    console.warn(tag(loopIndex, "ACTION_ID_GUARD"), payload);
    pushAgentDebugEvent("ACTION_ID_GUARD", payload, "warn");
  }
}

export interface ValidationGateDebugInfo {
  ok: boolean;
  actionType?: string;
  reason?: string;
  invalidActionCount: number;
  rejectedDocIds: string[];
  rejectedBlockIds: string[];
  willExecute: boolean;
}

export function debugValidationGate(
  trace: boolean | undefined,
  loopIndex: number | undefined,
  info: ValidationGateDebugInfo
): void {
  if (!shouldLog(trace)) return;
  const payload = {
    ok: info.ok,
    actionType: info.actionType,
    reason: info.reason ? shortText(info.reason, 120) : undefined,
    invalidActionCount: info.invalidActionCount,
    rejectedDocIdCount: info.rejectedDocIds.length,
    rejectedBlockIdCount: info.rejectedBlockIds.length,
    willExecute: info.willExecute,
  };
  if (info.ok) {
    console.debug(tag(loopIndex, "VALIDATION_GATE"), payload);
    pushAgentDebugEvent("VALIDATION_GATE", payload, "debug");
  } else {
    console.warn(tag(loopIndex, "VALIDATION_GATE"), payload);
    pushAgentDebugEvent("VALIDATION_GATE", payload, "warn");
  }
}

export interface FooterReferencesFilteredDebugInfo {
  totalRefs: number;
  filteredRefs: number;
  usedReferenceDocIds: string[];
  droppedReferenceDocIds: string[];
}

export function debugFooterReferencesFiltered(trace: boolean | undefined, loopIndex: number, info: FooterReferencesFilteredDebugInfo): void {
  if (!shouldLog(trace)) return;
  const payload = {
    totalRefs: info.totalRefs,
    filteredRefs: info.filteredRefs,
    usedReferenceDocCount: info.usedReferenceDocIds.length,
    droppedReferenceDocCount: info.droppedReferenceDocIds.length,
  };
  console.info(tag(loopIndex, "FOOTER_REFERENCES_FILTERED"), payload);
  pushAgentDebugEvent("FOOTER_REFERENCES_FILTERED", payload, "info");
}

export function debugActionQueryGuard(trace: boolean | undefined, loopIndex: number, query: string, reason: string): void {
  if (!shouldLog(trace)) return;
  const payload = {
    query: safeTextMeta(query),
    reason,
  };
  console.warn(tag(loopIndex, "ACTION_QUERY_GUARD"), payload);
  pushAgentDebugEvent("ACTION_QUERY_GUARD", payload, "warn");
}

export function debugSearchQueryGuard(trace: boolean | undefined, query: string, source: string): void {
  if (!shouldLog(trace)) return;
  const payload = {
    query: safeTextMeta(query),
    source,
  };
  console.info("[KB-Agent | SEARCH_QUERY_GUARD]", payload);
  pushAgentDebugEvent("SEARCH_QUERY_GUARD", payload, "info");
}

// ===== Active Mode Safe Debug Helpers (no docIds/blockIds) =====

export function debugFooterReferencesSafe(trace: boolean | undefined, loopIndex: number, refs: Array<{ index: number; docTitle: string }>): void {
  if (!shouldLog(trace)) return;
  const previews = refs.map((r) => ({
    index: r.index,
    docTitleHash: stableShortHash(r.docTitle),
  }));
  const payload = { count: refs.length, refs: previews };
  console.info(tag(loopIndex, "FOOTER_REFERENCES_SAFE"), payload);
  pushAgentDebugEvent("FOOTER_REFERENCES_SAFE", payload, "info");
}

export function debugFooterReferencesFilteredSafe(trace: boolean | undefined, loopIndex: number, info: {
  totalRefs: number;
  filteredRefs: number;
  usedReferenceDocCount: number;
  droppedReferenceDocCount: number;
}): void {
  if (!shouldLog(trace)) return;
  const payload = {
    totalRefs: info.totalRefs,
    filteredRefs: info.filteredRefs,
    usedReferenceDocCount: info.usedReferenceDocCount,
    droppedReferenceDocCount: info.droppedReferenceDocCount,
  };
  console.info(tag(loopIndex, "FOOTER_REFERENCES_FILTERED_SAFE"), payload);
  pushAgentDebugEvent("FOOTER_REFERENCES_FILTERED_SAFE", payload, "info");
}

// ─── Knowledge Map & Focus Scope Debug Logs ──────────────────────────────────

export function debugKnowledgeMapLoaded(
  trace: boolean | undefined,
  loopIndex: number,
  info: {
    returnedNodeCount: number;
    matchedNodeCount: number;
    mappingCount: number;
    truncated: boolean;
    query?: string;
  }
): void {
  if (!shouldLog(trace)) return;
  const payload = {
    returnedNodeCount: info.returnedNodeCount,
    matchedNodeCount: info.matchedNodeCount,
    mappingCount: info.mappingCount,
    truncated: info.truncated,
    hasQuery: !!info.query,
  };
  console.info(tag(loopIndex, "KNOWLEDGE_MAP_LOADED_SAFE"), payload);
  pushAgentDebugEvent("KNOWLEDGE_MAP_LOADED_SAFE", payload, "info");
}

export function debugKnowledgeMapStored(
  trace: boolean | undefined,
  loopIndex: number,
  info: {
    returnedNodeCount: number;
    matchedNodeCount: number;
    mappingCount: number;
    truncated: boolean;
  }
): void {
  if (!shouldLog(trace)) return;
  const payload = {
    returnedNodeCount: info.returnedNodeCount,
    matchedNodeCount: info.matchedNodeCount,
    mappingCount: info.mappingCount,
    truncated: info.truncated,
  };
  console.info(tag(loopIndex, "KNOWLEDGE_MAP_STORED_SAFE"), payload);
  pushAgentDebugEvent("KNOWLEDGE_MAP_STORED_SAFE", payload, "info");
}

export function debugFocusScopeSet(
  trace: boolean | undefined,
  loopIndex: number,
  info: {
    focusedDocCount: number;
    mode: string;
    truncated: boolean;
  }
): void {
  if (!shouldLog(trace)) return;
  const payload = {
    focusedDocCount: info.focusedDocCount,
    mode: info.mode,
    truncated: info.truncated,
  };
  console.info(tag(loopIndex, "FOCUS_SCOPE_SET_SAFE"), payload);
  pushAgentDebugEvent("FOCUS_SCOPE_SET_SAFE", payload, "info");
}

export function debugSearchScopeFocusApplied(
  trace: boolean | undefined,
  loopIndex: number,
  info: {
    focusDocCount: number;
    queryCount: number;
    scopeType: string;
  }
): void {
  if (!shouldLog(trace)) return;
  const payload = {
    focusDocCount: info.focusDocCount,
    queryCount: info.queryCount,
    scopeType: info.scopeType,
  };
  console.info(tag(loopIndex, "SEARCH_SCOPE_FOCUS_APPLIED_SAFE"), payload);
  pushAgentDebugEvent("SEARCH_SCOPE_FOCUS_APPLIED_SAFE", payload, "info");
}
