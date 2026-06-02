/**
 * Workspace Update
 *
 * 统一更新 EvidenceWorkspace 的 helper。
 *
 * 职责：
 * - 所有工具结果都通过 updateWorkspaceFromToolResult 写入 EvidenceWorkspace
 * - 返回新的 EvidenceWorkspace，不原地 mutate
 * - 按 action.type 处理不同工具的合并逻辑
 * - 统一 merge result.warning / observation.warning / data.warnings / result.error
 * - 去重规则：docId/blockId/字符串/warnings
 * - 搜索候选不是最终证据，不放入 readDocuments
 * - 每次都追加 ToolObservation
 * - coverage 计数按"新加入数量"增加，避免膨胀
 */

import type { AgentAction } from "../actions/action-types";
import type { AgentToolDefinition, AgentToolExecutionResult } from "../tools/tool-types";
import type { PlannerActionMaterializeResult } from "../actions/planner-action-materializer";
import type {
  EvidenceWorkspace,
  CandidateDoc,
  CandidateBlock,
  EvidenceDocument,
  EvidenceBlockContext,
  ToolObservation,
} from "./evidence-workspace";
import type { SafeTextMeta } from "../debug/agentic-rag-debug";
import { safeTextMeta } from "../debug/agentic-rag-debug";
import type { KnowledgeDocHandleMapping, ExpandedFocusDoc } from "../tools/knowledge-map-types";
import { mergeCandidateDocIdsIntoPool, markDocsAsReadInPool } from "./research-candidate-pool";
import { isStrongCandidateDoc, isInventoryOnlyCandidateDoc } from "./candidate-quality";

export interface UpdateWorkspaceParams {
  workspace: EvidenceWorkspace;
  action: AgentAction;
  result: AgentToolExecutionResult;
  observation?: ReturnType<AgentToolDefinition["observationFormatter"]>;
  materializerMetadata?: PlannerActionMaterializeResult["previousReferenceMetadata"];
}

function dedupStrings(arr: string[]): string[] {
  return [...new Set(arr)];
}

function provenanceQualityScore(doc: CandidateDoc): number {
  let score = 0;
  if (doc.provenance === "structural_focus") score += 20;
  else if (doc.provenance === "search_scope") score += 10;
  else if (doc.provenance === "list_scope_docs_query") score += 8;
  else if (doc.provenance === "doc_tree_context") score += 7;
  else if (doc.provenance === "metadata") score += 5;
  else if (doc.provenance === "link_graph") score += 4;
  else if (doc.provenance === "list_scope_docs") score += 2;
  if (doc.hasQuery) score += 3;
  if (!doc.inventoryOnly) score += 2;
  if (doc.lifecycle === "candidate") score += 2;
  if (doc.relevanceScore != null) score += doc.relevanceScore;
  return score;
}

function shouldReplaceCandidateDoc(existing: CandidateDoc, incoming: CandidateDoc): boolean {
  if (existing.docId !== incoming.docId) return false;
  const existingScore = existing.aggregateScore ?? existing.relevanceScore ?? existing.score ?? 0;
  const incomingAggregateScore = incoming.aggregateScore ?? incoming.relevanceScore ?? incoming.score ?? 0;
  if (incomingAggregateScore > existingScore) return true;
  if (incomingAggregateScore < existingScore) return false;
  const existingProvScore = provenanceQualityScore(existing);
  const incomingProvScore = provenanceQualityScore(incoming);
  return incomingProvScore > existingProvScore;
}

function mergeCandidateDocs(existing: CandidateDoc[], incoming: CandidateDoc[]): CandidateDoc[] {
  const result = [...existing];
  const existingMap = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    existingMap.set(result[i].docId, i);
  }

  for (const doc of incoming) {
    const existingIdx = existingMap.get(doc.docId);
    if (existingIdx === undefined) {
      result.push(doc);
      existingMap.set(doc.docId, result.length - 1);
    } else {
      const existingDoc = result[existingIdx];
      if (shouldReplaceCandidateDoc(existingDoc, doc)) {
        result[existingIdx] = doc;
      } else {
        const merged = mergeDocCandidateScores(existingDoc, doc);
        result[existingIdx] = merged;
      }
    }
  }

  result.sort((a, b) => {
    const scoreA = a.aggregateScore ?? a.relevanceScore ?? a.score ?? 0;
    const scoreB = b.aggregateScore ?? b.relevanceScore ?? b.score ?? 0;
    return scoreB - scoreA;
  });

  return result;
}

