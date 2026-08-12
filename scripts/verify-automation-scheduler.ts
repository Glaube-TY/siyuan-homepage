import assert from "node:assert/strict";
import { nextScheduledAt, resolveDueOccurrence } from "../src/features/agent-platform/automation/automation-schedule";
import { bindAutomationRobotResult } from "../src/features/agent-platform/automation/automation-robot-route";
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
  task: { kind: "agent", execution: { goal: "自检", profileId: "background-job", allowedToolNames: ["siyuan_kb"], allowedActionNames: ["siyuan_kb:search"], memoryAccess: "none", budget: { maxTokens: 1000, maxToolCalls: 1, maxDurationMs: 10_000 } } },
  runner: { deviceId: "device-demo", runtime: "frontend", requiredCapabilities: [] },
  policy: { catchUp: "latest", overlap: "skip", maxRetries: 0, maxConsecutiveFailures: 3 },
  output: {},
  createdAt, updatedAt: createdAt,
};
const now = createdAt + 3.5 * 3_600_000;
const due = resolveDueOccurrence(job, undefined, now);
assert.equal(due.scheduledAt, createdAt + 3 * 3_600_000, "latest 补发只运行最近一次到期实例");
assert.equal(due.nextRunAt, createdAt + 4 * 3_600_000, "补发后应保留下一次正式计划");

assert.deepEqual(
  bindAutomationRobotResult({ action: "create", args: { robotRouteRef: "model-route" } }, "current-route"),
  { action: "create", args: { robotRouteRef: "current-route" } },
  "机器人创建任务时必须由运行时覆盖模型提供的机器人路由",
);
assert.deepEqual(
  bindAutomationRobotResult({ action: "create", args: { name: "每日早报" } }, "current-route"),
  { action: "create", args: { name: "每日早报", robotRouteRef: "current-route" } },
  "机器人只说自然语言时也必须自动补齐当前会话投递目标",
);

console.log("automation scheduler verification passed");
