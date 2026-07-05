/**
 * In-Flight Turn Journal — dual-write crash-surviving turn state.
 *
 * Purpose:
 *   After SiYuan front-end reload or renderer crash, the in-memory turn state
 *   (tool events, workbench events, assistant pending message) is lost.
 *   This journal persists a safe, minimised summary so the next load can
 *   recognise and report the interrupted turn without claiming success.
 *
 * Storage strategy:
 *   - Dual-write: localStorage (sync fast-path) + plugin data file via saveData/loadData.
 *   - readTurnJournal reads plugin data file first, falls back to localStorage.
 *   - checkpointTurnJournal writes localStorage synchronously; key events also
 *     trigger an async best-effort saveData flush.
 *   - asyncFlushJournal can be called explicitly before critical moments
 *     (e.g. permission confirm) to force plugin data file write immediately.
 *
 * Safety:
 *   - No full markdown, full document body, tokens, API keys, local absolute paths.
 *   - `argsPreview` is stored because callers already produce safe digests.
 *   - `outputSummary` is stored; full `result.content` is NOT.
 *   - Provider raw message text is NOT stored.
 *   - Write failures are silently swallowed — journal must never block Agent flow.
 *
 * Lifecycle:
 *   setPluginStorage   → called once during plugin onload with saveData/loadData/removeData
 *   createTurnJournal  → on assistant pending creation
 *   checkpointTurnJournal → on tool_start / permission_required / permission_resolved /
 *                            tool_result / assistant_final / done / error / notice
 *   asyncFlushJournal  → explicit async flush to plugin data file (call before critical moments)
 *   completeTurnJournal → on normal answer_ready
 *   failTurnJournal     → on manual stop or abort, then scheduleClearAfter(10 min)
 *   readTurnJournal     → on hydrate for crash recovery
 *   recoverTurnJournal  → after recovery applied
 */

import { saveData, loadData, removeData } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";

const LOCAL_STORAGE_KEY = "kbAgent.inFlightTurn.v1";
const PLUGIN_DATA_KEY = "notebrain.agentInFlightTurnJournal.v1";
const DEFAULT_WORKBENCH_EVENT_MAX = 80;
const ANSWER_PREVIEW_MAX_CHARS = 4000;
const QUESTION_PREVIEW_MAX_CHARS = 200;

// ─── Plugin storage ref ──────────────────────────────────────────────────────

let pluginSaveData: typeof saveData | null = null;
let pluginLoadData: typeof loadData | null = null;
let pluginRemoveData: typeof removeData | null = null;

export function setPluginStorage(fns: {
  saveData: typeof saveData;
  loadData: typeof loadData;
  removeData: typeof removeData;
}): void {
  pluginSaveData = fns.saveData;
  pluginLoadData = fns.loadData;
  pluginRemoveData = fns.removeData;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SafeWorkbenchEvent {
  type: string;
  stepIndex?: number;
  toolName?: string;
  ok?: boolean;
  errorCode?: string;
  outputSummary?: string;
  argsPreview?: Record<string, unknown>;
}

export interface InFlightTurnJournal {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  questionPreview: string;
  startedAt: number;
  updatedAt: number;
  status: "running" | "recovering" | "completed" | "failed";
  lastEventType: string;
  lastStepIndex?: number;
  lastToolName?: string;
  lastAction?: string;
  lastInnerAction?: string;
  lastArgsDigest?: string;
  lastConfirmationId?: string;
  lastErrorCode?: string;
  lastPermissionState?: "none" | "required" | "allowed" | "denied";
  answerPreview: string;
  workbenchEvents: SafeWorkbenchEvent[];
  reason?: string;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function previewText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

// ─── Dual-write storage layer ────────────────────────────────────────────────

function writeLocalStorage(journal: InFlightTurnJournal): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(journal));
  } catch {
    // Silently ignore.
  }
}

function readLocalStorage(): InFlightTurnJournal | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InFlightTurnJournal;
    if (typeof parsed.conversationId !== "string" || typeof parsed.assistantMessageId !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function deleteLocalStorage(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // Silently ignore.
  }
}

async function writePluginData(journal: InFlightTurnJournal): Promise<void> {
  if (!pluginSaveData) return;
  try {
    await pluginSaveData(PLUGIN_DATA_KEY, journal);
  } catch {
    // Silently ignore.
  }
}