function mergeDocCandidateScores(existing: CandidateDoc, incoming: CandidateDoc): CandidateDoc {
  const merged: CandidateDoc = { ...existing };

  const existingIsInventory = existing.inventoryOnly === true || existing.lifecycle === "inventory";
  const incomingIsStrong = incoming.provenance === "structural_focus"
    || incoming.provenance === "search_scope"
    || incoming.provenance === "list_scope_docs_query"
    || incoming.provenance === "doc_tree_context";

  if (existingIsInventory && incomingIsStrong) {
    merged.provenance = incoming.provenance;
    merged.lifecycle = incoming.lifecycle;
    merged.inventoryOnly = incoming.inventoryOnly;
    merged.source = incoming.source;
    if (incoming.relationToFocus !== undefined) merged.relationToFocus = incoming.relationToFocus;
    if (incoming.structuralReason !== undefined) merged.structuralReason = incoming.structuralReason;
    if (incoming.relevanceScore != null) merged.relevanceScore = incoming.relevanceScore;
    if (incoming.aggregateScore != null) merged.aggregateScore = incoming.aggregateScore;
  }

  const existingAggregate = existing.aggregateScore ?? existing.relevanceScore ?? existing.score ?? 0;
  const incomingAggregate = incoming.aggregateScore ?? incoming.relevanceScore ?? incoming.score ?? 0;

  if (incomingAggregate > existingAggregate) {
    merged.aggregateScore = incomingAggregate;
    merged.relevanceScore = incomingAggregate;
    merged.score = incomingAggregate;
  }

  if (incoming.topBlockScore !== undefined) {
    const existingTop = existing.topBlockScore ?? 0;
    merged.topBlockScore = Math.max(existingTop, incoming.topBlockScore);
  }

  const existingMetaMap = new Map<string, SafeTextMeta>();
  for (const m of existing.sourceQueryMetas ?? (existing.sourceQueryMeta ? [existing.sourceQueryMeta] : [])) {
    if (m.hash) existingMetaMap.set(m.hash, m);
  }
  if (incoming.sourceQueryMeta?.hash && !existingMetaMap.has(incoming.sourceQueryMeta.hash)) {
    existingMetaMap.set(incoming.sourceQueryMeta.hash, incoming.sourceQueryMeta);
  }
  if (incoming.sourceQueryMetas) {
    for (const m of incoming.sourceQueryMetas) {
      if (m.hash && !existingMetaMap.has(m.hash)) {
        existingMetaMap.set(m.hash, m);
      }
    }
  }
  const mergedMetas = Array.from(existingMetaMap.values());
  merged.sourceQueryMetas = mergedMetas;
  if (mergedMetas.length > 0 && !merged.sourceQueryMeta) {
    merged.sourceQueryMeta = mergedMetas[0];
  }

  const existingChannels = new Set(existing.channelHits ?? []);
  if (incoming.source) {
    existingChannels.add(incoming.source);
  }
  if (incoming.channelHits) {
    for (const c of incoming.channelHits) {
      existingChannels.add(c);
    }
  }
  merged.channelHits = Array.from(existingChannels);

  if (incoming.title) {
    merged.title = incoming.title;
  }
  if (incoming.box) {
    merged.box = incoming.box;
  }
  if (incoming.path) {
    merged.path = incoming.path;
  }

  return merged;
}

function mergeResultWarnings(
  result: AgentToolExecutionResult,
  observation?: ReturnType<AgentToolDefinition["observationFormatter"]>,
  dataWarnings?: unknown
): string[] {
  const parts: string[] = [];
  if (result.error) parts.push(result.error);
  if (result.warning) parts.push(result.warning);
  if (observation?.warning) parts.push(observation.warning);
  if (dataWarnings) {
    const w = Array.isArray(dataWarnings) ? dataWarnings.join("; ") : String(dataWarnings);
    if (w) parts.push(w);
  }
  return parts.filter(Boolean);
}

