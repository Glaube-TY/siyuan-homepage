import SHA256 from "crypto-js/sha256";
import { checkBlocksExist, getBlockAttrsChecked, getBlockKramdownChecked, getChildBlocksChecked, getBlockTreeInfos, SiyuanApiError } from "@/api";
import { readTaskIndexSnapshot } from "@/components/tools/siyuanComponentDataApi";
import { validateEnhancedDiaryWriteTarget } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { findDayWorkspaceHeadingBlock } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { normalizeRecordCategoryTitle } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryWorkspaceSections";
import { queryTodayQuickRecordsDetailed, type WorkspaceQuickRecordAddTarget, type EnhancedDiaryWorkspaceRecord } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceRecordService";
import { readEnhancedDiaryProjectRecordIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectRecordIndex";
import { HOMEPAGE_MCP_DIARY_TASK_WRITES, HOMEPAGE_MCP_DIARY_RECORD_UPDATE, HOMEPAGE_MCP_DIARY_RECORD_DELETE, homepageMcpDiaryRecordAddSchema, homepageMcpDiaryRecordWriteSchema, type HomepageMcpWritePreview } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { readHomepageMcpDiaryState, nativeOrders, rowFingerprint, diaryAttributes, HomepageMcpDiaryTargetUnavailable } from "./homepage-mcp-diary-task-write";

const hash = (value: unknown): string => SHA256(JSON.stringify(value)).toString();
const ID = /^\d{14}-[a-z0-9]{7}$/;

async function readRecordState(categoryTitle?: string, expectedBlockId?: string) {
  const state = await readHomepageMcpDiaryState(expectedBlockId, "quickRecords");
  if ((await validateEnhancedDiaryWriteTarget(state.doc.id, state.target.notebookId, state.target.date)).status !== "valid") throw new Error("diary_record_document_invalid");
  const lookup = await findDayWorkspaceHeadingBlock(state.doc.id, "quickRecords", state.config.headingStructure, state.config.templateFieldMapping, state.top);
  if (!lookup.heading || lookup.heading.id !== state.target.headingId || lookup.heading.level > 4) throw new Error("diary_record_scope_invalid");
  const end = lookup.headings.find((heading) => heading.index > lookup.heading!.index && heading.level <= lookup.heading!.level)?.index ?? state.top.length;
  const date = `${state.target.date.slice(0, 4)}-${state.target.date.slice(4, 6)}-${state.target.date.slice(6)}`;
  const detailed = await queryTodayQuickRecordsDetailed(state.doc.id, state.doc.content, date, state.config.headingStructure, state.config.templateFieldMapping, state.config, state.top);
  if (detailed.status !== "parsed" || !detailed.structureComplete || !detailed.relationComplete) throw new Error("diary_record_read_incomplete");
  if (categoryTitle === undefined) {
    const records = detailed.records.filter((record) => record.headingBlockId === expectedBlockId);
    if (records.length !== 1) throw new HomepageMcpDiaryTargetUnavailable("未找到当前今日日记中的指定快速记录，未生成确认。");
    categoryTitle = homepageMcpDiaryRecordAddSchema.shape.categoryTitle.parse(records[0].categoryTitle);
  }
  const matches = lookup.headings.filter((heading) => heading.index > lookup.heading!.index && heading.index < end && normalizeRecordCategoryTitle(heading.title) === categoryTitle);
  if (!matches.length) throw new HomepageMcpDiaryTargetUnavailable("目标快速记录分类尚不存在，请先在强化日记工作台中创建。");
  if (matches.length !== 1 || matches[0].level !== lookup.heading.level + 1) throw new HomepageMcpDiaryTargetUnavailable("快速记录分类标题不唯一或等级不正确，未生成确认。");
  const category = matches[0];
  const boundary = lookup.headings.find((heading) => heading.index > category.index && heading.level <= category.level);
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
  return { ...state, records: detailed.records, index, indexExactFingerprint: hash(index), indexFingerprint: hash([index.complete, indexItems, index.failures ?? []]), taskIndexFingerprint: hash(taskIndex.items),
    category, categoryTitle, insertionIndex: boundary?.index ?? state.top.length, boundaryId: boundary?.id ?? null, orders: nativeOrders(state) };
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
  mutation?: { record: EnhancedDiaryWorkspaceRecord; paragraphId: string; paragraphMetadataFingerprint: string; indexExactFingerprint: string; insertedParagraphId?: string };
  deletion?: { record: EnhancedDiaryWorkspaceRecord; paragraphId: string; indexExactFingerprint: string };
}

const paragraphMetadata = (row: Parameters<typeof rowFingerprint>[0]): string => rowFingerprint({ ...row, id: "", content: "", markdown: "", created: "", ial: '{: id=""}' });
const recordMetadata = (record: EnhancedDiaryWorkspaceRecord): string => {
  const { content: _content, contentBlockIds: _ids, rawProjectContent: _raw, ...metadata } = record;
  return hash(metadata);
};

async function plainBlock(state: Awaited<ReturnType<typeof readRecordState>>, id: string): Promise<boolean> {
  const row = state.rows.find((item) => item.id === id);
  if (!row || state.parents[id] !== state.doc.id) return false;
  const attrs = diaryAttributes(row.ial);
  const actual = Object.fromEntries(Object.entries(await getBlockAttrsChecked(id)).filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)));
  const raw = await getBlockKramdownChecked(id);
  return Object.keys(attrs).length === 1 && attrs.id === id && hash(actual) === hash(attrs) && raw.id === id &&
    raw.kramdown.replace(/\n\{:[^\n]*\}\s*$/, "").trim() === row.markdown &&
    (row.type !== "p" || !(await getChildBlocksChecked(id)).length);
}

