import type { ReferenceItem } from "../../../types/chat";
import type { ToolResultEntry } from "./tool-result-log";
import type { ConversationContextSnapshot } from "./conversation-context-builder";
import type { AgentScope } from "../scope/types";
import { pushAgentDebugEvent } from "../debug/workbench-debug";

export type ReferenceSourceType =
  | "siyuan_doc"
  | "web_page"
  | "file"
  | "mcp_resource"
  | "api_result";

export type ReferenceReason =
  | "agent_explicit"
  | "read_content"
  | "structure_result"
  | "search_candidate";

export type ReadLevel = "content" | "structure" | "candidate";

export interface CollectedReference {
  sourceType: ReferenceSourceType;
  docId?: string;
  blockId?: string;
  url?: string;
  sourceName?: string;
  title?: string;
  provider?: string;
  priority?: number;
  reason?: ReferenceReason;
  readLevel?: ReadLevel;
}

const MAX_OBSERVATION_REFERENCES = 50;
const MAX_FOOTER_REFERENCES = 10;

const SOURCE_TYPES = new Set<ReferenceSourceType>([
  "siyuan_doc",
  "web_page",
  "file",
  "mcp_resource",
  "api_result",
]);

const REASON_PRIORITY: Record<ReferenceReason, number> = {
  agent_explicit: 1000,
  read_content: 100,
  structure_result: 60,
  search_candidate: 50,
};

const REASON_TO_READ_LEVEL: Record<ReferenceReason, ReadLevel> = {
  agent_explicit: "content",
  read_content: "content",
  structure_result: "structure",
  search_candidate: "candidate",
};

