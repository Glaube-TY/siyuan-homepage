import type { MobileNotificationPlanProvider, MobileNotificationPlanRequest } from "@/features/notification-center";
import { automationJobStore } from "./automation-job-store";
import { listScheduledBetween } from "./automation-schedule";

export const automationMobileNotificationPlanProvider: MobileNotificationPlanProvider = {
  id: "automation-reminders",
  source: "ai",
  async buildPlans(context): Promise<MobileNotificationPlanRequest[]> {
    const jobs = (await automationJobStore.listJobs()).filter((job) =>
      job.enabled && job.task.kind === "reminder" && job.trigger.kind !== "sensor"
      && job.delivery.targets.some((target) => target.kind === "mobile"),
    );
    return jobs.flatMap((job) => listScheduledBetween(job.trigger, context.now.getTime(), context.horizonEnd.getTime()).map((scheduledAt) => {
      const occurrenceKey = `${job.jobId}:${scheduledAt}`;
      return {
        planKey: `mobile:${occurrenceKey}`,
        source: "ai",
        ruleId: job.jobId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        event: {
          source: "ai", sourceId: job.jobId, type: "automation_reminder", title: job.name,
          content: job.task.kind === "reminder" ? job.task.message : "", level: "info",
          scheduledAt: new Date(scheduledAt).toISOString(), occurrenceKey,
          extra: { automationJobId: job.jobId },
        },
      };
    }));
  },
};
