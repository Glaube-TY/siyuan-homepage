import type { AgentWorkbenchEvent } from "../contracts/turn-event";
import {
  inspectAgentRunResume,
  type AgentRunCheckpoint,
} from "../../agent-core/session/agent-run-checkpoint";

export const PROVIDER_OUTPUT_TRUNCATED_ERROR_CODE = "provider_output_truncated";

export function getFinalWorkbenchDoneStatus(
  events: readonly AgentWorkbenchEvent[] | undefined,
): "answer_ready" | "failed" | "cancelled" | undefined {
  if (!events) return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "done") return event.status;
  }
  return undefined;
}

export function hasSettledWorkbenchTerminal(
  events: readonly AgentWorkbenchEvent[] | undefined,
): boolean {
  const status = getFinalWorkbenchDoneStatus(events);
  return status === "answer_ready" || status === "failed";
}

export function hasWorkbenchErrorCode(
  events: readonly AgentWorkbenchEvent[] | undefined,
  code: string,
): boolean {
  return events?.some((event) => event.type === "error" && event.code === code) ?? false;
}

export function isProviderOutputTruncatedWorkbench(
  events: readonly AgentWorkbenchEvent[] | undefined,
): boolean {
  return hasWorkbenchErrorCode(events, PROVIDER_OUTPUT_TRUNCATED_ERROR_CODE);
}

export interface WorkbenchRunPresentation {
  active: boolean;
  label: string;
  status: "idle" | "preparing" | "waiting_model" | "executing_tool" | "waiting_confirmation" | "retrying" | "finalizing" | "completed" | "failed" | "cancelled";
}

export function getWorkbenchRunPresentation(
  events: readonly AgentWorkbenchEvent[] | undefined,
): WorkbenchRunPresentation {
  const doneStatus = getFinalWorkbenchDoneStatus(events);
  if (doneStatus === "answer_ready") return { active: false, label: "执行完成", status: "completed" };
  if (doneStatus === "failed") return { active: false, label: "执行失败", status: "failed" };
  if (doneStatus === "cancelled") return { active: false, label: "已取消", status: "cancelled" };

  const hasRunStarted = events?.some((event) => event.type === "run_started") ?? false;
  const last = [...(events ?? [])].reverse().find((event) => event.type !== "usage");
  if (!last) return { active: false, label: "准备中", status: "idle" };
  if (last.type === "error") return { active: false, label: "执行失败", status: "failed" };
  if (!hasRunStarted) return { active: false, label: "执行已中断", status: "idle" };
  if (last.type === "permission_required") return { active: true, label: "等待确认", status: "waiting_confirmation" };
  if (last.type === "tool_start") return { active: true, label: "正在执行工具", status: "executing_tool" };
  if (last.type === "tool_call_delta") return { active: true, label: "正在准备工具", status: "preparing" };
  if (last.type === "model_started") return { active: true, label: "等待模型响应", status: "waiting_model" };
  if (last.type === "assistant_final") return { active: true, label: "正在完成回答", status: "finalizing" };
  if (last.type === "notice") {
    if (/重试|retry/i.test(last.message)) return { active: true, label: "正在自动重试", status: "retrying" };
    if (/压缩|整理上下文/.test(last.message)) return { active: true, label: "正在压缩上下文", status: "preparing" };
    return { active: true, label: last.message, status: "preparing" };
  }
  if (last.type === "tool_result" || last.type === "permission_resolved") {
    return { active: true, label: "正在继续处理", status: "waiting_model" };
  }
  return { active: true, label: "正在准备", status: "preparing" };
}

export interface AgentRecoveryPresentation {
  resumable: boolean;
  title: string;
  summary: string;
}

export function getAgentRecoveryPresentation(
  checkpoint: AgentRunCheckpoint,
  events: readonly AgentWorkbenchEvent[] | undefined,
): AgentRecoveryPresentation {
  const decision = inspectAgentRunResume(checkpoint);
  const completedTools = events?.filter((event) => event.type === "tool_result" && event.result.ok).length ?? 0;
  const prefix = completedTools > 0 ? `已完成 ${completedTools} 个工具步骤。` : "尚无已完成的工具步骤。";

  if (decision.resumable) {
    return {
      resumable: true,
      title: "可从安全检查点继续",
      summary: `${prefix}当前没有待重放或结果未知的操作，将从安全边界继续。`,
    };
  }

  const reason = decision.reason === "no_progress"
    ? "从当前检查点恢复后模型仍未产生有效输出，已停止重复恢复；请重新尝试本轮或更换模型。"
    : decision.reason === "side_effect_unknown"
    ? "上一个操作结果未知，为避免重复写入，已禁止自动继续。"
    : decision.reason === "confirmation_pending"
      ? "中断时仍在等待操作确认，本次确认已失效。"
      : decision.reason === "tool_pending"
        ? "中断前已有尚未执行的工具计划，为避免误操作，已禁止自动继续。"
        : "本轮已经结束，不能继续执行。";
  return {
    resumable: false,
    title: decision.reason === "no_progress" ? "恢复未取得进展" : "需要重新确认",
    summary: `${prefix}${reason}`,
  };
}
