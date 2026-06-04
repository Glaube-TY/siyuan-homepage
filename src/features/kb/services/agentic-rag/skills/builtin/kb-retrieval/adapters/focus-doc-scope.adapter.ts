import type { ActiveFocusScope } from "../../../../tools/knowledge-map-types";
import type { KbRetrievalToolDeps } from "./kb-retrieval-tool-deps";
import { sanitizeTitle } from "./kb-safe-text";
import type {
  FocusDocScopeInput,
  FocusDocScopeOutput,
  PlannerVisibleScopeDoc,
} from "../schemas/focus-doc-scope.schema";

function resolveFocusDocs(
  args: FocusDocScopeInput,
): Array<{ docId: string; title: string; depth?: number; childCount?: number }> {
  return args.docIds.map((docId) => ({
    docId,
    title: "未命名文档",
    depth: 0,
    childCount: 0,
  }));
}

export function executeFocusDocScope(
  _deps: KbRetrievalToolDeps,
  args: FocusDocScopeInput,
): {
  safeOutput: FocusDocScopeOutput;
  activeFocusScope: ActiveFocusScope;
} {
  const resolved = resolveFocusDocs(args);
  if (resolved.length === 0) {
    throw new Error("需要提供有效的 docIds。");
  }

  const docIds = resolved.map((m) => m.docId);
  const docs: PlannerVisibleScopeDoc[] = resolved.map((m) => ({
    docId: m.docId,
    title: sanitizeTitle(m.title),
    depth: m.depth,
    childCount: m.childCount ?? 0,
  }));
  const activeFocusScope: ActiveFocusScope = {
    docIds,
    mode: args.mode,
    reason: `focus_doc_scope:${args.mode}`,
    source: "focus_doc_scope",
    createdAtActionIndex: 0,
    maxDocIds: args.maxDocIds,
    expandedDocs: docs.map((d) => ({
      docId: d.docId,
      title: d.title,
      depth: d.depth,
      childCount: d.childCount,
      relationToFocus: "root" as const,
    })),
    primaryRoot: resolved[0]
      ? { title: resolved[0].title, titlePath: resolved[0].title, docId: resolved[0].docId }
      : undefined,
  };

  return {
    safeOutput: { docs, focusedDocCount: docs.length, mode: args.mode, truncated: docs.length >= args.maxDocIds },
    activeFocusScope,
  };
}
