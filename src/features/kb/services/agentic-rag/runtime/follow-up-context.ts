/**
 * Follow-Up Context / Runtime Facts Collector
 *
 * 轻量 turn-level 结构，只收集上一轮事实。
 *
 * 职责：
 * - 只收集 runtime facts：上一轮显示参考资料、问题和回答摘要等
 * - 不再理解用户问题、不解析自然语言、不判断意图
 * - 本文件只收集上一轮 runtime facts，不做意图判断，不决定工具路径
 * - 不调用 LLM、不执行工具、不执行检索
 * - 不改变工具执行逻辑
 */

import type { AgenticRuntimeRecentContext } from "./recent-context-types";

export interface FollowUpContext {
  currentQuestion: string;
  previousUserQuestion?: string;
  previousAssistantSummary?: string;
  previousReferenceDocIds: string[];
  previousReferenceTitles: string[];
  confidence: number;
  reasons: string[];
}

export interface BuildFollowUpContextParams {
  currentQuestion: string;
  recentContext: AgenticRuntimeRecentContext | null | undefined;
}

export function buildFollowUpContext(params: BuildFollowUpContextParams): FollowUpContext {
  const { currentQuestion, recentContext } = params;

  const lastReferenceDocIds = recentContext?.lastReferenceDocIds ?? [];
  const lastReferenceTitles = recentContext?.lastReferenceTitles ?? [];
  const lastUserQuestion = recentContext?.lastUserQuestion;
  const lastAssistantSummary = recentContext?.lastAssistantSummary;

  console.info("[KB-AGENT | RUNTIME_TURN_FACTS_BUILT]", {
    hasPreviousQuestion: !!lastUserQuestion,
    previousReferenceDocIdsCount: lastReferenceDocIds.length,
  });

  return {
    currentQuestion,
    previousUserQuestion: lastUserQuestion,
    previousAssistantSummary: lastAssistantSummary,
    previousReferenceDocIds: [...lastReferenceDocIds],
    previousReferenceTitles: [...lastReferenceTitles],
    confidence: 0.5,
    reasons: ["runtime facts only; intent derivation deferred to runtimeTurnFacts"],
  };
}
