/**
 * Budget from Settings
 *
 * 把 KbSettings 映射为 AgenticRagBudget。
 *
 * 职责：
 * - 集中管理 Agentic RAG 预算默认值
 * - 从 settings 读取可映射字段（如 maxContextItems、maxContextTextLength）
 * - 使用合理 clamp，避免 0、负数、NaN
 * - 不改 settings schema
 */

import type { KbSettings } from "../../../types/settings";
import type { AgenticRagBudget } from "./budget";

const DEFAULT_MAX_STEPS = 20;
const DEFAULT_MAX_SEARCH_CALLS = 3;
const DEFAULT_MAX_QUERIES_PER_SEARCH = 3;
const DEFAULT_MAX_BLOCK_CONTEXTS = 12;
const DEFAULT_MAX_INVALID_ACTIONS = 4;
const DEFAULT_PER_BATCH_READ_LIMIT = 5;
const DEFAULT_MAX_RESEARCH_BATCHES = 3;
const DEFAULT_MAX_TOTAL_RESEARCH_DOCS = 20;
const DEFAULT_MAX_RESEARCH_SEARCH_CALLS = 3;

function clampPositive(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min) return fallback;
  return Math.min(value, max);
}

export function buildAgenticRagBudgetFromSettings(settings: KbSettings): AgenticRagBudget {
  const maxReadDocs = clampPositive(settings.maxContextItems, 5, 1, 20);
  const maxContextChars = clampPositive(settings.maxContextTextLength, 800, 200, 20000);

  return {
    maxSteps: DEFAULT_MAX_STEPS,
    maxSearchCalls: DEFAULT_MAX_SEARCH_CALLS,
    maxQueriesPerSearch: DEFAULT_MAX_QUERIES_PER_SEARCH,
    maxReadDocs,
    maxBlockContexts: DEFAULT_MAX_BLOCK_CONTEXTS,
    maxContextChars,
    maxInvalidActions: DEFAULT_MAX_INVALID_ACTIONS,
    perBatchReadLimit: DEFAULT_PER_BATCH_READ_LIMIT,
    maxResearchBatches: DEFAULT_MAX_RESEARCH_BATCHES,
    maxTotalResearchDocs: DEFAULT_MAX_TOTAL_RESEARCH_DOCS,
    maxResearchSearchCalls: DEFAULT_MAX_RESEARCH_SEARCH_CALLS,
  };
}
