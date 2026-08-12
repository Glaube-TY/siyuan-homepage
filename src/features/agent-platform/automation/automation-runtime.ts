import { notificationCenter, getNotificationDeviceId, requestMobilePlanRefresh, type NotificationDeliveryTarget } from "@/features/notification-center";
import { notificationLockName, withNotificationLock } from "@/features/notification-center/notification-center-locks";
import { runAgentProfile } from "@/features/kb/services/agent-workbench";
import type { AgentWorkbenchEvent } from "@/features/kb/services/agent-workbench/contracts/turn-event";
import { createBackgroundJobAgentProfile } from "../agent-profile";
import { createAutomationRunId, type AutomationJobDefinition, type AutomationJobState, type AutomationRunRecord } from "./automation-job-contract";
import { AUTOMATION_JOBS_CHANGED_EVENT, automationJobStore } from "./automation-job-store";
import { getAutomationSensor } from "./automation-sensor-registry";
import { nextScheduledAt, resolveDueOccurrence } from "./automation-schedule";
import { registerBackgroundScanTask, signalBackgroundScanTask } from "./unified-background-scheduler";
import { AUTOMATION_RUN_NOW_EVENT } from "./automation-control";
import { decodeAutomationRobotRoute } from "./automation-robot-route";
import { getNotebrainPlugin } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { RobotKernelClient, getPluginKernelPort } from "@/features/robot-assistant/runtime/robot-kernel-client";
import { inspectAgentRunResume } from "@/features/kb/services/agent-core/session/agent-run-checkpoint";

export const AUTOMATION_RUNTIME_CHANGED_EVENT = "automation-runtime-changed";
const TASK_ID = "automation-jobs";
let unregister: (() => void) | undefined;

function month(timestamp: number): string { return new Date(timestamp).toISOString().slice(0, 7); }
function emitChanged(): void { window.dispatchEvent(new CustomEvent(AUTOMATION_RUNTIME_CHANGED_EVENT)); }

async function saveState(job: AutomationJobDefinition, current: AutomationJobState | undefined, patch: Partial<AutomationJobState>): Promise<AutomationJobState> {
  const next: AutomationJobState = {
    ...(current ?? {
      schemaVersion: 1 as const, jobId: job.jobId, revision: 1, jobRevision: job.revision,
      status: "idle" as const, consecutiveFailures: 0, updatedAt: Date.now(),
    }),
    revision: current ? current.revision + 1 : 1, jobRevision: job.revision,
    ...patch,
    updatedAt: Date.now(),
  };
  return automationJobStore.saveState(next, current?.revision);
}

function mapTargets(job: AutomationJobDefinition): NotificationDeliveryTarget[] {
  return job.delivery.targets.flatMap((target) => target.kind === "robot" ? [] : [target]);
}

async function deliver(job: AutomationJobDefinition, run: AutomationRunRecord, title: string, content: string, level: "success" | "warning" | "error" = "success"): Promise<void> {
  const targets = mapTargets(job);
  if (targets.length > 0) {
    await notificationCenter.notify({
      source: "ai", sourceId: job.jobId, type: `automation_${job.task.kind}`, title, content, level,
      scheduledAt: new Date(run.scheduledAt).toISOString(), occurrenceKey: run.occurrenceKey,
      extra: { automationJobId: job.jobId, automationRunId: run.runId },
    }, { targets, reason: "自动化任务投递" });
  }
  for (const target of job.delivery.targets) {
    if (target.kind !== "robot") continue;
    const route = decodeAutomationRobotRoute(target.routeRef);
    const client = new RobotKernelClient(getPluginKernelPort(getNotebrainPlugin()));
    if (!client.available) throw new Error("机器人运行设备当前不可用。");
    const result = await client.call<{ ok?: boolean; message?: string }>("robot.sendAutomationMessage", { ...route, text: `${title}\n${content}` });
    if (!result?.ok) throw new Error(result?.message || "机器人消息投递失败。");
  }
}

function shouldDeliver(job: AutomationJobDefinition, status: AutomationRunRecord["status"], changed: boolean, actionPerformed = false): boolean {
  if (status === "failed") return true;
  if (job.delivery.notifyWhen === "always" || job.delivery.notifyWhen === "result-or-error") return true;
  if (job.delivery.notifyWhen === "change-only") return changed;
  return actionPerformed;
}

function retryableCode(code: string | undefined): boolean {
  return Boolean(code && /timeout|rate_limit|http_5|network|provider_http/.test(code));
}

