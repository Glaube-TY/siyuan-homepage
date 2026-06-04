/**
 * v3 Turn Result
 *
 * 纯 v3 (Skill-first Agent Workbench) 返回给 orchestration 层的回合结果类型。
 *
 * 职责：
 * - 只承载 v3 自身的执行结果
 * - 不引用非 V3 运行时代码
 * - 不含 docId / blockId / notebookId / path / titlePath / internalMapping
 *
 * orchestration 层只使用本类型。
 */

import type { AgentScope, AgentScopeSummary } from "../../scope/types";
import type { ReferenceItem } from "../../../../types/chat";

/**
 * v3 自身的 trace 简表：
 * - 来源 observation store 内的可展示条目
 * - 不得包含 docId / blockId / path / titlePath / internalMapping
 */
export interface V3TraceEntry {
  name: string;
  status: "ok" | "warn" | "error" | "info";
  summary?: string;
  stepIndex?: number;
}

/**
 * v3 自身的 action 简表：
 * - 仅展示工具 / 决策类型，不含内部参数
 */
export interface V3ActionHistoryEntry {
  type: string;
  toolName?: string;
  stepIndex?: number;
  status?: "ok" | "warn" | "error" | "info";
}

/**
 * v3 回合结果。
 *
 * 包含：
 * - scope：当前回答的 AgentScope（v3 scope types，不含内部 mapping）
 * - scopeSummary：v3 范围摘要
 * - answer：Planner 产出的最终回答正文
 * - footerReferences：通过 final_answer references 解析得到的引用（直接使用 docId/blockId）
 * - warnings：v3 内部收集的可展示警告
 * - trace：observation store 简表
 * - actionHistory：动作历史简表
 */
export interface V3TurnResult {
  scope: AgentScope;
  scopeSummary: AgentScopeSummary;
  answer: string;
  footerReferences: ReferenceItem[];
  warnings: string[];
  trace: V3TraceEntry[];
  actionHistory: V3ActionHistoryEntry[];
}

/**
 * v3 进度事件。
 *
 * - 不携带内部标识
 * - 仅描述阶段 + 可选提示
 */
export type V3ProgressPhase =
  | "resolving_scope"
  | "building_context"
  | "planning"
  | "tool_running"
  | "composing_answer"
  | "streaming_answer"
  | "done";

export interface V3ProgressEvent {
  phase: V3ProgressPhase;
  scopeType?: string;
  detail?: string;
  /** progress_answer 工具产生的进展 body。 */
  kind?: "progress";
  body?: string;
}
