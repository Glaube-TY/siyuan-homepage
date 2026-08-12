import type { AutomationJobDefinition, AutomationJobState, AutomationTrigger } from "./automation-job-contract";
import { BACKGROUND_SCHEDULE_CONSTANTS, nextScheduledAt } from "../../background-runtime/background-schedule";
export { listScheduledBetween, nextScheduledAt } from "../../background-runtime/background-schedule";
const { MINUTE } = BACKGROUND_SCHEDULE_CONSTANTS;

function latestDueAt(trigger: AutomationTrigger, firstDue: number, now: number): number {
  if (trigger.kind === "once") return firstDue;
  if (trigger.kind === "interval" || trigger.kind === "sensor") {
    const interval = trigger.intervalMinutes * MINUTE;
    return firstDue + Math.floor((now - firstDue) / interval) * interval;
  }
  let latest = firstDue;
  for (let next = nextScheduledAt(trigger, latest); next !== undefined && next <= now; next = nextScheduledAt(trigger, latest)) latest = next;
  return latest;
}

export interface DueOccurrence {
  scheduledAt?: number;
  nextRunAt?: number;
  occurrenceKey?: string;
  skipped: boolean;
}

export function resolveDueOccurrence(
  job: AutomationJobDefinition,
  state: AutomationJobState | undefined,
  now = Date.now(),
): DueOccurrence {
  if (!job.enabled) return { skipped: true };
  const next = state?.nextRunAt ?? nextScheduledAt(job.trigger, job.createdAt - 1);
  if (next === undefined || next > now) return { nextRunAt: next, skipped: false };
  const expired = job.policy.expiresAfterMs !== undefined && now - next > job.policy.expiresAfterMs;
  if ((job.policy.catchUp === "skip" && now - next > MINUTE) || expired) {
    return { skipped: true, nextRunAt: nextScheduledAt(job.trigger, now) };
  }
  const scheduledAt = job.policy.catchUp === "latest" ? latestDueAt(job.trigger, next, now) : next;
  return {
    scheduledAt,
    occurrenceKey: `${job.jobId}:${scheduledAt}`,
    nextRunAt: nextScheduledAt(job.trigger, scheduledAt),
    skipped: false,
  };
}

export const AUTOMATION_SCHEDULE_CONSTANTS = BACKGROUND_SCHEDULE_CONSTANTS;
