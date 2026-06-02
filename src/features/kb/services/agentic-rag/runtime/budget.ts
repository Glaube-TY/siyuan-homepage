/**
 * Agentic RAG Budget & Counters
 *
 * 共享契约：可被 graph/state 和 tools/tool-types 共用。
 *
 * 职责：
 * - 定义 AgenticRagBudget、AgenticRagCounters
 * - 提供 createInitialAgenticRagCounters()
 * - 不硬编码预算默认值（默认值后续从 settings/DEFAULT_KB_SETTINGS 汇总）
 */

export interface AgenticRagBudget {
  maxSteps: number;
  maxSearchCalls: number;
  maxQueriesPerSearch: number;
  maxReadDocs: number;
  maxBlockContexts: number;
  maxContextChars: number;
  maxInvalidActions: number;
  perBatchReadLimit?: number;
  maxResearchBatches?: number;
  maxTotalResearchDocs?: number;
  maxResearchSearchCalls?: number;
}

export interface AgenticRagCounters {
  stepCount: number;
  searchCallCount: number;
  readDocCount: number;
  readBlockContextCount: number;
  invalidActionCount: number;
}

export function createInitialAgenticRagCounters(): AgenticRagCounters {
  return {
    stepCount: 0,
    searchCallCount: 0,
    readDocCount: 0,
    readBlockContextCount: 0,
    invalidActionCount: 0,
  };
}
