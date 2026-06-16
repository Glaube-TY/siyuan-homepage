import {
  saveReviewContent,
  loadReviewContent,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceReviewContent";
import {
  toggleCompletionMarker,
  skipPeriod,
  restoreSkippedPeriod,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import type { EnhancedDiaryPeriod } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { ManageDiaryReviewInput, ManageDiaryReviewOutput } from "../contracts/manage-diary-review.contract";

type ExecResult = { ok: boolean; safeOutput: ManageDiaryReviewOutput; errorCode?: string };

async function executeSaveContent(args: ManageDiaryReviewInput): Promise<ExecResult> {
  const period = args.period as EnhancedDiaryPeriod;
  const fields = args.fields!;

  // 校验字段 label 是否来自模板允许列表
  const loaded = await loadReviewContent(args.docId, period);
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

  const result = await saveReviewContent(args.docId, period, reviewFields);

  if (!result.ok) {
    const errorMap: Record<string, { code: string; msg: string }> = {
      missing_period_root: { code: "missing_period_root", msg: `文档中未找到 ${period} 周期根标题，请先补充模板。` },
      missing_review_root: { code: "missing_review_root", msg: `文档中未找到复盘根标题，请先补充模板。` },
    };
    const mapped = errorMap[result.reason || ""];
    return {
      ok: false,
      errorCode: mapped?.code || "review_write_failed",
      safeOutput: { operation: "save_content", changed: false, docId: args.docId, period, updatedFieldCount: 0, message: mapped?.msg || "保存复盘内容失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "save_content", changed: true, docId: args.docId, period, updatedFieldCount: fields.length, message: `已保存 ${fields.length} 个复盘字段。` },
  };
}

async function executeSetStatus(args: ManageDiaryReviewInput): Promise<ExecResult> {
  const period = args.period as EnhancedDiaryPeriod;
  const { docId, status } = args;

  if (status === "skipped") {
    const result = await skipPeriod({ docId, period });

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
  const restoreResult = await restoreSkippedPeriod({ docId, period, mode: status! });

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

  const toggleResult = await toggleCompletionMarker({ docId, period, completed: status === "completed" });

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
  _deps: KbRetrievalToolDeps,
  args: ManageDiaryReviewInput,
): Promise<ExecResult> {
  switch (args.operation) {
    case "save_content":
      return executeSaveContent(args);
    case "set_status":
      return executeSetStatus(args);
    default:
      return {
        ok: false,
        errorCode: "invalid_input",
        safeOutput: { operation: String(args.operation), changed: false, docId: args.docId, period: args.period, message: `不支持的操作：${args.operation}` },
      };
  }
}
