import { searchBlocksForAgenticRag } from "../../../../tools/readers/search-blocks";
import type {
  AgenticDocHit,
  AgenticSearchHit,
} from "../../../../tools/search-types";
import type { KbRetrievalToolDeps } from "./kb-retrieval-tool-deps";
import { sanitizeTitle, containsInternalReference } from "./kb-safe-text";
import type {
  PlannerVisibleSearchCandidate,
  SearchScopeInput,
  SearchScopeOutput,
} from "../schemas/search-scope.schema";

const MAX_PREVIEW_CHARS = 160;

function sanitizePreview(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const preview = value.replace(/\s+/g, " ").trim();
  if (!preview) return undefined;
  if (containsInternalReference(preview)) return undefined;
  return preview.slice(0, MAX_PREVIEW_CHARS);
}

function collectPreviewByDoc(hits: AgenticSearchHit[]): Map<string, string> {
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
    candidates: PlannerVisibleSearchCandidate[];
    seenDocIds: Set<string>;
  },
  input: {
    docId: string;
    blockId?: string;
    title: string;
    preview?: string;
    score?: number;
    hitType: "titleHit" | "contentHit" | "structureHit";
  },
): void {
  if (!input.docId) return;
  const safeTitle = sanitizeTitle(input.title);

  // 同一 docId 已存在时：如果新命中有 blockId 而旧记录没有，补充 blockId
  if (state.seenDocIds.has(input.docId)) {
    if (input.blockId) {
      const existing = state.candidates.find((c) => c.docId === input.docId);
      if (existing && !existing.blockId) {
        existing.blockId = input.blockId;
      }
    }
    return;
  }

  const candidate: PlannerVisibleSearchCandidate = {
    docId: input.docId,
    sourceType: "siyuan_doc",
    title: safeTitle,
    rank: state.candidates.length + 1,
    hitType: input.hitType,
    canReadContent: input.preview ? "true" : "unknown",
  };
  // blockId 只在块级命中且 blockId !== docId 时设置
  if (input.blockId && input.blockId !== input.docId) {
    candidate.blockId = input.blockId;
  }
  if (input.preview) candidate.preview = input.preview;
  if (typeof input.score === "number" && Number.isFinite(input.score)) {
    candidate.score = Number(input.score.toFixed(6));
  }
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

  const result = await searchBlocksForAgenticRag({
    scope,
    query: args.query,
    limit: args.limit,
  });

  const previewByDoc = collectPreviewByDoc(result.hits);
  const state = {
    candidates: [] as PlannerVisibleSearchCandidate[],
    seenDocIds: new Set<string>(),
  };

  // docHits 是标题/结构级别的命中
  for (const docHit of result.docHits as AgenticDocHit[]) {
    const hasContentPreview = previewByDoc.has(docHit.docId);
    addCandidate(state, {
      docId: docHit.docId,
      title: docHit.docTitle,
      preview: previewByDoc.get(docHit.docId),
      score: docHit.score,
      hitType: hasContentPreview ? "contentHit" : "titleHit",
    });
  }

  // hits 是块级别的命中（正文匹配）
  // AgenticSearchHit.docId 是文档 root_id，blockId 是具体块 id
  // 块级命中：docId = root_id（文档），blockId = 块 id（仅当与 docId 不同时）
  for (const hit of result.hits) {
    const contentPreview = sanitizePreview(hit.content);
    addCandidate(state, {
      docId: hit.docId,
      blockId: hit.blockId,
      title: hit.docTitle,
      preview: contentPreview,
      score: hit.score,
      hitType: "contentHit",
    });
  }

  const hitCount = result.hits.length + result.docHits.length;
  const candidateDocCount = Math.max(
    result.candidateDocCount ?? 0,
    state.candidates.length,
  );

  // 统计命中类型
  const titleHitCount = state.candidates.filter((c) => c.hitType === "titleHit").length;
  const contentHitCount = state.candidates.filter((c) => c.hitType === "contentHit").length;
  const ftsHitCount = result.hits?.length ?? 0;

  // 生成 summary
  let summary: string | undefined;
  if (ftsHitCount === 0 && titleHitCount > 0) {
    summary = "这是标题/结构候选，不代表正文命中。请根据标题判断是否需要读取对应文档。";
  } else if (contentHitCount > 0 && titleHitCount > 0) {
    summary = `包含 ${contentHitCount} 个正文命中和 ${titleHitCount} 个标题命中。`;
  }

  console.info("[KB-AGENT | SEARCH_SCOPE_LOADED]", {
    candidateDocCount: state.candidates.length,
    titleHitCount,
    contentHitCount,
    ftsHitCount,
  });

  return {
    safeOutput: {
      candidates: state.candidates,
      hitCount,
      candidateDocCount,
      returnedCandidateCount: state.candidates.length,
      truncated: hitCount > state.candidates.length,
      summary,
    },
  };
}
