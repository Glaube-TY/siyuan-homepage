import {
  queryWorkspaceTasks,
  toggleWorkspaceTaskComplete,
  updateWorkspaceTask,
  type UpdateWorkspaceTaskOptions,
  postponeWorkspaceTask,
  deleteWorkspaceTask,
  migrateWorkspaceTaskToToday,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import { addNewTaskToDiary, getOrCreateTodayDiaryDocument } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryActions";
import SHA256 from "crypto-js/sha256";
import type { ToolRuntimeContext } from "../../../contracts/tool-contract";
import { homepageMcpDiaryTaskWriteSchema } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { findDayWorkspaceHeadingBlock } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { formatDiaryAttrDate, lookupDiaryDocumentForDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { addDays, formatLocalDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceDate";
import type { EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { ManageDiaryTaskInput, ManageDiaryTaskOutput } from "../contracts/manage-diary-task.contract";
import { createDiaryToolPluginAdapter, loadAgendaEnhancedDiaryConfig, prepareAgendaEnhancedDiaryIndex } from "./agenda-utils.impl";
import {
  validateEnhancedDiaryProjectWriteTarget,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceProjectLifecycle";

/** 将优先级数字 1-4 转为任务管理 Plus 的 ❗ 格式 */
function priorityToSymbols(level: number | undefined): string | undefined {
  if (level === undefined || level < 1 || level > 4) return undefined;
  return "❗".repeat(level);
}

type ExecResult = { ok: boolean; safeOutput: ManageDiaryTaskOutput; errorCode?: string };

async function resolveProject(
  config: Awaited<ReturnType<typeof loadAgendaEnhancedDiaryConfig>>,
  id?: string,
  existingTargetId?: string,
) {
  if (!id) return null;
  return validateEnhancedDiaryProjectWriteTarget(config.projectStorage, id, existingTargetId);
}

function projectError(reason: unknown): { errorCode: string; message: string } {
  const code = (reason as Record<string, unknown>)?.code;
  if (typeof code === "string" && code) {
    return { errorCode: code, message: reason instanceof Error ? reason.message : "项目操作失败。" };
  }
  return { errorCode: "project_index_unavailable", message: reason instanceof Error ? reason.message : "无法确认项目状态。" };
}

async function findTask(
  deps: KbRetrievalToolDeps,
  config: Awaited<ReturnType<typeof loadAgendaEnhancedDiaryConfig>>,
  target: { blockId?: string; taskId?: string },
): Promise<{ task: EnhancedDiaryWorkspaceTask | undefined; errorCode?: string; message?: string }> {
  if (!target.blockId && !target.taskId) {
    return { task: undefined, errorCode: "invalid_input", message: "必须提供 target.blockId 或 target.taskId。" };
  }
  const pluginAdapter = createDiaryToolPluginAdapter(deps);
  const tasks = await queryWorkspaceTasks(config, new Date(), pluginAdapter);
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
  target?: ToolRuntimeContext["diaryTaskCreateTarget"],
): Promise<ExecResult> {
  const loaded = await loadAgendaEnhancedDiaryConfig(deps);
  const config = target ? loaded : await prepareAgendaEnhancedDiaryIndex(deps, loaded);
  const pluginAdapter = createDiaryToolPluginAdapter(deps);
  const taskInput = args.task!;
  let project = null;
  try {
    project = await resolveProject(config, taskInput.projectTargetId);
  } catch (reason) {
    const failure = projectError(reason);
    return { ok: false, errorCode: failure.errorCode, safeOutput: { operation: "create", changed: false, message: failure.message } };
  }
  let doc: { docId: string; errorCode?: string; message?: string };
  if (target) {
    // MCP 目标消失时直接拒绝，绝不进入自动创建日记路径。
    const lookup = await lookupDiaryDocumentForDate(new Date(), config.dailyNotebookId, { strictIndexRead: true, pruneStale: false });
    const heading = lookup.status === "exists"
      ? await findDayWorkspaceHeadingBlock(lookup.doc.id, "newTasks", config.headingStructure, config.templateFieldMapping) : null;
    if (Object.keys(args).some((key) => !["operation", "task"].includes(key)) || !args.task ||
      Object.keys(args.task).some((key) => key !== "taskname") || formatDiaryAttrDate(new Date()) !== target.date ||
      config.dailyNotebookId !== target.notebookId || SHA256(JSON.stringify(config)).toString() !== target.configFingerprint ||
      lookup.status !== "exists" || lookup.doc.id !== target.docId || !heading?.found || heading.heading?.id !== target.headingId) {
      return { ok: false, errorCode: "diary_target_conflict", safeOutput: { operation: "create", changed: false, message: "已确认的现有日记目标已变化，未执行任务新建。" } };
    }
    doc = { docId: target.docId };
  } else doc = await ensureTodayDoc(pluginAdapter, config);
  if (!doc.docId) {
    return { ok: false, errorCode: doc.errorCode, safeOutput: { operation: "create", changed: false, message: doc.message! } };
  }

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
      projectTargetId: project?.id,
      projectTitle: project?.title,
    },
    dailyNotebookId: config.dailyNotebookId!,
    expectedDate: formatDiaryAttrDate(new Date()),
    headingStructure: config.headingStructure,
    mapping: config.templateFieldMapping,
    projectStorage: config.projectStorage,
  });

  if (result.ok && (result.partial || !result.blockId) || !result.ok && result.reason === "insert_failed") {
    return { ok: false, errorCode: "write_result_unknown", safeOutput: { operation: "create", changed: result.ok, docId: doc.docId, taskname: taskInput.taskname, message: "任务写入或索引同步结果未知，请先回读，禁止自动重试。" } };
  }
  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.reason === "archived_project_target" ? "archived_project_target" : "task_create_failed",
      safeOutput: { operation: "create", changed: false, docId: doc.docId, taskname: taskInput.taskname, message: result.message || "任务写入失败。" },
    };
  }
  return {
    ok: true,
    safeOutput: { operation: "create", changed: true, docId: doc.docId, blockId: result.blockId, taskname: taskInput.taskname, projectTargetId: project?.id, projectName: project?.title, projectPath: project?.pathTitles, message: "任务已写入今日日记。" },
  };
}