async function ordinaryRecord(state: Awaited<ReturnType<typeof readRecordState>>, id: string): Promise<EnhancedDiaryWorkspaceRecord> {
  const record = state.records.find((item) => item.headingBlockId === id), heading = state.rows.find((item) => item.id === id);
  const paragraph = record?.contentBlockIds?.length === 1 && state.rows.find((row) => row.id === record.contentBlockIds![0]);
  const time = heading && /^(\d{2}):(\d{2}) 记录$/.exec(String(heading.content));
  const position = state.top.findIndex((item) => item.id === id);
  if (!record || !heading || !paragraph || heading.type !== "h" || paragraph.type !== "p" || !time || +time[1] > 23 || +time[2] > 59 ||
    record.docId !== state.doc.id || record.categoryTitle !== state.categoryTitle || record.headingLevel !== state.category.level + 1 ||
    heading.subtype !== `h${record.headingLevel}` || heading.markdown !== `${"#".repeat(record.headingLevel)} ${time[0]}` || record.headingTitle !== time[0] || record.timeText !== time[0].slice(0, 5) ||
    record.date?.replace(/-/g, "") !== state.target.date || !homepageMcpDiaryRecordAddSchema.shape.content.safeParse(record.content).success ||
    paragraph.markdown !== record.content || paragraph.content !== record.content || record.rawProjectContent !== record.content ||
    record.tags.length || record.projectTargetId || record.hiddenProjectTargetId || record.visibleProjectTargetId || record.rootProjectId ||
    record.projectPath?.length || record.projectAncestorTargetIds?.length || record.isKeyRecord || record.projectRelationStatus !== "none" || state.index.items[id] ||
    position <= state.category.index || position + 1 >= state.insertionIndex || state.top[position + 1].id !== paragraph.id ||
    position + 2 < state.insertionIndex && state.top[position + 2].type !== "h" ||
    !["h", "NodeHeading"].includes(state.treeInfos[id]?.type ?? "") || !["p", "NodeParagraph"].includes(state.treeInfos[paragraph.id]?.type ?? "") ||
    !await plainBlock(state, id) || !await plainBlock(state, paragraph.id)) throw new HomepageMcpDiaryTargetUnavailable("目标不是结构完整、无额外属性的单段普通快速记录，未生成确认。");
  return record;
}

