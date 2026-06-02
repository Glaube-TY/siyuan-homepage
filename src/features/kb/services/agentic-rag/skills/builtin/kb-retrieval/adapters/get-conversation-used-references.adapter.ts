import type { KnowledgeDocHandleMapping } from "../../../../tools/knowledge-map-types";
import type {
  KbConversationReference,
  KbRetrievalToolDeps,
} from "./kb-retrieval-tool-deps";
import type {
  GetConversationUsedReferencesOutput,
  PlannerVisibleConversationReference,
} from "../schemas/get-conversation-used-references.schema";

const SIYUAN_BLOCK_ID_PATTERN = /\d{14}-[a-z0-9]{7}/i;
const HEX_32_PATTERN = /\b[0-9a-f]{32}\b/i;
const PATH_SEPARATOR_PATTERN = /[\\/]/;
const SY_FILE_PATTERN = /\.sy\b/i;

function sanitizeReferenceTitle(value: unknown): string {
  if (typeof value !== "string") return "Untitled";
  const title = value.trim();
  if (!title) return "Untitled";
  if (SIYUAN_BLOCK_ID_PATTERN.test(title)) return "Untitled";
  if (HEX_32_PATTERN.test(title)) return "Untitled";
  if (PATH_SEPARATOR_PATTERN.test(title)) return "Untitled";
  if (SY_FILE_PATTERN.test(title)) return "Untitled";
  return title.slice(0, 80);
}

function makeReferenceKey(ref: KbConversationReference): string {
  const docId = typeof ref.docId === "string" ? ref.docId.trim() : "";
  if (docId) return `id:${docId}`;
  return `title:${sanitizeReferenceTitle(ref.docTitle)}`;
}

export function executeGetConversationUsedReferences(
  deps: KbRetrievalToolDeps,
): {
  safeOutput: GetConversationUsedReferencesOutput;
  internalMapping: KnowledgeDocHandleMapping[];
} {
  const turns = deps.getConversationTurns?.() ?? [];
  const byKey = new Map<string, {
    title: string;
    internalDocId?: string;
    usedCount: number;
  }>();

  for (const turn of turns) {
    for (const ref of turn.footerRefs ?? []) {
      const key = makeReferenceKey(ref);
      const existing = byKey.get(key);
      if (existing) {
        existing.usedCount += 1;
        continue;
      }
      const internalDocId = typeof ref.docId === "string" && ref.docId.trim()
        ? ref.docId.trim()
        : undefined;
      byKey.set(key, {
        title: sanitizeReferenceTitle(ref.docTitle),
        internalDocId,
        usedCount: 1,
      });
    }
  }

  const references: PlannerVisibleConversationReference[] = [];
  const internalMapping: KnowledgeDocHandleMapping[] = [];
  let index = 0;
  for (const item of byKey.values()) {
    const handle = `ref_${index++}`;
    references.push({
      handle,
      title: item.title,
      usedCount: item.usedCount,
    });
    if (item.internalDocId) {
      internalMapping.push({
        handle,
        internalDocId: item.internalDocId,
        title: item.title,
        depth: 0,
        childCount: 0,
        source: "conversation_reference",
      });
    }
  }

  return {
    safeOutput: {
      references,
      referenceCount: references.length,
      returnedReferenceCount: references.length,
      totalTurnsAvailable: turns.length,
      truncated: false,
    },
    internalMapping,
  };
}
