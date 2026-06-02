/**
 * Turn Context Fact
 *
 * 最小 runtime facts，只记录历史引用的结构化信息。
 *
 * 职责：
 * - 从 followUpContext 提取 previousReferenceDocIds / previousReferenceTitles
 * - 不包含任何对话分类、上下文模式或 AI 理解结果
 * - 不影响 allowedActions、默认参数或工具选择
 */

import type { FollowUpContext } from "./follow-up-context";

export interface TurnContextFact {
  previousReferenceDocIds: string[];
  previousReferenceTitles: string[];
  hasPreviousReferences: boolean;
}

export interface BuildTurnContextFactParams {
  followUpContext: FollowUpContext;
}

export function buildTurnContextFact(params: BuildTurnContextFactParams): TurnContextFact {
  const { followUpContext } = params;

  const previousReferenceDocIds = followUpContext.previousReferenceDocIds ?? [];
  const previousReferenceTitles = followUpContext.previousReferenceTitles ?? [];

  return {
    previousReferenceDocIds,
    previousReferenceTitles,
    hasPreviousReferences: previousReferenceDocIds.length > 0,
  };
}
