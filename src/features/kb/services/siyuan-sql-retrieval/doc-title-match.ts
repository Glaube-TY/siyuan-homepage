/**
 * SQL Fast Path 文档标题匹配模块
 *
 * 职责：
 * - 从思源 SQL blocks 表读取文档列表（type='d'）
 * - 实现标题匹配逻辑
 * - 提供 Fast Path Gate 配置和判断函数
 */

import { sql } from "@/api";

/**
 * 轻量文档索引类型
 */
export interface DocIndexLite {
  doc_id: string;
  box: string;
  title: string;
  updated: string;
  tag: string;
  hash: string;
  path: string;
}

/**
 * 从思源 SQL 加载所有文档
 * @returns DocIndexLite[]
 */
export async function loadAllDocsFromSql(): Promise<DocIndexLite[]> {
  const sqlStmt = `
    SELECT id as doc_id, content as title, path, box, updated, hash, tag
    FROM blocks
    WHERE type = 'd'
    ORDER BY updated DESC
  `;

  try {
    const rows = await sql(sqlStmt);
    if (!Array.isArray(rows)) return [];

    return rows.map((r: any) => ({
      doc_id: r.doc_id || "",
      title: r.title || "",
      path: r.path || "",
      box: r.box || "",
      updated: r.updated || "",
      hash: r.hash || "",
      tag: r.tag || "",
    })).filter(d => d.doc_id);
  } catch (e) {
    console.error("[loadAllDocsFromSql] SQL error:", e);
    return [];
  }
}

/**
 * Fast Path Gate 配置
 */
export interface FastPathGateConfig {
  /** 最小标题相似度分数（0-1） */
  minTitleSimilarity: number;
  /** 最大允许匹配的文档数（超过则视为模糊） */
  maxMatchedDocs: number;
}

/** 默认 Scope 模式 Gate 配置 */
export const DEFAULT_SCOPE_GATE_CONFIG: FastPathGateConfig = {
  minTitleSimilarity: 0.85,
  maxMatchedDocs: 3,
};

/** 默认 Whole KB 模式 Gate 配置 */
export const DEFAULT_WHOLEKB_GATE_CONFIG: FastPathGateConfig = {
  minTitleSimilarity: 0.9,
  maxMatchedDocs: 2,
};

/**
 * 文档标题匹配结果
 */
export interface DocTitleMatchResult {
  matched: boolean;
  matchedDocs: Array<{
    docId: string;
    title: string;
    similarity: number;
  }>;
  bestMatch?: {
    docId: string;
    title: string;
    similarity: number;
  };
}

/**
 * 计算字符串相似度（简单实现，基于公共子串长度）
 * @param s1 字符串1
 * @param s2 字符串2
 * @returns 相似度分数（0-1）
 */
function calculateSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  // 包含关系给予高分
  if (str1.includes(str2) || str2.includes(str1)) {
    const longer = Math.max(str1.length, str2.length);
    const shorter = Math.min(str1.length, str2.length);
    return 0.8 + 0.2 * (shorter / longer);
  }

  // 计算编辑距离相似度（简化版）
  const maxLen = Math.max(str1.length, str2.length);
  const commonLen = longestCommonSubstring(str1, str2).length;
  return commonLen / maxLen;
}

/**
 * 计算最长公共子串
 */
function longestCommonSubstring(s1: string, s2: string): string {
  if (s1.length === 0 || s2.length === 0) return "";

  const matrix: number[][] = Array(s1.length + 1)
    .fill(null)
    .map(() => Array(s2.length + 1).fill(0));

  let maxLen = 0;
  let endPos = 0;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
        if (matrix[i][j] > maxLen) {
          maxLen = matrix[i][j];
          endPos = i;
        }
      }
    }
  }

  return s1.substring(endPos - maxLen, endPos);
}

/**
 * 查找强文档标题匹配
 *
 * @param query 查询字符串
 * @param docs 文档列表
 * @returns 匹配结果
 */
export function findStrongDocTitleMatch(
  query: string,
  docs: DocIndexLite[]
): DocTitleMatchResult {
  if (!query || !docs || docs.length === 0) {
    return { matched: false, matchedDocs: [] };
  }

  // 计算每个文档的相似度
  const scoredDocs = docs.map(doc => ({
    docId: doc.doc_id,
    title: doc.title,
    similarity: calculateSimilarity(doc.title, query),
  }));

  // 按相似度排序
  scoredDocs.sort((a, b) => b.similarity - a.similarity);

  // 找出高相似度的文档
  const highSimilarityThreshold = 0.7;
  const matchedDocs = scoredDocs.filter(d => d.similarity >= highSimilarityThreshold);

  if (matchedDocs.length === 0) {
    return { matched: false, matchedDocs: [] };
  }

  return {
    matched: true,
    matchedDocs,
    bestMatch: matchedDocs[0],
  };
}

/**
 * 判断是否应进入 Fast Path
 *
 * @param match 标题匹配结果
 * @param config Gate 配置
 * @returns 是否应进入 Fast Path
 */
export function shouldEnterFastPath(
  match: DocTitleMatchResult,
  config: FastPathGateConfig
): boolean {
  if (!match.matched || match.matchedDocs.length === 0) {
    return false;
  }

  // 检查最佳匹配的相似度
  const bestMatch = match.bestMatch || match.matchedDocs[0];
  if (bestMatch.similarity < config.minTitleSimilarity) {
    return false;
  }

  // 检查匹配的文档数量
  if (match.matchedDocs.length > config.maxMatchedDocs) {
    return false;
  }

  return true;
}
