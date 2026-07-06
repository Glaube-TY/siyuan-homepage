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
import { createDiaryToolPluginAdapter, loadAgendaEnhancedDiaryConfig } from "./agenda-utils.impl";

type ExecResult = { ok: boolean; safeOutput: ManageDiaryRecordOutput; errorCode?: string };

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
): Promise<{ record: EnhancedDiaryWorkspaceRecord | undefined; date: string; docId: string; errorCode?: string; message?: string }> {
  const date = target.date || formatDiaryDate(new Date());
  const dateObj = new Date(date);
  const doc = await getDiaryDocumentForDate(dateObj);
  if (!doc) {
    return { record: undefined, date, docId: "", errorCode: "diary_doc_not_found", message: `${date} 的日记文档不存在。` };
  }

  const records = await queryTodayQuickRecords(doc.id, doc.content, date, config.headingStructure);
  const record = matchRecord(records, target);

  if (!record) {
    const identifier = target.recordId || target.headingBlockId || "未知";
    return { record: undefined, date, docId: doc.id, errorCode: "record_not_found", message: `未找到匹配的快速记录（${identifier}），请通过 query_diary_records 获取真实 ID。` };
  }

  return { record, date, docId: doc.id };
}

async function executeAdd(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryRecordInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const pluginAdapter = createDiaryToolPluginAdapter(deps);
  const date = formatDiaryDate(new Date());

  const result = await addWorkspaceQuickRecord(pluginAdapter, config, args.categoryTitle!, args.content!);
  if (!result.ok) {
    return {
      ok: false,
      errorCode: "quick_record_write_failed",
      safeOutput: { operation: "add", changed: false, categoryTitle: args.categoryTitle, date, message: result.message || "快速记录写入失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "add", changed: true, categoryTitle: args.categoryTitle, date, message: "快速记录已写入今日日记。" },
  };
}

async function executeUpdate(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryRecordInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const found = await findRecordForTarget(config, args.target!);

  if (!found.record) {
    return {
      ok: false,
      errorCode: found.errorCode || "record_not_found",
      safeOutput: { operation: "update", changed: false, recordId: args.target?.recordId, headingBlockId: args.target?.headingBlockId, date: found.date, message: found.message || "未找到快速记录。" },
    };
  }

  if (!found.record.contentBlockIds || found.record.contentBlockIds.length !== 1) {
    return {
      ok: false,
      errorCode: "record_not_locatable",
      safeOutput: { operation: "update", changed: false, recordId: found.record.id, headingBlockId: found.record.headingBlockId, date: found.date, message: "当前记录由多个块组成，无法可靠更新，请在日记中手动编辑。" },
    };
  }

  const result = await updateQuickRecord(found.record, args.content!);
  if (!result.ok) {
    return {
      ok: false,
      errorCode: "quick_record_update_failed",
      safeOutput: { operation: "update", changed: false, recordId: found.record.id, headingBlockId: found.record.headingBlockId, date: found.date, message: result.message || "更新记录失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "update", changed: true, recordId: found.record.id, headingBlockId: found.record.headingBlockId, categoryTitle: found.record.categoryTitle, date: found.date, message: "快速记录已更新。" },
  };
}

async function executeDelete(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryRecordInput,
): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
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

  const result = await deleteQuickRecord(found.record);
  if (!result.ok) {
    return {
      ok: false,
      errorCode: "quick_record_delete_failed",
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
