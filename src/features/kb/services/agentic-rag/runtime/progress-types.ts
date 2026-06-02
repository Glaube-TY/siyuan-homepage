/**
 * Agentic RAG Progress Types
 *
 * 独立的 progress 事件类型定义，避免循环 import。
 *
 * 职责：
 * - 定义 AgenticRagProgressPhase 枚举
 * - 定义 AgenticRagProgressEvent 接口
 * - 供 orchestration 层和 graph 内部使用
 */

export type AgenticRagProgressPhase =
  | "resolving_scope"
  | "building_context"
  | "analyzing_question"
  | "planning_retrieval"
  | "searching_evidence"
  | "assembling_evidence"
  | "reading_fixed_docs"
  | "running_agent_loop"
  | "composing_answer"
  | "streaming_answer"
  | "done";

export interface AgenticRagProgressEvent {
  phase: AgenticRagProgressPhase;
  scopeType?: string;
  detail?: string;
}