async function deletePluginData(): Promise<void> {
  if (!pluginRemoveData) return;
  try {
    await pluginRemoveData(PLUGIN_DATA_KEY);
  } catch {
    // Silently ignore.
  }
}

// ─── Dual-write orchestration ────────────────────────────────────────────────

/**
 * Write journal to localStorage synchronously, and schedule an async flush
 * to plugin data file. Tool-critical events also trigger immediate async write.
 */
function writeJournal(journal: InFlightTurnJournal): void {
  writeLocalStorage(journal);
  // Best-effort async write to plugin data file for durability
  void (async () => {
    try { await writePluginData(journal); } catch { /* ignore */ }
  })();
}

function readJournalSync(): InFlightTurnJournal | null {
  // Always read from localStorage as the sync fast path
  return readLocalStorage();
}

function deleteJournalDual(): void {
  deleteLocalStorage();
  void (async () => {
    try { await deletePluginData(); } catch { /* ignore */ }
  })();
}

// ─── Clear timer ─────────────────────────────────────────────────────────────

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleClearAfter(ms: number): void {
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
  }
  clearTimer = setTimeout(() => {
    clearTimer = null;
    deleteJournalDual();
  }, ms);
}

function cancelScheduledClear(): void {
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
}

// ─── Throttle for answer preview updates ─────────────────────────────────────

let lastThrottledWrite = 0;
const THROTTLE_MS = 800;

function shouldThrottle(): boolean {
  const now = Date.now();
  if (now - lastThrottledWrite < THROTTLE_MS) return true;
  lastThrottledWrite = now;
  return false;
}

// ─── Key event types that trigger immediate async plugin data flush ──────────

const KEY_EVENT_TYPES = new Set([
  "tool_start",
  "permission_required",
  "permission_confirm_clicked",
  "permission_resolved",
  "tool_result",
  "assistant_final",
  "done",
  "error",
  "notice",
]);

function isKeyEvent(eventType: string): boolean {
  return KEY_EVENT_TYPES.has(eventType);
}

// ─── Async flush queue ───────────────────────────────────────────────────────

let flushPending = false;
let flushSeq = 0;

