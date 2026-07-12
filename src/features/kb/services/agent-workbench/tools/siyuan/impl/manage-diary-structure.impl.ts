import { getOrCreateTodayDiaryDocument } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryActions";
import { getDiaryDocumentForDate, appendTemplateToDiary } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { getPeriodContext, formatDiaryDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import { parseLocalDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceDate";
import type { EnhancedDiaryConfig, EnhancedDiaryPeriod } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { ManageDiaryStructureInput, ManageDiaryStructureOutput } from "../contracts/manage-diary-structure.contract";
import { createDiaryToolPluginAdapter, loadAgendaEnhancedDiaryConfig, prepareAgendaEnhancedDiaryIndex } from "./agenda-utils.impl";
import { resolveEnhancedDiaryDateFromMetadata } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { sqlChecked } from "@/api";

type ExecResult = { ok: boolean; safeOutput: ManageDiaryStructureOutput; errorCode?: string };

const ENSURE_ERROR_CODE_MAP: Record<string, string> = {
  missing_notebook: "diary_not_configured",
  create_failed: "diary_create_failed",
  read_failed: "diary_read_failed",
  existing_doc_unreadable: "diary_doc_unreadable",
  index_not_ready: "diary_index_not_ready",
};

/**
 * 校验传入 docId 是否为当前强化日记配置中的真实日记文档。
 * 接收 config 以确认文档属于配置的日记笔记本。
 * 使用与日记索引相同的纯元数据日期解析函数。
 * 严格区分 SQL 查询失败与文档不存在。
 */
async function validateAppendTemplateDocId(
    docId: string,
    config: EnhancedDiaryConfig
): Promise<
  | { ok: true; diaryDate: string }
  | { ok: false; errorCode: "diary_doc_not_found" | "invalid_diary_doc" | "diary_doc_out_of_scope" | "diary_validation_failed"; message: string }
> {
  // 0. Config must have dailyNotebookId
  if (!config.dailyNotebookId) {
    return {
      ok: false,
      errorCode: "diary_doc_out_of_scope",
      message: "未配置强化日记笔记本。",
    };
  }

  // 1. SQL query — use sqlChecked (throws on API error), SELECT specific columns
  let rows: any[];
  try {
    const escaped = docId.replace(/'/g, "''");
    rows = await sqlChecked(
      `SELECT id, type, box, content, ial, hpath, path FROM blocks WHERE id = '${escaped}' LIMIT 1`
    );
  } catch (err) {
    console.warn("[validateAppendTemplateDocId] SQL query failed", err);
    return {
      ok: false,
      errorCode: "diary_validation_failed",
      message: `校验 docId "${docId}" 时查询异常，请稍后重试。`,
    };
  }

  const block = rows[0] as { id?: string; type?: string; box?: string; content?: string; ial?: string; hpath?: string; path?: string } | undefined;
  if (!block) {
    return {
      ok: false,
      errorCode: "diary_doc_not_found",
      message: `docId "${docId}" 对应的文档不存在。`,
    };
  }

  // 2. Must be a document
  if (block.type !== "d") {
    return {
      ok: false,
      errorCode: "invalid_diary_doc",
      message: `docId "${docId}" 不是文档（type=${block.type ?? "unknown"}），append_template 只能用于日记文档。`,
    };
  }

  // 3. Must belong to the configured diary notebook
  if (block.box !== config.dailyNotebookId) {
    return {
      ok: false,
      errorCode: "diary_doc_out_of_scope",
      message: `docId "${docId}" 属于笔记本 ${block.box ?? "未知"}，不属于当前配置的强化日记笔记本 ${config.dailyNotebookId}。`,
    };
  }

  // 4. Must be recognisable as a diary date document (same rule as diary index)
  const resolved = resolveEnhancedDiaryDateFromMetadata({
    ial: block.ial,
    title: block.content,
    hpath: block.hpath,
    path: block.path,
  });
  if (!resolved) {
    return {
      ok: false,
      errorCode: "invalid_diary_doc",
      message: `docId "${docId}"（${block.content || "未命名"}）不是强化日记体系中的日记/周记/月记/年记文档，无法补充模板。`,
    };
  }

  return { ok: true, diaryDate: resolved.date };
}

async function executeEnsureToday(deps: KbRetrievalToolDeps): Promise<ExecResult> {
  const config = await prepareAgendaEnhancedDiaryIndex(deps, await loadAgendaEnhancedDiaryConfig(deps));
  const pluginAdapter = createDiaryToolPluginAdapter(deps);
  const result = await getOrCreateTodayDiaryDocument(pluginAdapter, config);

  if (!result.ok || !result.docId) {
    const reason = result.reason || "unknown";
    const messages: Record<string, string> = {
      missing_notebook: "未配置日记笔记本，请在强化日记设置中指定。",
      create_failed: "创建今日日记失败。",
      read_failed: "今日日记已创建，但读取内容失败。",
      existing_doc_unreadable: "今日日记已存在，但暂时无法读取内容，请稍后重试。",
      index_not_ready: "强化日记索引未就绪，请稍后重试。",
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
  let config = await loadAgendaEnhancedDiaryConfig(deps);
  const period = args.period as EnhancedDiaryPeriod;

  let docId = args.docId;
  let date: Date;

  if (docId) {
    const validation = await validateAppendTemplateDocId(docId, config);
    if (validation.ok === false) {
      return {
        ok: false,
        errorCode: validation.errorCode,
        safeOutput: { operation: "append_template", changed: false, docId, period, reason: validation.errorCode, message: validation.message },
      };
    }
    // Use diaryDate from metadata as authoritative date for template context
    const diaryDate = validation.diaryDate;
    if (args.date) {
      const parsedArgDate = parseLocalDate(args.date);
      const argDateFormatted = `${parsedArgDate.getFullYear()}${String(parsedArgDate.getMonth() + 1).padStart(2, "0")}${String(parsedArgDate.getDate()).padStart(2, "0")}`;
      if (argDateFormatted !== diaryDate) {
        return {
          ok: false,
          errorCode: "diary_doc_date_mismatch",
          safeOutput: { operation: "append_template", changed: false, docId, period, reason: "diary_doc_date_mismatch", message: `docId 的日记日期 ${diaryDate} 与请求日期 ${args.date} 不一致，禁止写入。` },
        };
      }
    }
    // Use the diaryDate from metadata to construct the template context date
    const y = Number(diaryDate.slice(0, 4)), m = Number(diaryDate.slice(4, 6)) - 1, d = Number(diaryDate.slice(6, 8));
    date = new Date(y, m, d);
  } else {
    date = args.date ? parseLocalDate(args.date) : new Date();
    config = await prepareAgendaEnhancedDiaryIndex(deps, config);
    const doc = await getDiaryDocumentForDate(date, config.dailyNotebookId);
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
    mapping: config.templateFieldMapping,
    taskManagementEnabled: config.workspaceSettings?.modules?.taskManagementEnabled !== false,
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCode: "diary_template_append_failed",
      safeOutput: { operation: "append_template", changed: false, docId, period, reason: result.reason, message: result.reason === "empty_template" ? "模板为空。" : result.reason === "read_failed" ? "日记正文暂时无法读取，为避免重复写入，本次未补充模板。" : "补充模板失败。" },
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
