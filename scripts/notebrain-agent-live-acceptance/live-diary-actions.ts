import assert from "node:assert/strict";

import { createNotebookChecked, removeNotebookChecked } from "../../src/api";
import {
  DEFAULT_ENHANCED_DIARY_CONFIG,
  ENHANCED_DIARY_CONFIG_FILE,
} from "../../src/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import { findDiaryDocsInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/find-diary-docs.contract";
import { getDailyWorkspaceOverviewInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/get-daily-workspace-overview.contract";
import { manageDiaryRecordInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/manage-diary-record.contract";
import { manageDiaryReviewInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/manage-diary-review.contract";
import { manageDiaryStructureInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/manage-diary-structure.contract";
import { manageDiaryTaskInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/manage-diary-task.contract";
import { queryDiaryRecordsInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/query-diary-records.contract";
import { queryTasksInputSchema } from "../../src/features/kb/services/agent-workbench/tools/siyuan/contracts/query-tasks.contract";
import { executeFindDiaryDocs } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/find-diary-docs.impl";
import { executeGetDailyWorkspaceOverview } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/get-daily-workspace-overview.impl";
import { executeManageDiaryRecord } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/manage-diary-record.impl";
import { executeManageDiaryReview } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/manage-diary-review.impl";
import { executeManageDiaryStructure } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/manage-diary-structure.impl";
import { executeManageDiaryTask } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/manage-diary-task.impl";
import { executeQueryDiaryRecords } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/query-diary-records.impl";
import { executeQueryTasks } from "../../src/features/kb/services/agent-workbench/tools/siyuan/impl/query-tasks.impl";
import type { SiyuanToolDeps } from "../../src/features/kb/services/agent-workbench/tools/siyuan/siyuan-tool-deps";

interface ResultRow { action: string; ok: boolean; detail?: string }
const results: ResultRow[] = [];

async function runSafe<T>(name: string, schema: { parse(value: unknown): T }, execute: (deps: SiyuanToolDeps, args: T) => Promise<{ ok?: boolean; safeOutput: any; errorCode?: string }>, deps: SiyuanToolDeps, raw: unknown) {
  try {
    const args = schema.parse(raw);
    const result = await execute(deps, args);
    if (result.ok === false) {
      throw new Error(`${name}: ${result.errorCode || "execution_failed"}: ${result.safeOutput?.message || "工具返回失败"}`);
    }
    const safeOutput = result.safeOutput;
    results.push({ action: name, ok: true });
    return safeOutput;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ action: name, ok: false, detail });
    throw error;
  }
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function taskTarget(output: { blockId?: string; taskId?: string }): { blockId?: string; taskId?: string } {
  return {
    ...(output.blockId ? { blockId: output.blockId } : {}),
    ...(output.taskId ? { taskId: output.taskId } : {}),
  };
}

function recordTarget(output: { recordId?: string; headingBlockId?: string }): { recordId?: string; headingBlockId?: string } {
  return {
    ...(output.recordId ? { recordId: output.recordId } : {}),
    ...(output.headingBlockId ? { headingBlockId: output.headingBlockId } : {}),
  };
}

const suffix = Date.now().toString(36);
const today = formatDate(new Date());
const createdNotebook = await createNotebookChecked(`Notebrain-Diary-Acceptance-${Date.now()}`);
const notebookId = String((createdNotebook as any)?.notebook?.id || "");
assert.match(notebookId, /^\d{14}-[a-z0-9]{7}$/);
const stored = new Map<string, unknown>();
stored.set(ENHANCED_DIARY_CONFIG_FILE, {
  ...structuredClone(DEFAULT_ENHANCED_DIARY_CONFIG),
  dailyNotebookId: notebookId,
  projectStorage: { mode: "notebook", notebookId, parentDocId: "" },
});
const deps: SiyuanToolDeps = {
  getScope: () => ({ type: "notebook", notebookId }),
  getEffectiveScope: () => ({ type: "notebook", notebookId }),
  async loadPluginData(key: string) {
    return structuredClone(stored.get(key) ?? null) as never;
  },
  async savePluginData(key: string, value: unknown) {
    stored.set(key, structuredClone(value));
  },
};

try {
  const ensured = await runSafe("diary.ensure_today", manageDiaryStructureInputSchema, executeManageDiaryStructure, deps, { operation: "ensure_today" });
  const todayDocId = String(ensured.docId || "");
  assert.match(todayDocId, /^\d{14}-[a-z0-9]{7}$/);

  await runSafe("diary.overview", getDailyWorkspaceOverviewInputSchema, executeGetDailyWorkspaceOverview, deps, { date: today });
  await runSafe("diary.query_tasks", queryTasksInputSchema, executeQueryTasks, deps, { scope: "all", date: today, limit: 30 });
  await runSafe("diary.query_records", queryDiaryRecordsInputSchema, executeQueryDiaryRecords, deps, { date: today, limit: 30 });

  for (const period of ["day", "week", "month", "year"] as const) {
    await runSafe(`diary.find_docs.${period}`, findDiaryDocsInputSchema, executeFindDiaryDocs, deps, { period, date: today, includeMarkdown: true, maxChars: 1000 });
  }

  for (const period of ["week", "month", "year"] as const) {
    await runSafe(`diary.append_template.${period}`, manageDiaryStructureInputSchema, executeManageDiaryStructure, deps, {
      operation: "append_template",
      period,
      date: today,
      docId: todayDocId,
    });
  }
  await runSafe("diary.append_template.day", manageDiaryStructureInputSchema, executeManageDiaryStructure, deps, {
    operation: "append_template",
    period: "day",
    date: today,
    docId: todayDocId,
  });

  const taskA = await runSafe("diary.task.create_a", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "create",
    task: { taskname: `验收任务A-${suffix}`, priority: 2, deadline: today, tags: ["Notebrain验收"] },
  });
  const targetA = taskTarget(taskA);
  assert.ok(targetA.blockId || targetA.taskId);
  await runSafe("diary.task.update", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "update",
    target: targetA,
    task: { taskname: `验收任务A已更新-${suffix}`, location: "隔离测试区" },
    clearFields: ["reminder"],
  });
  await runSafe("diary.task.set_status", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "set_status",
    target: targetA,
    completed: true,
  });

  const taskB = await runSafe("diary.task.create_b", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "create",
    task: { taskname: `验收任务B-${suffix}` },
  });
  const targetB = taskTarget(taskB);
  await runSafe("diary.task.postpone", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "postpone",
    target: targetB,
    postponeTo: "tomorrow",
  });

  const taskC = await runSafe("diary.task.create_c", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "create",
    task: { taskname: `验收任务C-${suffix}` },
  });
  const targetC = taskTarget(taskC);
  const migrateArgs = manageDiaryTaskInputSchema.parse({ operation: "migrate", target: targetC });
  const migrateGuard = await executeManageDiaryTask(deps, migrateArgs);
  assert.equal(migrateGuard.ok, false);
  assert.equal(migrateGuard.errorCode, "task_migration_failed");
  assert.match(migrateGuard.safeOutput.message, /已经在今日日记/);
  results.push({ action: "diary.task.migrate.already_today_guard", ok: true });
  await runSafe("diary.task.delete_log", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "delete",
    target: targetA,
    deleteMode: "log",
  });
  await runSafe("diary.task.delete", manageDiaryTaskInputSchema, executeManageDiaryTask, deps, {
    operation: "delete",
    target: targetC,
    deleteMode: "delete",
  });

  const record = await runSafe("diary.record.add", manageDiaryRecordInputSchema, executeManageDiaryRecord, deps, {
    operation: "add",
    target: { date: today },
    categoryTitle: "Notebrain验收",
    content: `验收记录-${suffix}`,
    tags: ["隔离测试"],
    isKeyRecord: false,
  });
  const selectedRecord = recordTarget(record);
  assert.ok(selectedRecord.recordId || selectedRecord.headingBlockId);
  await runSafe("diary.record.update", manageDiaryRecordInputSchema, executeManageDiaryRecord, deps, {
    operation: "update",
    target: selectedRecord,
    content: `验收记录已更新-${suffix}`,
    tags: ["隔离测试", "已更新"],
    isKeyRecord: false,
  });
  await runSafe("diary.record.delete", manageDiaryRecordInputSchema, executeManageDiaryRecord, deps, {
    operation: "delete",
    target: selectedRecord,
  });

  await runSafe("diary.review.save_content", manageDiaryReviewInputSchema, executeManageDiaryReview, deps, {
    operation: "save_content",
    docId: todayDocId,
    period: "day",
    fields: [
      { label: "今日总结", content: `验收总结-${suffix}` },
      { label: "明日关注", content: "继续完成发布前验收" },
    ],
  });
  await runSafe("diary.review.set_status", manageDiaryReviewInputSchema, executeManageDiaryReview, deps, {
    operation: "set_status",
    docId: todayDocId,
    period: "day",
    status: "completed",
  });

  await runSafe("diary.overview_after", getDailyWorkspaceOverviewInputSchema, executeGetDailyWorkspaceOverview, deps, { date: today });
  await runSafe("diary.query_tasks_after", queryTasksInputSchema, executeQueryTasks, deps, { scope: "all", date: today, keyword: "验收任务", limit: 30 });
  await runSafe("diary.query_records_after", queryDiaryRecordsInputSchema, executeQueryDiaryRecords, deps, { date: today, keyword: "验收记录", limit: 30 });
} finally {
  await removeNotebookChecked(notebookId);
}

process.stdout.write(JSON.stringify({
  ok: results.every((item) => item.ok),
  passed: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok),
  results,
}));
