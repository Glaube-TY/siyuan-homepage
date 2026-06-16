import {
  queryWorkspaceTasks,
  toggleWorkspaceTaskComplete,
  updateWorkspaceTask,
  postponeWorkspaceTask,
  deleteWorkspaceTask,
  migrateWorkspaceTaskToToday,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import { addNewTaskToDiary, getOrCreateTodayDiaryDocument } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryActions";
import type { EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { ManageDiaryTaskInput, ManageDiaryTaskOutput } from "../contracts/manage-diary-task.contract";
import { loadAgendaEnhancedDiaryConfig } from "./agenda-utils.impl";

/** 将优先级数字 1-4 转为任务管理 Plus 的 ❗ 格式 */
function priorityToSymbols(level: number | undefined): string | undefined {
  if (level === undefined || level < 1 || level > 4) return undefined;
  return "❗".repeat(level);
}

type ExecResult = { ok: boolean; safeOutput: ManageDiaryTaskOutput; errorCode?: string };

async function findTask(
  config: Awaited<ReturnType<typeof loadAgendaEnhancedDiaryConfig>>,
  target: { blockId?: string; taskId?: string },
): Promise<{ task: EnhancedDiaryWorkspaceTask | undefined; errorCode?: string; message?: string }> {
  if (!target.blockId && !target.taskId) {
    return { task: undefined, errorCode: "invalid_input", message: "必须提供 target.blockId 或 target.taskId。" };
  }
  const tasks = await queryWorkspaceTasks(config, new Date());
  const task = tasks.find(
    (t) =>
      (target.blockId && t.blockId === target.blockId) ||
      (target.taskId && t.id === target.taskId),
  );
  if (!task) {
    const identifier = target.blockId || target.taskId || "未知";
    return { task: undefined, errorCode: "task_not_found", message: `未找到匹配的任务（${identifier}），请通过 query_tasks 获取真实 ID。` };
  }
  return { task };
}

async function ensureTodayDoc(
  plugin: any,
  config: Awaited<ReturnType<typeof loadAgendaEnhancedDiaryConfig>>,
): Promise<{ docId: string; errorCode?: string; message?: string }> {
  const todayDoc = await getOrCreateTodayDiaryDocument(plugin, config);
  if (!todayDoc.ok || !todayDoc.docId) {
    return { docId: "", errorCode: "diary_create_failed", message: "未能打开或创建今日日记。" };
  }
  return { docId: todayDoc.docId };
}

async function executeCreate(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const plugin = deps.getScope?.() ?? {};
  const doc = await ensureTodayDoc(plugin, config);
  if (!doc.docId) {
    return { ok: false, errorCode: doc.errorCode, safeOutput: { operation: "create", changed: false, message: doc.message! } };
  }

  const taskInput = args.task!;
  const result = await addNewTaskToDiary({
    docId: doc.docId,
    task: {
      taskname: taskInput.taskname!,
      priority: priorityToSymbols(taskInput.priority),
      startDate: taskInput.startDate,
      deadline: taskInput.deadline,
      recurrence: taskInput.recurrence,
      reminder: taskInput.reminder,
      location: taskInput.location,
      tags: taskInput.tags,
    },
    headingStructure: config.headingStructure,
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCode: "task_create_failed",
      safeOutput: { operation: "create", changed: false, docId: doc.docId, taskname: taskInput.taskname, message: result.message || "任务写入失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "create", changed: true, docId: doc.docId, taskname: taskInput.taskname, message: "任务已写入今日日记。" },
  };
}

async function executeMigrate(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const plugin = deps.getScope?.() ?? {};

  // 先找任务，找不到直接失败，不创建今日日记
  const found = await findTask(config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "migrate", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  // migrateWorkspaceTaskToToday 内部会创建/获取今日日记
  const result = await migrateWorkspaceTaskToToday(plugin, config, found.task);
  if (!result.ok) {
    return {
      ok: false,
      errorCode: "task_migration_failed",
      safeOutput: { operation: "migrate", changed: false, taskId: found.task.id, blockId: found.task.blockId, taskname: found.task.taskname, message: result.message || "任务迁移失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "migrate", changed: true, taskId: found.task.id, blockId: found.task.blockId, taskname: found.task.taskname, message: `任务「${found.task.taskname}」已迁移到今日日记。` },
  };
}

async function executeSetStatus(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const found = await findTask(config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "set_status", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  const task = found.task;
  const completed = args.completed!;

  // 幂等
  if (task.completed === completed) {
    return {
      ok: true,
      safeOutput: { operation: "set_status", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: completed ? "任务已是完成状态。" : "任务已是未完成状态。" },
    };
  }

  const result = await toggleWorkspaceTaskComplete(task, completed);
  if (!result.ok) {
    return {
      ok: false,
      errorCode: "task_update_failed",
      safeOutput: { operation: "set_status", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: result.message || "更新任务状态失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "set_status", changed: true, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: completed ? "任务已标记完成。" : "任务已标记未完成。" },
  };
}

async function executeUpdate(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const found = await findTask(config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "update", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  const task = found.task;
  const patch = args.task || {};
  const clearSet = new Set(args.clearFields || []);

  const result = await updateWorkspaceTask(task, {
    taskname: patch.taskname ?? task.taskname,
    completed: task.completed,
    priority: clearSet.has("priority") ? "" : (priorityToSymbols(patch.priority) ?? task.priority),
    startDate: clearSet.has("startDate") ? "" : (patch.startDate ?? task.startDate),
    deadline: clearSet.has("deadline") ? "" : (patch.deadline ?? task.deadline),
    recurrence: clearSet.has("recurrence") ? "" : (patch.recurrence ?? task.recurrence),
    reminder: clearSet.has("reminder") ? "" : (patch.reminder ?? task.reminder),
    location: clearSet.has("location") ? "" : (patch.location ?? task.location),
    tags: clearSet.has("tags") ? [] : (patch.tags ?? task.tags),
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCode: "task_update_failed",
      safeOutput: { operation: "update", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: result.message || "更新任务失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "update", changed: true, taskId: task.id, blockId: task.blockId, taskname: patch.taskname ?? task.taskname, message: "任务已更新。" },
  };
}

async function executePostpone(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const found = await findTask(config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "postpone", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  const task = found.task;
  const target = args.postponeTo === "next_week" ? "nextWeek" : "tomorrow";
  const result = await postponeWorkspaceTask(task, target);

  if (!result.ok) {
    return {
      ok: false,
      errorCode: "task_postpone_failed",
      safeOutput: { operation: "postpone", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: result.message || "推迟任务失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "postpone", changed: true, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: `任务已推迟到${args.postponeTo === "next_week" ? "下周" : "明天"}。` },
  };
}

async function executeDelete(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const plugin = deps.getScope?.() ?? {};
  const found = await findTask(config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "delete", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  const task = found.task;
  const mode = args.deleteMode || "log";
  const result = await deleteWorkspaceTask(plugin, config, task, mode);

  if (!result.ok) {
    return {
      ok: false,
      errorCode: "task_delete_failed",
      safeOutput: { operation: "delete", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: result.message || "删除任务失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "delete", changed: true, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: mode === "log" ? "任务已删除并记录日志。" : "任务已删除。" },
  };
}

export async function executeManageDiaryTask(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
): Promise<ExecResult> {
  switch (args.operation) {
    case "create":
      return executeCreate(deps, args);
    case "migrate":
      return executeMigrate(deps, args);
    case "set_status":
      return executeSetStatus(deps, args);
    case "update":
      return executeUpdate(deps, args);
    case "postpone":
      return executePostpone(deps, args);
    case "delete":
      return executeDelete(deps, args);
    default:
      return {
        ok: false,
        errorCode: "invalid_input",
        safeOutput: { operation: String(args.operation), changed: false, message: `不支持的操作：${args.operation}` },
      };
  }
}
