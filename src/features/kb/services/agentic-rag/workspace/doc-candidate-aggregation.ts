/**
 * Doc Candidate Aggregation
 *
 * 将块级召回聚合为文档级排序候选。
 *
 * 职责：
 * - 从 candidateBlocks 聚合出 doc-ranked candidateDocs
 * - 先按 docId 分组，再对每组计算 aggregateScore
 * - aggregateScore = topN 加权 + matchedBlockCountBonus + multiQueryBonus
 * - 不依赖中文/英文词表、语义 regex、question.includes
 * - 不臆造不存在字段
 */

import type { CandidateDoc, CandidateBlock } from "./evidence-workspace";
import type { SafeTextMeta } from "../debug/agentic-rag-debug";

export interface AggregateCandidateDocsParams {
  blocks: CandidateBlock[];
  existingDocs?: CandidateDoc[];
  defaultSource?: string;
  defaultProvenance?: "search_scope" | "metadata" | "link_graph" | "recent" | "outline" | "unknown";
}

interface DocGroup {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  blockScores: number[];
  sourceQueryMetas: Map<string, SafeTextMeta>;
  channelHits: Set<string>;
  matchedBlockCount: number;
}

export function aggregateCandidateDocsFromBlocks(params: AggregateCandidateDocsParams): CandidateDoc[] {
  const { blocks, existingDocs = [], defaultSource = "search_scope", defaultProvenance = "search_scope" } = params;

  const docMap = new Map<string, DocGroup>();

  for (const block of blocks) {
    const docId = block.docId;
    let group = docMap.get(docId);

    if (!group) {
      group = {
        docId,
        title: block.docTitle,
        box: block.box,
        path: block.path,
        blockScores: [],
        sourceQueryMetas: new Map(),
        channelHits: new Set(),
        matchedBlockCount: 0,
      };
      docMap.set(docId, group);
    }

    const score = block.relevanceScore ?? block.score ?? 0;
    group.blockScores.push(score);
    group.matchedBlockCount += 1;

    if (block.sourceQueryMeta?.hash) {
      group.sourceQueryMetas.set(block.sourceQueryMeta.hash, block.sourceQueryMeta);
    }

    if (block.channel) {
      group.channelHits.add(block.channel);
    }
    if (block.channelHits) {
      for (const ch of block.channelHits) {
        group.channelHits.add(ch);
      }
    }
    if (block.source) {
      group.channelHits.add(block.source);
    }

    if (block.docTitle && !group.title) {
      group.title = block.docTitle;
    }
    if (block.box && !group.box) {
      group.box = block.box;
    }
    if (block.path && !group.path) {
      group.path = block.path;
    }
  }

  const docs: CandidateDoc[] = [];

  for (const group of docMap.values()) {
    const blockScoresDesc = [...group.blockScores].sort((a, b) => b - a);

    const topBlockScore = blockScoresDesc.length > 0 ? blockScoresDesc[0] : 0;

    const topNWeights = [1, 0.6, 0.3];
    let topNWeighted = 0;
    for (let i = 0; i < Math.min(blockScoresDesc.length, topNWeights.length); i++) {
      topNWeighted += blockScoresDesc[i] * topNWeights[i];
    }

    const matchedBlockCountBonus = Math.min(group.matchedBlockCount, 5) * 0.1;
    const multiQueryBonus = Math.max(0, group.sourceQueryMetas.size - 1) * 0.15;

    const aggregateScore = topNWeighted + matchedBlockCountBonus + multiQueryBonus;

    const sourceQueryMetas = Array.from(group.sourceQueryMetas.values());

    docs.push({
      docId: group.docId,
      title: group.title,
      box: group.box,
      path: group.path,
      source: defaultSource,
      provenance: defaultProvenance,
      score: aggregateScore,
      relevanceScore: aggregateScore,
      aggregateScore,
      topBlockScore,
      sourceQueryMetas,
      sourceQueryMeta: sourceQueryMetas.length > 0 ? sourceQueryMetas[0] : undefined,
      channelHits: Array.from(group.channelHits),
      lifecycle: "candidate",
      hasQuery: sourceQueryMetas.length > 0,
      inventoryOnly: false,
    });
  }

  for (const existing of existingDocs) {
    const existingInMap = docs.find((d) => d.docId === existing.docId);
    if (!existingInMap) {
      docs.push({ ...existing });
    }
  }

  docs.sort((a, b) => {
    const scoreA = a.aggregateScore ?? a.relevanceScore ?? a.score ?? 0;
    const scoreB = b.aggregateScore ?? b.relevanceScore ?? b.score ?? 0;
    return scoreB - scoreA;
  });

  return docs;
}

export function mergeDocCandidateScores(existing: CandidateDoc, incoming: CandidateDoc): CandidateDoc {
  const merged: CandidateDoc = { ...existing };

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
