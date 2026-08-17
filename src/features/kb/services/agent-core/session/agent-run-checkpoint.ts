import type { AgentMessage, AgentToolCall } from "../messages/agent-message";
import type { AgentRunIdentity } from "../../../../agent-platform/agent-run-protocol";

export type AgentRunCheckpointPhase =
  | "before_model"
  | "before_tool"
  | "waiting_confirmation"
  | "after_tool"
  | "final";

export interface AgentRecoveryContext {
  toolName: string;
  action?: string;
  errorCode?: string;
  message?: string;
  field?: string;
  hint?: string;
  nextStep?: string;
  safeArgs?: Record<string, string | number | boolean | string[]>;
  targetIds?: Record<string, string | string[]>;
}

export interface AgentSuccessfulWriteGuard {
  toolName: string;
  keyDigest: string;
  firstStepIndex?: number;
}

export interface AgentRunCheckpoint {
  schemaVersion: 1;
  identity: AgentRunIdentity;
  phase: AgentRunCheckpointPhase;
  stepIndex: number;
  messages: AgentMessage[];
  pendingToolCalls?: AgentToolCall[];
  sideEffectState: "not_started" | "committed" | "unknown";
  /** 从当前安全边界开始的恢复次数；旧检查点没有此字段时按 0 处理。 */
  resumeAttempt?: number;
  /** 恢复请求没有取得进展，禁止再次展示同一检查点的继续按钮。 */
  recoveryExhausted?: boolean;
  recoveryFailureCode?: string;
  recoveryFingerprint?: string;
  /** 仅保留可安全用于纠正参数的失败结构，不保存原始工具正文。 */
  recoveryContext?: AgentRecoveryContext;
  /** 成功写操作的不可逆 Guard；不包含原始 args。 */
  successfulWriteGuards?: AgentSuccessfulWriteGuard[];
  createdAt: number;
}

export interface AgentRunResumeDecision {
  resumable: boolean;
  reason: "safe_boundary" | "run_finished" | "side_effect_unknown" | "confirmation_pending" | "tool_pending" | "no_progress";
}

export interface AgentResumeProgress {
  producedToolCall: boolean;
  addedToolResult: boolean;
  producedSuccessfulToolResult: boolean;
  producedFinal: boolean;
  stepAdvanced: boolean;
  producedMeaningfulToolResult: boolean;
  meaningfulFailureContextChanged: boolean;
}

const RECOVERY_GUARD_ONLY_ERROR_CODES = new Set([
  "duplicate_write_call_blocked",
  "duplicate_read_call_blocked",
  "duplicate_failed_call_blocked",
  "trajectory_repetition_detected",
  "repeated_unknown_tool",
  "repeated_invalid_action_args",
  "tool_call_limit_reached",
  "user_rejected",
  "permission_denied",
  "user_aborted",
  "write_result_unknown",
]);

export function isRecoveryGuardOnlyResult(errorCode: string | undefined): boolean {
  return !!errorCode && RECOVERY_GUARD_ONLY_ERROR_CODES.has(errorCode);
}

function stableRecoveryRecord(
  record: Record<string, string | number | boolean | string[]> | undefined,
): Record<string, string | number | boolean | string[]> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export function getAgentRecoveryContextFingerprint(context: AgentRecoveryContext | undefined): string | undefined {
  if (!context) return undefined;
  return JSON.stringify({
    toolName: context.toolName,
    action: context.action,
    errorCode: context.errorCode,
    field: context.field,
    targetIds: stableRecoveryRecord(context.targetIds),
    safeArgs: stableRecoveryRecord(context.safeArgs),
  });
}

export function buildAgentResumeProgress(params: {
  producedToolCall: boolean;
  addedToolResult: boolean;
  producedSuccessfulToolResult: boolean;
  producedFinal: boolean;
  stepAdvanced: boolean;
  toolResultCodes?: readonly string[];
  previousRecoveryContext?: AgentRecoveryContext;
  latestRecoveryContext?: AgentRecoveryContext;
}): AgentResumeProgress {
  const previousFingerprint = getAgentRecoveryContextFingerprint(params.previousRecoveryContext);
  const latestFingerprint = getAgentRecoveryContextFingerprint(params.latestRecoveryContext);
  const meaningfulFailureContextChanged = (
    (params.toolResultCodes ?? []).some((code) => !isRecoveryGuardOnlyResult(code))
    && !!latestFingerprint
    && latestFingerprint !== previousFingerprint
    && !isRecoveryGuardOnlyResult(params.latestRecoveryContext?.errorCode)
  );
  return {
    producedToolCall: params.producedToolCall,
    addedToolResult: params.addedToolResult,
    producedSuccessfulToolResult: params.producedSuccessfulToolResult,
    producedFinal: params.producedFinal,
    stepAdvanced: params.stepAdvanced,
    producedMeaningfulToolResult: params.producedSuccessfulToolResult || meaningfulFailureContextChanged,
    meaningfulFailureContextChanged,
  };
}

export function hasAgentResumeProgress(progress: AgentResumeProgress): boolean {
  return progress.producedMeaningfulToolResult || progress.producedFinal;
}

export function markAgentRunCheckpointNoProgress(
  checkpoint: AgentRunCheckpoint | undefined,
  progress: AgentResumeProgress,
  failureCode: string | undefined,
): AgentRunCheckpoint | undefined {
  if (!checkpoint || hasAgentResumeProgress(progress)) return undefined;
  const code = failureCode?.trim() || "agent_resume_no_progress";
  return {
    ...checkpoint,
    recoveryExhausted: true,
    recoveryFailureCode: code,
    recoveryFingerprint: [
      "resume",
      checkpoint.identity.runId,
      checkpoint.phase,
      checkpoint.stepIndex,
      code,
    ].join(":").slice(0, 240),
    createdAt: Date.now(),
  };
}

export function inspectAgentRunResume(checkpoint: AgentRunCheckpoint): AgentRunResumeDecision {
  if (checkpoint.phase === "final") return { resumable: false, reason: "run_finished" };
  if (checkpoint.sideEffectState === "unknown") return { resumable: false, reason: "side_effect_unknown" };
  if (checkpoint.phase === "waiting_confirmation") return { resumable: false, reason: "confirmation_pending" };
  if (checkpoint.phase === "before_tool") return { resumable: false, reason: "tool_pending" };
  if (checkpoint.recoveryExhausted === true) return { resumable: false, reason: "no_progress" };
  return { resumable: true, reason: "safe_boundary" };
}
