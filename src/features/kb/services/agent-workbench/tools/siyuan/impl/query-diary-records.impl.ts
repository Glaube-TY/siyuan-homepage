import { getDiaryDocumentForDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import {
  queryQuickRecordsInDateRange,
  queryTodayQuickRecords,
} from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceRecordService";
import type { EnhancedDiaryWorkspaceRecord } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceRecordService";
import type { SiyuanToolDeps as KbRetrievalToolDeps } from "../siyuan-tool-deps";
import type {
  QueryDiaryRecordsInput,
  QueryDiaryRecordsOutput,
} from "../contracts/query-diary-records.contract";
import {
  formatAgendaDate,
  mapAgendaRecord,
  parseAgendaDate,
} from "./agenda-utils.impl";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function recordMatchesCategory(
  record: EnhancedDiaryWorkspaceRecord,
  category: string | undefined,
): boolean {
  if (!category) return true;
  const target = normalize(category);
  return (
    normalize(record.categoryTitle).includes(target) ||
    normalize(record.categoryKey).includes(target)
  );
}

function recordMatchesKeyword(
  record: EnhancedDiaryWorkspaceRecord,
  keyword: string | undefined,
): boolean {
  if (!keyword) return true;
  const query = normalize(keyword);
  return [
    record.headingTitle,
    record.categoryTitle,
    record.timeText,
    record.content,
    record.docTitle,
  ].some((value) => normalize(value || "").includes(query));
}

async function querySingleDayRecords(date: Date): Promise<{
  dateText: string;
  records: EnhancedDiaryWorkspaceRecord[];
}> {
  const dateText = formatAgendaDate(date);
  const doc = await getDiaryDocumentForDate(date);
  if (!doc) return { dateText, records: [] };

  const records = await queryTodayQuickRecords(doc.id, doc.content, dateText);
  for (const record of records) {
    record.date = dateText;
    record.docTitle = doc.title || dateText;
  }
  return { dateText, records };
}

export async function executeQueryDiaryRecords(
  _deps: KbRetrievalToolDeps,
  args: QueryDiaryRecordsInput,
): Promise<{ safeOutput: QueryDiaryRecordsOutput }> {
  const limit = args.limit ?? 30;
  let dateText: string | undefined;
  let records: EnhancedDiaryWorkspaceRecord[] = [];

  if (args.startDate && args.endDate) {
    const startDate = parseAgendaDate(args.startDate);
    const endDate = parseAgendaDate(args.endDate);
    records = await queryQuickRecordsInDateRange({
      startDate,
      endDate,
      includeToday: true,
    });
  } else {
    const result = await querySingleDayRecords(parseAgendaDate(args.date));
    dateText = result.dateText;
    records = result.records;
  }

  const matched = records
    .filter((record) => recordMatchesCategory(record, args.category))
    .filter((record) => recordMatchesKeyword(record, args.keyword));

  return {
    safeOutput: {
      date: dateText,
      startDate: args.startDate,
      endDate: args.endDate,
      records: matched
        .slice(0, limit)
        .map((record, index) => mapAgendaRecord(record, record.date || dateText || "", index)),
      totalMatched: matched.length,
      returned: Math.min(matched.length, limit),
      note: "只读快速记录查询；不会新增、修改、删除记录，也不会把记录转为任务。范围查询沿用现有最近 90 天保护。",
    },
  };
}