async function executeMigrate(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
  migration?: ToolRuntimeContext["diaryTaskMigrationTarget"],
): Promise<ExecResult> {
  if (migration) {
    const input = homepageMcpDiaryTaskWriteSchema.parse(args);
    if (input.operation !== "migrate" || input.target.blockId !== migration.blockId) return {
      ok: false, errorCode: "diary_target_conflict", safeOutput: { operation: "migrate", changed: false, message: "迁移参数与批准目标不一致。" },
    };
    let task;
    try { task = await migration.readTask(); }
    catch { return { ok: false, errorCode: "diary_target_conflict", safeOutput: { operation: "migrate", changed: false, message: "迁移目标已变化，未写入。" } }; }
    const result = await migrateWorkspaceTaskToToday(createDiaryToolPluginAdapter(deps), await loadAgendaEnhancedDiaryConfig(deps), task, migration);
    return { ok: result.ok, errorCode: result.ok ? undefined : result.reason,
      safeOutput: { operation: "migrate", changed: result.changed === true, blockId: task.blockId, taskId: task.id,
        taskname: task.taskname, message: result.message || "任务已迁移并完成来源、日志和索引回读。" } };
  }
  const config = await prepareAgendaEnhancedDiaryIndex(deps, await loadAgendaEnhancedDiaryConfig(deps));
  const pluginAdapter = createDiaryToolPluginAdapter(deps);

  // 先找任务，找不到直接失败，不创建今日日记
  const found = await findTask(deps, config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "migrate", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  // migrateWorkspaceTaskToToday 内部会创建/获取今日日记
  const result = await migrateWorkspaceTaskToToday(pluginAdapter, config, found.task);
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

function mutationUncertain(operation: string): ExecResult {
  return { ok: false, errorCode: "write_result_unknown", safeOutput: { operation, changed: true,
    message: "任务修改或索引同步结果未知，请先回读，禁止自动重试。" } };
}

async function findApprovedTask(args: ManageDiaryTaskInput, target: NonNullable<ToolRuntimeContext["diaryTaskMutationTarget"]>) {
  try {
    const input = homepageMcpDiaryTaskWriteSchema.parse(args);
    if (input.operation === "create" || input.operation !== target.operation || input.target.blockId !== target.blockId) throw new Error("diary_target_conflict");
    if (input.operation === "delete" && (input.deleteMode !== target.deleteMode || (input.deleteMode === "log" && !target.loggedDeletion))) throw new Error("diary_target_conflict");
    if (input.operation === "postpone" && (input.postponeTo !== target.postponeTo || target.expectedDeadline !== formatLocalDate(addDays(new Date(), input.postponeTo === "tomorrow" ? 1 : 7)))) throw new Error("diary_target_conflict");
    const task = await target.readTask();
    if (task.blockId !== target.blockId || task.rootId !== target.docId || task.box !== target.notebookId) throw new Error("diary_target_conflict");
    return { task };
  } catch {
    return { task: undefined, errorCode: "diary_target_conflict", message: "已确认的任务身份、内容或日记区域已变化，未执行修改。" };
  }
}

async function executeSetStatus(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
  mutation?: ToolRuntimeContext["diaryTaskMutationTarget"],
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const found = mutation ? await findApprovedTask(args, mutation) : await findTask(deps, config, args.target!);
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
  if (mutation && (result.partial || !result.ok && result.reason === "update_failed")) return mutationUncertain(args.operation);
  if (!result.ok) {
    return {
      ok: false,
      errorCode: "task_update_failed",
      safeOutput: { operation: "set_status", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: result.message || "更新任务状态失败。" },
    };
  }

  const message = result.partial
    ? (result.message || "任务状态已更新，但项目关系同步不完整。")
    : (completed ? "任务已标记完成。" : "任务已标记未完成。");
  return {
    ok: true,
    safeOutput: { operation: "set_status", changed: true, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message },
  };
}

async function executeUpdate(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
  mutation?: ToolRuntimeContext["diaryTaskMutationTarget"],
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const found = mutation ? await findApprovedTask(args, mutation) : await findTask(deps, config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "update", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  const task = found.task;
  const patch = args.task || {};
  const clearSet = new Set(args.clearFields || []);
  const relationMode: UpdateWorkspaceTaskOptions["relationMode"] =
    clearSet.has("projectTargetId") || Object.prototype.hasOwnProperty.call(patch, "projectTargetId")
      ? "replace"
      : "preserve";
  const requestedProjectId = clearSet.has("projectTargetId") ? "" : (patch.projectTargetId ?? task.projectTargetId ?? "");
  let project = null;
  if (relationMode === "replace" && requestedProjectId) {
    try {
      project = await resolveProject(config, requestedProjectId, task.projectTargetId);
    } catch (reason) {
      const failure = projectError(reason);
      return { ok: false, errorCode: failure.errorCode, safeOutput: { operation: "update", changed: false, taskId: task.id, blockId: task.blockId, message: failure.message } };
    }
  }

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
    projectTargetId: requestedProjectId,
    projectTitle: project?.title,
  }, config.projectStorage, { relationMode });

  if (mutation && (result.partial || !result.ok && result.reason === "update_failed")) return mutationUncertain(args.operation);

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.reason === "archived_project_target" ? "archived_project_target" : "task_update_failed",
      safeOutput: { operation: "update", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: result.message || "更新任务失败。" },
    };
  }

  const message = result.partial
    ? (result.message || "任务已更新，但项目关系同步不完整。")
    : "任务已更新。";
  return {
    ok: true,
    safeOutput: { operation: "update", changed: true, taskId: task.id, blockId: task.blockId, taskname: patch.taskname ?? task.taskname, projectTargetId: project?.id, projectName: project?.title, projectPath: project?.pathTitles, message },
  };
}