async function executeAgent(job: AutomationJobDefinition, goal: string, runId: string) {
  if (job.task.kind === "reminder") throw new Error("提醒任务不能运行 Agent。");
  const execution = job.task.kind === "agent" ? job.task.execution : job.task.reaction.kind === "agent" ? job.task.reaction.execution : undefined;
  if (!execution) throw new Error("当前任务没有 Agent 执行配置。");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort("automation_timeout"), execution.budget.maxDurationMs);
  const events: AgentWorkbenchEvent[] = [];
  let checkpointWrite = Promise.resolve();
  const profile = createBackgroundJobAgentProfile({ ...execution, maxToolCalls: execution.budget.maxToolCalls });
  try {
    const outcome = await runAgentProfile({
      profile, question: goal, mode: "whole_kb", conversationId: `automation-${job.jobId}`, turnId: runId,
      abortSignal: controller.signal, maxToolCalls: execution.budget.maxToolCalls,
      onWorkbenchEvent(event) {
        events.push(event);
        if (event.type === "usage" && event.cumulativeUsage.totalTokens > execution.budget.maxTokens) controller.abort("automation_token_budget_exceeded");
      },
      onCheckpoint(checkpoint) { checkpointWrite = checkpointWrite.then(() => automationJobStore.saveCheckpoint(runId, checkpoint)); },
      finalize: ({ answer }) => ({ result: { answer } }),
    });
    await checkpointWrite;
    return { outcome, events };
  } finally {
    window.clearTimeout(timeout);
  }
}

function toolSummaries(events: AgentWorkbenchEvent[]): AutomationRunRecord["toolSummaries"] {
  return events.filter((event): event is Extract<AgentWorkbenchEvent, { type: "tool_result" }> => event.type === "tool_result")
    .map((event) => ({ toolName: event.toolName, summary: event.result.summary?.slice(0, 1_000) }));
}

const TERMINAL_RUN_STATUSES = new Set<AutomationRunRecord["status"]>(["succeeded", "failed", "cancelled", "skipped"]);

async function recoverInterruptedRun(job: AutomationJobDefinition, state: AutomationJobState): Promise<AutomationJobState> {
  if (!state.activeRunId || !state.activeRunMonth) return state;
  const execution = job.task.kind === "agent" ? job.task.execution : job.task.kind === "monitor" && job.task.reaction.kind === "agent" ? job.task.reaction.execution : undefined;
  if (Date.now() - (state.lastStartedAt ?? state.updatedAt) <= (execution?.budget.maxDurationMs ?? 60_000) + 60_000) return state;
  const run = await automationJobStore.getRun(state.activeRunMonth, state.activeRunId);
  if (run && TERMINAL_RUN_STATUSES.has(run.status)) {
    const summary = run.result?.summary ?? run.error?.message ?? "任务已取消。";
    try {
      if (shouldDeliver(job, run.status, run.status !== "skipped", run.toolSummaries.length > 0)) {
        await deliver(job, run, job.name, summary, run.status === "failed" ? "error" : "success");
      }
    } catch (error) { console.error("[automation-runtime] 恢复投递失败", error); }
    await automationJobStore.deleteCheckpoint(run.runId);
    const failures = run.status === "failed" ? state.consecutiveFailures + 1 : 0;
    const blocked = failures >= job.policy.maxConsecutiveFailures;
    const manual = run.occurrenceKey.includes(":manual:");
    return saveState(job, state, {
      status: blocked ? "blocked" : run.status === "failed" ? "failed" : "idle", activeRunId: undefined, activeRunMonth: undefined,
      pendingScheduledAt: undefined, lastOccurrenceKey: run.occurrenceKey, lastCompletedAt: run.completedAt,
      lastScheduledAt: manual ? state.lastScheduledAt : run.scheduledAt,
      nextRunAt: manual ? state.nextRunAt : nextScheduledAt(job.trigger, job.policy.catchUp === "skip" ? run.scheduledAt : run.completedAt ?? Date.now()),
      consecutiveFailures: failures, pauseReason: blocked ? "连续失败次数达到上限，已自动暂停。" : undefined,
    });
  }

  const checkpoint = run ? await automationJobStore.getCheckpoint(run.runId) : undefined;
  const safeToReplay = run?.status === "queued" || Boolean(checkpoint && inspectAgentRunResume(checkpoint).resumable);
  const completedAt = Date.now();
  if (run) {
    await automationJobStore.saveRun({
      ...run, revision: run.revision + 1, status: "failed", completedAt, updatedAt: completedAt,
      error: {
        code: "automation_interrupted", message: safeToReplay
          ? "运行设备异常退出，已从安全边界重新排队。"
          : "运行设备异常退出，检查点无法证明可安全重放，任务已阻断。",
        retryable: safeToReplay, safeToReplay,
      },
    }, run.revision);
    await automationJobStore.deleteCheckpoint(run.runId);
  }
  return saveState(job, state, {
    status: safeToReplay ? "idle" : "blocked", activeRunId: undefined, activeRunMonth: undefined,
    pendingScheduledAt: undefined, nextRunAt: safeToReplay ? state.nextRunAt ?? run?.scheduledAt : state.nextRunAt,
    lastCompletedAt: completedAt, consecutiveFailures: safeToReplay ? state.consecutiveFailures : state.consecutiveFailures + 1,
    pauseReason: safeToReplay ? undefined : "中断检查点不满足安全重放条件，请检查后重新启用。",
  });
}