function scheduleAsyncFlush(): void {
  if (flushPending) return;
  flushPending = true;
  const seq = ++flushSeq;
  void (async () => {
    try {
      // Re-read the latest journal from localStorage before flushing
      // (multiple checkpoints may have happened between schedule and execution)
      const latest = readLocalStorage();
      if (latest) {
        await writePluginData(latest);
      }
    } catch { /* ignore */ }
    if (seq === flushSeq) {
      flushPending = false;
    }
  })();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function createTurnJournal(params: {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  questionPreview: string;
}): void {
  const journal: InFlightTurnJournal = {
    conversationId: params.conversationId,
    userMessageId: params.userMessageId,
    assistantMessageId: params.assistantMessageId,
    questionPreview: previewText(params.questionPreview, QUESTION_PREVIEW_MAX_CHARS),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    status: "running",
    lastEventType: "turn_started",
    lastPermissionState: "none",
    answerPreview: "",
    workbenchEvents: [],
  };
  cancelScheduledClear();
  writeJournal(journal);
}

export function checkpointTurnJournal(params: {
  eventType: string;
  stepIndex?: number;
  toolName?: string;
  action?: string;
  innerAction?: string;
  argsDigest?: string;
  confirmationId?: string;
  errorCode?: string;
  permissionState?: "none" | "required" | "allowed" | "denied";
  answerPreview?: string;
  safeWorkbenchEvent?: SafeWorkbenchEvent;
}): void {
  const journal = readJournalSync();
  if (!journal) return;

  if (params.eventType === "assistant_text_delta" && shouldThrottle()) {
    return;
  }

  journal.updatedAt = Date.now();
  journal.lastEventType = params.eventType;

  if (params.stepIndex !== undefined) journal.lastStepIndex = params.stepIndex;
  if (params.toolName !== undefined) journal.lastToolName = params.toolName;
  if (params.action !== undefined) journal.lastAction = params.action;
  if (params.innerAction !== undefined) journal.lastInnerAction = params.innerAction;
  if (params.argsDigest !== undefined) journal.lastArgsDigest = params.argsDigest;
  if (params.confirmationId !== undefined) journal.lastConfirmationId = params.confirmationId;
  if (params.errorCode !== undefined) journal.lastErrorCode = params.errorCode;
  if (params.permissionState !== undefined) journal.lastPermissionState = params.permissionState;
  if (params.answerPreview !== undefined) {
    journal.answerPreview = previewText(params.answerPreview, ANSWER_PREVIEW_MAX_CHARS);
  }

  if (params.safeWorkbenchEvent) {
    journal.workbenchEvents.push(params.safeWorkbenchEvent);
    if (journal.workbenchEvents.length > DEFAULT_WORKBENCH_EVENT_MAX) {
      journal.workbenchEvents.splice(0, journal.workbenchEvents.length - DEFAULT_WORKBENCH_EVENT_MAX);
    }
  }

  writeLocalStorage(journal);

  // Key events: also flush to plugin data file asynchronously
  if (isKeyEvent(params.eventType)) {
    scheduleAsyncFlush();
  }
}

/**
 * Explicit async flush to plugin data file. Call this before critical
 * moments like permission confirm that may be followed by a crash.
 */
export async function asyncFlushJournal(): Promise<void> {
  const journal = readLocalStorage();
  if (!journal) return;
  try {
    await writePluginData(journal);
  } catch {
    // Silently ignore.
  }
}

export function completeTurnJournal(): void {
  const journal = readLocalStorage();
  if (journal) {
    journal.status = "completed";
    journal.updatedAt = Date.now();
    journal.lastEventType = "completed";
    writeLocalStorage(journal);
  }
  deleteJournalDual();
  cancelScheduledClear();
}

export function failTurnJournal(params: { reason?: string } = {}): void {
  const journal = readLocalStorage();
  if (journal) {
    journal.status = "failed";
    journal.updatedAt = Date.now();
    journal.lastEventType = "failed";
    journal.reason = params.reason ? previewText(params.reason, 200) : "stopped";
    writeJournal(journal);
    scheduleClearAfter(10 * 60 * 1000);
  }
}

/**
 * Synchronous read (localStorage only). Use readTurnJournal for the dual-read path.
 */
export function readTurnJournal(): InFlightTurnJournal | null {
  return readLocalStorage();
}

/**
 * Async read: tries plugin data file first, falls back to localStorage.
 * Used during hydration for durable recovery across front-end reloads.
 */
export async function readTurnJournalAsync(): Promise<InFlightTurnJournal | null> {
  if (pluginLoadData) {
    try {
      const data = await pluginLoadData(PLUGIN_DATA_KEY) as InFlightTurnJournal | null;
      if (data && typeof data.conversationId === "string" && typeof data.assistantMessageId === "string") {
        return data;
      }
    } catch {
      // Silently ignore.
    }
  }
  return readLocalStorage();
}

export function recoverTurnJournal(): void {
  const journal = readLocalStorage();
  if (journal) {
    journal.status = "recovering";
    journal.updatedAt = Date.now();
    journal.lastEventType = "recovered";
    writeLocalStorage(journal);
  }
  deleteJournalDual();
  cancelScheduledClear();
}

// ─── Last-known-state (beforeunload / permission confirm) ────────────────────

const LAST_KNOWN_KEY = "kbAgent.lastKnownState.v1";

export interface LastKnownState {
  asking: boolean;
  activeConversationId: string;
  nativePermissionModalOpen: boolean;
  nativePermissionToolName?: string;
  nativePermissionTitle?: string;
  nativePermissionAction?: string;
  nativePermissionArgsPreview?: Record<string, unknown>;
  permissionConfirmClicked?: boolean;
  lastJournalEvent?: string;
  updatedAt: number;
}

export function writeLastKnownState(state: LastKnownState): void {
  try {
    localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(state));
  } catch {
    // Silently ignore.
  }
}

export function readLastKnownState(): LastKnownState | null {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastKnownState;
  } catch {
    return null;
  }
}

export function clearLastKnownState(): void {
  try {
    localStorage.removeItem(LAST_KNOWN_KEY);
  } catch {
    // Silently ignore.
  }
}
