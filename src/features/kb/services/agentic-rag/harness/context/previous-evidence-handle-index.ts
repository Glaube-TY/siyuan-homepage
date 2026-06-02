import type { EvidenceWorkspace, ConversationUsedReference } from "../../workspace/evidence-workspace";
import type { FollowUpContext } from "../../runtime/follow-up-context";
import type { AgenticRuntimeRecentContext } from "../../runtime/recent-context-types";

export interface PreviousEvidenceHandleItem {
  handle: string;
  title?: string;
  turnIndex: number;
  sourceKind?: string;
}

export interface PreviousEvidenceHandleIndex {
  items: PreviousEvidenceHandleItem[];
  handleToDocId: Map<string, string>;
  totalDisplayedCount: number;
  readableCount: number;
  nonReadableCount: number;
  alreadyReadCount: number;
  unreadReadableItems: PreviousEvidenceHandleItem[];
}

function extractReadableFromConversationRefs(
  conversationUsedRefs: ConversationUsedReference[],
  readDocIds: Set<string>,
): PreviousEvidenceHandleIndex {
  const items: PreviousEvidenceHandleItem[] = [];
  const handleToDocId = new Map<string, string>();
  let totalDisplayedCount = 0;
  let alreadyReadCount = 0;

  for (const turnRef of conversationUsedRefs) {
    for (const ref of turnRef.references ?? []) {
      if (!ref.referenceHandle || ref.referenceHandle.trim().length === 0) continue;
      totalDisplayedCount++;

      const hasDocId = !!ref.internalDocId && ref.internalDocId.trim().length > 0;
      if (hasDocId) {
        handleToDocId.set(ref.referenceHandle, ref.internalDocId!);
        items.push({
          handle: ref.referenceHandle,
          title: ref.docTitle && ref.docTitle.trim().length > 0 ? ref.docTitle : undefined,
          turnIndex: turnRef.turnIndex,
          sourceKind: ref.sourceKind,
        });
        if (readDocIds.has(ref.internalDocId!)) {
          alreadyReadCount++;
        }
      }
    }
  }

  const readableCount = items.length;
  const nonReadableCount = totalDisplayedCount - readableCount;
  const unreadReadableItems = items.filter((item) => {
    const docId = handleToDocId.get(item.handle);
    return docId && !readDocIds.has(docId);
  });

  return {
    items,
    handleToDocId,
    totalDisplayedCount,
    readableCount,
    nonReadableCount,
    alreadyReadCount,
    unreadReadableItems,
  };
}

function extractFromFollowUpContext(
  followUp: FollowUpContext,
  readDocIds: Set<string>,
  lastTurnIndex: number,
): PreviousEvidenceHandleIndex {
  const items: PreviousEvidenceHandleItem[] = [];
  const handleToDocId = new Map<string, string>();
  let alreadyReadCount = 0;

  const titles = followUp.previousReferenceTitles ?? [];

  for (let i = 0; i < followUp.previousReferenceDocIds.length; i++) {
    const docId = followUp.previousReferenceDocIds[i];
    if (!docId || docId.trim().length === 0) continue;

    const handle = `prev_ref:${lastTurnIndex}:${i}`;
    handleToDocId.set(handle, docId);
    items.push({
      handle,
      title: titles[i] && titles[i].trim().length > 0 ? titles[i] : undefined,
      turnIndex: lastTurnIndex,
    });
    if (readDocIds.has(docId)) {
      alreadyReadCount++;
    }
  }

  const readableCount = items.length;
  const unreadReadableItems = items.filter((item) => {
    const docId = handleToDocId.get(item.handle);
    return docId && !readDocIds.has(docId);
  });

  return {
    items,
    handleToDocId,
    totalDisplayedCount: readableCount,
    readableCount,
    nonReadableCount: 0,
    alreadyReadCount,
    unreadReadableItems,
  };
}

export function buildPreviousEvidenceHandleIndex(
  workspace: Pick<EvidenceWorkspace, "conversationUsedReferences" | "readDocuments">,
  followUpContext?: FollowUpContext,
  recentContext?: AgenticRuntimeRecentContext,
): PreviousEvidenceHandleIndex | undefined {
  const readDocIds = new Set(
    (workspace.readDocuments ?? []).map((d) => d.docId).filter(Boolean)
  );

  const conversationUsedRefs = workspace.conversationUsedReferences;
  if (conversationUsedRefs && conversationUsedRefs.length > 0) {
    const index = extractReadableFromConversationRefs(conversationUsedRefs, readDocIds);
    if (index.readableCount > 0) {
      return index;
    }
    if (index.totalDisplayedCount > 0) {
      return index;
    }
  }

  if (followUpContext?.previousReferenceDocIds && followUpContext.previousReferenceDocIds.length > 0) {
    const conversationTurns = recentContext?.conversationTurns;
    const lastTurnIndex = conversationTurns && conversationTurns.length > 0 ? conversationTurns.length - 1 : 0;
    const index = extractFromFollowUpContext(followUpContext, readDocIds, lastTurnIndex);
    if (index.readableCount > 0) {
      return index;
    }
  }

  return undefined;
}
