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
 *   - readTurnJournalAsync reads both plugin and localStorage, picks newer by updatedAt.
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
 *   - Exception: flushApprovalStrict/processApprovalTransition propagate errors
 *     for approval persistence; a failed durable write must prevent allow resolution.
 *
 * Lifecycle:
 *   setPluginStorage   → called once during plugin onload with saveData/loadData/removeData
 *   createTurnJournal  → on assistant pending creation
 *   checkpointTurnJournal → on tool_start / permission_required / permission_resolved /
 *                            tool_result / assistant_final / done / error / notice
 *   asyncFlushJournal  → explicit async flush to plugin data file (call before critical moments)
 *   markTurnCompletedPendingPersistence → answer ready, before session save
 *   clearTurnJournalAfterPersistence → only after the session save is verified
 *   failTurnJournal     → on manual stop or abort; journal stays until recovery is persisted
 *   readTurnJournal     → on hydrate for crash recovery
 */

import { saveData, loadData, removeData } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import {
  type AgentRunCheckpoint,
} from "../../agent-core/session/agent-run-checkpoint";

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
  message?: string;
  status?: "answer_ready" | "failed" | "cancelled";
}

export interface InFlightTurnJournal {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  questionPreview: string;
  startedAt: number;
  updatedAt: number;
  status: "running" | "recovering" | "completed" | "completed_pending_persist" | "failed";
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
  agentRunCheckpoint?: AgentRunCheckpoint;
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
let journalStorageTail: Promise<void> = Promise.resolve();

function enqueueJournalStorage(task: () => Promise<void>): Promise<void> {
  const run = journalStorageTail.catch(() => undefined).then(task);
  journalStorageTail = run.then(() => undefined, () => undefined);
  return run;
}

function writeJournal(journal: InFlightTurnJournal): void {
  writeLocalStorage(journal);
  const snapshot = structuredClone(journal);
  void enqueueJournalStorage(() => writePluginData(snapshot));
}

function readJournalSync(): InFlightTurnJournal | null {
  // Always read from localStorage as the sync fast path
  return readLocalStorage();
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
  "agent_checkpoint_before_tool",
  "agent_checkpoint_waiting_confirmation",
  "agent_checkpoint_after_tool",
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
        await enqueueJournalStorage(() => writePluginData(structuredClone(latest)));
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
  agentRunCheckpoint?: AgentRunCheckpoint;
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
  if (params.agentRunCheckpoint) journal.agentRunCheckpoint = structuredClone(params.agentRunCheckpoint);
  if (
    (params.eventType === "permission_resolved"
      || params.eventType === "permission_confirm_clicked")
    && params.permissionState === "allowed"
    && journal.agentRunCheckpoint
  ) {
    // 用户批准后立即标记写入结果未知，不等工具实际执行。
    // 若在批准与 tool_result 之间发生重载，恢复层据此判定 side_effect_unknown。
    journal.agentRunCheckpoint.sideEffectState = "unknown";
  }
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
    await enqueueJournalStorage(() => writePluginData(structuredClone(journal)));
  } catch {
    // Silently ignore.
  }
}

/**
 * Strict approval persistence: bypasses silent-catch layers and throws on any
 * failure. Readback is bound to this exact approval snapshot via structured
 * identity fields — an old unknown snapshot from the same conversation cannot pass.
 *
 * Throws (with stable reason codes):
 *   APPROVAL_FLUSH_NO_JOURNAL               – no current turn journal in localStorage
 *   APPROVAL_FLUSH_CONVERSATION_MISMATCH    – journal belongs to a different conversation
 *   APPROVAL_FLUSH_CHECKPOINT_NOT_UNKNOWN   – checkpoint sideEffectState is not "unknown"
 *   APPROVAL_FLUSH_NO_PLUGIN_STORAGE        – plugin storage not configured
 *   APPROVAL_FLUSH_SAVE_FAILED              – plugin saveData threw or returned unexpectedly
 *   APPROVAL_FLUSH_READBACK_MISSING         – post-save readback returned null or invalid
 *   APPROVAL_FLUSH_READBACK_IDENTITY_MISMATCH – persisted data differs from this approval snapshot
 *   APPROVAL_FLUSH_LOCAL_STALE              – localStorage does not reflect this approval
 */