const AGGREGATE_REFERENCE_ACTION_TOOL_NAMES = new Map<string, string>([
  ["siyuan_kb:read_docs", "read_docs"],
  ["siyuan_kb:list_map", "list_knowledge_map"],
  ["siyuan_kb:search", "search_scope"],
  ["diary_task:overview", "get_daily_workspace_overview"],
  ["diary_task:query_tasks", "query_tasks"],
  ["diary_task:query_records", "query_diary_records"],
  ["diary_task:find_docs", "find_diary_docs"],
  ["web_fetch:read_page", "web_fetch:read_page"],
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function unwrapAggregateObservation(entry: ToolResultEntry): { toolName?: string; content: unknown } {
  const content = asRecord(entry.content);
  const action = readString(content?.action);
  if (action && Object.prototype.hasOwnProperty.call(content, "result")) {
    return {
      toolName: AGGREGATE_REFERENCE_ACTION_TOOL_NAMES.get(`${entry.toolName}:${action}`) ?? entry.toolName,
      content: content.result,
    };
  }
  return { toolName: entry.toolName, content: entry.content };
}

function normalizeSourceType(
  value: unknown,
  fallback?: ReferenceSourceType,
): ReferenceSourceType | undefined {
  if (typeof value === "string" && SOURCE_TYPES.has(value as ReferenceSourceType)) {
    return value as ReferenceSourceType;
  }
  return fallback;
}

function hasSiyuanTarget(ref: Pick<CollectedReference, "docId" | "blockId">): boolean {
  return !!ref.docId || !!ref.blockId;
}

function hasWebTarget(ref: Pick<CollectedReference, "url">): boolean {
  return !!ref.url;
}

function makeSiyuanReference(input: {
  docId?: unknown;
  blockId?: unknown;
  title?: unknown;
  priority: number;
  reason: ReferenceReason;
}): CollectedReference | undefined {
  const ref: CollectedReference = {
    sourceType: "siyuan_doc",
    docId: readString(input.docId),
    blockId: readString(input.blockId),
    title: readString(input.title),
    priority: input.priority,
    reason: input.reason,
    readLevel: REASON_TO_READ_LEVEL[input.reason],
  };
  return hasSiyuanTarget(ref) ? ref : undefined;
}

function pushReference(
  refs: CollectedReference[],
  ref: CollectedReference | undefined,
  limit = MAX_OBSERVATION_REFERENCES,
): boolean {
  if (refs.length >= limit) return false;
  if (!ref) return true;
  refs.push(ref);
  return refs.length < limit;
}

// ═══════════════════════════════════════════════════════════════════
// Grounding: build the set of trusted resource IDs
// ═══════════════════════════════════════════════════════════════════

export interface GroundingEvidence {
  readLevel: ReadLevel;
  referenceReason: ReferenceReason;
  source: "observation" | "conversation_context" | "attached_doc" | "scope";
  title?: string;
  sourceName?: string;
  provider?: string;
  url?: string;
}

export interface BuildGroundingSetParams {
  /** References extracted from current turn observation log */
  observationRefs: readonly CollectedReference[];
  /** Conversation context from previous turns */
  conversationContext?: ConversationContextSnapshot;
  /** Current turn scope */
  scope?: AgentScope;
  /** User-attached docs from current request */
  attachedDocs?: readonly { docId: string; title?: string }[];
}

/**
 * Build a map of grounded resource IDs → evidence.
 *
 * Only IDs with grounding evidence may enter footerReferences /
 * citedReferences / agentMemory / conversationContext.
 *
 * Trusted sources:
 * 1. Current turn tool observation (aggregate results, attached_doc_hydration, legacy tool observations)
 * 2. Historical references in conversationContext — ONLY if ref.grounded === true
 * 3. User-attached docs
 * 4. Current scope docId/rootDocId/docIds
 */
export function buildReferenceGroundingSet(params: BuildGroundingSetParams): Map<string, GroundingEvidence> {
  const map = new Map<string, GroundingEvidence>();

  function add(id: string, evidence: GroundingEvidence) {
    const existing = map.get(id);
    if (!existing) {
      map.set(id, evidence);
      return;
    }
    // Prefer stronger evidence: content > structure > candidate
    const rank = (r: ReadLevel) => (r === "content" ? 3 : r === "structure" ? 2 : 1);
    const newRank = rank(evidence.readLevel);
    const oldRank = rank(existing.readLevel);
    if (newRank > oldRank) {
      map.set(id, evidence);
    } else if (newRank === oldRank) {
      // Same level: merge metadata, keep existing title if present
      map.set(id, {
        ...evidence,
        title: existing.title || evidence.title,
        sourceName: existing.sourceName || evidence.sourceName,
        provider: existing.provider || evidence.provider,
        url: existing.url || evidence.url,
      });
    }
  }

  // 1. Observation refs from current turn
  for (const ref of params.observationRefs) {
    if (ref.docId) {
      add(ref.docId, {
        readLevel: ref.readLevel ?? "content",
        referenceReason: ref.reason ?? "read_content",
        source: "observation",
        title: ref.title,
        sourceName: ref.sourceName,
        provider: ref.provider,
      });
    }
    if (ref.blockId) {
      add(ref.blockId, {
        readLevel: ref.readLevel ?? "content",
        referenceReason: ref.reason ?? "read_content",
        source: "observation",
        title: ref.title,
        sourceName: ref.sourceName,
        provider: ref.provider,
      });
    }
    if (ref.url && ref.sourceType === "web_page") {
      add(`web_page:${ref.url}`, {
        readLevel: ref.readLevel ?? "content",
        referenceReason: ref.reason ?? "read_content",
        source: "observation",
        title: ref.title,
        sourceName: ref.sourceName,
        provider: ref.provider,
        url: ref.url,
      });
    }
  }

  // 2. Historical references from conversationContext — ONLY grounded:true
  if (params.conversationContext?.recentTurns) {
    for (const turn of params.conversationContext.recentTurns) {
      for (const ref of turn.assistant?.references ?? []) {
        if (ref.grounded !== true) continue;
        if (!ref.docId && !ref.blockId && !ref.url) continue;
        const evidence: GroundingEvidence = {
          readLevel: ref.readLevel ?? "content",
          referenceReason: ref.referenceReason ?? "read_content",
          source: "conversation_context",
          title: ref.title,
          sourceName: ref.sourceName,
          url: ref.url,
        };
        if (ref.docId) add(ref.docId, evidence);
        if (ref.blockId) add(ref.blockId, evidence);
        if (ref.url) add(`web_page:${ref.url}`, evidence);
      }
    }
  }

  // 3. User-attached docs
  for (const doc of params.attachedDocs ?? []) {
    if (doc.docId) {
      add(doc.docId, {
        readLevel: "content",
        referenceReason: "agent_explicit",
        source: "attached_doc",
        title: doc.title,
      });
    }
  }

  // 4. Scope IDs
  if (params.scope) {
    switch (params.scope.type) {
      case "current_doc":
        if (params.scope.docId) {
          add(params.scope.docId, {
            readLevel: "content",
            referenceReason: "agent_explicit",
            source: "scope",
          });
        }
        break;
      case "doc_tree":
        if (params.scope.rootDocId) {
          add(params.scope.rootDocId, {
            readLevel: "content",
            referenceReason: "agent_explicit",
            source: "scope",
          });
        }
        break;
      case "custom_docs":
        for (const docId of params.scope.docIds) {
          add(docId, {
            readLevel: "content",
            referenceReason: "agent_explicit",
            source: "scope",
          });
        }
        break;
      // notebook / whole_kb: no specific docId to ground
    }
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════
// normalizeAnswerReferences — with grounding check
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalize and ground-check agent's explicit references.
 *
 * - sourceType missing but has docId/blockId → defaults to siyuan_doc
 * - Must hit groundingMap (docId or blockId must have evidence) at content readLevel
 * - Ungrounded / insufficient-level refs are dropped with debug events
 * - No title-as-ID, no path/realPath/internalMapping, no ref without any resource ID
 */
export function normalizeAnswerReferences(
  refs: readonly unknown[] | undefined,
  groundingMap: Map<string, GroundingEvidence>,
): CollectedReference[] {
  const out: CollectedReference[] = [];
  let rejectedUngroundedCount = 0;
  let rejectedInsufficientLevelCount = 0;
  const sourceTypeCounts: Record<string, number> = {};

  for (const raw of refs ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const rawRecord = raw as Record<string, unknown>;
    const docId = readString(rawRecord.docId);
    const blockId = readString(rawRecord.blockId);
    const url = readString(rawRecord.url);
    const sourceType = normalizeSourceType(
      rawRecord.sourceType,
      docId || blockId ? "siyuan_doc" : url ? "web_page" : undefined,
    );
    if (!sourceType) continue;

    // ── web_page ──
    if (sourceType === "web_page" && url) {
      const evidence = groundingMap.get(`web_page:${url}`);
      if (!evidence) {
        rejectedUngroundedCount++;
        pushAgentDebugEvent("REFERENCE_DROPPED_UNGROUNDED", {
          sourceType: "web_page",
          url,
          title: readString(rawRecord.title) ?? undefined,
        }, "info");
        continue;
      }
      // Only content-level web evidence can be a footer reference
      if (evidence.readLevel !== "content") {
        rejectedInsufficientLevelCount++;
        pushAgentDebugEvent("REFERENCE_DROPPED_INSUFFICIENT_LEVEL", {
          sourceType: "web_page",
          url,
          readLevel: evidence.readLevel,
        }, "info");
        continue;
      }
      const ref: CollectedReference = {
        sourceType,
        url,
        title: readString(rawRecord.title) ?? evidence.title,
        sourceName: readString(rawRecord.sourceName) ?? evidence.sourceName,
        provider: readString(rawRecord.provider) ?? evidence.provider,
        priority: REASON_PRIORITY.agent_explicit,
        reason: "agent_explicit",
        readLevel: evidence.readLevel,
      };
      out.push(ref);
      sourceTypeCounts.web_page = (sourceTypeCounts.web_page ?? 0) + 1;
      continue;
    }

    // ── siyuan_doc ──
    if (sourceType !== "siyuan_doc") continue;

    // Grounding check: docId or blockId must have evidence
    const evidence = (docId && groundingMap.get(docId)) || (blockId && groundingMap.get(blockId));
    if (!evidence) {
      rejectedUngroundedCount++;
      pushAgentDebugEvent("REFERENCE_DROPPED_UNGROUNDED", {
        sourceType: "siyuan_doc",
        docId: docId ?? undefined,
        blockId: blockId ?? undefined,
        title: readString(rawRecord.title) ?? undefined,
      }, "info");
      continue;
    }

    // Only content-level evidence can be a footer reference (match web_page behavior)
    if (evidence.readLevel !== "content") {
      rejectedInsufficientLevelCount++;
      pushAgentDebugEvent("REFERENCE_DROPPED_INSUFFICIENT_LEVEL", {
        sourceType: "siyuan_doc",
        docId: docId ?? undefined,
        blockId: blockId ?? undefined,
        readLevel: evidence.readLevel,
      }, "info");
      continue;
    }

    const ref: CollectedReference = {
      sourceType,
      docId,
      blockId,
      title: readString(rawRecord.title) ?? evidence.title,
      provider: readString(rawRecord.provider) ?? evidence.provider,
      priority: REASON_PRIORITY.agent_explicit,
      reason: "agent_explicit",
      readLevel: evidence.readLevel,
    };
    if (!hasSiyuanTarget(ref)) continue;

    out.push(ref);
    sourceTypeCounts.siyuan_doc = (sourceTypeCounts.siyuan_doc ?? 0) + 1;
  }

  if (refs && refs.length > 0) {
    pushAgentDebugEvent("REFERENCE_GROUNDING_STATS_SAFE", {
      explicitCount: refs.length,
      groundedExplicitCount: out.length,
      rejectedUngroundedCount,
      rejectedInsufficientLevelCount,
      finalCount: out.length,
      sourceTypeBreakdown: sourceTypeCounts,
    }, "info");
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════
// collectObservationReferences — from observation log
// ═══════════════════════════════════════════════════════════════════

export function collectObservationReferences(
  entries: readonly ToolResultEntry[],
): CollectedReference[] {
  const refs: CollectedReference[] = [];
  for (const entry of entries) {
    if (entry.kind === "skill_observation") {
      const content = asRecord(entry.content);
      if (content?.source === "attached_doc_hydration") {
        collectAttachedDocHydrationReferences(content, refs);
      }
      continue;
    }
    if (entry.kind !== "tool_executed" && entry.kind !== "tool_observation") continue;
    const observed = unwrapAggregateObservation(entry);
    if (observed.toolName === "read_docs") {
      collectReadDocsReferences(observed.content, refs);
    } else if (observed.toolName === "list_knowledge_map") {
      collectKnowledgeMapReferences(observed.content, refs);
    } else if (observed.toolName === "search_scope") {
      collectSearchScopeReferences(observed.content, refs);
    } else if (observed.toolName === "get_daily_workspace_overview") {
      collectDailyWorkspaceOverviewReferences(observed.content, refs);
    } else if (observed.toolName === "query_tasks") {
      collectAgendaTaskReferences(observed.content, refs);
    } else if (observed.toolName === "query_diary_records") {
      collectAgendaRecordReferences(observed.content, refs);
    } else if (observed.toolName === "find_diary_docs") {
      collectDiaryDocReferences(observed.content, refs);
    } else if (observed.toolName === "web_search") {
      collectWebSearchReferences(observed.content, refs);
    } else if (observed.toolName === "web_fetch:read_page") {
      collectWebReadPageReferences(observed.content, refs);
    }
    if (refs.length >= MAX_OBSERVATION_REFERENCES) break;
  }
  return refs;
}

// ═══════════════════════════════════════════════════════════════════
// mergeAnswerReferences — explicit only
// ═══════════════════════════════════════════════════════════════════

/**
 * Build footer references from grounded explicit refs ONLY.
 *
 * Only Agent's answer.references enter footerReferences.
 * fallbackRefs are collected for groundingSet evidence only — they never
 * become footer items. The system does NOT auto-add read_content or any
 * observation result as a reference.
 *
 * If Agent writes no references, footerReferences is empty.
 */
export function mergeAnswerReferences(
  explicitRefs: readonly CollectedReference[],
  /** Intentionally unused — only collected as groundingSet evidence, never auto-added to footer */
  _fallbackRefs: readonly CollectedReference[],
): CollectedReference[] {
  const sorted = [...explicitRefs].sort(compareReferences);
  const merged: CollectedReference[] = [];
  const byResource = new Map<string, number>();

  for (const ref of sorted) {
    if (!hasSiyuanTarget(ref) && !hasWebTarget(ref)) continue;
    const key = resourceKey(ref);
    const existingIndex = byResource.get(key);
    if (existingIndex === undefined) {
      byResource.set(key, merged.length);
      merged.push(ref);
      continue;
    }
    const existing = merged[existingIndex];
    if (isBetterReference(ref, existing)) {
      merged[existingIndex] = ref;
    }
  }

  return merged.sort(compareReferences).slice(0, MAX_FOOTER_REFERENCES);
}

// ═══════════════════════════════════════════════════════════════════
// toFooterReferenceItems — convert to UI ReferenceItem
// ═══════════════════════════════════════════════════════════════════

export function toFooterReferenceItems(
  refs: readonly CollectedReference[],
): ReferenceItem[] {
  const siyuanRefs = refs
    .filter((ref) => ref.sourceType === "siyuan_doc" && hasSiyuanTarget(ref))
    .slice(0, MAX_FOOTER_REFERENCES)
    .map((ref, index) => ({
      index: index + 1,
      docTitle: ref.title ?? "",
      headingPathText: ref.title ?? "",
      sourceBlockIds: ref.blockId ? [ref.blockId] : [],
      docId: ref.docId,
      displayTitle: ref.title,
      sourceType: "siyuan_doc" as const,
      readLevel: ref.readLevel,
      referenceReason: ref.reason,
      grounded: true,
    }));

  const webRefs = refs
    .filter((ref) => ref.sourceType === "web_page" && hasWebTarget(ref))
    .slice(0, MAX_FOOTER_REFERENCES)
    .map((ref, index) => ({
      index: siyuanRefs.length + index + 1,
      docTitle: ref.title ?? ref.sourceName ?? ref.url ?? "",
      headingPathText: ref.url ?? "",
      sourceBlockIds: [] as string[],
      docId: undefined,
      displayTitle: ref.title ?? ref.sourceName ?? ref.url,
      sourceType: "web_page" as const,
      url: ref.url,
      sourceName: ref.sourceName,
      provider: ref.provider,
      readLevel: ref.readLevel ?? "content" as const,
      referenceReason: ref.reason,
      grounded: true,
    }));

  return [...siyuanRefs, ...webRefs].slice(0, MAX_FOOTER_REFERENCES);
}

// ═══════════════════════════════════════════════════════════════════
// Internal: per-tool reference extraction
// ═══════════════════════════════════════════════════════════════════

function collectReadDocsReferences(
  content: unknown,
  refs: CollectedReference[],
): void {
  const root = asRecord(content);
  const items = Array.isArray(root?.items) ? root.items : [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const text = readString(record.content);
    if (!text) continue;
    if (!pushReference(refs, makeSiyuanReference({
      docId: record.docId,
      blockId: record.blockId,
      title: record.title,
      priority: REASON_PRIORITY.read_content,
      reason: "read_content",
    }))) break;
  }
  // Note: errors are NOT extracted as references
}

function collectAttachedDocHydrationReferences(
  content: Record<string, unknown>,
  refs: CollectedReference[],
): void {
  const items = Array.isArray(content.items) ? content.items : [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const text = readString(record.content);
    if (!text) continue;
    if (!pushReference(refs, makeSiyuanReference({
      docId: record.docId,
      title: record.title,
      priority: REASON_PRIORITY.read_content,
      reason: "read_content",
    }))) break;
  }
}

function collectSearchScopeReferences(
  content: unknown,
  refs: CollectedReference[],
): void {
  const root = asRecord(content);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) continue;
    if (!pushReference(refs, makeSiyuanReference({
      docId: record.docId,
      blockId: record.blockId,
      title: record.title,
      priority: REASON_PRIORITY.search_candidate,
      reason: "search_candidate",
    }))) break;
  }
}

function collectKnowledgeMapReferences(
  content: unknown,
  refs: CollectedReference[],
): void {
  const root = asRecord(content);
  if (!root) return;

  const docs = Array.isArray(root.docs) ? root.docs : [];
  for (const doc of docs) {
    if (!collectKnowledgeNode(doc, refs)) return;
  }

  const notebooks = Array.isArray(root.notebooks) ? root.notebooks : [];
  for (const notebook of notebooks) {
    const notebookRecord = asRecord(notebook);
    const roots = Array.isArray(notebookRecord?.roots) ? notebookRecord.roots : [];
    for (const node of roots) {
      if (!collectKnowledgeNode(node, refs)) return;
    }
  }
}

function collectKnowledgeNode(
  node: unknown,
  refs: CollectedReference[],
  depth = 0,
): boolean {
  if (refs.length >= MAX_OBSERVATION_REFERENCES || depth > 20) return false;
  const record = asRecord(node);
  if (!record) return true;

  if (!pushReference(refs, makeSiyuanReference({
    docId: record.docId,
    title: record.title,
    priority: REASON_PRIORITY.structure_result,
    reason: "structure_result",
  }))) return false;

  const linkedDocs = Array.isArray(record.linkedDocs) ? record.linkedDocs : [];
  for (const linked of linkedDocs) {
    const linkedRecord = asRecord(linked);
    if (!linkedRecord) continue;
    if (!pushReference(refs, makeSiyuanReference({
      docId: linkedRecord.docId,
      title: linkedRecord.title,
      priority: REASON_PRIORITY.structure_result,
      reason: "structure_result",
    }))) return false;
  }

  const children = Array.isArray(record.children) ? record.children : [];
  for (const child of children) {
    if (!collectKnowledgeNode(child, refs, depth + 1)) return false;
  }
  return refs.length < MAX_OBSERVATION_REFERENCES;
}

function collectDailyWorkspaceOverviewReferences(
  content: unknown,
  refs: CollectedReference[],
): void {
  const root = asRecord(content);
  if (!root) return;

  const todayDiary = asRecord(root.todayDiary);
  if (todayDiary) {
    if (!pushReference(refs, makeSiyuanReference({
      docId: todayDiary.docId,
      title: todayDiary.title,
      priority: REASON_PRIORITY.structure_result,
      reason: "structure_result",
    }))) return;
  }

  collectAgendaTaskReferencesFromArray(root.tasks, refs);
  collectAgendaRecordReferencesFromArray(root.records, refs);
  collectDiaryDocReferencesFromArray(root.reviews, refs, "structure_result");
  collectDiaryDocReferencesFromArray(root.carryoverPlans, refs, "read_content");

  const notifications = Array.isArray(root.notifications) ? root.notifications : [];
  for (const notification of notifications) {
    const record = asRecord(notification);
    if (!record) continue;
    if (!pushReference(refs, makeSiyuanReference({
      docId: record.relatedDocId,
      title: record.title,
      priority: REASON_PRIORITY.structure_result,
      reason: "structure_result",
    }))) return;
  }
}

function collectAgendaTaskReferences(
  content: unknown,
  refs: CollectedReference[],
): void {
  const root = asRecord(content);
  collectAgendaTaskReferencesFromArray(root?.tasks, refs);
}

function collectAgendaTaskReferencesFromArray(
  tasks: unknown,
  refs: CollectedReference[],
): void {
  const items = Array.isArray(tasks) ? tasks : [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const taskTitle = readString(record.taskname);
    if (!pushReference(refs, makeSiyuanReference({
      docId: record.sourceDocId ?? record.rootId,
      blockId: record.blockId,
      title: taskTitle ? `任务：${taskTitle}` : record.sourceDocTitle,
      priority: REASON_PRIORITY.read_content,
      reason: "read_content",
    }))) return;
  }
}

function collectAgendaRecordReferences(
  content: unknown,
  refs: CollectedReference[],
): void {
  const root = asRecord(content);
  collectAgendaRecordReferencesFromArray(root?.records, refs);
}

function collectAgendaRecordReferencesFromArray(
  records: unknown,
  refs: CollectedReference[],
): void {
  const items = Array.isArray(records) ? records : [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const headingTitle = readString(record.headingTitle);
    const categoryTitle = readString(record.categoryTitle);
    const title = headingTitle
      ? `快速记录：${headingTitle}`
      : categoryTitle
        ? `快速记录：${categoryTitle}`
        : record.docTitle;
    if (!pushReference(refs, makeSiyuanReference({
      docId: record.docId,
      blockId: record.headingBlockId,
      title,
      priority: REASON_PRIORITY.read_content,
      reason: "read_content",
    }))) return;
  }
}

function collectDiaryDocReferences(
  content: unknown,
  refs: CollectedReference[],
): void {
  const root = asRecord(content);
  collectDiaryDocReferencesFromArray(root?.docs, refs, undefined);
}

function collectDiaryDocReferencesFromArray(
  docs: unknown,
  refs: CollectedReference[],
  forcedReason: ReferenceReason | undefined,
): void {
  const items = Array.isArray(docs) ? docs : [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const hasPreview = typeof record.markdownPreview === "string" && record.markdownPreview.trim().length > 0;
    const reason = forcedReason ?? (hasPreview ? "read_content" : "structure_result");
    if (!pushReference(refs, makeSiyuanReference({
      docId: record.docId,
      title: record.title,
      priority: REASON_PRIORITY[reason],
      reason,
    }))) return;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Internal: web search reference extraction
// ═══════════════════════════════════════════════════════════════════

function collectWebSearchReferences(content: unknown, refs: CollectedReference[]): void {
  const root = asRecord(content);
  const results = Array.isArray(root?.results) ? root!.results as Record<string, unknown>[] : [];
  for (const item of results) {
    const url = readString(item.url);
    const title = readString(item.title);
    if (!url || !title) continue;
    // Web search candidates are search_candidate only — NOT footer references
    if (!pushReference(refs, {
      sourceType: "web_page",
      url,
      title,
      sourceName: readString(item.sourceName) ?? readString(item.provider),
      provider: readString(item.provider),
      priority: REASON_PRIORITY.search_candidate,
      reason: "search_candidate",
      readLevel: "candidate",
    })) return;
  }
}

function collectWebReadPageReferences(content: unknown, refs: CollectedReference[]): void {
  const root = asRecord(content);
  const url = readString(root?.url);
  const text = readString(root?.text) ?? readString(root?.markdown);
  if (!url || !text) return;
  pushReference(refs, {
    sourceType: "web_page",
    url,
    title: readString(root?.title) ?? readString(root?.sourceName) ?? url,
    sourceName: readString(root?.sourceName),
    provider: readString(root?.provider),
    priority: REASON_PRIORITY.read_content,
    reason: "read_content",
    readLevel: "content",
  });
}

// ═══════════════════════════════════════════════════════════════════
// Internal: sorting / comparison helpers
// ═══════════════════════════════════════════════════════════════════

function priorityOf(ref: CollectedReference): number {
  return ref.priority ?? (ref.reason ? REASON_PRIORITY[ref.reason] : 0);
}

function compareReferences(a: CollectedReference, b: CollectedReference): number {
  const priorityDelta = priorityOf(b) - priorityOf(a);
  if (priorityDelta !== 0) return priorityDelta;
  if (!!b.blockId !== !!a.blockId) return b.blockId ? 1 : -1;
  return titleScore(b) - titleScore(a);
}

function titleScore(ref: CollectedReference): number {
  return ref.title?.length ?? 0;
}

function resourceKey(ref: CollectedReference): string {
  if (ref.url) return `${ref.sourceType}:url:${ref.url}`;
  if (ref.docId) return `${ref.sourceType}:doc:${ref.docId}`;
  return `${ref.sourceType}:block:${ref.blockId ?? ""}`;
}

function isBetterReference(candidate: CollectedReference, existing: CollectedReference): boolean {
  if (priorityOf(candidate) !== priorityOf(existing)) {
    return priorityOf(candidate) > priorityOf(existing);
  }
  if (!!candidate.blockId !== !!existing.blockId) return !!candidate.blockId;
  return titleScore(candidate) > titleScore(existing);
}
