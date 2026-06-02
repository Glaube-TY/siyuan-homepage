/**
 * DocumentCandidate 聚合工具
 *
 * 把块级命中聚合为文档候选，供 hybrid search / Agent Core 检索链路使用。
 *
 * 核心原则：
 * - content 是检索主字段
 * - type=d 的 content 是文档名
 * - tag 可参与标签加权
 * - 不使用 markdown / name / alias / hpath
 * - path 只用于内部结构判断
 */

import type {
  BlockSearchHit,
  DocumentCandidate,
  DocumentMatchedSummary,
} from "./types";

/**
 * 聚合选项
 *
 * 各类 doc 信息 map 可选传入，后续可由 type=d 文档块或 DocGraphService 提供。
 */
export interface BuildDocumentCandidatesOptions {
  maxBlocksPerDocument?: number;
  maxDocuments?: number;
  titleByDocId?: Map<string, string> | Record<string, string>;
  docPathByDocId?: Map<string, string> | Record<string, string>;
  docUpdatedByDocId?: Map<string, string> | Record<string, string>;
  docHashByDocId?: Map<string, string> | Record<string, string>;
}

/**
 * 内部 helper：从 Map 或 Record 中取值
 */
function getOptionValue(
  source: Map<string, string> | Record<string, string> | undefined,
  key: string
): string | undefined {
  if (!source) {
    return undefined;
  }
  if (source instanceof Map) {
    return source.get(key);
  }
  return (source as Record<string, string>)[key];
}

/**
 * 构造文档命中摘要
 */
export function buildMatchedSummary(hits: BlockSearchHit[]): DocumentMatchedSummary {
  let titleMatched = false;
  let tagMatched = false;
  let headingMatched = false;
  let paragraphMatched = false;
  let listMatched = false;
  let tableMatched = false;
  let codeMatched = false;

  for (const hit of hits) {
    switch (hit.type) {
      case "d":
        titleMatched = true;
        break;
      case "h":
        headingMatched = true;
        break;
      case "p":
        paragraphMatched = true;
        break;
      case "i":
      case "l":
        listMatched = true;
        break;
      case "t":
        tableMatched = true;
        break;
      case "c":
        codeMatched = true;
        break;
    }
    if (hit.tag) {
      tagMatched = true;
    }
  }

  return {
    titleMatched,
    tagMatched,
    headingMatched,
    paragraphMatched,
    listMatched,
    tableMatched,
    codeMatched,
    matchedBlockCount: hits.length,
  };
}

/**
 * 根据块列表计算文档级分数
 *
 * 规则：
 * - topScore * 0.45 + topN(前8块之和) * 0.45 + diversityBonus
 * - 长文档不靠无限块数量刷分，只取前 8
 */
export function scoreDocumentFromBlocks(hits: BlockSearchHit[]): number {
  if (hits.length === 0) {
    return 0;
  }

  const sorted = [...hits].sort((a, b) => b.blockScore - a.blockScore);
  const topScore = sorted[0].blockScore;

  const topN = sorted.slice(0, 8).reduce((sum, h) => sum + h.blockScore, 0);

  const typeSet = new Set<string>();
  for (const h of sorted) {
    typeSet.add(h.type);
  }
  const diversityBonus = Math.min(typeSet.size * 1.5, 6);

  return topScore * 0.45 + topN * 0.45 + diversityBonus;
}

/**
 * 把已打分的 BlockSearchHit[] 按 docId 聚合为 DocumentCandidate[]
 *
 * 不修改原 hits，返回新数组。
 */
export function buildDocumentCandidates(
  hits: BlockSearchHit[],
  options?: BuildDocumentCandidatesOptions
): DocumentCandidate[] {
  const maxBlocks = options?.maxBlocksPerDocument ?? 8;
  const maxDocs = options?.maxDocuments ?? 12;

  // 过滤并分组
  const groupMap = new Map<string, BlockSearchHit[]>();

  for (const hit of hits) {
    if (!hit.docId) {
      continue;
    }
    if (!hit.content || hit.content.trim() === "") {
      continue;
    }
    const group = groupMap.get(hit.docId);
    if (group) {
      group.push(hit);
    } else {
      groupMap.set(hit.docId, [hit]);
    }
  }

  const candidates: DocumentCandidate[] = [];

  for (const [docId, docHits] of groupMap) {
    // 组内按 blockScore 降序
    const sortedBlocks = [...docHits].sort((a, b) => b.blockScore - a.blockScore);
    const matchedBlocks = sortedBlocks.slice(0, maxBlocks);

    // box：第一个非空
    let box = "";
    for (const h of sortedBlocks) {
      if (h.box) {
        box = h.box;
        break;
      }
    }

    // path 优先级：options > type=d hit > 第一个非空
    let path = getOptionValue(options?.docPathByDocId, docId) || "";
    if (!path) {
      for (const h of sortedBlocks) {
        if (h.type === "d" && h.path) {
          path = h.path;
          break;
        }
      }
    }
    if (!path) {
      for (const h of sortedBlocks) {
        if (h.path) {
          path = h.path;
          break;
        }
      }
    }

    // title 优先级：options > type=d content > 最高分 hit content 前40字符 > docId
    let title = getOptionValue(options?.titleByDocId, docId) || "";
    if (!title) {
      for (const h of sortedBlocks) {
        if (h.type === "d" && h.content) {
          title = h.content;
          break;
        }
      }
    }
    if (!title) {
      const topHit = sortedBlocks[0];
      if (topHit && topHit.content) {
        title = topHit.content.slice(0, 40);
      }
    }
    if (!title) {
      title = docId;
    }

    // updated 优先级：options > 组中最新
    let updated = getOptionValue(options?.docUpdatedByDocId, docId) || "";
    if (!updated) {
      for (const h of sortedBlocks) {
        if (h.updated && h.updated > updated) {
          updated = h.updated;
        }
      }
    }

    // hash 优先级：options > type=d hash > 第一个非空
    let hash = getOptionValue(options?.docHashByDocId, docId) || "";
    if (!hash) {
      for (const h of sortedBlocks) {
        if (h.type === "d" && h.hash) {
          hash = h.hash;
          break;
        }
      }
    }
    if (!hash) {
      for (const h of sortedBlocks) {
        if (h.hash) {
          hash = h.hash;
          break;
        }
      }
    }

    const matchedSummary = buildMatchedSummary(matchedBlocks);
    const docScore = scoreDocumentFromBlocks(matchedBlocks);

    candidates.push({
      docId,
      box,
      path,
      title,
      matchedBlocks,
      docScore,
      matchedSummary,
      updated: updated || undefined,
      hash: hash || undefined,
    });
  }

  // 按 docScore 降序，同分按 updated 降序
  candidates.sort((a, b) => {
    if (b.docScore !== a.docScore) {
      return b.docScore - a.docScore;
    }
    const aUpdated = a.updated || "";
    const bUpdated = b.updated || "";
    return bUpdated.localeCompare(aUpdated);
  });

  return candidates.slice(0, maxDocs);
}
