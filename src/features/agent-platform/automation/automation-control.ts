import { isHomepageEntitlementGranted } from "@/features/entitlement/homepage-entitlement";

export const AUTOMATION_RUN_NOW_EVENT = "automation-run-now";

export async function requestAutomationRunNow(jobId: string): Promise<void> {
  if (!isHomepageEntitlementGranted()) throw new Error("高级功能不可用。");
  const [{ automationJobStore }, { nextScheduledAt }] = await Promise.all([
    import("./automation-job-store"), import("./automation-schedule"),
  ]);
  const job = await automationJobStore.getJob(jobId);
  if (!job) throw new Error("自动化任务不存在。");
  // 手动运行允许作用于停用任务；不修改 job.enabled
  const state = await automationJobStore.getState(jobId);
  if (state?.activeRunId) throw new Error("任务正在运行，请等待本轮结束。");
  if (state?.status === "blocked" || state?.status === "paused") throw new Error("任务已暂停或阻塞，无法手动运行。");
  await automationJobStore.saveState({
    ...(state ?? {
      schemaVersion: 1 as const, jobId, revision: 1, jobRevision: job.revision,
      status: "idle" as const, nextRunAt: nextScheduledAt(job.trigger, Date.now()), consecutiveFailures: 0, updatedAt: Date.now(),
    }),
    revision: state ? state.revision + 1 : 1, jobRevision: job.revision,
    status: "idle", pauseReason: undefined, consecutiveFailures: 0,
    manualRunRequestedAt: Date.now(), updatedAt: Date.now(),
  }, state?.revision);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AUTOMATION_RUN_NOW_EVENT, { detail: { jobId } }));
}
