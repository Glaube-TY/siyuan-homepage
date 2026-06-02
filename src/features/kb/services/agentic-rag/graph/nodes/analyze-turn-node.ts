/**
 * Analyze Turn Node
 *
 * 轻量 runtime facts 初始化。
 *
 * 职责：
 * - 记录 hasPreviousQuestion、previousReferenceDocIdsCount、hasPreviousAssistantSummary
 * - 不调用 LLM，不生成对话分类、上下文模式或工具建议
 * - 不决定工具路径
 */

import type { AgenticRagState, TraceStep } from "../state";
import { buildRuntimeTurnFacts } from "../../runtime/runtime-turn-facts";
import { pushAgentDebugEvent } from "../../debug/agentic-rag-debug";

export interface AnalyzeTurnNodeInput {
  state: AgenticRagState;
}

export interface AnalyzeTurnNodeOutput {
  state: AgenticRagState;
}

export async function analyzeTurnNode(input: AnalyzeTurnNodeInput): Promise<AnalyzeTurnNodeOutput> {
  const state = input.state;

  const traceLog = [...state.traceLog];

  const hasPreviousQuestion = !!state.followUpContext?.previousUserQuestion?.trim();
  const previousReferenceDocIdsCount = state.followUpContext?.previousReferenceDocIds?.length ?? 0;
  const hasPreviousAssistantSummary = !!state.followUpContext?.previousAssistantSummary?.trim();

  const runtimeFacts = buildRuntimeTurnFacts();

  pushAgentDebugEvent("ANALYZE_TURN_RUNTIME_FACTS_SAFE", {
    hasPreviousQuestion,
    previousReferenceDocIdsCount,
    hasPreviousAssistantSummary,
  }, "info");

  return {
    state: {
      ...state,
      runtimeTurnFacts: runtimeFacts,
      traceLog: [
        ...traceLog,
        { name: "analyze_turn", status: "success" as const, detail: `runtime facts: hasPreviousQuestion=${hasPreviousQuestion}, refs=${previousReferenceDocIdsCount}` } as TraceStep,
      ],
    },
  };
}
