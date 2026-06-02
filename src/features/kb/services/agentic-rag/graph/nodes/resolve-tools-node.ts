/**
 * Resolve Tools Node
 *
 * 使用 resolveAgenticRagToolCapabilities 解析可用工具，写入 state.availableTools。
 *
 * 职责：
 * - 调用 resolveAgenticRagToolCapabilities
 * - 将 available tool definitions 写入 state.availableTools
 * - unavailable tools 写入 traceLog.detail，不默认全部 push 到 state.warnings
 * - 只有 capability resolver 自身异常或缺少 scope 这类关键状态，才写入 warnings
 * - 不读取用户 question
 */

import type { AgenticRagState } from "../state";
import { resolveAgenticRagToolCapabilities, getUnavailableAgenticRagTools } from "../../tools/capability-resolver";
import { expectAllContractsCoveredByAgentActionSchema } from "../../harness/contracts/tool-contract-adapters";

export interface ResolveToolsNodeInput {
  state: AgenticRagState;
}

export interface ResolveToolsNodeOutput {
  state: AgenticRagState;
}

export function resolveToolsNode(input: ResolveToolsNodeInput): ResolveToolsNodeOutput {
  const { state } = input;

  const context = {
    scope: state.scope,
    scopeSummary: state.scopeSummary,
    runtime: state.runtime,
    workspace: state.workspace,
    budget: state.budget,
    counters: state.counters,
    followUpContext: state.followUpContext,
    trace: state.trace,
  };

  const availableTools = resolveAgenticRagToolCapabilities(context)
    .filter((r) => r.available)
    .map((r) => r.definition);

  const unavailable = getUnavailableAgenticRagTools(context);

  const traceLog = [...state.traceLog];
  const warnings = [...state.warnings];
  const contractCoverage = expectAllContractsCoveredByAgentActionSchema();

  const unavailableSummary = unavailable.map((u) => `${u.name}:${u.reason ?? "unknown"}`).join(", ");
  traceLog.push({
    name: "resolve_tools",
    status: "success",
    detail: `${availableTools.length} tools available, ${unavailable.length} unavailable${unavailableSummary ? ` [${unavailableSummary}]` : ""}`,
  });

  traceLog.push({
    name: "TOOL_CONTRACT_COVERAGE_SAFE",
    status: contractCoverage.ok ? "success" : "failed",
    detail: JSON.stringify({
      actionTypeCount: contractCoverage.actionTypes.length,
      missingActionTypes: contractCoverage.missingActionTypes,
      errorCount: contractCoverage.errors.length,
    }),
  });

  if (!contractCoverage.ok) {
    warnings.push(`tool contract coverage failed: ${contractCoverage.missingActionTypes.join(", ")}`);
  }

  if (!state.scope) {
    warnings.push("resolve_tools: no scope defined");
  }

  return {
    state: {
      ...state,
      availableTools,
      warnings,
      traceLog,
    },
  };
}
