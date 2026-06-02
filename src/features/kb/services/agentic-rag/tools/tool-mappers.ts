/**
 * Tool Mappers
 *
 * Lightweight type mappers between agentic-rag tool output types and workspace types.
 *
 * 职责：
 * - 将 agentic-rag 本地工具输出结构转换为 workspace 兼容结构
 * - 不塞进 executor 大文件
 * - 不复制旧 AgentTaskType
 */

import type { AgenticSearchHit } from "./search-types";
import type { AgenticDocLite, AgenticDocFull } from "./doc-types";
import type { CandidateDoc, CandidateBlock, EvidenceDocument } from "../workspace/evidence-workspace";
import type { AgentToolExecutionContext } from "./tool-types";
import type { AgenticRuntimeRecentContext } from "../runtime/recent-context-types";
import { safeTextMeta, pushAgentDebugEvent } from "../debug/agentic-rag-debug";

/**
 * 将 AgentSearchHit 转换为 CandidateBlock + CandidateDoc
 */
export function mapSearchHitToCandidates(hit: AgenticSearchHit, queryText?: string): {
  doc: CandidateDoc;
  block: CandidateBlock;
} {
  const queryMeta = queryText ? safeTextMeta(queryText) : undefined;
  return {
    doc: {
      docId: hit.docId,
      title: hit.docTitle,
      box: hit.box,
      path: hit.path,
      score: hit.score,
      source: hit.source ?? "keyword",
      provenance: "search_scope",
      hasQuery: true,
      sourceQueryMeta: queryMeta,
      inventoryOnly: false,
      lifecycle: "candidate",
      relevanceScore: hit.score,
    },
    block: {
      blockId: hit.blockId,
      docId: hit.docId,
      docTitle: hit.docTitle,
      content: hit.content,
      score: hit.score,
      box: hit.box,
      path: hit.path,
      source: hit.source ?? "keyword",
      relevanceScore: hit.score,
      sourceQueryMeta: queryMeta,
      channel: hit.source ?? "keyword",
      channelHits: hit.source ? [hit.source] : ["keyword"],
    },
  };
}

/**
 * 将 AgenticDocLite 转换为 CandidateDoc
 */
export function mapAgentDocLiteToCandidateDoc(doc: AgenticDocLite, options?: { query?: string }): CandidateDoc {
  const hasQuery = !!options?.query && options.query.trim().length > 0;
  const queryText = hasQuery ? options?.query : undefined;
  return {
    docId: doc.docId,
    title: doc.title,
    box: doc.box,
    path: doc.path,
    titlePath: doc.titlePath,
    parentTitles: doc.parentTitles,
    updated: doc.updated,
    source: "list_scope_docs",
    provenance: hasQuery ? "list_scope_docs_query" : "list_scope_docs",
    hasQuery,
    sourceQueryMeta: queryText ? safeTextMeta(queryText) : undefined,
    inventoryOnly: !hasQuery,
    lifecycle: hasQuery ? "candidate" : "inventory",
  };
}

/**
 * 将 AgenticDocFull 转换为 EvidenceDocument
 */
export function mapAgentDocFullToEvidenceDocument(doc: AgenticDocFull): EvidenceDocument {
  return {
    docId: doc.docId,
    title: doc.title,
    box: doc.box,
    path: doc.path,
    content: doc.content,
    contentFormat: "markdown",
    truncated: doc.truncated,
    contentChars: doc.contentChars,
  };
}

/**
 * 从 context 中查找 docId 对应的 title/box/path 元数据
 *
 * 查找优先级：
 * 1. workspace.candidateDocs
 * 2. workspace.readDocuments
 * 3. workspace.recentEvidence
 * 4. followUpContext.previousReferenceDocIds + previousReferenceTitles
 * 5. runtime.recentContext.lastReferenceDocIds + lastReferenceTitles
 * 6. runtime.recentContext.recentReferenceDocIds + recentReferenceTitles
 * 7. scope current_doc
 * 8. scope custom_docs
 *
 * 找不到时返回 null，调用方应使用安全标题 fallback
 */
export function findDocMetaById(
  docId: string,
  context: AgentToolExecutionContext,
  recentContext?: AgenticRuntimeRecentContext
): { title: string; box?: string; path?: string } | null {
  const { scope, workspace, followUpContext } = context;

  if (workspace) {
    const candidate = workspace.candidateDocs.find((d) => d.docId === docId);
    if (candidate) {
      return { title: candidate.title, box: candidate.box, path: candidate.path };
    }

    const readDoc = workspace.readDocuments.find((d) => d.docId === docId);
    if (readDoc) {
      return { title: readDoc.title, box: readDoc.box, path: readDoc.path };
    }

    const recent = workspace.recentEvidence.find((d) => d.docId === docId);
    if (recent) {
      return { title: recent.docTitle, box: recent.box };
    }
  }

  const followUpTitles = followUpContext?.previousReferenceTitles;
  const followUpDocIds = followUpContext?.previousReferenceDocIds;
  if (Array.isArray(followUpDocIds) && followUpDocIds.length > 0) {
    const idx = followUpDocIds.indexOf(docId);
    if (idx >= 0) {
      const title = followUpTitles?.[idx];
      if (title && title.trim().length > 0) {
        const titleMeta = safeTextMeta(title);
        pushAgentDebugEvent("PREVIOUS_EVIDENCE_TITLE_RESOLVED_SAFE", {
          source: "followUpContext",
          matched: true,
          titleChars: titleMeta.chars,
          titleHash: titleMeta.hash,
        }, "info");
        return { title };
      }
    }
  }

  const rc = recentContext ?? context.runtime?.recentContext;
  if (rc) {
    const lastDocIds = rc.lastReferenceDocIds;
    const lastTitles = rc.lastReferenceTitles;
    if (Array.isArray(lastDocIds) && lastDocIds.length > 0) {
      const idx = lastDocIds.indexOf(docId);
      if (idx >= 0) {
        const title = lastTitles?.[idx];
        if (title && title.trim().length > 0) {
          const titleMeta = safeTextMeta(title);
          pushAgentDebugEvent("PREVIOUS_EVIDENCE_TITLE_RESOLVED_SAFE", {
            source: "recentContext.last",
            matched: true,
            titleChars: titleMeta.chars,
            titleHash: titleMeta.hash,
          }, "info");
          return { title };
        }
      }
    }

    const recentDocIds = rc.recentReferenceDocIds;
    const recentTitles = rc.recentReferenceTitles;
    if (Array.isArray(recentDocIds) && recentDocIds.length > 0) {
      const idx = recentDocIds.indexOf(docId);
      if (idx >= 0) {
        const title = recentTitles?.[idx];
        if (title && title.trim().length > 0) {
          const titleMeta = safeTextMeta(title);
          pushAgentDebugEvent("PREVIOUS_EVIDENCE_TITLE_RESOLVED_SAFE", {
            source: "recentContext.recent",
            matched: true,
            titleChars: titleMeta.chars,
            titleHash: titleMeta.hash,
          }, "info");
          return { title };
        }
      }
    }
  }

  if (scope?.type === "current_doc" && scope.docId === docId) {
    return { title: scope.title || "当前文档", box: scope.box };
  }

  if (scope?.type === "custom_docs" && scope.docIds?.includes(docId)) {
    return { title: "未命名文档" };
  }

  return null;
}
