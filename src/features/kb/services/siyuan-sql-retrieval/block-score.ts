/**
 * 思源 SQL 块级召回打分工具
 *
 * 对块级召回结果打分，为文档候选聚合提供基础分值。
 *
 * 核心原则：
 * - content 是检索主字段
 * - type=d 的 content 是文档名，命中文档名权重最高
 * - tag 可参与标签加权
 * - 不使用 markdown / name / alias / hpath
 * - path 只用于内部结构判断
 */

import type { BlockSearchHit, BlockSearchScoreParts } from "./types";
import { normalizeSearchQuery, normalizeSearchTerms } from "./sql-utils";
import { getKbSettings } from "../settings/kb-settings-service";
import { DEFAULT_KB_SETTINGS } from "../../constants/default-settings";

/**
 * 打分选项
 */
export interface BlockScoreOptions {
  query: string;
  structureBoostDocIds?: string[];
  structureBoostPathPrefixes?: string[];
  now?: number;
}

/**
 * 默认块类型权重
 *
 * d 是文档块，content 即文档名，权重最高
 * h 是标题块
 * p 是段落
 * i 是列表项
 * l 是列表容器
 * t 是表格
 * c 是代码块
 */
export const DEFAULT_BLOCK_TYPE_WEIGHTS: Record<string, number> = {
  d: 12,
  h: 10,
  p: 7,
  i: 7,
  t: 6,
  l: 5,
  c: 5,
};

/**
 * 对单个块命中计算打分
 *
 * 不修改原 hit，返回新对象
 */
export async function scoreBlockHit(hit: BlockSearchHit, options: BlockScoreOptions): Promise<BlockSearchHit> {
  const settings = await getKbSettings();
  const headingWeight = Number.isFinite(settings.headingMatchWeight) ? settings.headingMatchWeight : DEFAULT_KB_SETTINGS.headingMatchWeight;
  const textWeight = Number.isFinite(settings.textMatchWeight) ? settings.textMatchWeight : DEFAULT_KB_SETTINGS.textMatchWeight;
  const previewWeight = Number.isFinite(settings.previewMatchWeight) ? settings.previewMatchWeight : DEFAULT_KB_SETTINGS.previewMatchWeight;

  const cleanedQuery = normalizeSearchQuery(options.query);
  const terms = normalizeSearchTerms(options.query);

  const contentLower = hit.content.toLowerCase();
  const tagLower = (hit.tag || "").toLowerCase();
  const queryLower = cleanedQuery.toLowerCase();

  const scoreParts: BlockSearchScoreParts = {};

  // keyword 分：对 query terms 逐个判断是否被 content 包含
  if (terms.length > 0) {
    let keywordScore = 0;
    for (const term of terms) {
      const termLower = term.toLowerCase();
      if (contentLower.includes(termLower)) {
        keywordScore += textWeight;
      }
    }
    if (keywordScore > 0) {
      if (hit.searchMode === "keyword") {
        keywordScore *= 1.5;
      }
      scoreParts.keyword = keywordScore;
    }
  }

  // fuzzy 分：完整 query 被 content 包含
  if (cleanedQuery && contentLower.includes(queryLower)) {
    let fuzzyScore = previewWeight * 2;
    if (hit.searchMode === "fuzzy") {
      fuzzyScore *= 1.5;
    }
    scoreParts.fuzzy = fuzzyScore;
  }

  // tagBoost：tag 包含 term 或完整 query
  if (tagLower) {
    let tagScore = 0;
    if (cleanedQuery && tagLower.includes(queryLower)) {
      tagScore += headingWeight;
    }
    for (const term of terms) {
      if (tagLower.includes(term.toLowerCase())) {
        tagScore += textWeight;
      }
    }
    if (tagScore > 0) {
      scoreParts.tagBoost = tagScore;
    }
  }

  // typeWeight：根据块类型取值，使用 headingWeight 作为标题块的权重基准
  let typeWeight: number;
  if (hit.type === "h") {
    typeWeight = headingWeight;
  } else if (hit.type === "d") {
    typeWeight = headingWeight * 1.2;
  } else {
    typeWeight = textWeight;
  }
  scoreParts.typeWeight = typeWeight;

  // structureBoost：docId 或 path 前缀命中
  let structureScore = 0;
  if (options.structureBoostDocIds && options.structureBoostDocIds.includes(hit.docId)) {
    structureScore += previewWeight;
  }
  if (options.structureBoostPathPrefixes && options.structureBoostPathPrefixes.length > 0) {
    for (const prefix of options.structureBoostPathPrefixes) {
      if (hit.path.startsWith(prefix)) {
        structureScore += Math.floor(previewWeight * 0.8);
        break;
      }
    }
  }
  if (structureScore > 0) {
    scoreParts.structureBoost = structureScore;
  }

  // recencyBoost：弱加分，固定为 0
  scoreParts.recencyBoost = 0;

  // blockScore 为各 scoreParts 求和
  const blockScore = Object.values(scoreParts).reduce((sum, v) => sum + (v || 0), 0);

  return {
    ...hit,
    blockScore,
    scoreParts,
  };
}

/**
 * 对块命中列表批量打分
 *
 * 过滤 content 为空的 hit，按 blockScore 降序排序，返回新数组
 */
export async function scoreBlockHits(hits: BlockSearchHit[], options: BlockScoreOptions): Promise<BlockSearchHit[]> {
  const scored = await Promise.all(
    hits
      .filter((hit) => hit.content && hit.content.trim() !== "")
      .map((hit) => scoreBlockHit(hit, options))
  );

  scored.sort((a, b) => {
    if (b.blockScore !== a.blockScore) {
      return b.blockScore - a.blockScore;
    }
    const aUpdated = a.updated || "";
    const bUpdated = b.updated || "";
    return bUpdated.localeCompare(aUpdated);
  });

  return scored;
}
