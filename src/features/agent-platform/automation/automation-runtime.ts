import { getNotificationDeviceId } from "@/features/notification-center";
import {
  notificationLockName,
  withNotificationLock,
} from "@/features/notification-center/notification-center-locks";
import {
  buildConversationContext,
  runAgentProfile,
} from "@/features/kb/services/agent-workbench";
import type { AgentWorkbenchEvent } from "@/features/kb/services/agent-workbench/contracts/turn-event";
import {
  createBackgroundJobAgentProfile,
  KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
  ROBOT_AGENT_PROFILE_ID,
} from "../agent-profile";
import {
  createAutomationRunId,
  type AutomationJobDefinition,
  type AutomationJobState,
  type AutomationRunRecord,
} from "./automation-job-contract";
import {
  AUTOMATION_JOBS_CHANGED_EVENT,
  automationJobStore,
} from "./automation-job-store";
import { getAutomationSensor } from "./automation-sensor-registry";
import { nextScheduledAt, resolveDueOccurrence } from "./automation-schedule";
import {
  registerBackgroundScanTask,
  signalBackgroundScanTask,
} from "@/features/background-runtime/background-scheduler";
import { AUTOMATION_RUN_NOW_EVENT } from "./automation-control";
import { decodeAutomationRobotRoute } from "./automation-robot-route";
import { getNotebrainPlugin } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import {
  RobotKernelClient,
  getPluginKernelPort,
} from "@/features/robot-assistant/runtime/robot-kernel-client";
import { inspectAgentRunResume } from "@/features/kb/services/agent-core/session/agent-run-checkpoint";
import { kbSessionStore } from "@/features/kb/stores/kb-session-store";
import { ROBOT_OUTBOUND_RESULT_EVENT } from "@/features/robot-assistant/contracts/robot-message";
import { restoreKbChatSessions } from "@/features/kb/services/agent-workbench/storage/chat-session-facade";
import type { ChatMessage } from "@/features/kb/types/chat";
import { RobotSettingsClient } from "@/features/robot-assistant/settings/robot-settings-client";

export const AUTOMATION_RUNTIME_CHANGED_EVENT = "automation-runtime-changed";
const TASK_ID = "automation-jobs";
let unregister: (() => void) | undefined;

function month(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}
function emitChanged(): void {
  window.dispatchEvent(new CustomEvent(AUTOMATION_RUNTIME_CHANGED_EVENT));
}

async function saveState(
  job: AutomationJobDefinition,
  current: AutomationJobState | undefined,
  patch: Partial<AutomationJobState>,
): Promise<AutomationJobState> {
  const next: AutomationJobState = {
    ...(current ?? {
      schemaVersion: 1 as const,
      jobId: job.jobId,
      revision: 1,
      jobRevision: job.revision,
      status: "idle" as const,
      consecutiveFailures: 0,
      updatedAt: Date.now(),
    }),
    revision: current ? current.revision + 1 : 1,
    jobRevision: job.revision,
    ...patch,
    updatedAt: Date.now(),
  };
  return automationJobStore.saveState(next, current?.revision);
}