async function runOccurrence(job: AutomationJobDefinition, scheduledAt: number, occurrenceKey: string): Promise<void> {
  let queuedScheduledAt: number | undefined;
  await withNotificationLock(notificationLockName("automation-job", job.jobId), async () => {
    let current = await automationJobStore.getState(job.jobId);
    if (current?.lastOccurrenceKey === occurrenceKey) return;
    if (job.policy.overlap === "skip" && current?.lastStartedAt !== undefined && current.lastCompletedAt !== undefined
      && current.lastStartedAt <= scheduledAt && scheduledAt <= current.lastCompletedAt) return;
    if (current?.activeRunId) {
      if (job.policy.overlap === "queue-latest") await saveState(job, current, { pendingScheduledAt: scheduledAt });
      return;
    }
    const now = Date.now();
    const runId = createAutomationRunId();
    let run: AutomationRunRecord = {
      schemaVersion: 1, runId, revision: 1, jobId: job.jobId, jobRevision: job.revision, occurrenceKey,
      status: "queued", scheduledAt, queuedAt: now, runner: job.runner, toolSummaries: [], createdAt: now, updatedAt: now,
    };
    run = await automationJobStore.saveRun(run);
    current = await saveState(job, current, { status: "running", activeRunId: runId, activeRunMonth: month(now), pendingScheduledAt: scheduledAt, lastStartedAt: now });
    run = await automationJobStore.saveRun({ ...run, revision: 2, status: "running", startedAt: Date.now(), updatedAt: Date.now() }, 1);

    let changed = true;
    let summary = job.task.kind === "reminder" ? job.task.message : "";
    let runStatus: AutomationRunRecord["status"] = "succeeded";
    let usage: AutomationRunRecord["usage"];
    let summaries: AutomationRunRecord["toolSummaries"] = [];
    let error: AutomationRunRecord["error"];
    let sensorCheckpoint = current.sensorCheckpoint;
    try {
      let agentGoal: string | undefined;
      if (job.task.kind === "monitor") {
        const sensor = getAutomationSensor(job.trigger.kind === "sensor" ? job.trigger.sensorId : "");
        if (!sensor) throw new Error("监测传感器未注册。");
        const result = await sensor.evaluate(new Date());
        changed = Boolean(current.sensorCheckpoint && current.sensorCheckpoint.fingerprint !== result.fingerprint);
        sensorCheckpoint = { fingerprint: result.fingerprint, checkedAt: Date.now(), summary: result.summary };
        summary = result.summary;
        if (!current.sensorCheckpoint || !changed) runStatus = "skipped";
        else if (job.task.reaction.kind === "notify") summary = `${job.task.reaction.message}\n${result.summary}`;
        else agentGoal = `${job.task.reaction.execution.goal}\n\n监测变化：${result.summary}`;
      } else if (job.task.kind === "agent") agentGoal = job.task.execution.goal;

      if (agentGoal) {
        let executed: Awaited<ReturnType<typeof executeAgent>> | undefined;
        for (let attempt = 0; attempt <= job.policy.maxRetries; attempt += 1) {
          executed = await executeAgent(job, agentGoal, runId);
          if (executed.outcome.ok || !retryableCode(executed.outcome.agentErrorCode)) break;
        }
        const tokenBudget = job.task.kind === "agent" ? job.task.execution.budget.maxTokens
          : job.task.kind === "monitor" && job.task.reaction.kind === "agent" ? job.task.reaction.execution.budget.maxTokens : Number.POSITIVE_INFINITY;
        if ((executed?.outcome.usage?.totalTokens ?? 0) > tokenBudget) {
          throw Object.assign(new Error("后台 Agent 已超过任务令牌预算。"), { code: "automation_token_budget_exceeded", events: executed?.events });
        }
        if (!executed?.outcome.ok) {
          const code = executed?.outcome.agentErrorCode ?? "background_agent_failed";
          throw Object.assign(new Error(executed?.outcome.displayError?.message ?? "后台 Agent 执行失败。"), { code, events: executed?.events });
        }
        summary = executed.outcome.result?.answer?.trim() || "后台 Agent 已完成。";
        usage = executed.outcome.usage;
        summaries = toolSummaries(executed.events);
      }
    } catch (reason) {
      runStatus = "failed";
      const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "automation_run_failed";
      const events = typeof reason === "object" && reason && "events" in reason && Array.isArray(reason.events) ? reason.events as AgentWorkbenchEvent[] : [];
      summaries = toolSummaries(events);
      error = { code, message: reason instanceof Error ? reason.message.slice(0, 2_000) : String(reason).slice(0, 2_000), retryable: retryableCode(code), safeToReplay: true };
      summary = error.message;
    }

    const completedAt = Date.now();
    const terminal: AutomationRunRecord = {
      ...run, revision: 3, status: runStatus, completedAt, updatedAt: completedAt, usage,
      toolSummaries: summaries,
      ...(runStatus === "failed" ? { error } : { result: { summary: summary.slice(0, 20_000), artifactIds: [] } }),
    };
    await automationJobStore.saveRun(terminal, 2);
    await automationJobStore.deleteCheckpoint(runId);
    const latestState = await automationJobStore.getState(job.jobId);
    if (!latestState || latestState.activeRunId !== runId) throw new Error("自动化运行状态已变化，已停止覆盖。");
    current = latestState;
    queuedScheduledAt = current.pendingScheduledAt !== scheduledAt ? current.pendingScheduledAt : undefined;
    const failures = runStatus === "failed" ? current.consecutiveFailures + 1 : 0;
    const blocked = failures >= job.policy.maxConsecutiveFailures;
    const manual = occurrenceKey.includes(":manual:");
    await saveState(job, current, {
      status: blocked ? "blocked" : runStatus === "failed" ? "failed" : "idle",
      activeRunId: undefined, activeRunMonth: undefined, pendingScheduledAt: undefined, manualRunRequestedAt: undefined,
      lastOccurrenceKey: occurrenceKey, lastScheduledAt: manual ? current.lastScheduledAt : scheduledAt, lastCompletedAt: completedAt,
      nextRunAt: manual ? current.nextRunAt : nextScheduledAt(job.trigger, job.policy.catchUp === "skip" ? scheduledAt : completedAt), consecutiveFailures: failures,
      pauseReason: blocked ? "连续失败次数达到上限，已自动暂停。" : undefined, sensorCheckpoint,
    });
    if (shouldDeliver(job, runStatus, changed, summaries.length > 0)) {
      try { await deliver(job, terminal, job.name, summary, runStatus === "failed" ? "error" : changed ? "success" : "warning"); }
      catch (deliveryError) { console.error("[automation-runtime] 任务已完成，但投递失败", deliveryError); }
    }
    emitChanged();
  });
  if (queuedScheduledAt !== undefined) await runOccurrence(job, queuedScheduledAt, `${job.jobId}:${queuedScheduledAt}`);
}

