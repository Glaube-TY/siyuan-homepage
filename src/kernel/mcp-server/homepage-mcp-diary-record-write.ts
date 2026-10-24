import SHA256 from "crypto-js/sha256";
import { getBlockAttrsChecked, getBlockKramdownChecked } from "@/api";
import { readTaskIndexSnapshot } from "@/components/tools/siyuanComponentDataApi";
import { validateEnhancedDiaryWriteTarget } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { findDayWorkspaceHeadingBlock } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { normalizeRecordCategoryTitle } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryWorkspaceSections";
import { queryTodayQuickRecordsDetailed, type WorkspaceQuickRecordAddTarget } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceRecordService";
import { readEnhancedDiaryProjectRecordIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectRecordIndex";
import { HOMEPAGE_MCP_DIARY_TASK_WRITES, homepageMcpDiaryRecordAddSchema, type HomepageMcpWritePreview } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { readHomepageMcpDiaryState, nativeOrders, rowFingerprint, diaryAttributes, HomepageMcpDiaryTargetUnavailable } from "./homepage-mcp-diary-task-write";

const hash = (value: unknown): string => SHA256(JSON.stringify(value)).toString();
const ID = /^\d{14}-[a-z0-9]{7}$/;

async function readRecordState(categoryTitle: string, expectedBlockId?: string) {
  const state = await readHomepageMcpDiaryState(expectedBlockId, "quickRecords");
  if ((await validateEnhancedDiaryWriteTarget(state.doc.id, state.target.notebookId, state.target.date)).status !== "valid") throw new Error("diary_record_document_invalid");
  const lookup = await findDayWorkspaceHeadingBlock(state.doc.id, "quickRecords", state.config.headingStructure, state.config.templateFieldMapping, state.top);
  if (!lookup.heading || lookup.heading.id !== state.target.headingId || lookup.heading.level > 4) throw new Error("diary_record_scope_invalid");
  const end = lookup.headings.find((heading) => heading.index > lookup.heading!.index && heading.level <= lookup.heading!.level)?.index ?? state.top.length;
  const matches = lookup.headings.filter((heading) => heading.index > lookup.heading!.index && heading.index < end && normalizeRecordCategoryTitle(heading.title) === categoryTitle);
  if (!matches.length) throw new HomepageMcpDiaryTargetUnavailable("目标快速记录分类尚不存在，请先在强化日记工作台中创建。");
  if (matches.length !== 1 || matches[0].level !== lookup.heading.level + 1) throw new HomepageMcpDiaryTargetUnavailable("快速记录分类标题不唯一或等级不正确，未生成确认。");
  const category = matches[0];
  const boundary = lookup.headings.find((heading) => heading.index > category.index && heading.level <= category.level);
  const date = `${state.target.date.slice(0, 4)}-${state.target.date.slice(4, 6)}-${state.target.date.slice(6)}`;
  const detailed = await queryTodayQuickRecordsDetailed(state.doc.id, state.doc.content, date, state.config.headingStructure, state.config.templateFieldMapping, state.config, state.top);
  if (detailed.status !== "parsed" || !detailed.structureComplete || !detailed.relationComplete) throw new Error("diary_record_read_incomplete");
  const index = await readEnhancedDiaryProjectRecordIndexStrict(state.target.notebookId);
  if (index.failures?.some((failure) => failure.docId === state.doc.id)) throw new Error("diary_record_index_conflict");
  // 普通记录不进入项目记录索引；原业务重建本日项目条目时只会刷新其派生 updatedAt。
  const indexItems = Object.fromEntries(Object.entries(index.items).sort(([a], [b]) => a.localeCompare(b)).map(([id, item]) => {
    if (item.diaryDocId !== state.doc.id) return [id, item];
    const { updatedAt: _updatedAt, ...business } = item;
    return [id, business];
  }));
  const taskIndex = await readTaskIndexSnapshot();
  if (!taskIndex.fileExists) throw new Error("diary_task_index_missing");
  return { ...state, records: detailed.records, indexFingerprint: hash([index.complete, indexItems, index.failures ?? []]), taskIndexFingerprint: hash(taskIndex.items),
    category, insertionIndex: boundary?.index ?? state.top.length, boundaryId: boundary?.id ?? null, orders: nativeOrders(state) };
}

export interface PreparedDiaryRecordWrite {
  preview: HomepageMcpWritePreview;
  stateFingerprint: string;
  target: Omit<WorkspaceQuickRecordAddTarget, "readTarget">;
  rows: Array<{ id: string; fingerprint: string }>;
  topIds: string[];
  parents: Record<string, string>;
  orders: Record<string, string[]>;
  recordFingerprints: Array<{ id: string; fingerprint: string }>;
  indexFingerprint: string;
  taskIndexFingerprint: string;
  insertionIndex: number;
  boundaryId: string | null;
  startedAt: number;
}

export async function prepareHomepageMcpDiaryRecordWrite(args: Record<string, unknown>): Promise<PreparedDiaryRecordWrite> {
  const input = homepageMcpDiaryRecordAddSchema.parse(args);
  const startedAt = Date.now();
  const state = await readRecordState(input.categoryTitle);
  const stateFingerprint = hash([state.stateFingerprint, state.records, state.indexFingerprint, state.taskIndexFingerprint]);
  const target = { ...state.target, categoryHeadingId: state.category.id, categoryTitle: input.categoryTitle, stateFingerprint };
  const operation = HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_record;
  return {
    stateFingerprint, target, startedAt, indexFingerprint: state.indexFingerprint, taskIndexFingerprint: state.taskIndexFingerprint,
    rows: state.rows.map((row) => ({ id: row.id, fingerprint: rowFingerprint(row) })), parents: state.parents, orders: state.orders,
    topIds: state.top.map((block) => block.id), insertionIndex: state.insertionIndex, boundaryId: state.boundaryId,
    recordFingerprints: state.records.map((record) => ({ id: record.headingBlockId!, fingerprint: hash(record) })),
    preview: { action: "manage_record", operationName: operation.name, consequence: operation.consequence, targetName: state.doc.title!, targetId: state.category.id, affectedCount: 1,
      details: [
        { label: "日记标题", value: state.doc.title! }, { label: "日记 docId", value: state.doc.id }, { label: "本地日期", value: state.target.date },
        { label: "分类名称", value: input.categoryTitle }, { label: "分类 headingId", value: state.category.id },
        { label: "目标身份", value: "已有分类标题，并非新记录 ID" }, { label: "快速记录内容", value: input.content },
        { label: "记录数量", value: "1" }, { label: "内容类型", value: "普通文本" },
      ] },
  };
}

export async function verifyHomepageMcpDiaryRecordWrite(args: Record<string, unknown>, before: PreparedDiaryRecordWrite, data: unknown): Promise<boolean> {
  const input = homepageMcpDiaryRecordAddSchema.parse(args);
  const output = data as { action?: unknown; result?: { operation?: unknown; changed?: unknown; headingBlockId?: unknown; categoryTitle?: unknown; date?: unknown; projectTargetId?: unknown; isKeyRecord?: unknown; tags?: unknown } } | null;
  const result = output?.result;
  if (output?.action !== "manage_record" || result?.operation !== "add" || result.changed !== true || typeof result.headingBlockId !== "string" || !ID.test(result.headingBlockId) ||
    result.categoryTitle !== input.categoryTitle || result.projectTargetId || result.isKeyRecord || result.tags !== undefined) return false;
  const headingId = result.headingBlockId;
  for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const after = await readRecordState(input.categoryTitle, headingId);
      const oldIds = new Set(before.rows.map((row) => row.id));
      const added = after.rows.filter((row) => !oldIds.has(row.id));
      if (added.length !== 2) continue;
      const heading = added.find((row) => row.id === headingId && row.type === "h"), paragraph = added.find((row) => row.type === "p");
      const time = heading && /^(\d{2}):(\d{2}) 记录$/.exec(String(heading.content));
      if (!heading || !paragraph || !time || +time[1] > 23 || +time[2] > 59 ||
        heading.subtype !== `h${after.category.level + 1}` || heading.markdown !== `${"#".repeat(after.category.level + 1)} ${time[0]}` ||
        paragraph.markdown !== input.content || paragraph.content !== input.content ||
        after.parents[heading.id] !== before.target.docId || after.parents[paragraph.id] !== before.target.docId ||
        after.target.docId !== before.target.docId || after.target.notebookId !== before.target.notebookId || after.target.date !== before.target.date ||
        after.target.configFingerprint !== before.target.configFingerprint || after.target.headingId !== before.target.headingId ||
        after.category.id !== before.target.categoryHeadingId || after.boundaryId !== before.boundaryId || after.insertionIndex !== before.insertionIndex + 2 ||
        after.indexFingerprint !== before.indexFingerprint || after.taskIndexFingerprint !== before.taskIndexFingerprint ||
        hash(after.top.map((block) => block.id)) !== hash([...before.topIds.slice(0, before.insertionIndex), heading.id, paragraph.id, ...before.topIds.slice(before.insertionIndex)]) ||
        after.rows.length !== before.rows.length + 2 || !before.rows.every((row) => {
          const current = after.rows.find((item) => item.id === row.id);
          return !!current && rowFingerprint(current) === row.fingerprint && after.parents[row.id] === before.parents[row.id];
        }) || hash(Object.fromEntries(Object.entries(after.orders).filter(([id]) => oldIds.has(id)).map(([id, children]) => [id, children.filter((child) => oldIds.has(child))]))) !== hash(before.orders)) return false;
      const now = new Date();
      const generatedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +time[1], +time[2]).getTime();
      if (generatedAt < Math.floor(before.startedAt / 60000) * 60000 || generatedAt > Date.now()) return false;
      for (const row of added) {
        const attrs = diaryAttributes(row.ial);
        const actual = Object.fromEntries(Object.entries(await getBlockAttrsChecked(row.id)).filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)));
        const raw = await getBlockKramdownChecked(row.id);
        if (Object.keys(attrs).length !== 1 || attrs.id !== row.id || hash(actual) !== hash(attrs) || raw.id !== row.id ||
          raw.kramdown.replace(/\n\{:[^\n]*\}\s*$/, "").trim() !== row.markdown) return false;
      }
      const record = after.records.find((item) => item.headingBlockId === headingId);
      if (!record || record.content !== input.content || record.categoryTitle !== input.categoryTitle || record.date !== result.date ||
        record.docId !== before.target.docId || record.headingLevel !== after.category.level + 1 || record.contentBlockIds?.join() !== paragraph.id ||
        record.tags.length || record.projectTargetId || record.hiddenProjectTargetId || record.visibleProjectTargetId || record.rootProjectId ||
        record.isKeyRecord || record.projectRelationStatus !== "none" || after.records.length !== before.recordFingerprints.length + 1) return false;
      return before.recordFingerprints.every((old) => hash(after.records.find((item) => item.headingBlockId === old.id)) === old.fingerprint);
    } catch { /* 仅有限回读；不能再次插入记录。 */ }
  }
  return false;
}
