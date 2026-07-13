import {
  addWorkspaceQuickRecord,
  updateQuickRecord,
  deleteQuickRecord,
  queryTodayQuickRecords,
  type EnhancedDiaryWorkspaceRecord,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceRecordService";
import { getDiaryDocumentForDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { formatDiaryDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { ManageDiaryRecordInput, ManageDiaryRecordOutput } from "../contracts/manage-diary-record.contract";
import { createDiaryToolPluginAdapter, loadAgendaEnhancedDiaryConfig, prepareAgendaEnhancedDiaryIndex } from "./agenda-utils.impl";
import {
  EnhancedDiaryProjectWriteTargetError,
  validateEnhancedDiaryProjectWriteTarget,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceProjectLifecycle";

type ExecResult = { ok: boolean; safeOutput: ManageDiaryRecordOutput; errorCode?: string };

async function resolveProject(
  config: Awaited<ReturnType<typeof loadAgendaEnhancedDiaryConfig>>,
  id?: string,
  existingTargetId?: string,
) {
  if (!id) return null;
  return validateEnhancedDiaryProjectWriteTarget(config.projectStorage, id, existingTargetId);
}

function projectError(reason: unknown): { errorCode: string; message: string } {
  if (reason instanceof EnhancedDiaryProjectWriteTargetError) {
    return { errorCode: reason.code, message: reason.message };
  }
  return { errorCode: "project_index_unavailable", message: reason instanceof Error ? reason.message : "无法确认项目状态。" };
}

function matchRecord(
  records: EnhancedDiaryWorkspaceRecord[],
  target: { recordId?: string; headingBlockId?: string },
): EnhancedDiaryWorkspaceRecord | undefined {
  if (target.recordId) {
    return records.find((r) => r.id === target.recordId || r.headingBlockId === target.recordId);
  }
  if (target.headingBlockId) {
    return records.find((r) => r.headingBlockId === target.headingBlockId);
  }
  return undefined;
}

async function findRecordForTarget(
  config: Awaited<ReturnType<typeof loadAgendaEnhancedDiaryConfig>>,
  target: { recordId?: string; headingBlockId?: string; date?: string },
): Promise<{ record: EnhancedDiaryWorkspaceRecord | undefined; date: string; docId: string; dateObj: Date; errorCode?: string; message?: string }> {
  const date = target.date || formatDiaryDate(new Date());
  const dateObj = new Date(date);
  const doc = await getDiaryDocumentForDate(dateObj, config.dailyNotebookId);
  if (!doc) {
    return { record: undefined, date, docId: "", dateObj, errorCode: "diary_doc_not_found", message: `${date} 的日记文档不存在。` };
  }

  const records = await queryTodayQuickRecords(doc.id, doc.content, date, config.headingStructure, config.templateFieldMapping, config);
  const record = matchRecord(records, target);

  if (!record) {
    const identifier = target.recordId || target.headingBlockId || "未知";
    return { record: undefined, date, docId: doc.id, dateObj, errorCode: "record_not_found", message: `未找到匹配的快速记录（${identifier}），请通过 query_diary_records 获取真实 ID。` };
  }

  return { record, date, docId: doc.id, dateObj };
}

async function executeAdd(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryRecordInput,
): Promise<ExecResult> {
  const config = await prepareAgendaEnhancedDiaryIndex(deps, await loadAgendaEnhancedDiaryConfig(deps));
  const pluginAdapter = createDiaryToolPluginAdapter(deps);
  const date = formatDiaryDate(new Date());
  let project = null;
  try {
    project = await resolveProject(config, args.projectTargetId);
  } catch (reason) {
    const failure = projectError(reason);
    return { ok: false, errorCode: failure.errorCode, safeOutput: { operation: "add", changed: false, message: failure.message } };
  }
  if (args.isKeyRecord && !project) return { ok: false, errorCode: "key_record_requires_project", safeOutput: { operation: "add", changed: false, message: "关键记录必须关联有效项目。" } };

  const result = await addWorkspaceQuickRecord(pluginAdapter, config, args.categoryTitle!, args.content!, { tags: args.tags, projectTargetId: project?.id, projectTitle: project?.title, rootProjectId: project?.rootProjectId, projectPath: project?.pathTitles, projectAncestorTargetIds: project?.ancestorTargetIds, isKeyRecord: args.isKeyRecord });
  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.reason === "archived_project_target" ? "archived_project_target" : "quick_record_write_failed",
      safeOutput: { operation: "add", changed: false, categoryTitle: args.categoryTitle, date, message: result.message || "快速记录写入失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "add", changed: true, headingBlockId: result.headingBlockId, categoryTitle: args.categoryTitle, date, tags: args.tags, projectTargetId: project?.id, projectName: project?.title, projectPath: project?.pathTitles, isKeyRecord: !!args.isKeyRecord, message: "快速记录已写入今日日记。" },
  };
}

async function executeUpdate(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryRecordInput,
): Promise<ExecResult> {
  const config = await prepareAgendaEnhancedDiaryIndex(deps, await loadAgendaEnhancedDiaryConfig(deps));
  const found = await findRecordForTarget(config, args.target!);

  if (!found.record) {
    return {
      ok: false,
      errorCode: found.errorCode || "record_not_found",
      safeOutput: { operation: "update", changed: false, recordId: args.target?.recordId, headingBlockId: args.target?.headingBlockId, date: found.date, message: found.message || "未找到快速记录。" },
    };
  }

  const expectedDate = `${found.dateObj.getFullYear()}${String(found.dateObj.getMonth() + 1).padStart(2, "0")}${String(found.dateObj.getDate()).padStart(2, "0")}`;
  const requestedProjectId = args.projectTargetId ?? found.record.projectTargetId;
  let project = null;
  try {
    project = await resolveProject(config, requestedProjectId, found.record.projectTargetId);
  } catch (reason) {
    const failure = projectError(reason);
    return { ok: false, errorCode: failure.errorCode, safeOutput: { operation: "update", changed: false, recordId: found.record.id, headingBlockId: found.record.headingBlockId, message: failure.message } };
  }
  if (args.isKeyRecord && !project) return { ok: false, errorCode: "key_record_requires_project", safeOutput: { operation: "update", changed: false, recordId: found.record.id, message: "关键记录必须关联有效项目。" } };
  const result = await updateQuickRecord(found.record, args.content ?? found.record.content, {
    dailyNotebookId: config.dailyNotebookId!,
    expectedDate,
    projectStorage: config.projectStorage,
  }, { tags: args.tags ?? found.record.tags, projectTargetId: project?.id, projectTitle: project?.title, rootProjectId: project?.rootProjectId, projectPath: project?.pathTitles, projectAncestorTargetIds: project?.ancestorTargetIds, isKeyRecord: args.isKeyRecord ?? found.record.isKeyRecord });
  if (!result.ok) {
    const errorCode = result.reason === "archived_project_target"
      ? "archived_project_target"
      : result.reason === "record_block_out_of_scope" || result.reason === "record_block_missing"
        ? "diary_doc_out_of_scope" : "quick_record_update_failed";
    return {
      ok: false,
      errorCode,
      safeOutput: { operation: "update", changed: false, recordId: found.record.id, headingBlockId: found.record.headingBlockId, date: found.date, message: result.message || "更新记录失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "update", changed: true, recordId: found.record.id, headingBlockId: found.record.headingBlockId, categoryTitle: found.record.categoryTitle, date: found.date, tags: args.tags ?? found.record.tags, projectTargetId: project?.id, projectName: project?.title, projectPath: project?.pathTitles, isKeyRecord: args.isKeyRecord ?? found.record.isKeyRecord, message: "快速记录已更新。" },
  };
}

async function executeDelete(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryRecordInput,
): Promise<ExecResult> {
  const config = await prepareAgendaEnhancedDiaryIndex(deps, await loadAgendaEnhancedDiaryConfig(deps));
  const found = await findRecordForTarget(config, args.target!);

  if (!found.record) {
    return {
      ok: false,
      errorCode: found.errorCode || "record_not_found",
      safeOutput: { operation: "delete", changed: false, recordId: args.target?.recordId, headingBlockId: args.target?.headingBlockId, date: found.date, message: found.message || "未找到快速记录。" },
    };
  }

  if (!found.record.headingBlockId || !found.record.contentBlockIds) {
    return {
      ok: false,
      errorCode: "record_not_locatable",
      safeOutput: { operation: "delete", changed: false, recordId: found.record.id, headingBlockId: found.record.headingBlockId, date: found.date, message: "未能可靠定位记录块，请在日记中手动删除。" },
    };
  }

  const expectedDate = `${found.dateObj.getFullYear()}${String(found.dateObj.getMonth() + 1).padStart(2, "0")}${String(found.dateObj.getDate()).padStart(2, "0")}`;
  const result = await deleteQuickRecord(found.record, {
    dailyNotebookId: config.dailyNotebookId!,
    expectedDate,
  });
  if (!result.ok) {
    const errorCode = result.reason === "record_block_out_of_scope" || result.reason === "record_block_missing"
      ? "diary_doc_out_of_scope" : "quick_record_delete_failed";
    return {
      ok: false,
      errorCode,
      safeOutput: { operation: "delete", changed: false, recordId: found.record.id, headingBlockId: found.record.headingBlockId, date: found.date, message: result.message || "删除记录失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "delete", changed: true, recordId: found.record.id, headingBlockId: found.record.headingBlockId, categoryTitle: found.record.categoryTitle, date: found.date, message: "快速记录已删除。" },
  };
}

export async function executeManageDiaryRecord(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryRecordInput,
): Promise<ExecResult> {
  switch (args.operation) {
    case "add":
      return executeAdd(deps, args);
    case "update":
      return executeUpdate(deps, args);
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