async function deliver(
  job: AutomationJobDefinition,
  content: string,
  runId: string,
): Promise<void> {
  const target = job.output.replyTarget;
  if (!target) return;
  if (target.kind === "kb-conversation") {
    await kbSessionStore.appendAutomationResult({
      ...(target.conversationId
        ? { conversationId: target.conversationId }
        : {}),
      createNew: target.conversationMode === "new",
      runId,
      jobName: job.name,
      goal: job.task.execution.goal,
      content,
    });
    return;
  }
  if (target.kind === "robot") {
    const route = decodeAutomationRobotRoute(target.routeRef);
    const client = new RobotKernelClient(
      getPluginKernelPort(getNotebrainPlugin()),
    );
    if (!client.available) throw new Error("机器人运行设备当前不可用。");
    const abort = new AbortController();
    const forwarded = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        abort.abort();
        reject(new Error("机器人客户端发送超时。"));
      }, 15_000);
      abort.signal.addEventListener("abort", () => window.clearTimeout(timer), {
        once: true,
      });
      window.addEventListener(
        ROBOT_OUTBOUND_RESULT_EVENT,
        ((
          event: CustomEvent<{
            deliveryId?: string;
            ok?: boolean;
            error?: string;
          }>,
        ) => {
          if (event.detail?.deliveryId !== runId) return;
          window.clearTimeout(timer);
          abort.abort();
          event.detail.ok
            ? resolve()
            : reject(new Error(event.detail.error || "机器人客户端发送失败。"));
        }) as EventListener,
        { signal: abort.signal },
      );
    });
    let result: { ok?: boolean; forwardedToClient?: boolean; message?: string };
    try {
      result = await client.call("robot.sendAutomationMessage", {
        ...route,
        deliveryId: runId,
        text: `${job.name}\n${content}`,
      });
    } catch (error) {
      abort.abort();
      throw error;
    }
    if (!result?.ok) {
      abort.abort();
      throw new Error(result?.message || "机器人消息投递失败。");
    }
    if (result.forwardedToClient) await forwarded;
    else abort.abort();
    const recorded = await client.call<{ ok?: boolean; message?: string }>(
      "robot.recordAutomationConversation",
      {
        ...route,
        conversationMode: target.conversationMode,
        ...(target.conversationId
          ? { conversationId: target.conversationId }
          : {}),
        jobName: job.name,
        goal: job.task.execution.goal,
        content,
      },
    );
    if (!recorded?.ok)
      throw new Error(recorded?.message || "机器人会话记录失败。");
  }
}

async function loadConversationContext(
  job: AutomationJobDefinition,
  goal: string,
) {
  const target = job.output.replyTarget;
  if (!target || target.conversationMode !== "existing") return undefined;
  if (target.kind === "kb-conversation" && target.conversationId) {
    const snapshot = await restoreKbChatSessions();
    const conversation = snapshot?.conversations.find(
      (item) => item.id === target.conversationId,
    );
    if (!conversation) throw new Error("绑定的本地 AI 会话不存在或已被删除。");
    return buildConversationContext({
      messages: conversation.messages,
      stageSummaries: conversation.stageSummaries,
      currentQuestion: goal,
      compressedContextSummary: conversation.compressedContextSummary,
      compressionState: conversation.compressionState,
    });
  }
  if (target.kind === "robot") {
    const client = new RobotKernelClient(
      getPluginKernelPort(getNotebrainPlugin()),
    );
    if (!client.available) throw new Error("机器人运行设备当前不可用。");
    const sessions = await client.call<unknown[]>("robot.getSessions");
    const route = decodeAutomationRobotRoute(target.routeRef);
    const session = (Array.isArray(sessions) ? sessions : []).find((item) => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      if (target.conversationId)
        return value.conversationId === target.conversationId;
      const key =
        value.key && typeof value.key === "object"
          ? (value.key as Record<string, unknown>)
          : {};
      return (
        key.provider === route.provider &&
        key.accountId === route.accountId &&
        key.chatId === route.chatId &&
        (!route.senderId || key.senderId === route.senderId) &&
        value.active === true
      );
    }) as Record<string, unknown> | undefined;
    if (!session) throw new Error("绑定的机器人会话不存在或已被删除。");
    const messages = (
      Array.isArray(session.messages) ? session.messages : []
    ).flatMap((item, index): ChatMessage[] => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      if (
        (value.role !== "user" && value.role !== "assistant") ||
        typeof value.content !== "string"
      )
        return [];
      const createdAt =
        typeof value.createdAt === "number" ? value.createdAt : Date.now();
      return [
        {
          id: `robot-${String(session.conversationId)}-${index}`,
          role: value.role,
          content: value.content,
          createdAt,
          ...(value.role === "assistant" ? { isComplete: true } : {}),
        } as ChatMessage,
      ];
    });
    return buildConversationContext({ messages, currentQuestion: goal });
  }
}

function shouldDeliver(
  job: AutomationJobDefinition,
  status: AutomationRunRecord["status"],
  changed: boolean,
): boolean {
  return (
    Boolean(job.output.replyTarget) &&
    status !== "skipped" &&
    (job.task.kind !== "monitor" || changed)
  );
}

function retryableCode(code: string | undefined): boolean {
  return Boolean(
    code && /timeout|rate_limit|http_5|network|provider_http/.test(code),
  );
}

