import { searchKnowledgeBlocks } from "../internal/readers/search-blocks";
import type {
  SiyuanDocHit,
  SiyuanSearchHit,
} from "../internal/search-types";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import { pushAgentDebugEvent } from "../../../debug/workbench-debug";
import { sanitizeTitle, containsInternalReference } from "./safe-text";
import type {
  SearchCandidate,
  SearchScopeInput,
  SearchScopeOutput,
} from "../contracts/search-scope.contract";

const MAX_PREVIEW_CHARS = 160;

function sanitizePreview(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const preview = value.replace(/\s+/g, " ").trim();
  if (!preview) return undefined;
  if (containsInternalReference(preview)) return undefined;
  return preview.slice(0, MAX_PREVIEW_CHARS);
}

function collectPreviewByDoc(hits: SiyuanSearchHit[]): Map<string, string> {
  const previews = new Map<string, string>();
  for (const hit of hits) {
    if (previews.has(hit.docId)) continue;
    const preview = sanitizePreview(hit.content);
    if (preview) previews.set(hit.docId, preview);
  }
  return previews;
}

function addCandidate(
  state: {
    candidates: SearchCandidate[];
    seenDocIds: Set<string>;
  },
  input: {
    docId: string;
    blockId?: string;
    title: string;
    location?: string;
    preview?: string;
    matchReason?: SearchCandidate["matchReason"];
    matchedText?: string;
  },
): void {
  if (!input.docId) return;
  const safeTitle = sanitizeTitle(input.title);

  // 同一 docId 已存在时：如果新命中有 blockId 而旧记录没有，则补充 blockId。
  if (state.seenDocIds.has(input.docId)) {
    if (input.blockId) {
      const existing = state.candidates.find((c) => c.docId === input.docId);
      if (existing && !existing.blockId) {
        existing.blockId = input.blockId;
      }
    }
    return;
  }

  const candidate: SearchCandidate = {
    docId: input.docId,
    title: safeTitle,
    rank: state.candidates.length + 1,
    matchReason: input.matchReason,
  };
  // blockId 只在块级命中且 blockId !== docId 时设置
  if (input.blockId && input.blockId !== input.docId) {
    candidate.blockId = input.blockId;
  }
  if (input.location) candidate.location = input.location;
  if (input.preview) candidate.preview = input.preview;
  if (input.matchedText) candidate.matchedText = input.matchedText;
  state.candidates.push(candidate);
  state.seenDocIds.add(input.docId);
}

export async function executeSearchScope(
  deps: KbRetrievalToolDeps,
  args: SearchScopeInput,
): Promise<{
  safeOutput: SearchScopeOutput;
}> {
  const scope = deps.getEffectiveScope();
  if (!scope) {
    throw new Error("Scope not available.");
  }

  const result = await searchKnowledgeBlocks({
    scope,
    query: args.query,
    limit: args.limit,
  });

  const previewByDoc = collectPreviewByDoc(result.hits);
  const state = {
    candidates: [] as SearchCandidate[],
    seenDocIds: new Set<string>(),
  };

  // docHits 是标题/结构级别的命中
  for (const docHit of result.docHits as SiyuanDocHit[]) {
    const hasContentPreview = previewByDoc.has(docHit.docId);
    const preview = previewByDoc.get(docHit.docId);
    addCandidate(state, {
      docId: docHit.docId,
      title: docHit.docTitle,
      location: undefined,
      preview,
      matchReason: hasContentPreview ? "content" : "title",
      matchedText: hasContentPreview ? preview : docHit.docTitle,
    });
  }

  // hits 是块级别的命中（正文匹配）
  // SiyuanSearchHit.docId 是文档 root_id，blockId 是具体块 id
  // 块级命中：docId = root_id（文档），blockId = 块 id（仅当与 docId 不同时）
  for (const hit of result.hits) {
    const contentPreview = sanitizePreview(hit.content);
    addCandidate(state, {
      docId: hit.docId,
      blockId: hit.blockId,
      title: hit.docTitle,
      location: undefined,
      preview: contentPreview,
      matchReason: "content",
      matchedText: contentPreview,
    });
  }

  const hitCount = result.hits.length + result.docHits.length;
  const candidateDocCount = Math.max(
    result.candidateDocCount ?? 0,
    state.candidates.length,
  );

  // 统计命中类型（仅用于内部摘要，不进入候选字段）
  const titleHitCount = state.candidates.filter((c) => c.matchReason === "title").length;
  const contentHitCount = state.candidates.filter((c) => c.matchReason === "content").length;
  const ftsHitCount = result.hits?.length ?? 0;

  // 生成 summary
  let summary: string | undefined;
  if (ftsHitCount === 0 && titleHitCount > 0) {
    summary = "这是标题/结构候选，不代表正文命中。请根据标题判断是否需要读取对应文档。";
  } else if (contentHitCount > 0 && titleHitCount > 0) {
    summary = `包含 ${contentHitCount} 个正文命中和 ${titleHitCount} 个标题命中。`;
  }

  pushAgentDebugEvent("SEARCH_SCOPE_LOADED", {
    candidateDocCount: state.candidates.length,
    titleHitCount,
    contentHitCount,
    ftsHitCount,
  }, "debug");

  return {
    safeOutput: {
      query: args.query,
      candidates: state.candidates,
      hitCount,
      candidateDocCount,
      returnedCandidateCount: state.candidates.length,
      note: "搜索结果只是候选，不代表已读取正文。",
      summary,
      warnings: result.warnings && result.warnings.length > 0 ? result.warnings : undefined,
    },
  };
}