async function executePostpone(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
  mutation?: ToolRuntimeContext["diaryTaskMutationTarget"],
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const found = mutation ? await findApprovedTask(args, mutation) : await findTask(deps, config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "postpone", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  const task = found.task;
  if (mutation && (task.completed || task.startDate || task.deadline || task.priority || task.recurrence || task.reminder || task.location || task.tags?.length ||
    task.projectTargetId || task.hiddenProjectTargetId || task.visibleProjectTargetId || task.rootProjectId || task.projectPath?.length || task.projectRelationStatus !== "none" ||
    formatDiaryAttrDate(new Date()) !== mutation.date || config.dailyNotebookId !== mutation.notebookId || SHA256(JSON.stringify(config)).toString() !== mutation.configFingerprint)) {
    return { ok: false, errorCode: "diary_target_conflict", safeOutput: { operation: "postpone", changed: false, message: "已批准的普通任务或日记配置已变化，未执行推迟。" } };
  }
  const target = args.postponeTo === "next_week" ? "nextWeek" : "tomorrow";
  const result = await postponeWorkspaceTask(task, target, mutation?.expectedDeadline);
  if (mutation && (result.partial || !result.ok && result.reason === "update_failed")) return mutationUncertain(args.operation);

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.reason === "diary_target_conflict" ? result.reason : "task_postpone_failed",
      safeOutput: { operation: "postpone", changed: false, taskId: task.id, blockId: task.blockId, taskname: task.taskname, message: result.message || "推迟任务失败。" },
    };
  }

  const message = result.partial
    ? (result.message || "任务已推迟，但项目关系同步不完整。")
    : `任务已推迟到${args.postponeTo === "next_week" ? "下周" : "明天"}。`;
  return {
    ok: true,
    safeOutput: { operation: "postpone", changed: true, taskId: task.id, blockId: task.blockId, taskname: task.taskname,
      ...(mutation ? { docId: mutation.docId, message: `任务截止日期已设为 ${mutation.expectedDeadline}，任务保留在原日记。` } : { message }) },
  };
}