async function scanJobs(): Promise<void> {
  for (const job of await automationJobStore.listJobs()) {
    if (!job.enabled || job.runner.deviceId !== getNotificationDeviceId()) continue;
    let state = await automationJobStore.getState(job.jobId);
    if (state?.activeRunId) {
      state = await withNotificationLock(notificationLockName("automation-job", job.jobId), async () => {
        const latest = await automationJobStore.getState(job.jobId);
        return latest?.activeRunId ? recoverInterruptedRun(job, latest) : latest;
      });
    }
    if (state?.status === "blocked" || state?.status === "paused") continue;
    if (state?.manualRunRequestedAt) {
      const scheduledAt = state.manualRunRequestedAt;
      await runOccurrence(job, scheduledAt, `${job.jobId}:manual:${scheduledAt}`);
      continue;
    }
    const due = resolveDueOccurrence(job, state);
    if (due.skipped && due.nextRunAt !== state?.nextRunAt) {
      await saveState(job, state, { status: "idle", nextRunAt: due.nextRunAt, consecutiveFailures: state?.consecutiveFailures ?? 0 });
    } else if (due.scheduledAt !== undefined && due.occurrenceKey) {
      await runOccurrence(job, due.scheduledAt, due.occurrenceKey);
    } else if (!state || state.jobRevision !== job.revision || state.nextRunAt !== due.nextRunAt) {
      await saveState(job, state, { status: "idle", nextRunAt: due.nextRunAt, consecutiveFailures: state?.consecutiveFailures ?? 0 });
    }
  }
}

function onJobsChanged(): void {
  signalBackgroundScanTask(TASK_ID);
  requestMobilePlanRefresh("automation-jobs-changed");
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
  unregister = registerBackgroundScanTask({ id: TASK_ID, signals: [AUTOMATION_JOBS_CHANGED_EVENT], async resolve() { return { enabled: true, intervalMs: 15_000, run: scanJobs }; } });
}

export function destroyAutomationRuntime(): void {
  unregister?.(); unregister = undefined;
  window.removeEventListener(AUTOMATION_JOBS_CHANGED_EVENT, onJobsChanged);
  window.removeEventListener(AUTOMATION_RUN_NOW_EVENT, onRunNow);
}
