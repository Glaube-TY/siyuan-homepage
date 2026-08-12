import { z } from "zod";
import {
  loadDataStrict,
  removeData,
  saveData,
  type StorageReadResult,
} from "../../kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { isValidStorageId } from "../../kb/services/agent-workbench/storage/notebrain-storage-keys";
import {
  automationJobDefinitionSchema,
  automationJobStateSchema,
  automationRunRecordSchema,
  type AutomationJobDefinition,
  type AutomationJobState,
  type AutomationRunRecord,
} from "./automation-job-contract";

const JOB_INDEX_KEY = "notebrain/automation/jobs/index.json";
const RUN_CATALOG_KEY = "notebrain/automation/runs/index.json";
const jobKey = (jobId: string) => `notebrain/automation/jobs/${jobId}.json`;
const stateKey = (jobId: string) => `notebrain/automation/state/${jobId}.json`;
const runIndexKey = (month: string) => `notebrain/automation/runs/${month}/index.json`;
const runKey = (month: string, runId: string) => `notebrain/automation/runs/${month}/${runId}.json`;

export const AUTOMATION_RUN_RETENTION = Object.freeze({ maxMonths: 12, maxRunsPerMonth: 200 });

export interface AutomationStoragePort {
  load<T>(key: string): Promise<StorageReadResult<T>>;
  save<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

const pluginStorage: AutomationStoragePort = {
  load: loadDataStrict,
  save: saveData,
  remove: removeData,
};

const jobIndexEntrySchema = z.object({
  jobId: z.string().refine(isValidStorageId),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["reminder", "agent", "monitor"]),
  enabled: z.boolean(),
  revision: z.number().int().min(1),
  updatedAt: z.number().int().nonnegative(),
}).strict();
const jobIndexSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  items: z.array(jobIndexEntrySchema),
  updatedAt: z.number().int().nonnegative(),
}).strict();
type JobIndex = z.infer<typeof jobIndexSchema>;

