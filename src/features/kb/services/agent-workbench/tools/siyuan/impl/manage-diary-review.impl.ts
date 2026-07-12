import {
  saveReviewContent,
  loadReviewContent,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceReviewContent";
import {
  toggleCompletionMarker,
  skipPeriod,
  restoreSkippedPeriod,
  validateEnhancedDiaryWriteTarget,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import type { EnhancedDiaryConfig, EnhancedDiaryPeriod } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { ManageDiaryReviewInput, ManageDiaryReviewOutput } from "../contracts/manage-diary-review.contract";
import { loadAgendaEnhancedDiaryConfig } from "./agenda-utils.impl";

type ExecResult = { ok: boolean; safeOutput: ManageDiaryReviewOutput; errorCode?: string };

async function executeSaveContent(args: ManageDiaryReviewInput, config: EnhancedDiaryConfig): Promise<ExecResult> {
  const period = args.period as EnhancedDiaryPeriod;
  const fields = args.fields!;

  // 校验字段 label 是否来自模板允许列表
  const loaded = await loadReviewContent(args.docId, period, config.headingStructure, config.templateFieldMapping);
  if (loaded.reason === "read_failed") {
    return {
      ok: false,
      errorCode: "diary_read_failed",
      safeOutput: { operation: "save_content", changed: false, docId: args.docId, period, updatedFieldCount: 0, message: "日记正文暂时无法读取，为保护已有内容，本次禁止编辑和保存，请稍后重试。" },
    };
  }
  const allowedLabels = new Set(loaded.fields.map((f) => f.label));
  const seenLabels = new Set<string>();

  for (const f of fields) {
    if (!allowedLabels.has(f.label)) {
      return {
        ok: false,
        errorCode: "invalid_input",
        safeOutput: { operation: "save_content", changed: false, docId: args.docId, period, updatedFieldCount: 0, message: `未知的复盘字段「${f.label}」。当前周期允许的字段：${[...allowedLabels].join("、")}。` },
      };
    }
    if (seenLabels.has(f.label)) {
      return {
        ok: false,
        errorCode: "invalid_input",
        safeOutput: { operation: "save_content", changed: false, docId: args.docId, period, updatedFieldCount: 0, message: `重复的复盘字段「${f.label}」，每个字段只能出现一次。` },
      };
    }
    seenLabels.add(f.label);
  }

  const reviewFields = fields.map((f) => ({
    key: f.label,
    label: f.label,
    content: f.content,
    missing: false,
  }));

  const result = await saveReviewContent(args.docId, period, reviewFields, config.headingStructure, config.templateFieldMapping);

  if (!result.ok) {
    const errorMap: Record<string, { code: string; msg: string; changed?: boolean }> = {
      missing_period_root: { code: "missing_period_root", msg: `文档中未找到 ${period} 周期根标题，请先补充模板。` },
      missing_review_root: { code: "missing_review_root", msg: `文档中未找到复盘根标题，请先补充模板。` },
      cleanup_failed: { code: "review_cleanup_failed", msg: "新内容已写入，但旧内容清理失败，请打开日记检查重复内容。", changed: true },
      partial_write: { code: "review_partial_write", msg: "部分字段已更新，但存在写入或清理失败，请重新读取后再继续。", changed: true },
      read_failed: { code: "review_read_failed", msg: "日记正文暂时无法读取，请稍后重试。", changed: false },
    };
    const mapped = errorMap[result.reason || ""];
    const changed = mapped?.changed ?? false;
    return {
      ok: false,
      errorCode: mapped?.code || "review_write_failed",
      safeOutput: { operation: "save_content", changed, docId: args.docId, period, updatedFieldCount: result.changedFieldCount || 0, message: mapped?.msg || "保存复盘内容失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "save_content", changed: true, docId: args.docId, period, updatedFieldCount: result.changedFieldCount || fields.length, message: `已保存 ${result.changedFieldCount || fields.length} 个复盘字段。` },
  };
}

async function executeSetStatus(args: ManageDiaryReviewInput, config: EnhancedDiaryConfig): Promise<ExecResult> {
  const period = args.period as EnhancedDiaryPeriod;
  const { docId, status } = args;

  if (status === "skipped") {
    const result = await skipPeriod({ docId, period, mapping: config.templateFieldMapping });

    if (!result.ok) {
      const errorMap: Record<string, { code: string; msg: string }> = {
        marker_not_found: { code: "marker_not_found", msg: `未找到 ${period} 周期的完成标记，请先补充模板。` },
        update_failed: { code: "review_status_update_failed", msg: "跳过复盘失败。" },
      };
      const mapped = errorMap[result.reason || ""];
      return {
        ok: false,
        errorCode: mapped?.code || "review_status_update_failed",
        safeOutput: { operation: "set_status", changed: false, docId, period, status, message: mapped?.msg || "跳过复盘失败。" },
      };
    }

    const alreadySkipped = result.skipped || result.reason === "already_skipped";
    return {
      ok: true,
      safeOutput: { operation: "set_status", changed: !alreadySkipped, docId, period, status, message: alreadySkipped ? "复盘已是跳过状态。" : "复盘已跳过。" },
    };
  }

  // completed / pending：先尝试从跳过状态恢复
  const restoreResult = await restoreSkippedPeriod({ docId, period, mode: status!, mapping: config.templateFieldMapping });

  if (restoreResult.ok) {
    return {
      ok: true,
      safeOutput: { operation: "set_status", changed: true, docId, period, status, message: `复盘已从跳过状态恢复为${status === "completed" ? "完成" : "未完成"}。` },
    };
  }

  // 不是跳过状态，正常切换完成标记
  if (restoreResult.reason !== "skip_marker_not_found") {
    return {
      ok: false,
      errorCode: "review_status_update_failed",
      safeOutput: { operation: "set_status", changed: false, docId, period, status, message: "更新复盘状态失败。" },
    };
  }

  const toggleResult = await toggleCompletionMarker({ docId, period, completed: status === "completed", mapping: config.templateFieldMapping });

  if (!toggleResult.ok) {
    const errorMap: Record<string, { code: string; msg: string }> = {
      marker_not_found: { code: "marker_not_found", msg: `未找到 ${period} 周期的完成标记，请先补充模板。` },
      update_failed: { code: "review_status_update_failed", msg: "更新复盘状态失败。" },
    };
    const mapped = errorMap[toggleResult.reason || ""];
    return {
      ok: false,
      errorCode: mapped?.code || "review_status_update_failed",
      safeOutput: { operation: "set_status", changed: false, docId, period, status, message: mapped?.msg || "更新复盘状态失败。" },
    };
  }

  const alreadyDone = toggleResult.skipped || toggleResult.reason === "already_completed" || toggleResult.reason === "already_uncompleted";
  return {
    ok: true,
    safeOutput: { operation: "set_status", changed: !alreadyDone, docId, period, status, message: alreadyDone ? `复盘已是${status === "completed" ? "完成" : "未完成"}状态。` : `复盘已标记为${status === "completed" ? "完成" : "未完成"}。` },
  };
}

export async function executeManageDiaryReview(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryReviewInput,
): Promise<ExecResult> {
  // Load config and validate docId scope before any operation
  let config: EnhancedDiaryConfig;
  try {
    config = await loadAgendaEnhancedDiaryConfig(deps);
  } catch {
    return {
      ok: false,
      errorCode: "diary_not_configured",
      safeOutput: { operation: String(args.operation), changed: false, docId: args.docId, period: args.period, message: "强化日记配置未加载。" },
    };
  }

  if (!config.dailyNotebookId) {
    return {
      ok: false,
      errorCode: "diary_not_configured",
      safeOutput: { operation: String(args.operation), changed: false, docId: args.docId, period: args.period, message: "未配置强化日记笔记本。" },
    };
  }

  // Validate docId belongs to configured diary notebook (no expectedDate needed)
  const writeCheck = await validateEnhancedDiaryWriteTarget(args.docId, config.dailyNotebookId);
  if (writeCheck.status !== "valid") {
    const errorMessages: Record<string, string> = {
      missing: `docId "${args.docId}" 对应的文档不存在。`,
      out_of_scope: `docId "${args.docId}" 不属于当前配置的强化日记笔记本。`,
      date_mismatch: `docId "${args.docId}" 无法识别为强化日记文档。`,
      unknown: `校检 docId "${args.docId}" 时查询异常，请稍后重试。`,
      not_configured: "未配置强化日记笔记本。",
    };
    return {
      ok: false,
      errorCode: writeCheck.status === "out_of_scope" ? "diary_doc_out_of_scope" : "diary_validation_failed",
      safeOutput: { operation: String(args.operation), changed: false, docId: args.docId, period: args.period, message: errorMessages[writeCheck.status] || "日记文档校验失败。" },
    };
  }

  switch (args.operation) {
    case "save_content":
      return executeSaveContent(args, config);
    case "set_status":
      return executeSetStatus(args, config);
    default:
      return {
        ok: false,
        errorCode: "invalid_input",
        safeOutput: { operation: String(args.operation), changed: false, docId: args.docId, period: args.period, message: `不支持的操作：${args.operation}` },
      };
  }
}