export async function prepareHomepageMcpDiaryRecordWrite(args: Record<string, unknown>): Promise<PreparedDiaryRecordWrite> {
  const input = homepageMcpDiaryRecordWriteSchema.parse(args);
  const startedAt = Date.now();
  const state = await readRecordState(input.operation === "add" ? input.categoryTitle : undefined, input.operation !== "add" ? input.target.headingBlockId : undefined);
  const record = input.operation !== "add" ? await ordinaryRecord(state, input.target.headingBlockId) : undefined;
  if (input.operation === "update" && record?.content === input.content) throw new HomepageMcpDiaryTargetUnavailable("记录内容已经一致，无需修改。");
  const stateFingerprint = hash([state.stateFingerprint, state.records, record ? state.indexExactFingerprint : state.indexFingerprint, state.taskIndexFingerprint]);
  const target = { ...state.target, categoryHeadingId: state.category.id, categoryTitle: state.categoryTitle, stateFingerprint };
  const operation = HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_record;
  return {
    stateFingerprint, target, startedAt, indexFingerprint: state.indexFingerprint, taskIndexFingerprint: state.taskIndexFingerprint,
    rows: state.rows.map((row) => ({ id: row.id, fingerprint: rowFingerprint(row) })), parents: state.parents, orders: state.orders,
    topIds: state.top.map((block) => block.id), insertionIndex: state.insertionIndex, boundaryId: state.boundaryId,
    recordFingerprints: state.records.map((record) => ({ id: record.headingBlockId!, fingerprint: hash(record) })),
    ...(record && input.operation === "delete" ? { deletion: { record, paragraphId: record.contentBlockIds![0], indexExactFingerprint: state.indexExactFingerprint } } : {}),
    ...(record && input.operation === "update" ? { mutation: { record, paragraphId: record.contentBlockIds![0], paragraphMetadataFingerprint: paragraphMetadata(state.rows.find((row) => row.id === record.contentBlockIds![0])!), indexExactFingerprint: state.indexExactFingerprint } } : {}),
    preview: input.operation === "delete" && record ? { action: "manage_record", operationName: HOMEPAGE_MCP_DIARY_RECORD_DELETE.name, consequence: HOMEPAGE_MCP_DIARY_RECORD_DELETE.consequence,
      targetName: state.doc.title!, targetId: record.headingBlockId!, affectedCount: 1, details: [
        { label: "日记标题", value: state.doc.title! }, { label: "日记 docId", value: state.doc.id }, { label: "本地日期", value: state.target.date },
        { label: "分类名称", value: state.categoryTitle }, { label: "分类 headingId", value: state.category.id },
        { label: "记录标题 headingBlockId", value: record.headingBlockId! }, { label: "原正文段落 ID", value: record.contentBlockIds![0] },
        { label: "原记录标题", value: record.headingTitle }, { label: "记录时间", value: record.timeText }, { label: "原正文", value: record.content },
        { label: "记录数量", value: "1" }, { label: "块数量", value: "2" }, { label: "永久删除警告", value: HOMEPAGE_MCP_DIARY_RECORD_DELETE.consequence },
      ] } : input.operation === "update" && record ? { action: "manage_record", operationName: HOMEPAGE_MCP_DIARY_RECORD_UPDATE.name, consequence: HOMEPAGE_MCP_DIARY_RECORD_UPDATE.consequence,
      targetName: state.doc.title!, targetId: record.headingBlockId!, affectedCount: 1, details: [
        { label: "日记标题", value: state.doc.title! }, { label: "日记 docId", value: state.doc.id }, { label: "本地日期", value: state.target.date },
        { label: "分类名称", value: state.categoryTitle }, { label: "分类 headingId", value: state.category.id },
        { label: "记录标题 headingBlockId", value: record.headingBlockId! }, { label: "原正文段落 ID", value: record.contentBlockIds![0] },
        { label: "原记录标题", value: record.headingTitle }, { label: "记录时间", value: record.timeText },
        { label: "原正文", value: record.content }, { label: "新正文", value: input.content }, { label: "记录数量", value: "1" },
      ] } : { action: "manage_record", operationName: operation.name, consequence: operation.consequence, targetName: state.doc.title!, targetId: state.category.id, affectedCount: 1,
      details: [
        { label: "日记标题", value: state.doc.title! }, { label: "日记 docId", value: state.doc.id }, { label: "本地日期", value: state.target.date },
        { label: "分类名称", value: state.categoryTitle }, { label: "分类 headingId", value: state.category.id },
        { label: "目标身份", value: "已有分类标题，并非新记录 ID" }, { label: "快速记录内容", value: input.operation === "add" ? input.content : "" },
        { label: "记录数量", value: "1" }, { label: "内容类型", value: "普通文本" },
      ] },
  };
}