async function executeAgent(
  job: AutomationJobDefinition,
  goal: string,
  runId: string,
) {
  const execution = job.task.execution;
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort("automation_timeout"),
    execution.budget.maxDurationMs,
  );
  const events: AgentWorkbenchEvent[] = [];
  let checkpointWrite = Promise.resolve();
  const conversationContext = await loadConversationContext(job, goal);
  let allowedToolNames = execution.allowedToolNames;
  if (job.output.replyTarget?.kind === "robot") {
    const client = new RobotSettingsClient(new RobotKernelClient(getPluginKernelPort(getNotebrainPlugin())));
    const settings = await client.getSettings();
    allowedToolNames = Object.entries(settings.robotToolPolicy.tools)
      .filter(([, policy]) => policy.remoteAllowed)
      .map(([name]) => name);
  }
  const profile = createBackgroundJobAgentProfile({
    ...execution,
    profileId:
      job.output.replyTarget?.kind === "robot"
        ? ROBOT_AGENT_PROFILE_ID
        : KNOWLEDGE_CHAT_AGENT_PROFILE_ID,
    allowedToolNames,
    maxToolCalls: execution.budget.maxToolCalls,
    conversationAccess: Boolean(conversationContext),
  });
  try {
    const outcome = await runAgentProfile({
      profile,
      question: goal,
      conversationContext,
      mode: "whole_kb",
      conversationId:
        job.output.replyTarget?.conversationMode === "existing"
          ? (job.output.replyTarget.conversationId ?? `automation-${job.jobId}`)
          : `automation-${job.jobId}-${runId}`,
      turnId: runId,
      abortSignal: controller.signal,
      maxToolCalls: execution.budget.maxToolCalls,
      unattendedWritePolicy: execution.unattendedWritePolicy ?? "safe",
      onWorkbenchEvent(event) {
        events.push(event);
        if (
          event.type === "usage" &&
          event.cumulativeUsage.totalTokens > execution.budget.maxTokens
        )
          controller.abort("automation_token_budget_exceeded");
      },
      onCheckpoint(checkpoint) {
        checkpointWrite = checkpointWrite.then(() =>
          automationJobStore.saveCheckpoint(runId, checkpoint),
        );
      },
      finalize: ({ answer }) => ({ result: { answer } }),
    });
    await checkpointWrite;
    return { outcome, events };
  } finally {
    window.clearTimeout(timeout);
  }
}

function toolSummaries(
  events: AgentWorkbenchEvent[],
): AutomationRunRecord["toolSummaries"] {
  return events
    .filter(
      (event): event is Extract<AgentWorkbenchEvent, { type: "tool_result" }> =>
        event.type === "tool_result",
    )
    .map((event) => ({
      toolName: event.toolName,
      summary: event.result.summary?.slice(0, 1_000),
    }));
}

