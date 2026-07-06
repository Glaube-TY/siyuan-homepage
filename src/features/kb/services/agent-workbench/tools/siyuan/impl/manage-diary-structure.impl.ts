import { getOrCreateTodayDiaryDocument } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryActions";
import { getDiaryDocumentForDate, appendTemplateToDiary } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { getPeriodContext, formatDiaryDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import { parseLocalDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceDate";
import type { EnhancedDiaryPeriod } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { ManageDiaryStructureInput, ManageDiaryStructureOutput } from "../contracts/manage-diary-structure.contract";
import { createDiaryToolPluginAdapter, loadAgendaEnhancedDiaryConfig } from "./agenda-utils.impl";
import { sql } from "@/api";

type ExecResult = { ok: boolean; safeOutput: ManageDiaryStructureOutput; errorCode?: string };

const ENSURE_ERROR_CODE_MAP: Record<string, string> = {
  missing_notebook: "diary_not_configured",
  create_failed: "diary_create_failed",
  read_failed: "diary_create_failed",
};

const DIARY_DOC_MARKER = /custom-dailynote-\d{8}/;

function escapeSqlId(id: string): string {
  return id.replace(/'/g, "''");
}

/**
 * 校验传入 docId 是否为强化日记体系中的真实日记文档。
 * 不校验正文 content，只检查 blocks 元数据：存在性、type='d'、ial 含 custom-dailynote 标记。
 */
async function validateAppendTemplateDocId(docId: string): Promise<
  | { ok: true }
  | { ok: false; errorCode: "diary_doc_not_found" | "invalid_diary_doc"; message: string }
> {
  const rows = await sql(`SELECT id, type, ial, content FROM blocks WHERE id = '${escapeSqlId(docId)}' LIMIT 1`);
  const block = rows[0] as { id?: string; type?: string; ial?: string; content?: string } | undefined;
  if (!block) {
    return {
      ok: false,
      errorCode: "diary_doc_not_found",
      message: `docId "${docId}" 对应的文档不存在。`,
    };
  }
  if (block.type !== "d") {
    return {
      ok: false,
      errorCode: "invalid_diary_doc",
      message: `docId "${docId}" 不是文档（type=${block.type ?? "unknown"}），append_template 只能用于日记文档。`,
    };
  }
  const ial = block.ial || "";
  if (!DIARY_DOC_MARKER.test(ial)) {
    return {
      ok: false,
      errorCode: "invalid_diary_doc",
      message: `docId "${docId}"（${block.content || "未命名"}）不是强化日记体系中的日记/周记/月记/年记文档，无法补充模板。`,
    };
  }
  return { ok: true };
}

async function executeEnsureToday(deps: KbRetrievalToolDeps): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const pluginAdapter = createDiaryToolPluginAdapter(deps);
  const result = await getOrCreateTodayDiaryDocument(pluginAdapter, config);

  if (!result.ok || !result.docId) {
    const reason = result.reason || "unknown";
    const messages: Record<string, string> = {
      missing_notebook: "未配置日记笔记本，请在强化日记设置中指定。",
      create_failed: "创建今日日记失败。",
      read_failed: "今日日记已创建，但读取内容失败。",
    };
    return {
      ok: false,
      errorCode: ENSURE_ERROR_CODE_MAP[reason] ?? "diary_create_failed",
      safeOutput: { operation: "ensure_today", changed: false, message: messages[reason] ?? "确保今日日记失败。" },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "ensure_today", changed: result.created, docId: result.docId, message: result.created ? "今日日记已创建。" : "今日日记已存在。" },
  };
}

async function executeAppendTemplate(deps: KbRetrievalToolDeps, args: { operation: "append_template"; period: string; date?: string; docId?: string }): Promise<ExecResult> {
  const config = await loadAgendaEnhancedDiaryConfig(deps);
  const period = args.period as EnhancedDiaryPeriod;
  const date = args.date ? parseLocalDate(args.date) : new Date();

  let docId = args.docId;
  if (docId) {
    const validation = await validateAppendTemplateDocId(docId);
    if (validation.ok === false) {
      return {
        ok: false,
        errorCode: validation.errorCode,
        safeOutput: { operation: "append_template", changed: false, docId, period, reason: validation.errorCode, message: validation.message },
      };
    }
  } else {
    const doc = await getDiaryDocumentForDate(date);
    if (!doc) {
      return {
        ok: false,
        errorCode: "diary_doc_not_found",
        safeOutput: { operation: "append_template", changed: false, period, reason: "doc_not_found", message: `${formatDiaryDate(date)} 的日记不存在，请先用 operation=ensure_today 创建。` },
      };
    }
    docId = doc.id;
  }

  const template = config.templates[period];
  if (!template) {
    return {
      ok: false,
      errorCode: "diary_template_missing",
      safeOutput: { operation: "append_template", changed: false, docId, period, reason: "no_template", message: `未配置 ${period} 周期模板。` },
    };
  }

  const ctx = getPeriodContext(period, date, config);
  const result = await appendTemplateToDiary({
    docId,
    period,
    template,
    context: ctx.templateContext,
    headingStructure: config.headingStructure,
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCode: "diary_template_append_failed",
      safeOutput: { operation: "append_template", changed: false, docId, period, reason: result.reason, message: result.reason === "empty_template" ? "模板为空。" : "补充模板失败。" },
    };
  }

  if (result.skipped) {
    return {
      ok: true,
      safeOutput: { operation: "append_template", changed: false, docId, period, skipped: true, reason: "template_already_present", message: `${period} 模板已存在，跳过插入。` },
    };
  }

  return {
    ok: true,
    safeOutput: { operation: "append_template", changed: true, docId, period, message: `已为 ${period} 周期补充模板。` },
  };
}

export async function executeManageDiaryStructure(
  deps: KbRetrievalToolDeps,
  args: ManageDiaryStructureInput,
): Promise<ExecResult> {
  if (args.operation === "ensure_today") {
    return executeEnsureToday(deps);
  }
  if (args.operation === "append_template") {
    return executeAppendTemplate(deps, args);
  }
  return {
    ok: false,
    errorCode: "invalid_input",
    safeOutput: { operation: String((args as { operation: string }).operation), changed: false, message: "不支持的操作。" },
  };
}