export async function verifyHomepageMcpDiaryRecordInsertion(args: Record<string, unknown>, before: PreparedDiaryRecordWrite, paragraphId: string, insertedOnly = true): Promise<boolean> {
  const input = homepageMcpDiaryRecordWriteSchema.parse(args), mutation = before.mutation;
  if (input.operation !== "update" || !mutation || !ID.test(paragraphId) || before.rows.some((row) => row.id === paragraphId) || input.target.headingBlockId !== mutation.record.headingBlockId) return false;
  for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const after = await readRecordState(before.target.categoryTitle, paragraphId);
      const oldIds = new Set(before.rows.map((row) => row.id)), added = after.rows.filter((row) => !oldIds.has(row.id));
      if (added.length !== 1 || after.rows.length !== before.rows.length + (insertedOnly ? 1 : 0) || (!insertedOnly && after.rows.some((row) => row.id === mutation.paragraphId))) continue;
      const paragraph = added[0], record = after.records.find((item) => item.headingBlockId === mutation.record.headingBlockId);
      const replace = (ids: string[]) => ids.flatMap((id) => id === mutation.paragraphId ? insertedOnly ? [paragraphId, id] : [paragraphId] : [id]);
      const orderHash = (orders: Record<string, string[]>) => hash(Object.entries(orders).sort(([a], [b]) => a.localeCompare(b)));
      if (paragraph.id !== paragraphId || paragraph.type !== "p" || paragraph.markdown !== input.content || paragraph.content !== input.content ||
        paragraphMetadata(paragraph) !== mutation.paragraphMetadataFingerprint || after.parents[paragraph.id] !== before.parents[mutation.paragraphId] ||
        after.target.docId !== before.target.docId || after.target.notebookId !== before.target.notebookId || after.target.date !== before.target.date ||
        after.target.configFingerprint !== before.target.configFingerprint || after.target.headingId !== before.target.headingId || after.category.id !== before.target.categoryHeadingId ||
        after.boundaryId !== before.boundaryId || after.insertionIndex !== before.insertionIndex + (insertedOnly ? 1 : 0) ||
        after.indexExactFingerprint !== mutation.indexExactFingerprint || after.taskIndexFingerprint !== before.taskIndexFingerprint ||
        hash(after.top.map((item) => item.id)) !== hash(replace(before.topIds)) ||
        orderHash(after.orders) !== orderHash(Object.fromEntries(Object.entries(before.orders).map(([id, children]) => [id, replace(children)]))) ||
        !before.rows.filter((row) => insertedOnly || row.id !== mutation.paragraphId).every((row) => {
          const current = after.rows.find((item) => item.id === row.id);
          return !!current && rowFingerprint(current) === row.fingerprint && after.parents[row.id] === before.parents[row.id];
        }) || !record || recordMetadata(record) !== recordMetadata(mutation.record) ||
        hash(record.contentBlockIds) !== hash(insertedOnly ? [paragraphId, mutation.paragraphId] : [paragraphId]) ||
        after.records.length !== before.recordFingerprints.length || !before.recordFingerprints.filter((old) => old.id !== mutation.record.headingBlockId)
          .every((old) => hash(after.records.find((item) => item.headingBlockId === old.id)) === old.fingerprint) ||
        !await plainBlock(after, paragraphId) || !await plainBlock(after, mutation.record.headingBlockId!)) return false;
      if (insertedOnly) return true;
      if ((await checkBlocksExist([mutation.paragraphId]))[mutation.paragraphId] !== false) continue;
      const ordinary = await ordinaryRecord(after, mutation.record.headingBlockId!);
      return ordinary.content === input.content;
    } catch { /* 只有限回读，不重放任何插入或删除。 */ }
  }
  return false;
}

