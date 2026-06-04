import type {
  KbConversationReference,
  KbRetrievalToolDeps,
} from "./kb-retrieval-tool-deps";
import { sanitizeTitle } from "./kb-safe-text";
import type {
  ListRecentReferencesOutput,
  PlannerVisibleRecentReference,
} from "../schemas/list-recent-references.schema";

function sanitizeReferenceTitle(value: unknown): string {
  return sanitizeTitle(value);
}

interface AccumulatedRef {
  docId: string;
  blockId?: string;
  title: string;
  sourceType?: string;
  preview?: string;
  usedCount: number;
  lastSeenAt?: number;
  minTurnAge?: number;
  source?: string;
  lastKnownStatus?: "available" | "not_found" | "permission_denied" | "mismatch";
}

function makeReferenceKey(ref: KbConversationReference): string {
  const docId = typeof ref.docId === "string" ? ref.docId.trim() : "";
  if (docId) return `id:${docId}`;
  return `title:${sanitizeReferenceTitle(ref.docTitle)}`;
}

export function executeListRecentReferences(
  deps: KbRetrievalToolDeps,
): {
  safeOutput: ListRecentReferencesOutput;
} {
  const turns = deps.getConversationTurns?.() ?? [];
  const recentTurns = deps.getRecentConversationContext?.() ?? [];
  const byKey = new Map<string, AccumulatedRef>();

  // 从 recentConversationContext 提取引用（按从旧到新遍历，后面覆盖前面的 lastSeenAt）
  for (const turn of recentTurns) {
    for (const ref of turn.displayReferences ?? []) {
      const docId = typeof ref.docId === "string" ? ref.docId.trim() : "";
      if (!docId) continue;
      const blockId = typeof ref.blockId === "string" && ref.blockId.trim() ? ref.blockId.trim() : undefined;
      const key = blockId ? `docId:${docId}:blockId:${blockId}` : `docId:${docId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.usedCount += 1;
        // 更新为最近出现时间
        if (turn.createdAt && (!existing.lastSeenAt || turn.createdAt > existing.lastSeenAt)) {
          existing.lastSeenAt = turn.createdAt;
        }
        // 更新为最小 turnAge（最近出现）
        if (typeof ref.turnAge === "number" && (existing.minTurnAge === undefined || ref.turnAge < existing.minTurnAge)) {
          existing.minTurnAge = ref.turnAge;
        }
        continue;
      }
      byKey.set(key, {
        docId,
        blockId,
        title: sanitizeReferenceTitle(ref.title),
        sourceType: typeof ref.sourceType === "string" ? ref.sourceType : "unknown",
        preview: typeof ref.snippet === "string" ? ref.snippet.slice(0, 200) : undefined,
        usedCount: 1,
        lastSeenAt: turn.createdAt,
        minTurnAge: ref.turnAge,
        source: ref.source,
        lastKnownStatus: undefined,
      });
    }
  }

  for (const turn of turns) {
    for (const ref of turn.footerRefs ?? []) {
      const key = makeReferenceKey(ref);
      const existing = byKey.get(key);
      if (existing) {
        existing.usedCount += 1;
        continue;
      }
      const docId = typeof ref.docId === "string" && ref.docId.trim()
        ? ref.docId.trim()
        : "";
      if (!docId) continue;
      byKey.set(key, {
        docId,
        title: sanitizeReferenceTitle(ref.docTitle),
        usedCount: 1,
      });
    }
  }

  // 按最近出现时间排序（最近的在前），无时间的按 minTurnAge 排序
  const sortedEntries = [...byKey.values()].sort((a, b) => {
    // 有 lastSeenAt 的按时间降序
    if (a.lastSeenAt !== undefined && b.lastSeenAt !== undefined) {
      return b.lastSeenAt - a.lastSeenAt;
    }
    // 有 minTurnAge 的按 turnAge 升序（0=最近）
    if (a.minTurnAge !== undefined && b.minTurnAge !== undefined) {
      return a.minTurnAge - b.minTurnAge;
    }
    // 有时间的优先
    if (a.lastSeenAt !== undefined) return -1;
    if (b.lastSeenAt !== undefined) return 1;
    return 0;
  });

  const references: PlannerVisibleRecentReference[] = sortedEntries.map((item) => {
    const ref: PlannerVisibleRecentReference = {
      docId: item.docId,
      title: item.title,
      sourceType: item.sourceType ?? "siyuan_doc",
      preview: item.preview,
      usedCount: item.usedCount,
    };
    if (item.blockId) {
      ref.blockId = item.blockId;
    }
    if (item.lastSeenAt !== undefined) {
      ref.lastSeenAt = item.lastSeenAt;
    }
    if (item.minTurnAge !== undefined) {
      ref.turnAge = item.minTurnAge;
    }
    if (item.source) {
      ref.source = item.source;
    }
    if (item.lastKnownStatus) {
      ref.lastKnownStatus = item.lastKnownStatus;
    }
    return ref;
  });

  return {
    safeOutput: {
      references,
      referenceCount: references.length,
      returnedReferenceCount: references.length,
      totalTurnsAvailable: turns.length,
      truncated: false,
    },
  };
}
