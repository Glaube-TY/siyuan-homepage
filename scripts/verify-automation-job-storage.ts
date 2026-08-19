import assert from "node:assert/strict";
import type { StorageReadResult } from "../src/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import {
  automationJobDefinitionSchema,
  automationJobStateSchema,
  type AutomationJobDefinition,
  type AutomationJobState,
  type AutomationRunRecord,
} from "../src/features/agent-platform/automation/automation-job-contract";
import {
  AutomationJobStore,
  type AutomationStoragePort,
} from "../src/features/agent-platform/automation/automation-job-store";
import { createAgentRunIdentity } from "../src/features/agent-platform/agent-run-protocol";
import {
  inspectAgentRunResume,
  type AgentRunCheckpoint,
} from "../src/features/kb/services/agent-core/session/agent-run-checkpoint";

class MemoryStorage implements AutomationStoragePort {
  readonly files = new Map<string, unknown>();
  readonly errors = new Map<string, string>();

  async load<T>(key: string): Promise<StorageReadResult<T>> {
    const error = this.errors.get(key);
    if (error) return { status: "error", error };
    return this.files.has(key)
      ? { status: "ok", data: structuredClone(this.files.get(key)) as T }
      : { status: "missing" };
  }

  async save<T>(key: string, value: T): Promise<void> {
    this.files.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
}

const now = Date.now();
const reminder: AutomationJobDefinition = {
  schemaVersion: 1,
  jobId: "job-reminder",
  revision: 1,
  name: "提醒提交材料",
  enabled: true,
  source: { surface: "kb-chat", profileId: "kb-full" },
  trigger: { kind: "once", at: now + 60_000, timeZone: "Asia/Shanghai" },
  task: {
    kind: "agent",
    execution: {
      goal: "整理并提交材料",
      profileId: "background-job",
      allowedToolNames: ["siyuan_kb"],
      allowedActionNames: ["siyuan_kb:search"],
      memoryAccess: "none",
      budget: { maxTokens: 1000, maxToolCalls: 1, maxDurationMs: 10_000 },
    },
  },
  runner: {
    deviceId: "device-a",
    runtime: "kernel",
    requiredCapabilities: ["notification"],
  },
  policy: {
    catchUp: "run-once",
    overlap: "skip",
    maxRetries: 1,
    maxConsecutiveFailures: 3,
  },
  output: {
    replyTarget: {
      kind: "robot",
      routeRef: "robot-route-a",
      conversationMode: "existing",
    },
  },
  createdAt: now,
  updatedAt: now,
};

const storage = new MemoryStorage();
const store = new AutomationJobStore(storage);
await store.saveJob(reminder);
assert.equal((await store.getJob(reminder.jobId))?.name, reminder.name);
assert.equal((await store.listJobs()).length, 1);
assert.equal(
  automationJobDefinitionSchema.parse({
    ...reminder,
    output: { replyTarget: { kind: "robot", routeRef: "legacy-route" } },
  }).output.replyTarget?.conversationMode,
  "existing",
  "未写会话方式的当前任务应按已有会话读取",
);
assert.equal(
  automationJobDefinitionSchema.safeParse({
    ...reminder,
    output: {
      replyTarget: {
        kind: "kb-conversation",
        conversationMode: "new",
      },
    },
  }).success,
  true,
  "每次新建本地会话不需要预先绑定会话 ID",
);

const revised = {
  ...reminder,
  revision: 2,
  name: "提醒提交最终材料",
  updatedAt: now + 1,
};
await assert.rejects(() => store.saveJob(revised), /刷新后重试/);
await store.saveJob(revised, 1);

const state: AutomationJobState = {
  schemaVersion: 1,
  jobId: reminder.jobId,
  revision: 1,
  jobRevision: 2,
  status: "idle",
  nextRunAt: now + 60_000,
  consecutiveFailures: 0,
  updatedAt: now + 1,
};
await store.saveState(state);
assert.equal((await store.getState(reminder.jobId))?.jobRevision, 2);
assert.equal(
  automationJobStateSchema.safeParse({
    ...state,
    activeRunId: "automation-run-a",
  }).success,
  false,
);

const queuedRun: AutomationRunRecord = {
  schemaVersion: 1,
  runId: "automation-run-a",
  revision: 1,
  jobId: reminder.jobId,
  jobRevision: 2,
  occurrenceKey: "job-reminder:slot:1",
  status: "queued",
  scheduledAt: now,
  queuedAt: now,
  runner: revised.runner,
  toolSummaries: [],
  createdAt: now,
  updatedAt: now,
};
await store.saveRun(queuedRun);
const completedRun: AutomationRunRecord = {
  ...queuedRun,
  revision: 2,
  status: "succeeded",
  startedAt: now,
  completedAt: now + 10,
  result: { summary: "提醒已生成。", artifactIds: [] },
  delivery: {
    target: reminder.output.replyTarget!,
    status: "succeeded",
    attemptedAt: now + 9,
  },
  updatedAt: now + 10,
};
await assert.rejects(() => store.saveRun(completedRun), /刷新后重试/);
await store.saveRun(completedRun, 1);
await assert.rejects(
  () => store.saveRun({ ...completedRun, revision: 3 }, 2),
  /不能重新打开/,
);
const runMonth = new Date(now).toISOString().slice(0, 7);
assert.equal((await store.listRuns(runMonth))[0]?.status, "succeeded");
assert.equal((await store.getRun(runMonth, queuedRun.runId))?.revision, 2);
assert.equal((await store.getRun(runMonth, queuedRun.runId))?.delivery?.status, "succeeded");

const checkpointRunId = "automation-checkpoint-v2";
const checkpoint: AgentRunCheckpoint = {
  schemaVersion: 2,
  identity: createAgentRunIdentity({
    sessionId: "automation-checkpoint-session",
    runId: checkpointRunId,
    startedAt: now,
  }),
  phase: "after_tool",
  stepIndex: 1,
  messages: [],
  sideEffectState: "not_started",
  createdAt: now,
};
await store.saveCheckpoint(checkpointRunId, checkpoint);
assert.equal((await store.getCheckpoint(checkpointRunId))?.schemaVersion, 2, "当前 schema=2 检查点应可读取");
assert.equal(inspectAgentRunResume(checkpoint).resumable, true);
const checkpointStorageKey = [...storage.files.keys()].find((key) => key.endsWith(`${checkpointRunId}.json`));
assert.ok(checkpointStorageKey);

storage.files.set(checkpointStorageKey, { ...checkpoint, schemaVersion: 1 });
assert.equal(await store.getCheckpoint(checkpointRunId), undefined, "旧 schema=1 检查点不得转换为 v2 或恢复");
assert.equal(storage.files.has(checkpointStorageKey), true, "存储边界只识别旧检查点，清理由恢复流程负责");
await store.deleteCheckpoint(checkpointRunId);
assert.equal(storage.files.has(checkpointStorageKey), false, "恢复清理旧检查点后不得残留");

await store.saveCheckpoint(checkpointRunId, checkpoint);
storage.files.set(checkpointStorageKey, { ...checkpoint, identity: { ...checkpoint.identity, runId: "other-run" } });
await assert.rejects(() => store.getCheckpoint(checkpointRunId), /结构无效/);
storage.files.set(checkpointStorageKey, { schemaVersion: 2, identity: checkpoint.identity });
await assert.rejects(() => store.getCheckpoint(checkpointRunId), /结构无效/);
storage.errors.set(checkpointStorageKey, "模拟读取失败");
await assert.rejects(() => store.getCheckpoint(checkpointRunId), /结构无效/);

assert.equal(
  automationJobDefinitionSchema.safeParse({
    ...reminder,
    jobId: "invalid-monitor",
    task: reminder.task,
    trigger: {
      kind: "sensor",
      sensorId: "task-overdue",
      intervalMinutes: 60,
      timeZone: "Asia/Shanghai",
    },
  }).success,
  false,
);
assert.equal(
  automationJobDefinitionSchema.safeParse({
    ...reminder,
    jobId: "legacy-reminder",
    task: { kind: "reminder", message: "不应进入 Agent Job" },
    delivery: { targets: [{ kind: "desktop" }], notifyWhen: "always" },
  }).success,
  false,
  "固定提醒和通知目标必须由通知中心管理",
);

await store.deleteJob(reminder.jobId, 2);
assert.equal(await store.getJob(reminder.jobId), undefined);
assert.equal(await store.getState(reminder.jobId), undefined);

console.log(
  "自动化 Job 契约、并发 revision、分片存储和不可变运行身份校验通过。",
);