const runIndexEntrySchema = z.object({
  runId: z.string().refine(isValidStorageId),
  jobId: z.string().refine(isValidStorageId),
  status: automationRunRecordSchema.shape.status,
  scheduledAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict();
const runMonthIndexSchema = z.object({
  schemaVersion: z.literal(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  items: z.array(runIndexEntrySchema),
  updatedAt: z.number().int().nonnegative(),
}).strict();
type RunMonthIndex = z.infer<typeof runMonthIndexSchema>;

const runCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  months: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    count: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  }).strict()),
  updatedAt: z.number().int().nonnegative(),
}).strict();
type RunCatalog = z.infer<typeof runCatalogSchema>;
const TERMINAL_RUN_STATUSES = new Set<AutomationRunRecord["status"]>([
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

function emptyJobIndex(): JobIndex {
  return { schemaVersion: 1, revision: 0, items: [], updatedAt: 0 };
}

function emptyRunMonth(month: string): RunMonthIndex {
  return { schemaVersion: 1, month, items: [], updatedAt: 0 };
}

function emptyRunCatalog(): RunCatalog {
  return { schemaVersion: 1, months: [], updatedAt: 0 };
}

function monthFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function indexEntry(job: AutomationJobDefinition): JobIndex["items"][number] {
  return {
    jobId: job.jobId,
    name: job.name,
    kind: job.task.kind,
    enabled: job.enabled,
    revision: job.revision,
    updatedAt: job.updatedAt,
  };
}

export class AutomationJobStore {
  private mutationTail = Promise.resolve();

  constructor(private readonly storage: AutomationStoragePort = pluginStorage) {}

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation);
    this.mutationTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async read<T>(key: string, schema: z.ZodType<T>, missing: () => T, label: string): Promise<T> {
    const result = await this.storage.load<unknown>(key);
    if (result.status === "missing" || (result.status === "ok" && result.data === "")) return missing();
    if (result.status === "error") throw new Error(`${label}读取失败：${result.error}`);
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) throw new Error(`${label}结构无效，已停止覆盖。`);
    return parsed.data;
  }

  private async saveChecked<T>(key: string, value: T, schema: z.ZodType<T>, label: string): Promise<T> {
    const parsed = schema.parse(value);
    await this.storage.save(key, parsed);
    const saved = await this.storage.load<unknown>(key);
    const verified = saved.status === "ok" ? schema.safeParse(saved.data) : undefined;
    if (!verified?.success || JSON.stringify(verified.data) !== JSON.stringify(parsed)) {
      throw new Error(`${label}写入校验失败：${key}`);
    }
    return verified.data;
  }

  private async removeChecked(key: string, label: string): Promise<void> {
    await this.storage.remove(key);
    const removed = await this.storage.load(key);
    if (removed.status !== "missing") throw new Error(`${label}删除校验失败：${key}`);
  }

  private readJobIndex(): Promise<JobIndex> {
    return this.read(JOB_INDEX_KEY, jobIndexSchema, emptyJobIndex, "自动化任务索引");
  }

  private readRunCatalog(): Promise<RunCatalog> {
    return this.read(RUN_CATALOG_KEY, runCatalogSchema, emptyRunCatalog, "自动化运行目录");
  }

  private readRunMonth(month: string): Promise<RunMonthIndex> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("自动化运行月份无效。");
    return this.read(runIndexKey(month), runMonthIndexSchema, () => emptyRunMonth(month), "自动化月度运行索引");
  }

  async listJobs(): Promise<AutomationJobDefinition[]> {
    await this.mutationTail;
    const index = await this.readJobIndex();
    const jobs = await Promise.all(index.items.map(async (entry) => {
      const result = await this.storage.load<unknown>(jobKey(entry.jobId));
      if (result.status === "error") throw new Error(`自动化任务读取失败：${entry.jobId}；${result.error}`);
      if (result.status === "missing") throw new Error(`自动化任务索引指向了缺失文件：${entry.jobId}`);
      return automationJobDefinitionSchema.parse(result.data);
    }));
    return jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getJob(jobId: string): Promise<AutomationJobDefinition | undefined> {
    if (!isValidStorageId(jobId)) return undefined;
    await this.mutationTail;
    const result = await this.storage.load<unknown>(jobKey(jobId));
    if (result.status === "missing") return undefined;
    if (result.status === "error") throw new Error(`自动化任务读取失败：${result.error}`);
    return automationJobDefinitionSchema.parse(result.data);
  }

  saveJob(jobInput: AutomationJobDefinition, expectedRevision?: number): Promise<AutomationJobDefinition> {
    return this.mutate(async () => {
      const job = automationJobDefinitionSchema.parse(jobInput);
      const existingResult = await this.storage.load<unknown>(jobKey(job.jobId));
      if (existingResult.status === "error") throw new Error(`自动化任务读取失败：${existingResult.error}`);
      const existing = existingResult.status === "ok"
        ? automationJobDefinitionSchema.parse(existingResult.data)
        : undefined;
      if (!existing && job.revision !== 1) throw new Error("新自动化任务 revision 必须为 1。");
      if (existing && (expectedRevision !== existing.revision || job.revision !== existing.revision + 1)) {
        throw new Error("自动化任务已被其他位置更新，请刷新后重试。");
      }

      const index = await this.readJobIndex();
      const indexed = index.items.find((entry) => entry.jobId === job.jobId);
      if (Boolean(existing) !== Boolean(indexed)) throw new Error("自动化任务文件与索引不一致，已停止覆盖。");
      const saved = await this.saveChecked(jobKey(job.jobId), job, automationJobDefinitionSchema, "自动化任务");
      index.items = [...index.items.filter((entry) => entry.jobId !== job.jobId), indexEntry(saved)];
      index.revision += 1;
      index.updatedAt = Date.now();
      await this.saveChecked(JOB_INDEX_KEY, index, jobIndexSchema, "自动化任务索引");
      return saved;
    });
  }

  deleteJob(jobId: string, expectedRevision: number): Promise<void> {
    return this.mutate(async () => {
      if (!isValidStorageId(jobId)) return;
      const currentResult = await this.storage.load<unknown>(jobKey(jobId));
      if (currentResult.status === "error") throw new Error(`自动化任务读取失败：${currentResult.error}`);
      if (currentResult.status === "missing") return;
      const current = automationJobDefinitionSchema.parse(currentResult.data);
      if (current.revision !== expectedRevision) throw new Error("自动化任务已被其他位置更新，请刷新后重试。");
      const index = await this.readJobIndex();
      if (!index.items.some((entry) => entry.jobId === jobId)) throw new Error("自动化任务索引缺少目标条目，已停止删除。");
      await this.removeChecked(jobKey(jobId), "自动化任务");
      const storedState = await this.storage.load(stateKey(jobId));
      if (storedState.status !== "missing") await this.removeChecked(stateKey(jobId), "自动化任务状态");
      index.items = index.items.filter((entry) => entry.jobId !== jobId);
      index.revision += 1;
      index.updatedAt = Date.now();
      await this.saveChecked(JOB_INDEX_KEY, index, jobIndexSchema, "自动化任务索引");
    });
  }

  async getState(jobId: string): Promise<AutomationJobState | undefined> {
    if (!isValidStorageId(jobId)) return undefined;
    await this.mutationTail;
    const result = await this.storage.load<unknown>(stateKey(jobId));
    if (result.status === "missing") return undefined;
    if (result.status === "error") throw new Error(`自动化任务状态读取失败：${result.error}`);
    return automationJobStateSchema.parse(result.data);
  }

  saveState(stateInput: AutomationJobState, expectedRevision?: number): Promise<AutomationJobState> {
    return this.mutate(async () => {
      const state = automationJobStateSchema.parse(stateInput);
      const jobResult = await this.storage.load<unknown>(jobKey(state.jobId));
      if (jobResult.status !== "ok") throw new Error("自动化任务不存在，不能保存运行状态。");
      const job = automationJobDefinitionSchema.parse(jobResult.data);
      if (state.jobRevision !== job.revision) throw new Error("任务状态对应的 Job revision 已过期。");
      const existingResult = await this.storage.load<unknown>(stateKey(state.jobId));
      if (existingResult.status === "error") throw new Error(`自动化任务状态读取失败：${existingResult.error}`);
      const existing = existingResult.status === "ok" ? automationJobStateSchema.parse(existingResult.data) : undefined;
      if (!existing && state.revision !== 1) throw new Error("新任务状态 revision 必须为 1。");
      if (existing && (expectedRevision !== existing.revision || state.revision !== existing.revision + 1)) {
        throw new Error("自动化任务状态已变化，请重新计算后保存。");
      }
      return this.saveChecked(stateKey(state.jobId), state, automationJobStateSchema, "自动化任务状态");
    });
  }

  saveRun(runInput: AutomationRunRecord, expectedRevision?: number): Promise<AutomationRunRecord> {
    return this.mutate(async () => {
      const run = automationRunRecordSchema.parse(runInput);
      const month = monthFromTimestamp(run.createdAt);
      const existingResult = await this.storage.load<unknown>(runKey(month, run.runId));
      if (existingResult.status === "error") throw new Error(`自动化运行记录读取失败：${existingResult.error}`);
      const existing = existingResult.status === "ok"
        ? automationRunRecordSchema.parse(existingResult.data)
        : undefined;
      if (!existing && run.revision !== 1) throw new Error("新运行记录 revision 必须为 1。");
      if (!existing) {
        const jobResult = await this.storage.load<unknown>(jobKey(run.jobId));
        if (jobResult.status !== "ok") throw new Error("自动化任务不存在，不能创建运行记录。");
        const job = automationJobDefinitionSchema.parse(jobResult.data);
        if (run.jobRevision !== job.revision) throw new Error("运行记录对应的 Job revision 已过期。");
      }
      if (existing) {
        if (expectedRevision !== existing.revision || run.revision !== existing.revision + 1) {
          throw new Error("自动化运行记录已变化，请刷新后重试。");
        }
        if (existing.jobId !== run.jobId
          || existing.jobRevision !== run.jobRevision
          || existing.occurrenceKey !== run.occurrenceKey
          || existing.scheduledAt !== run.scheduledAt
          || existing.queuedAt !== run.queuedAt
          || existing.createdAt !== run.createdAt
          || JSON.stringify(existing.runner) !== JSON.stringify(run.runner)) {
          throw new Error("自动化运行身份不可修改。");
        }
        if (TERMINAL_RUN_STATUSES.has(existing.status)) throw new Error("自动化运行已结束，不能重新打开。");
      }
      const saved = await this.saveChecked(runKey(month, run.runId), run, automationRunRecordSchema, "自动化运行记录");
      const monthIndex = await this.readRunMonth(month);
      monthIndex.items = [
        { runId: run.runId, jobId: run.jobId, status: run.status, scheduledAt: run.scheduledAt, updatedAt: run.updatedAt },
        ...monthIndex.items.filter((entry) => entry.runId !== run.runId),
      ].sort((a, b) => b.updatedAt - a.updatedAt);
      if (!existing) {
        for (const expired of monthIndex.items.splice(AUTOMATION_RUN_RETENTION.maxRunsPerMonth)) {
          await this.removeChecked(runKey(month, expired.runId), "过期自动化运行记录");
        }
      }
      monthIndex.updatedAt = Date.now();
      await this.saveChecked(runIndexKey(month), monthIndex, runMonthIndexSchema, "自动化月度运行索引");
      await this.updateRunCatalog(month, monthIndex.items.length);
      return saved;
    });
  }

  async listRuns(month: string, limit = 50): Promise<AutomationRunRecord[]> {
    await this.mutationTail;
    const index = await this.readRunMonth(month);
    const entries = index.items.slice(0, Math.max(1, Math.min(200, Math.round(limit))));
    return Promise.all(entries.map(async (entry) => {
      const result = await this.storage.load<unknown>(runKey(month, entry.runId));
      if (result.status !== "ok") throw new Error(`自动化运行记录缺失或读取失败：${entry.runId}`);
      return automationRunRecordSchema.parse(result.data);
    }));
  }

  async getRun(month: string, runId: string): Promise<AutomationRunRecord | undefined> {
    if (!/^\d{4}-\d{2}$/.test(month) || !isValidStorageId(runId)) return undefined;
    await this.mutationTail;
    const result = await this.storage.load<unknown>(runKey(month, runId));
    if (result.status === "missing") return undefined;
    if (result.status === "error") throw new Error(`自动化运行记录读取失败：${result.error}`);
    return automationRunRecordSchema.parse(result.data);
  }

  private async updateRunCatalog(month: string, count: number): Promise<void> {
    const catalog = await this.readRunCatalog();
    const now = Date.now();
    catalog.months = [
      { month, count, updatedAt: now },
      ...catalog.months.filter((entry) => entry.month !== month),
    ].sort((a, b) => b.month.localeCompare(a.month));
    const expiredMonths = catalog.months.splice(AUTOMATION_RUN_RETENTION.maxMonths);
    for (const expired of expiredMonths) {
      const index = await this.readRunMonth(expired.month);
      for (const entry of index.items) await this.removeChecked(runKey(expired.month, entry.runId), "过期自动化运行记录");
      await this.removeChecked(runIndexKey(expired.month), "过期自动化运行索引");
    }
    catalog.updatedAt = now;
    await this.saveChecked(RUN_CATALOG_KEY, catalog, runCatalogSchema, "自动化运行目录");
  }
}

export const automationJobStore = new AutomationJobStore();