export async function flushApprovalStrict(conversationId: string): Promise<void> {
  const journal = readLocalStorage();
  if (!journal) throw new Error("APPROVAL_FLUSH_NO_JOURNAL");
  if (journal.conversationId !== conversationId) throw new Error("APPROVAL_FLUSH_CONVERSATION_MISMATCH");
  if (!journal.agentRunCheckpoint || journal.agentRunCheckpoint.sideEffectState !== "unknown") {
    throw new Error("APPROVAL_FLUSH_CHECKPOINT_NOT_UNKNOWN");
  }
  if (!pluginSaveData || !pluginLoadData) throw new Error("APPROVAL_FLUSH_NO_PLUGIN_STORAGE");

  // Capture immutable snapshot of this specific approval for post-save identity binding.
  const snapshot = structuredClone(journal);

  await enqueueJournalStorage(async () => {
    try {
      await pluginSaveData!(PLUGIN_DATA_KEY, structuredClone(snapshot));
    } catch (cause) {
      const wrapped = new Error("APPROVAL_FLUSH_SAVE_FAILED");
      (wrapped as any).cause = cause instanceof Error ? cause : undefined;
      throw wrapped;
    }
  });

  // Post-save readback bound to this approval snapshot via structured identity fields.
  const readback = await pluginLoadData(PLUGIN_DATA_KEY) as InFlightTurnJournal | null;
  if (!readback || typeof readback !== "object") throw new Error("APPROVAL_FLUSH_READBACK_MISSING");

  const snapCp = snapshot.agentRunCheckpoint;
  const rbCp = readback.agentRunCheckpoint;
  if (
    readback.conversationId !== snapshot.conversationId
    || readback.assistantMessageId !== snapshot.assistantMessageId
    || readback.updatedAt !== snapshot.updatedAt
    || readback.lastEventType !== snapshot.lastEventType
    || readback.lastPermissionState !== snapshot.lastPermissionState
    || readback.lastConfirmationId !== snapshot.lastConfirmationId
    || !rbCp
    || !snapCp
    || rbCp.sideEffectState !== "unknown"
    || rbCp.identity.runId !== snapCp.identity.runId
    || rbCp.phase !== snapCp.phase
    || rbCp.stepIndex !== snapCp.stepIndex
  ) {
    throw new Error("APPROVAL_FLUSH_READBACK_IDENTITY_MISMATCH");
  }

  // localStorage must also reflect this approval (not stale)
  const localCheck = readLocalStorage();
  if (!localCheck || localCheck.updatedAt !== snapshot.updatedAt || localCheck.lastEventType !== "permission_confirm_clicked") {
    throw new Error("APPROVAL_FLUSH_LOCAL_STALE");
  }
}

/**
 * 共享生产批准转换：从 waiting_confirmation 写入 permission_confirm_clicked/allowed、
 * 形成 unknown、严格保存并返回可放行(true)/拒绝(false)。摘要确认与块差异确认共用。
 */
export async function processApprovalTransition(params: {
  conversationId: string;
  toolName: string;
  action?: string;
  innerAction?: string;
  argsDigest?: string;
  confirmationId?: string;
  agentRunCheckpoint?: AgentRunCheckpoint;
}): Promise<boolean> {
  checkpointTurnJournal({
    eventType: "permission_confirm_clicked",
    stepIndex: 0,
    toolName: params.toolName,
    action: params.action,
    innerAction: params.innerAction,
    argsDigest: params.argsDigest,
    confirmationId: params.confirmationId,
    permissionState: "allowed",
    ...(params.agentRunCheckpoint ? { agentRunCheckpoint: structuredClone(params.agentRunCheckpoint) } : {}),
  });

  try {
    await flushApprovalStrict(params.conversationId);
    return true;
  } catch {
    return false;
  }
}

export async function markTurnCompletedPendingPersistence(params: {
  answerPreview?: string;
  reason?: string;
} = {}): Promise<void> {
  const journal = readLocalStorage();
  if (!journal) return;
  journal.status = "completed_pending_persist";
  journal.updatedAt = Date.now();
  journal.lastEventType = "completed_pending_persist";
  if (params.answerPreview !== undefined) {
    journal.answerPreview = previewText(params.answerPreview, ANSWER_PREVIEW_MAX_CHARS);
  }
  if (params.reason !== undefined) {
    journal.reason = previewText(params.reason, 200);
  }
  writeLocalStorage(journal);
  await enqueueJournalStorage(() => writePluginData(structuredClone(journal)));
}

export async function clearTurnJournalAfterPersistence(): Promise<void> {
  deleteLocalStorage();
  await enqueueJournalStorage(() => deletePluginData());
}

export function failTurnJournal(params: { reason?: string } = {}): void {
  const journal = readLocalStorage();
  if (journal) {
    journal.status = "failed";
    journal.updatedAt = Date.now();
    journal.lastEventType = "failed";
    journal.reason = params.reason ? previewText(params.reason, 200) : "stopped";
    writeJournal(journal);
  }
}

/**
 * Synchronous read (localStorage only). Use readTurnJournal for the dual-read path.
 */
export function readTurnJournal(): InFlightTurnJournal | null {
  return readLocalStorage();
}

/**
 * Async read: reads both plugin data file and localStorage, picks the copy with
 * the newer updatedAt. Used during hydration for durable recovery across reloads.
 * Invalid or structurally incomplete copies are ignored.
 */
export async function readTurnJournalAsync(): Promise<InFlightTurnJournal | null> {
  let pluginCopy: InFlightTurnJournal | null = null;
  if (pluginLoadData) {
    try {
      const data = await pluginLoadData(PLUGIN_DATA_KEY) as InFlightTurnJournal | null;
      if (data && typeof data.conversationId === "string" && typeof data.assistantMessageId === "string" && typeof data.updatedAt === "number") {
        pluginCopy = data;
      }
    } catch {
      // Silently ignore.
    }
  }

  const localCopy = readLocalStorage();

  // Pick the copy with newer updatedAt; ties prefer localStorage (fresher writes).
  if (pluginCopy && localCopy) {
    return localCopy.updatedAt >= pluginCopy.updatedAt ? localCopy : pluginCopy;
  }
  return pluginCopy ?? localCopy;
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