async function executeDelete(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryTaskInput,
  mutation?: ToolRuntimeContext["diaryTaskMutationTarget"],
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const pluginAdapter = createDiaryToolPluginAdapter(deps);
  const found = mutation ? await findApprovedTask(args, mutation) : await findTask(deps, config, args.target!);
  if (!found.task) {
    return { ok: false, errorCode: found.errorCode, safeOutput: { operation: "delete", changed: false, taskId: args.target?.taskId, blockId: args.target?.blockId, message: found.message! } };
  }

  const task = found.task;
  const mode = mutation ? mutation.deleteMode! : args.deleteMode || "log";
  const result = await deleteWorkspaceTask(pluginAdapter, config, task, mode,
    mutation?.loggedDeletion ? { ...mutation.loggedDeletion, readTask: mutation.readTask } : undefined);

  if (mutation && (result.partial || !result.ok && result.reason === "delete_failed")) return mutationUncertain(args.operation);

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.reason === "diary_target_conflict" ? result.reason : "task_delete_failed",
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
  target?: ToolRuntimeContext["diaryTaskCreateTarget"],
  mutation?: ToolRuntimeContext["diaryTaskMutationTarget"],
  migration?: ToolRuntimeContext["diaryTaskMigrationTarget"],
): Promise<ExecResult> {
  switch (args.operation) {
    case "create":
      return executeCreate(deps, args, target);
    case "migrate":
      return executeMigrate(deps, args, migration);
    case "set_status":
      return executeSetStatus(deps, args, mutation);
    case "update":
      return executeUpdate(deps, args, mutation);
    case "postpone":
      return executePostpone(deps, args, mutation);
    case "delete":
      return executeDelete(deps, args, mutation);
    default:
      return {
        ok: false,
        errorCode: "invalid_input",
        safeOutput: { operation: String(args.operation), changed: false, message: `不支持的操作：${args.operation}` },
      };
  }
}