const TERMINAL_RUN_STATUSES = new Set<AutomationRunRecord["status"]>([
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

async function recoverInterruptedRun(
  job: AutomationJobDefinition,
  state: AutomationJobState,
): Promise<AutomationJobState> {
  if (!state.activeRunId || !state.activeRunMonth) return state;
  const execution = job.task.execution;
  if (
    Date.now() - (state.lastStartedAt ?? state.updatedAt) <=
    (execution?.budget.maxDurationMs ?? 60_000) + 60_000
  )
    return state;
  const run = await automationJobStore.getRun(
    state.activeRunMonth,
    state.activeRunId,
  );
  if (run && TERMINAL_RUN_STATUSES.has(run.status)) {
    const summary = run.result?.summary ?? run.error?.message ?? "任务已取消。";
    try {
      if (
        !run.delivery &&
        shouldDeliver(job, run.status, run.status !== "skipped")
      ) {
        await deliver(job, summary, run.runId);
      }
    } catch (error) {
      console.error("[automation-runtime] 恢复投递失败", error);
    }
    await automationJobStore.deleteCheckpoint(run.runId);
    const recoveredFailed =
      run.status === "failed" || run.delivery?.status === "failed";
    const failures = recoveredFailed ? state.consecutiveFailures + 1 : 0;
    const blocked = failures >= job.policy.maxConsecutiveFailures;
    const manual = run.occurrenceKey.includes(":manual:");
    return saveState(job, state, {
      status: blocked ? "blocked" : recoveredFailed ? "failed" : "idle",
      activeRunId: undefined,
      activeRunMonth: undefined,
      pendingScheduledAt: undefined,
      lastOccurrenceKey: run.occurrenceKey,
      lastCompletedAt: run.completedAt,
      lastScheduledAt: manual ? state.lastScheduledAt : run.scheduledAt,
      nextRunAt: manual
        ? state.nextRunAt
        : nextScheduledAt(
            job.trigger,
            job.policy.catchUp === "skip"
              ? run.scheduledAt
              : (run.completedAt ?? Date.now()),
          ),
      consecutiveFailures: failures,
      pauseReason: blocked ? "连续失败次数达到上限，已自动暂停。" : undefined,
    });
  }

  const checkpoint = run
    ? await automationJobStore.getCheckpoint(run.runId)
    : undefined;
  const safeToReplay =
    run?.status === "queued" ||
    Boolean(checkpoint && inspectAgentRunResume(checkpoint).resumable);
  const completedAt = Date.now();
  if (run) {
    await automationJobStore.saveRun(
      {
        ...run,
        revision: run.revision + 1,
        status: "failed",
        completedAt,
        updatedAt: completedAt,
        error: {
          code: "automation_interrupted",
          message: safeToReplay
            ? "运行设备异常退出，已从安全边界重新排队。"
            : "运行设备异常退出，检查点无法证明可安全重放，任务已阻断。",
          retryable: safeToReplay,
          safeToReplay,
        },
      },
      run.revision,
    );
    await automationJobStore.deleteCheckpoint(run.runId);
  }
  return saveState(job, state, {
    status: safeToReplay ? "idle" : "blocked",
    activeRunId: undefined,
    activeRunMonth: undefined,
    pendingScheduledAt: undefined,
    nextRunAt: safeToReplay
      ? (state.nextRunAt ?? run?.scheduledAt)
      : state.nextRunAt,
    lastCompletedAt: completedAt,
    consecutiveFailures: safeToReplay
      ? state.consecutiveFailures
      : state.consecutiveFailures + 1,
    pauseReason: safeToReplay
      ? undefined
      : "中断检查点不满足安全重放条件，请检查后重新启用。",
  });
}

async function runOccurrence(
  job: AutomationJobDefinition,
  scheduledAt: number,
  occurrenceKey: string,
): Promise<void> {
  let queuedScheduledAt: number | undefined;
  await withNotificationLock(
    notificationLockName("automation-job", job.jobId),
    async () => {
      let current = await automationJobStore.getState(job.jobId);
      if (current?.lastOccurrenceKey === occurrenceKey) return;
      if (
        job.policy.overlap === "skip" &&
        current?.lastStartedAt !== undefined &&
        current.lastCompletedAt !== undefined &&
        current.lastStartedAt <= scheduledAt &&
        scheduledAt <= current.lastCompletedAt
      )
        return;
      if (current?.activeRunId) {
        if (job.policy.overlap === "queue-latest")
          await saveState(job, current, { pendingScheduledAt: scheduledAt });
        return;
      }
      const now = Date.now();
      const runId = createAutomationRunId();
      let run: AutomationRunRecord = {
        schemaVersion: 1,
        runId,
        revision: 1,
        jobId: job.jobId,
        jobRevision: job.revision,
        occurrenceKey,
        status: "queued",
        scheduledAt,
        queuedAt: now,
        runner: job.runner,
        toolSummaries: [],
        createdAt: now,
        updatedAt: now,
      };
      run = await automationJobStore.saveRun(run);
      current = await saveState(job, current, {
        status: "running",
        activeRunId: runId,
        activeRunMonth: month(now),
        pendingScheduledAt: scheduledAt,
        lastStartedAt: now,
      });
      run = await automationJobStore.saveRun(
        {
          ...run,
          revision: 2,
          status: "running",
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
        1,
      );

      let changed = true;
      let summary = "";
      let runStatus: AutomationRunRecord["status"] = "succeeded";
      let usage: AutomationRunRecord["usage"];
      let summaries: AutomationRunRecord["toolSummaries"] = [];
      let error: AutomationRunRecord["error"];
      let sensorCheckpoint = current.sensorCheckpoint;
      try {
        let agentGoal: string | undefined;
        if (job.task.kind === "monitor") {
          const sensor = getAutomationSensor(
            job.trigger.kind === "sensor" ? job.trigger.sensorId : "",
          );
          if (!sensor) throw new Error("监测传感器未注册。");
          const result = await sensor.evaluate(new Date());
          changed = Boolean(
            current.sensorCheckpoint &&
            current.sensorCheckpoint.fingerprint !== result.fingerprint,
          );
          sensorCheckpoint = {
            fingerprint: result.fingerprint,
            checkedAt: Date.now(),
            summary: result.summary,
          };
          summary = result.summary;
          if (!current.sensorCheckpoint || !changed) runStatus = "skipped";
          else
            agentGoal = `${job.task.execution.goal}\n\n监测变化：${result.summary}`;
        } else if (job.task.kind === "agent")
          agentGoal = job.task.execution.goal;

        if (agentGoal) {
          let executed: Awaited<ReturnType<typeof executeAgent>> | undefined;
          for (
            let attempt = 0;
            attempt <= job.policy.maxRetries;
            attempt += 1
          ) {
            executed = await executeAgent(job, agentGoal, runId);
            if (
              executed.outcome.ok ||
              !retryableCode(executed.outcome.agentErrorCode)
            )
              break;
          }
          const tokenBudget = job.task.execution.budget.maxTokens;
          if ((executed?.outcome.usage?.totalTokens ?? 0) > tokenBudget) {
            throw Object.assign(new Error("后台 Agent 已超过任务令牌预算。"), {
              code: "automation_token_budget_exceeded",
              events: executed?.events,
            });
          }
          if (!executed?.outcome.ok) {
            const code =
              executed?.outcome.agentErrorCode ?? "background_agent_failed";
            throw Object.assign(
              new Error(
                executed?.outcome.displayError?.message ??
                  "后台 Agent 执行失败。",
              ),
              { code, events: executed?.events },
            );
          }
          summary =
            executed.outcome.result?.answer?.trim() || "后台 Agent 已完成。";
          usage = executed.outcome.usage;
          summaries = toolSummaries(executed.events);
        }
      } catch (reason) {
        runStatus = "failed";
        const code =
          typeof reason === "object" && reason && "code" in reason
            ? String(reason.code)
            : "automation_run_failed";
        const events =
          typeof reason === "object" &&
          reason &&
          "events" in reason &&
          Array.isArray(reason.events)
            ? (reason.events as AgentWorkbenchEvent[])
            : [];
        summaries = toolSummaries(events);
        error = {
          code,
          message:
            reason instanceof Error
              ? reason.message.slice(0, 2_000)
              : String(reason).slice(0, 2_000),
          retryable: retryableCode(code),
          safeToReplay: true,
        };
        summary = error.message;
      }

      let delivery: AutomationRunRecord["delivery"];
      if (shouldDeliver(job, runStatus, changed) && job.output.replyTarget) {
        const attemptedAt = Date.now();
        try {
          await deliver(job, summary, runId);
          delivery = {
            target: job.output.replyTarget,
            status: "succeeded",
            attemptedAt,
          };
        } catch (deliveryError) {
          delivery = {
            target: job.output.replyTarget,
            status: "failed",
            attemptedAt,
            error: (deliveryError instanceof Error
              ? deliveryError.message
              : String(deliveryError)
            ).slice(0, 2_000),
          };
        }
      }
      const completedAt = Date.now();
      const terminal: AutomationRunRecord = {
        ...run,
        revision: 3,
        status: runStatus,
        completedAt,
        updatedAt: completedAt,
        usage,
        toolSummaries: summaries,
        delivery,
        ...(runStatus === "failed"
          ? { error }
          : { result: { summary: summary.slice(0, 20_000), artifactIds: [] } }),
      };
      await automationJobStore.saveRun(terminal, 2);
      await automationJobStore.deleteCheckpoint(runId);
      const latestState = await automationJobStore.getState(job.jobId);
      if (!latestState || latestState.activeRunId !== runId)
        throw new Error("自动化运行状态已变化，已停止覆盖。");
      current = latestState;
      queuedScheduledAt =
        current.pendingScheduledAt !== scheduledAt
          ? current.pendingScheduledAt
          : undefined;
      const executionFailed =
        runStatus === "failed" || delivery?.status === "failed";
      const failures = executionFailed ? current.consecutiveFailures + 1 : 0;
      const blocked = failures >= job.policy.maxConsecutiveFailures;
      const manual = occurrenceKey.includes(":manual:");
      await saveState(job, current, {
        status: blocked ? "blocked" : executionFailed ? "failed" : "idle",
        activeRunId: undefined,
        activeRunMonth: undefined,
        pendingScheduledAt: undefined,
        manualRunRequestedAt: undefined,
        lastOccurrenceKey: occurrenceKey,
        lastScheduledAt: manual ? current.lastScheduledAt : scheduledAt,
        lastCompletedAt: completedAt,
        nextRunAt: manual
          ? current.nextRunAt
          : nextScheduledAt(
              job.trigger,
              job.policy.catchUp === "skip" ? scheduledAt : completedAt,
            ),
        consecutiveFailures: failures,
        pauseReason: blocked ? "连续失败次数达到上限，已自动暂停。" : undefined,
        sensorCheckpoint,
      });
      emitChanged();
    },
  );
  if (queuedScheduledAt !== undefined)
    await runOccurrence(
      job,
      queuedScheduledAt,
      `${job.jobId}:${queuedScheduledAt}`,
    );
}

async function scanJobs(): Promise<void> {
  for (const job of await automationJobStore.listJobs()) {
    if (!job.enabled || job.runner.deviceId !== getNotificationDeviceId())
      continue;
    let state = await automationJobStore.getState(job.jobId);
    if (state?.activeRunId) {
      state = await withNotificationLock(
        notificationLockName("automation-job", job.jobId),
        async () => {
          const latest = await automationJobStore.getState(job.jobId);
          return latest?.activeRunId
            ? recoverInterruptedRun(job, latest)
            : latest;
        },
      );
    }
    if (state?.status === "blocked" || state?.status === "paused") continue;
    if (state?.manualRunRequestedAt) {
      const scheduledAt = state.manualRunRequestedAt;
      await runOccurrence(
        job,
        scheduledAt,
        `${job.jobId}:manual:${scheduledAt}`,
      );
      continue;
    }
    const due = resolveDueOccurrence(job, state);
    if (due.skipped && due.nextRunAt !== state?.nextRunAt) {
      await saveState(job, state, {
        status: "idle",
        nextRunAt: due.nextRunAt,
        consecutiveFailures: state?.consecutiveFailures ?? 0,
      });
    } else if (due.scheduledAt !== undefined && due.occurrenceKey) {
      await runOccurrence(job, due.scheduledAt, due.occurrenceKey);
    } else if (
      !state ||
      state.jobRevision !== job.revision ||
      state.nextRunAt !== due.nextRunAt
    ) {
      await saveState(job, state, {
        status: "idle",
        nextRunAt: due.nextRunAt,
        consecutiveFailures: state?.consecutiveFailures ?? 0,
      });
    }
  }
}

function onJobsChanged(): void {
  signalBackgroundScanTask(TASK_ID);
  emitChanged();
}

function onRunNow(event: Event): void {
  const jobId = (event as CustomEvent<{ jobId?: string }>).detail?.jobId;
  if (!jobId) return;
  signalBackgroundScanTask(TASK_ID);
}

export function startAutomationRuntime(): void {
  if (unregister) return;
  window.addEventListener(AUTOMATION_JOBS_CHANGED_EVENT, onJobsChanged);
  window.addEventListener(AUTOMATION_RUN_NOW_EVENT, onRunNow);
  unregister = registerBackgroundScanTask({
    id: TASK_ID,
    signals: [AUTOMATION_JOBS_CHANGED_EVENT],
    async resolve() {
      return { enabled: true, intervalMs: 15_000, run: scanJobs };
    },
  });
}

export function destroyAutomationRuntime(): void {
  unregister?.();
  unregister = undefined;
  window.removeEventListener(AUTOMATION_JOBS_CHANGED_EVENT, onJobsChanged);
  window.removeEventListener(AUTOMATION_RUN_NOW_EVENT, onRunNow);
}
