import assert from "node:assert/strict";
import { nextScheduledAt, resolveDueOccurrence } from "../src/features/agent-platform/automation/automation-schedule";
import type { AutomationJobDefinition } from "../src/features/agent-platform/automation/automation-job-contract";

const shanghai = "Asia/Shanghai";
const beforeEight = Date.parse("2026-08-12T23:59:00.000Z");
assert.equal(
  nextScheduledAt({ kind: "daily", time: "08:00", timeZone: shanghai }, beforeEight),
  Date.parse("2026-08-13T00:00:00.000Z"),
  "每日任务应按 IANA 时区计算",
);
assert.equal(
  nextScheduledAt({ kind: "interval", intervalMinutes: 30, anchorAt: 1_000, timeZone: shanghai }, 1_000),
  1_801_000,
  "间隔任务应严格返回 afterExclusive 之后的时刻",
);

const createdAt = Date.parse("2026-08-13T00:00:00.000Z");
const job: AutomationJobDefinition = {
  schemaVersion: 1, jobId: "job-scheduler-demo", revision: 1, name: "调度自检", enabled: true,
  source: { surface: "internal" },
  trigger: { kind: "interval", intervalMinutes: 60, anchorAt: createdAt, timeZone: shanghai },
  task: { kind: "reminder", message: "自检" },
  runner: { deviceId: "device-demo", runtime: "frontend", requiredCapabilities: [] },
  policy: { catchUp: "latest", overlap: "skip", maxRetries: 0, maxConsecutiveFailures: 3 },
  delivery: { targets: [{ kind: "desktop" }], notifyWhen: "always" },
  createdAt, updatedAt: createdAt,
};
const now = createdAt + 3.5 * 3_600_000;
const due = resolveDueOccurrence(job, undefined, now);
assert.equal(due.scheduledAt, createdAt + 3 * 3_600_000, "latest 补发只运行最近一次到期实例");
assert.equal(due.nextRunAt, createdAt + 4 * 3_600_000, "补发后应保留下一次正式计划");

console.log("automation scheduler verification passed");
