/**
 * Agentic RAG Tool Types
 *
 * 职责：
 * - 定义 AgentToolDefinition、AgentToolAvailability、AgentToolExecutionContext、
 *   AgentToolExecutionResult、AgentToolBudgetCost
 * - AgentToolDefinition 必须包含 readOnly: true
 * - 工具定义中不出现写入工具
 * - 补齐后续 Capability Resolver 需要的结构，但不实现工具执行
 */

import type { AgentActionName } from "../actions/action-types";
import type { ZodType } from "zod";
import type { AgentScope, AgentScopeSummary } from "../scope/types";
import type { AgenticRuntimeContext } from "../runtime/recent-context-types";
import type { EvidenceWorkspace } from "../workspace/evidence-workspace";
import type { AgenticRagBudget, AgenticRagCounters } from "../runtime/budget";
import type { FollowUpContext } from "../runtime/follow-up-context";

export interface AgentToolAvailability {
  available: boolean;
  reason?: string;
}

export interface AgentToolBudgetCost {
  toolCallsUsed: number;
  toolCallsRemaining: number;
  tokensUsed?: number;
}

export interface AgentToolExecutionContext {
  scope?: AgentScope;
  scopeSummary?: AgentScopeSummary;
  runtime?: AgenticRuntimeContext;
  workspace?: EvidenceWorkspace;
  budget?: AgenticRagBudget;
  counters?: AgenticRagCounters;
  followUpContext?: FollowUpContext;
  abortSignal?: AbortSignal;
  trace?: boolean;
}

export interface AgentToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warning?: string;
  budgetCost?: AgentToolBudgetCost;
}

export interface AgentToolDefinition {
  name: AgentActionName;
  description: string;
  readOnly: true;
  inputSchema: ZodType;
  outputSchema: ZodType;
  availability: (context: AgentToolExecutionContext) => AgentToolAvailability;
  budgetCost: (context: AgentToolExecutionContext) => AgentToolBudgetCost;
  execute: (
    args: Record<string, unknown>,
    context: AgentToolExecutionContext
  ) => Promise<AgentToolExecutionResult>;
  observationFormatter: (result: AgentToolExecutionResult) => {
    summary?: string;
    counts?: Record<string, number>;
    error?: string;
    warning?: string;
  };
}