function mergeWarnings(existing: string[], incoming: string[]): string[] {
  return dedupStrings([...existing, ...incoming]);
}

export function updateWorkspaceFromToolResult(params: UpdateWorkspaceParams): EvidenceWorkspace {
  const { workspace, action, result, observation, materializerMetadata } = params;
  const data = (result.data as Record<string, unknown> | undefined) ?? undefined;

  const newWorkspace: EvidenceWorkspace = {
    candidateDocs: [...workspace.candidateDocs],
    candidateBlocks: [...workspace.candidateBlocks],
    dailyNotes: [...workspace.dailyNotes],
    tasks: [...workspace.tasks],
    metadataHits: [...workspace.metadataHits],
    linkGraph: workspace.linkGraph ? { nodes: [...workspace.linkGraph.nodes], edges: [...workspace.linkGraph.edges] } : undefined,
    readDocuments: [...workspace.readDocuments],
    readBlockContexts: [...workspace.readBlockContexts],
    docOutlines: [...workspace.docOutlines],
    recentEvidence: [...workspace.recentEvidence],
    toolObservations: [...workspace.toolObservations],
    warnings: [...workspace.warnings],
    coverage: { ...workspace.coverage },
    usedEvidenceIds: [...workspace.usedEvidenceIds],
    references: [...workspace.references],
    conversationUsedReferences: workspace.conversationUsedReferences ? [...workspace.conversationUsedReferences] : undefined,
    previousReferenceReadState: workspace.previousReferenceReadState
      ? { ...workspace.previousReferenceReadState, remainingDocIds: [...workspace.previousReferenceReadState.remainingDocIds], readDocIdSet: new Set(workspace.previousReferenceReadState.readDocIdSet) }
      : undefined,
    // 保留 knowledge map 到本轮结束，只有 list_knowledge_map 会更新这些字段
    knowledgeMap: workspace.knowledgeMap,
    docHandleMappings: workspace.docHandleMappings ? [...workspace.docHandleMappings] : undefined,
    activeFocusScope: workspace.activeFocusScope,
    researchCandidatePool: workspace.researchCandidatePool,
  };

  const attemptedDocIds = data?.attemptedDocIds as string[] | undefined;
  const failedDocIds = data?.failedDocIds as string[] | undefined;
  const attemptedBlockIds = data?.attemptedBlockIds as string[] | undefined;
  const failedBlockIds = data?.failedBlockIds as string[] | undefined;

  const toolObservation: ToolObservation = {
    actionType: action.type,
    success: result.success,
    summary: observation?.summary,
    counts: observation?.counts as ToolObservation["counts"],
    error: result.error ?? observation?.error,
    warning: result.warning ?? observation?.warning,
    attemptedDocIds: attemptedDocIds,
    failedDocIds: failedDocIds,
    attemptedBlockIds: attemptedBlockIds,
    failedBlockIds: failedBlockIds,
  };
  newWorkspace.toolObservations.push(toolObservation);

  const allWarnings = mergeResultWarnings(result, observation, data?.warnings);
  newWorkspace.warnings = mergeWarnings(newWorkspace.warnings, allWarnings);

  if (!result.success) {
    return newWorkspace;
  }

  switch (action.type) {
    case "search_scope": {
      const candidateDocs = (data?.candidateDocs as CandidateDoc[]) ?? [];
      const candidateBlocks = (data?.candidateBlocks as CandidateBlock[]) ?? [];
      const searchedQueryMetas = (data?.searchedQueryMetas as Array<{ hasText: boolean; chars: number; hash?: string }>) ?? [];

      newWorkspace.candidateDocs = mergeCandidateDocs(newWorkspace.candidateDocs, candidateDocs);

      const existingBlockIds = new Set(newWorkspace.candidateBlocks.map((b) => b.blockId));
      const newBlocks = candidateBlocks.filter((b) => !existingBlockIds.has(b.blockId));
      newWorkspace.candidateBlocks = [...newWorkspace.candidateBlocks, ...newBlocks];

      const existingMetaHashes = new Set(newWorkspace.coverage.searchedQueryMetas.map((m) => m.hash).filter(Boolean));
      for (const meta of searchedQueryMetas) {
        if (!meta.hash || !existingMetaHashes.has(meta.hash)) {
          newWorkspace.coverage.searchedQueryMetas.push(meta);
          if (meta.hash) existingMetaHashes.add(meta.hash);
        }
      }
      newWorkspace.coverage.searchCallCount = (newWorkspace.coverage.searchCallCount ?? 0) + 1;

      const searchHitStrongCandidates = candidateDocs.filter((d) => isStrongCandidateDoc(d));
      const searchHitInventoryDropped = candidateDocs.filter((d) => isInventoryOnlyCandidateDoc(d)).length;
      const blockDerivedDocIds = new Set(candidateBlocks.map((b) => b.docId).filter(Boolean));
      const blockDerivedStrongCandidates = [...blockDerivedDocIds]
        .map((docId) => newWorkspace.candidateDocs.find((d) => d.docId === docId))
        .filter((d): d is CandidateDoc => !!d && isStrongCandidateDoc(d));

      const poolSourceCandidates = [...searchHitStrongCandidates, ...blockDerivedStrongCandidates];
      const seenPoolDocIds = new Set<string>();
      const dedupedPoolCandidates = poolSourceCandidates.filter((d) => {
        if (seenPoolDocIds.has(d.docId)) return false;
        seenPoolDocIds.add(d.docId);
        return true;
      });

      const sortedCandidateDocIds = dedupedPoolCandidates
        .sort((a, b) => {
          const scoreA = a.aggregateScore ?? a.relevanceScore ?? a.score ?? 0;
          const scoreB = b.aggregateScore ?? b.relevanceScore ?? b.score ?? 0;
          return scoreB - scoreA;
        })
        .map((d) => d.docId);

      console.info("[KB-AGENT | RESEARCH_POOL_BUILT_SAFE]", {
        sourceAction: "search_scope",
        sourceCandidateCount: candidateDocs.length,
        poolDocCount: sortedCandidateDocIds.length,
        inventoryDroppedCount: searchHitInventoryDropped,
        searchHitCandidateCount: searchHitStrongCandidates.length,
        blockDerivedDocCount: blockDerivedStrongCandidates.length,
      });

      const queryKey = searchedQueryMetas.map((m) => m.hash ?? "nohash").join("|") || "search";
      const existingPool = workspace.researchCandidatePool;
      if (existingPool && existingPool.queryKey === queryKey) {
        newWorkspace.researchCandidatePool = mergeCandidateDocIdsIntoPool(existingPool, sortedCandidateDocIds, queryKey);
      } else {
        newWorkspace.researchCandidatePool = mergeCandidateDocIdsIntoPool(
          { queryKey: "", candidateDocIdsInRankOrder: [], readDocIds: [], skippedDocIds: [], exhausted: false, lastBatchSize: 0, totalCandidateCount: 0, batchCount: 0 },
          sortedCandidateDocIds,
          queryKey
        );
      }
      break;
    }

    case "list_scope_docs": {
      const candidateDocs = (data?.candidateDocs as CandidateDoc[]) ?? [];
      let docs: CandidateDoc[];
      if (candidateDocs.length > 0) {
        docs = candidateDocs;
      } else {
        const listArgs = action.args as { query?: string } | undefined;
        const hasQuery = !!listArgs?.query && listArgs.query.trim().length > 0;
        const rawDocs = (data?.docs as Array<{ docId: string; title: string; box?: string; path?: string; titlePath?: string; parentTitles?: string[]; updated?: string }>) ?? [];
        docs = rawDocs.map((d) => ({
          docId: d.docId,
          title: d.title,
          box: d.box,
          path: d.path,
          titlePath: d.titlePath,
          parentTitles: d.parentTitles,
          updated: d.updated,
          score: undefined,
          source: "list_scope_docs",
          provenance: hasQuery ? "list_scope_docs_query" : "list_scope_docs",
          hasQuery,
          sourceQueryMeta: hasQuery && listArgs?.query ? safeTextMeta(listArgs.query) : undefined,
          inventoryOnly: !hasQuery,
          lifecycle: hasQuery ? "candidate" : "inventory",
        }));
      }

      newWorkspace.candidateDocs = mergeCandidateDocs(newWorkspace.candidateDocs, docs);
      const existingDocIdsBefore = new Set(workspace.candidateDocs.map((d) => d.docId));
      const trulyNewCount = docs.filter((d) => !existingDocIdsBefore.has(d.docId)).length;
      newWorkspace.coverage.listedDocCount = (newWorkspace.coverage.listedDocCount ?? 0) + trulyNewCount;
      break;
    }

    case "read_docs": {
      const documents = (data?.documents as EvidenceDocument[]) ?? [];
      const existingDocIds = new Set(newWorkspace.readDocuments.map((d) => d.docId));
      const newDocs = documents.filter((d) => !existingDocIds.has(d.docId));

      const candidateDocMap = new Map<string, CandidateDoc>();
      for (const c of workspace.candidateDocs) {
        candidateDocMap.set(c.docId, c);
      }

      const actionReadSource = ((action.args as unknown) as Record<string, unknown>)?.readSource as string | undefined;

      for (const doc of newDocs) {
        // actionReadSource 优先级最高，特别是 previous_evidence
        if (actionReadSource) {
          (doc as any).readSource = actionReadSource;
          (doc as any).provenance = actionReadSource;
        } else {
          const candidate = candidateDocMap.get(doc.docId);
          if (candidate) {
            (doc as any).readSource = candidate.source || candidate.provenance;
            (doc as any).provenance = candidate.provenance;
          }
        }
        newWorkspace.readDocuments.push(doc);
      }
      newWorkspace.coverage.readDocCount = (newWorkspace.coverage.readDocCount ?? 0) + newDocs.length;

      if (newWorkspace.researchCandidatePool && newDocs.length > 0) {
        newWorkspace.researchCandidatePool = markDocsAsReadInPool(
          newWorkspace.researchCandidatePool,
          newDocs.map((d) => d.docId)
        );
      }

      // 安全日志：不输出真实 docId
      const previousReferenceDocCount = newDocs.filter((d) => (d as any).readSource === "previous_evidence").length;
      console.info("[KB-AGENT | READ_DOCS_WORKSPACE_STORED_SAFE]", {
        newDocCount: newDocs.length,
        readSource: actionReadSource ?? "unknown",
        previousReferenceDocCount,
      });

      // 循环保护：记录上一批 previous_evidence 读取的 docId
      if (actionReadSource === "previous_evidence") {
        newWorkspace.lastReadPreviousEvidenceBatch = newDocs.map((d) => d.docId);

        const readDocCount = newWorkspace.readDocuments.length;
        const evidenceItemCount = readDocCount + newWorkspace.readBlockContexts.length;
        console.info("[KB-AGENT | PREVIOUS_EVIDENCE_READ_INTEGRATED_SAFE]", {
          readDocCount,
          evidenceItemCount,
          source: "previous_evidence",
        });

        if (materializerMetadata) {
          if (materializerMetadata.source === "conversation_used_references" || materializerMetadata.source === "followUp_context" || materializerMetadata.source === "recent_context") {
            const existingState = workspace.previousReferenceReadState;
            const existingReadSet = existingState ? new Set(existingState.readDocIdSet) : new Set<string>();
            const existingSelectedTurns = existingState ? [...existingState.selectedTurnIndexes] : [];
            const existingTotal = existingState ? existingState.totalCount : materializerMetadata.sourceDocIds.length;

            const newReadDocIds = newDocs.map((d) => d.docId);
            for (const docId of newReadDocIds) {
              existingReadSet.add(docId);
            }

            const newRemaining = materializerMetadata.sourceDocIds.filter((id) => !existingReadSet.has(id));

            newWorkspace.previousReferenceReadState = {
              totalCount: existingTotal,
              selectedTurnIndexes: existingSelectedTurns,
              readDocIdSet: existingReadSet,
              remainingDocIds: newRemaining,
              source: "displayed_footer_references",
            };

            console.info("[KB-AGENT | PREVIOUS_REFERENCE_READ_STATE_UPDATED_SAFE]", {
              totalCount: existingTotal,
              readCount: existingReadSet.size,
              remainingCount: newRemaining.length,
              materializerSource: materializerMetadata.source,
            });
          }
        }
      }

      break;
    }

    case "read_block_context": {
      const contexts = (data?.contexts as EvidenceBlockContext[]) ?? [];
      const existingBlockIds = new Set(newWorkspace.readBlockContexts.map((c) => c.blockId));
      const newContexts = contexts.filter((c) => !existingBlockIds.has(c.blockId));
      for (const ctx of newContexts) {
        newWorkspace.readBlockContexts.push(ctx);
      }
      newWorkspace.coverage.readBlockContextCount = (newWorkspace.coverage.readBlockContextCount ?? 0) + newContexts.length;
      break;
    }

    case "answer": {
      break;
    }

    case "get_conversation_used_references": {
      // 优先使用 internalConversationUsedReferences（包含 internalDocId），严禁该字段进入 observation/prompt/debug
      const internalRefs = (data as any)?.internalConversationUsedReferences as any[] | undefined;
      const safeRefs = (data?.conversationUsedReferences as any[]) ?? [];

      if (internalRefs && internalRefs.length > 0) {
        newWorkspace.conversationUsedReferences = internalRefs;
      } else if (safeRefs.length > 0) {
        // 只有 internal 不存在时才用 safe data
        newWorkspace.conversationUsedReferences = safeRefs;
      }

      // 安全日志：不输出真实 docId
      const storedRefs = newWorkspace.conversationUsedReferences ?? [];
      let internalDocIdCount = 0;
      for (const turnRef of storedRefs) {
        for (const ref of turnRef.references ?? []) {
          if (ref.internalDocId && ref.internalDocId.trim().length > 0) {
            internalDocIdCount++;
          }
        }
      }
      const totalRefCount = storedRefs.reduce((sum, r) => sum + (r.references?.length ?? 0), 0);
      console.info("[KB-AGENT | CONVERSATION_USED_REFERENCES_WORKSPACE_STORED]", {
        totalRefCount,
        internalDocIdCount,
      });
      break;
    }

    case "get_doc_tree_context": {
      const internalMapping = (data?.internalMapping as Array<{
        handle: string;
        internalDocId: string;
        title: string;
        relation: string;
        provenance: string;
      }>) ?? [];

      if (internalMapping.length > 0) {
        // 按 internalDocId 去重，保留第一个
        const uniqueMapping = new Map<string, typeof internalMapping[0]>();
        for (const m of internalMapping) {
          if (!uniqueMapping.has(m.internalDocId)) {
            uniqueMapping.set(m.internalDocId, m);
          }
        }
        const dedupedMapping = [...uniqueMapping.values()];
        const duplicateCandidateCount = internalMapping.length - dedupedMapping.length;

        const treeCandidateDocs: CandidateDoc[] = dedupedMapping.map((m) => ({
          docId: m.internalDocId,
          title: m.title,
          source: "get_doc_tree_context",
          provenance: "doc_tree_context" as any,
          lifecycle: "candidate",
          inventoryOnly: false,
          relevanceScore: 5,
          aggregateScore: 5,
          matchedBlockCount: 0,
          topBlockScore: 0,
          sourceQueryMetas: [],
          channelHits: [],
        }));

        // 计算去重前的已存在文档
        const existingDocIdsBefore = new Set(workspace.candidateDocs.map((d) => d.docId));
        
        // 合并候选
        newWorkspace.candidateDocs = mergeCandidateDocs(newWorkspace.candidateDocs, treeCandidateDocs);

        // 计算真正新增的文档数
        const trulyNewCount = treeCandidateDocs.filter((d) => !existingDocIdsBefore.has(d.docId)).length;
        const excludedAnchorCount = (data?.excludedAnchorSelfCount as number) ?? 0;

        // 按 docId 去重后的唯一候选
        const uniqueCandidateDocIds = [...new Set(newWorkspace.candidateDocs.map((d) => d.docId))];

        const sortedCandidateDocIds = [...newWorkspace.candidateDocs]
          .sort((a, b) => {
            const scoreA = a.aggregateScore ?? a.relevanceScore ?? a.score ?? 0;
            const scoreB = b.aggregateScore ?? b.relevanceScore ?? b.score ?? 0;
            return scoreB - scoreA;
          })
          .map((d) => d.docId);

        const queryKey = "doc_tree_context";
        const existingPool = workspace.researchCandidatePool;
        if (existingPool && existingPool.queryKey === queryKey) {
          newWorkspace.researchCandidatePool = mergeCandidateDocIdsIntoPool(existingPool, sortedCandidateDocIds, queryKey);
        } else {
          newWorkspace.researchCandidatePool = mergeCandidateDocIdsIntoPool(
            { queryKey: "", candidateDocIdsInRankOrder: [], readDocIds: [], skippedDocIds: [], exhausted: false, lastBatchSize: 0, totalCandidateCount: 0, batchCount: 0 },
            sortedCandidateDocIds,
            queryKey
          );
        }

        console.info("[KB-AGENT | TREE_CANDIDATES_MERGED_SAFE]", {
          anchorCount: (data?.anchorCount as number) ?? 0,
          rawCandidateCount: internalMapping.length,
          dedupedCandidateCount: dedupedMapping.length,
          excludedAnchorCount,
          duplicateCandidateCount,
          trulyNewCount,
          totalCandidateCount: uniqueCandidateDocIds.length,
        });
      }
      break;
    }

    case "list_knowledge_map": {
      const safeOutput = data?.safeOutput as {
        totalNodeCount?: number;
        returnedNodeCount?: number;
        truncated?: boolean;
        query?: string;
      } | undefined;
      const internalMapping = data?.internalMapping as Array<{
        handle: string;
        internalDocId: string;
        title: string;
        titlePath?: string;
        box?: string;
        path?: string;
        depth: number;
        childCount?: number;
      }> ?? [];

      // 更新图谱状态
      newWorkspace.knowledgeMap = {
        loaded: true,
        query: safeOutput?.query,
        totalNodeCount: safeOutput?.totalNodeCount ?? 0,
        returnedNodeCount: safeOutput?.returnedNodeCount ?? 0,
        truncated: safeOutput?.truncated ?? false,
        loadedAtActionIndex: newWorkspace.toolObservations.length,
      };

      // 合并 handle 映射（按 handle 去重）
      const existingHandles = new Set((newWorkspace.docHandleMappings ?? []).map((m) => m.handle));
      const newMappings = internalMapping.filter((m) => !existingHandles.has(m.handle));
      newWorkspace.docHandleMappings = [
        ...(newWorkspace.docHandleMappings ?? []),
        ...newMappings.map((m) => ({
          ...m,
          source: "knowledge_map" as const,
        })),
      ];

      // 安全日志：不输出真实 docId
      console.info("[KB-AGENT | KNOWLEDGE_MAP_STORED_SAFE]", {
        returnedNodeCount: safeOutput?.returnedNodeCount ?? 0,
        mappingCount: internalMapping.length,
        newMappingCount: newMappings.length,
        truncated: safeOutput?.truncated ?? false,
      });
      break;
    }

    case "focus_doc_scope": {
      const activeFocusScope = data?.activeFocusScope as {
        handles?: string[];
        docIds?: string[];
        mode?: string;
        reason?: string;
        maxDocIds?: number;
        expandedDocs?: Array<{
          docId: string;
          title: string;
          titlePath?: string;
          parentTitle?: string;
          relationToFocus: "root" | "descendant" | "sibling";
          structuralReason?: string;
          depth: number;
        }>;
      } | undefined;

      if (activeFocusScope) {
        newWorkspace.activeFocusScope = {
          handles: activeFocusScope.handles ?? [],
          docIds: activeFocusScope.docIds ?? [],
          mode: (activeFocusScope.mode as any) ?? "subtree",
          reason: activeFocusScope.reason ?? "",
          source: "focus_doc_scope",
          createdAtActionIndex: newWorkspace.toolObservations.length,
          maxDocIds: activeFocusScope.maxDocIds ?? 80,
        };

        // 把 focus 范围内的文档作为 structural_focus 候选写入 candidateDocs
        // 这些候选不是证据，但可以被 read_candidate_docs 读取
        if (activeFocusScope.docIds && activeFocusScope.docIds.length > 0) {
          const mappingByDocId = new Map<string, KnowledgeDocHandleMapping>();
          for (const m of (newWorkspace.docHandleMappings ?? [])) {
            mappingByDocId.set(m.internalDocId, m);
          }

          const expandedDocsByDocId = new Map<string, ExpandedFocusDoc>();
          if (activeFocusScope.expandedDocs) {
            for (const exp of activeFocusScope.expandedDocs) {
              expandedDocsByDocId.set(exp.docId, exp);
            }
          }

          const existingDocById = new Map<string, CandidateDoc>();
          for (const c of newWorkspace.candidateDocs) {
            existingDocById.set(c.docId, c);
          }

          let addedCount = 0;
          let upgradedFromInventoryCount = 0;
          let unchangedStrongCount = 0;

          const structuralFocusDocs: CandidateDoc[] = activeFocusScope.docIds
            .map((docId) => {
              const expanded = expandedDocsByDocId.get(docId);
              const mapping = mappingByDocId.get(docId);
              const title = expanded?.title ?? mapping?.title ?? "未命名文档";

              const existing = existingDocById.get(docId);
              const existingIsInventory = existing
                && (existing.inventoryOnly === true
                  || existing.lifecycle === "inventory"
                  || (existing.provenance === "list_scope_docs" && existing.hasQuery !== true));

              if (existing && !existingIsInventory) {
                unchangedStrongCount++;
                return null;
              }

              if (existingIsInventory) {
                upgradedFromInventoryCount++;
              } else {
                addedCount++;
              }

              if (!expanded && (!mapping || !mapping.title)) {
                console.warn("[KB-AGENT | FOCUS_SCOPE_TITLE_MISSING_WARNING]", {
                  docId: docId.substring(0, 8) + "...",
                });
              }

              const doc: CandidateDoc = {
                docId,
                title,
                titlePath: expanded?.titlePath ?? mapping?.titlePath,
                box: mapping?.box,
                path: mapping?.path,
                source: "focus_doc_scope",
                provenance: "structural_focus",
                lifecycle: "candidate",
                inventoryOnly: false,
                relevanceScore: 40,
                aggregateScore: 40,
                topBlockScore: 0,
                sourceQueryMetas: [],
                channelHits: [],
                relationToFocus: expanded?.relationToFocus,
                structuralReason: expanded?.structuralReason,
              };
              return doc;
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);

          if (structuralFocusDocs.length > 0) {
            newWorkspace.candidateDocs = mergeCandidateDocs(newWorkspace.candidateDocs, structuralFocusDocs);
          }

          const readableCandidateUnreadCount = newWorkspace.candidateDocs.filter(
            (d) => !(d.inventoryOnly === true || d.lifecycle === "inventory") && !(d.provenance === "list_scope_docs" && d.hasQuery !== true)
          ).length;

          console.info("[KB-AGENT | FOCUS_SCOPE_STRUCTURAL_CANDIDATES_UPSERTED_SAFE]", {
            requestedDocCount: activeFocusScope.docIds.length,
            addedCount,
            upgradedFromInventoryCount,
            unchangedStrongCount,
            readableCandidateUnreadCount,
          });
        }

        // 安全日志：不输出真实 docId
        console.info("[KB-AGENT | FOCUS_SCOPE_SET_SAFE]", {
          focusedHandleCount: activeFocusScope.handles?.length ?? 0,
          focusedDocCount: activeFocusScope.docIds?.length ?? 0,
          mode: activeFocusScope.mode ?? "subtree",
        });
      }
      break;
    }

    default: {
      break;
    }
  }

  return newWorkspace;
}