export async function verifyHomepageMcpDiaryRecordWrite(args: Record<string, unknown>, before: PreparedDiaryRecordWrite, data: unknown): Promise<boolean> {
  const input = homepageMcpDiaryRecordWriteSchema.parse(args);
  const output = data as { action?: unknown; result?: { operation?: unknown; changed?: unknown; headingBlockId?: unknown; categoryTitle?: unknown; date?: unknown; projectTargetId?: unknown; isKeyRecord?: unknown; tags?: unknown } } | null;
  const result = output?.result;
  if (output?.action !== "manage_record" || result?.operation !== input.operation || result.changed !== true || typeof result.headingBlockId !== "string" || !ID.test(result.headingBlockId) ||
    result.categoryTitle !== before.target.categoryTitle || result.projectTargetId || result.isKeyRecord || (input.operation === "update" ? !Array.isArray(result.tags) || result.tags.length : result.tags !== undefined)) return false;
  if (input.operation === "delete") {
    const deletion = before.deletion;
    if (!deletion || result.headingBlockId !== input.target.headingBlockId || deletion.record.headingBlockId !== input.target.headingBlockId) return false;
    const removed = new Set([input.target.headingBlockId, deletion.paragraphId]);
    const retained = before.rows.filter((row) => !removed.has(row.id));
    const expectedOrders = Object.fromEntries(Object.entries(before.orders).filter(([id]) => !removed.has(id)).map(([id, children]) => [id, children.filter((child) => !removed.has(child))]));
    for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      try {
        const after = await readRecordState(before.target.categoryTitle, before.target.categoryHeadingId);
        const exists = await checkBlocksExist([...removed]);
        if ([...removed].some((id) => exists[id] !== false) || after.rows.length !== before.rows.length - 2) continue;
        for (const id of removed) {
          try {
            const trees = await getBlockTreeInfos([id]);
            if (!trees || typeof trees !== "object" || Array.isArray(trees) || Object.keys(trees).length) return false;
          } catch (error) {
            // 3.8.8 对不存在的单个块返回该明确错误；其他 API/网络失败仍是结果未知。
            if (!(error instanceof SiyuanApiError && error.url === "/api/block/getBlockTreeInfos" && error.siyuanCode === -1 && error.siyuanMsg === "block not found")) throw error;
          }
        }
        return after.target.docId === before.target.docId && after.target.notebookId === before.target.notebookId && after.target.date === before.target.date &&
          after.target.configFingerprint === before.target.configFingerprint && after.target.headingId === before.target.headingId &&
          after.category.id === before.target.categoryHeadingId && after.boundaryId === before.boundaryId && after.insertionIndex === before.insertionIndex - 2 &&
          after.indexExactFingerprint === deletion.indexExactFingerprint && after.taskIndexFingerprint === before.taskIndexFingerprint &&
          hash(after.top.map((item) => item.id)) === hash(before.topIds.filter((id) => !removed.has(id))) && hash(after.orders) === hash(expectedOrders) &&
          retained.every((row) => {
            const current = after.rows.find((item) => item.id === row.id);
            return !!current && rowFingerprint(current) === row.fingerprint && after.parents[row.id] === before.parents[row.id];
          }) && after.records.length === before.recordFingerprints.length - 1 && !after.records.some((record) => removed.has(record.headingBlockId!)) &&
          before.recordFingerprints.filter((record) => !removed.has(record.id)).every((record) => hash(after.records.find((item) => item.headingBlockId === record.id)) === record.fingerprint);
      } catch { /* 只回读，不重放已发出的删除事务。 */ }
    }
    return false;
  }
  if (input.operation === "update") {
    if (result.headingBlockId !== input.target.headingBlockId) return false;
    const id = before.mutation?.insertedParagraphId;
    return !!id && verifyHomepageMcpDiaryRecordInsertion(args, before, id, false);
  }
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
