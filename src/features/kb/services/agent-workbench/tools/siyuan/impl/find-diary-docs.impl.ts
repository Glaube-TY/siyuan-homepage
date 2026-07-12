import { getDiaryDocumentForDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import {
  getEnhancedDiaryStatus,
  getPeriodContext,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import type {
  EnhancedDiaryConfig,
  EnhancedDiaryPeriod,
  EnhancedDiaryPeriodContext,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type { AgendaDiaryDoc } from "../contracts/agenda-common.contract";
import type {
  FindDiaryDocsInput,
  FindDiaryDocsOutput,
} from "../contracts/find-diary-docs.contract";
import {
  cleanOptionalString,
  formatAgendaDate,
  loadAgendaEnhancedDiaryConfig,
  prepareAgendaEnhancedDiaryIndex,
  parseAgendaDate,
  truncateAgendaText,
} from "./agenda-utils.impl";

const MAX_RANGE_SCAN_DAYS = 366;
const MAX_RETURNED_DOCS = 100;

function contextKey(period: EnhancedDiaryPeriod, ctx: EnhancedDiaryPeriodContext): string {
  return `${period}:${ctx.range.start}:${ctx.range.end}:${formatAgendaDate(ctx.targetDate)}`;
}

async function buildDiaryDocResult(params: {
  period: EnhancedDiaryPeriod;
  ctx: EnhancedDiaryPeriodContext;
  config: EnhancedDiaryConfig;
  statusBaseDate: Date;
  includeMarkdown: boolean;
  maxChars: number;
}): Promise<AgendaDiaryDoc> {
  const { period, ctx, config, statusBaseDate, includeMarkdown, maxChars } = params;
  const doc = await getDiaryDocumentForDate(ctx.targetDate, config.dailyNotebookId);
  const status = getEnhancedDiaryStatus({
    docExists: !!doc,
    content: doc?.content || "",
    period,
    baseDate: statusBaseDate,
    targetDate: ctx.targetDate,
    config,
  });
  const content = doc?.content || "";
  const preview = includeMarkdown && doc
    ? truncateAgendaText(content, maxChars)
    : undefined;

  return {
    period,
    date: formatAgendaDate(ctx.targetDate),
    docId: cleanOptionalString(doc?.id),
    title: cleanOptionalString(doc?.title),
    exists: !!doc,
    range: ctx.range,
    status,
    markdownPreview: preview,
    truncated: includeMarkdown && doc ? content.trim().length > maxChars : undefined,
  };
}

export async function executeFindDiaryDocs(
  deps: KbRetrievalToolDeps,
  args: FindDiaryDocsInput,
): Promise<{ safeOutput: FindDiaryDocsOutput }> {
  const period = args.period ?? "day";
  const isRangeQuery = !!args.startDate && !!args.endDate;
  let includeMarkdown = args.includeMarkdown ?? false;
  const maxChars = args.maxChars ?? 1000;
  const config = await prepareAgendaEnhancedDiaryIndex(deps, await loadAgendaEnhancedDiaryConfig(deps));
  const warnings: string[] = [];
  const docs: AgendaDiaryDoc[] = [];

  if (isRangeQuery && includeMarkdown) {
    includeMarkdown = false;
    warnings.push("范围查询不返回正文预览（includeMarkdown 已强制关闭）。本结果不包含完整正文；正文读取能力依赖真实 docId。");
  }

  if (args.startDate && args.endDate) {
    const startDate = parseAgendaDate(args.startDate);
    const endDate = parseAgendaDate(args.endDate);
    const seen = new Set<string>();
    const cursor = new Date(startDate);
    let scannedDays = 0;

    while (cursor <= endDate && scannedDays < MAX_RANGE_SCAN_DAYS && docs.length < MAX_RETURNED_DOCS) {
      const ctx = getPeriodContext(period, cursor, config);
      const key = contextKey(period, ctx);
      if (!seen.has(key)) {
        seen.add(key);
        docs.push(await buildDiaryDocResult({
          period,
          ctx,
          config,
          statusBaseDate: new Date(cursor),
          includeMarkdown,
          maxChars,
        }));
      }
      cursor.setDate(cursor.getDate() + 1);
      scannedDays += 1;
    }

    if (cursor <= endDate) {
      warnings.push(`范围过大，已限制扫描 ${MAX_RANGE_SCAN_DAYS} 天、返回 ${MAX_RETURNED_DOCS} 条以内。`);
    }

    return {
      safeOutput: {
        period,
        startDate: args.startDate,
        endDate: args.endDate,
        docs,
        returned: docs.length,
        totalChecked: seen.size,
        note: "只读日记文档定位；不会创建日记、补模板、标记完成或跳过复盘。本结果只用于定位文档；正文不在本结果中展开。",
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  }

  const date = parseAgendaDate(args.date);
  const ctx = getPeriodContext(period, date, config);
  docs.push(await buildDiaryDocResult({
    period,
    ctx,
    config,
    statusBaseDate: date,
    includeMarkdown,
    maxChars,
  }));

  return {
    safeOutput: {
      period,
      date: formatAgendaDate(date),
      docs,
      returned: docs.length,
      totalChecked: docs.length,
      note: "只读日记文档定位；不会创建日记、补模板、标记完成或跳过复盘。本结果只用于定位文档；正文不在本结果中展开。",
    },
  };
}
