/**
 * Create Initial Agentic RAG State
 *
 * 轻量初始化 helper。
 *
 * 职责：
 * - 只做轻量初始化，不解析 scope、不读取 UI、不调用 LLM
 * - 预算默认值集中放在 runtime/budget.ts 并标注后续接 settings
 */

import type { AgenticRagState } from "./state";
import { createEmptyEvidenceWorkspace } from "../workspace/evidence-workspace";
import { createInitialAgenticRagCounters, type AgenticRagBudget } from "../runtime/budget";
import type { FollowUpContext } from "../runtime/follow-up-context";
import { buildAgentOperatingContract } from "../runtime/agent-operating-contract";
import type { ThinkingMode } from "../../../types/session";

export interface CreateInitialAgenticRagStateParams {
  question: string;
  budget: AgenticRagBudget;
  mode?: AgenticRagState["mode"];
  customDocIds?: string[];
  recentContextSummary?: string;
  runtime?: AgenticRagState["runtime"];
  scope?: AgenticRagState["scope"];
  scopeSummary?: AgenticRagState["scopeSummary"];
  trace?: boolean;
  followUpContext?: FollowUpContext;
  thinkingMode?: ThinkingMode;
}

export function createInitialAgenticRagState(params: CreateInitialAgenticRagStateParams): AgenticRagState {
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const currentDateTime = now.toISOString().replace("T", " ").slice(0, 19);

  const operatingContract = buildAgentOperatingContract();

  return {
    question: params.question,
    mode: params.mode ?? "whole_kb",
    customDocIds: params.customDocIds,
    recentContextSummary: params.recentContextSummary,
    runtime: params.runtime,
    trace: params.trace ?? false,
    thinkingMode: params.thinkingMode ?? "off",
    currentDate,
    currentDateTime,
    scope: params.scope,
    scopeSummary: params.scopeSummary,
    availableTools: [],
    actionHistory: [],
    workspace: createEmptyEvidenceWorkspace(),
    budget: params.budget,
    counters: createInitialAgenticRagCounters(),
    footerReferences: [],
    followUpContext: params.followUpContext,
    operatingContract,
    warnings: [],
    traceLog: [],
  };
}
