/**
 * 检索配置常量
 * 集中管理排序权重、上下文预算等可调参数
 * 便于根据真实对话表现微调
 */

// ==================== Hybrid Search 权重配置 ====================

/** 各检索通道基础权重 */
export const CHANNEL_WEIGHTS = {
  /** Keyword 检索权重 */
  keyword: 1.0,
  /** Fuzzy 检索权重 */
  fts: 1.2,
} as const;

/** 块类型基础权重微调
 * 用于在同等匹配条件下调整不同类型块的优先级
 */
export const BLOCK_TYPE_BASE_WEIGHTS: Record<string, number> = {
  doc: 1.0,
  heading: 1.1,
  paragraph: 1.0,
  listItem: 0.95,
  quote: 0.95,
  code: 1.0,
  math: 1.0,
  table: 1.0,
  html: 0.9,
};

// ==================== Doc 聚合评分配置 ====================

/** Doc 聚合评分加权系数 */
export const DOC_SCORE_WEIGHTS = {
  /** 命中数量加权系数（每个 hit 加分，有上限） */
  hitCountMultiplier: 0.5,
  /** 命中数量加分上限 */
  hitCountBonusCap: 3,
  /** doc 类型命中额外加分 */
  docHitBonus: 2,
  /** 多 backend 命中额外加分 */
  multiBackendBonus: 3,
} as const;

// ==================== QA Context 配置 ====================

/** Context 预算配置 */
export const CONTEXT_BUDGET = {
  /** 单个 context 最大字符数 */
  maxContextTextLength: 8000,
  /** 最大 context 项数 */
  maxContextItems: 8,
  /** 全文文档预算占比（相对于总预算） */
  fullDocBudgetRatio: 0.7,
  /** 全文文档候选数量上限 */
  maxFullDocCandidates: 3,

  // ==================== Secondary Evidence Budget Gate ====================
  // current stage: when primary exists, secondary should remain supplementary
  // rather than parallel evidence bulk

  /** 当存在 primary contexts 时，secondary 的最大数量 */
  maxSecondaryContextsWhenPrimaryPresent: 2,
  /** 当 primary 占主导地位时，secondary 的最大数量 */
  maxSecondaryContextsWhenPrimaryDominant: 1,
  /** primary 占主导地位的阈值比例（相对于总预算） */
  primaryDominantLengthRatio: 0.6,

  // ==================== Primary Companion Snippet ====================
  // current stage only allows a very small same-doc snippet exception
  // for truncated primary full-doc contexts
  // 目的是增强回答对主文档关键局部段落的抓取，不是重新放开大量 secondary

  /** 当 primary full-doc 被截断时，允许补的同文档 companion snippet 数量 */
  maxCompanionSnippetsForTruncatedPrimary: 1,

  // ==================== Recent Evidence Direct Answer Anchor Budget ====================
  // current stage: 让 anchor 真正成为少量局部锚点，而不是再次形成一批并行证据

  /** none 分支 recent direct answer 中，anchor secondary 的最大数量 */
  maxAnchorSecondaryForRecentDirectAnswer: 2,
} as const;

// ==================== Section Expansion 配置 ====================

/** Section expansion 长度限制 */
export const SECTION_EXPANSION_LIMITS = {
  /** 默认最大 section 长度 */
  defaultMaxSectionLength: 8000,
  /** code/math/table 命中时，前后额外读取的段落数
   * 用于为这些特殊块补充解释性上下文
   */
  surroundingParagraphs: 2,
} as const;

// ==================== 引用信息配置 ====================

/** 引用项配置 */
export const REFERENCE_CONFIG = {
  /** 是否在引用中保留 heading path 信息 */
  includeHeadingPath: true,
  /** 引用中 sourceBlockIds 数量上限 */
  maxSourceBlockIdsInRef: 10,
} as const;