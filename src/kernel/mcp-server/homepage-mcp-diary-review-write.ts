import SHA256 from "crypto-js/sha256";
import { checkBlocksExist, getChildBlocksChecked, getBlockAttrsChecked, getBlockKramdownChecked } from "@/api";
import { readTaskIndexSnapshot } from "@/components/tools/siyuanComponentDataApi";
import { buildUpdatedRootHeadingMarkdown, findPeriodRootHeadingBlock, validateEnhancedDiaryWriteTarget } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { findDayWorkspaceHeadingBlock } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { normalizeHeadingTitle } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryMarkdownSections";
import { loadReviewContent } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceReviewContent";
import { scanDiaryContentForPeriod } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryUtils";
import { ENHANCED_DIARY_COMPLETED_SUFFIX, stripReviewStatusSuffix, matchesRootHeadingWithMapping, getActiveReviewFields, getReviewFieldLookupAliases, getFieldAliases, headingTitleMatchesAliases } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTemplateFieldMapping";
import { readEnhancedDiaryProjectIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectIndex";
import { readEnhancedDiaryProjectRecordIndexStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryProjectRecordIndex";
import { getEnhancedDiaryIndexEntriesStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { loadDataStrict } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import type { ToolRuntimeContext } from "@/features/kb/services/agent-workbench/contracts/tool-contract";
import { homepageMcpDiaryReviewWriteSchema, homepageMcpDiaryReviewContentSchema, HOMEPAGE_MCP_DIARY_REVIEW_CONTENT, homepageMcpWritePreviewSchema, HOMEPAGE_MCP_DIARY_TASK_WRITES, HOMEPAGE_MCP_DIARY_REVIEW_LABELS, HOMEPAGE_MCP_DIARY_REVIEW_STATUS_NAMES } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { readHomepageMcpDiaryDocumentState, rowFingerprint, diaryAttributes, nativeOrders, HomepageMcpDiaryTargetUnavailable } from "./homepage-mcp-diary-task-write";

const hash = (value: unknown): string => SHA256(JSON.stringify(value)).toString();
const requireState = (valid: unknown): void => { if (!valid) throw new HomepageMcpDiaryTargetUnavailable("今日日记、日复盘根标题或索引状态无法可靠核对，未生成确认。"); };

async function readReviewState(docId: string, expectedBlockId?: string) {
  const state = await readHomepageMcpDiaryDocumentState(new Date(), "newTasks", expectedBlockId);
  requireState(state.doc.id === docId && (await validateEnhancedDiaryWriteTarget(docId, state.target.notebookId, state.target.date)).status === "valid");
  const root = await findPeriodRootHeadingBlock(docId, "day", state.config.templateFieldMapping);
  requireState(root && root.block.level === 1);
  if (!root) throw new Error("diary_review_root_missing");
  const roots = state.top.filter((block) => block.type === "h" && /^#\s+/.test(block.markdown) &&
    matchesRootHeadingWithMapping(block.markdown.replace(/^#\s+/, ""), "day", state.config.templateFieldMapping));
  const row = state.rows.find((item) => item.id === root.block.id);
  requireState(roots.length === 1 && roots[0].id === root.block.id && row?.type === "h" && row.subtype === "h1" &&
    row.markdown === root.raw && state.parents[root.block.id] === docId && ["h", "NodeHeading"].includes(state.treeInfos[root.block.id]?.type));
  if (!row) throw new Error("diary_review_row_missing");
  const raw = await getBlockKramdownChecked(row.id), attrs = await getBlockAttrsChecked(row.id);
  requireState(raw.id === row.id && raw.kramdown.replace(/\n\{:[^\n]*\}\s*$/, "").trim() === root.raw &&
    hash(diaryAttributes(row.ial)) === hash(Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)))));
  const title = root.block.title;
  const completed = title.endsWith(ENHANCED_DIARY_COMPLETED_SUFFIX);
  requireState(root.raw === "# " + title && stripReviewStatusSuffix(title).length &&
    title.split(ENHANCED_DIARY_COMPLETED_SUFFIX).length - 1 === (completed ? 1 : 0));
  const scan = scanDiaryContentForPeriod(state.doc.content, "day", state.config.templateFieldMapping);
  requireState(scan.hasCompletionMarker && !scan.skipped && !scan.hasSkipMarker && scan.completed === completed);
  const quickRecords = await readHomepageMcpDiaryDocumentState(new Date(), "quickRecords");
  requireState(quickRecords.doc.id === docId && quickRecords.target.date === state.target.date &&
    quickRecords.target.configFingerprint === state.target.configFingerprint && hash(quickRecords.rows) === hash(state.rows) &&
    hash(quickRecords.top) === hash(state.top) && hash(quickRecords.parents) === hash(state.parents));
  const index = await readTaskIndexSnapshot();
  requireState(index.fileExists && index.items.length <= 10_000);
  await Promise.all([readEnhancedDiaryProjectIndexStrict(state.config.projectStorage), readEnhancedDiaryProjectRecordIndexStrict(state.target.notebookId)]);
  const auxiliary = await Promise.all(["enhanced-diary-project-index.json", "enhanced-diary-project-record-index.json"].map(async (key) => {
    const read = await loadDataStrict<Record<string, unknown>>(key);
    requireState(read.status === "ok" && read.data && !Array.isArray(read.data));
    if (read.status !== "ok") throw new Error("diary_review_index_unreadable");
    requireState(JSON.stringify(read.data).length <= 1_000_000);
    return read.data;
  }));
  const indexes = hash([index.items, auxiliary, await getEnhancedDiaryIndexEntriesStrict(state.target.notebookId)]);
  const orders = nativeOrders(state);
  return { ...state, root, row, completed, indexes, orders, quickRecordsId: quickRecords.target.headingId,
    fingerprint: hash([state.stateFingerprint, raw, attrs, indexes, orders]) };
}

export async function prepareHomepageMcpDiaryReviewWrite(args: Record<string, unknown>) {
  const input = homepageMcpDiaryReviewWriteSchema.parse(args);
  if (input.operation === "save_content") return prepareReviewContent(input);
  const state = await readReviewState(input.docId);
  if (state.completed === (input.status === "completed")) throw new HomepageMcpDiaryTargetUnavailable("复盘已经是目标状态，无需修改，未生成确认。");
  const expectedMarkdown = buildUpdatedRootHeadingMarkdown(state.root.raw, input.status === "completed");
  requireState(expectedMarkdown);
  const target: NonNullable<ToolRuntimeContext["diaryReviewStatusTarget"]> = {
    docId: state.doc.id, notebookId: state.target.notebookId, date: state.target.date, period: "day", status: input.status,
    rootHeadingId: state.root.block.id, rootMarkdown: state.root.raw, expectedMarkdown: expectedMarkdown!, stateFingerprint: state.fingerprint,
    readTarget: async () => { if ((await readReviewState(input.docId)).fingerprint !== state.fingerprint) throw new Error("diary_review_conflict"); },
  };
  const values = [state.doc.title!, state.doc.id, state.target.date, target.rootHeadingId, state.root.block.title,
    state.completed ? "已完成" : "未完成", input.status === "completed" ? "已完成" : "未完成", expectedMarkdown!.slice(2), "1"];
  return { target, stateFingerprint: state.fingerprint, state,
    preview: homepageMcpWritePreviewSchema.parse({ action: "manage_review", operationName: HOMEPAGE_MCP_DIARY_REVIEW_STATUS_NAMES[input.status],
      consequence: HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_review.consequence, targetName: state.doc.title!, targetId: target.rootHeadingId,
      affectedCount: 1, details: HOMEPAGE_MCP_DIARY_REVIEW_LABELS.map((label, i) => ({ label, value: values[i] })) }) };
}

export async function verifyHomepageMcpDiaryReviewWrite(before: Awaited<ReturnType<typeof prepareHomepageMcpDiaryReviewWrite>>): Promise<boolean> {
  if ("contentTarget" in before) return verifyReviewContent(before, false);
  for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const after = await readReviewState(before.target.docId), state = before.state;
      if (after.root.raw !== before.target.expectedMarkdown) continue;
      return after.root.block.id === before.target.rootHeadingId && after.completed === (before.target.status === "completed") &&
        hash(after.target) === hash(state.target) && after.indexes === state.indexes && after.quickRecordsId === state.quickRecordsId &&
        hash(after.parents) === hash(state.parents) && hash(after.orders) === hash(state.orders) &&
        hash(after.top.map((block) => block.id)) === hash(state.top.map((block) => block.id)) && after.rows.length === state.rows.length &&
        state.rows.every((row) => {
          const current = after.rows.find((item) => item.id === row.id);
          return !!current && rowFingerprint(current) === rowFingerprint(row.id === before.target.rootHeadingId
            ? { ...row, content: after.root.block.title, markdown: before.target.expectedMarkdown } : row);
        });
    } catch { /* 只有限回读，绝不重放标题更新。 */ }
  }
  return false;
}


type ReviewState = Awaited<ReturnType<typeof readReviewState>>;
type ContentInput = ReturnType<typeof homepageMcpDiaryReviewContentSchema.parse>;

async function checkedBlock(state: ReviewState, id: string, paragraph = false) {
  const row = state.rows.find((item) => item.id === id);
  requireState(row && state.parents[id] === state.doc.id);
  if (!row) throw new Error("review_block_missing");
  const attrs = diaryAttributes(row.ial), actual = await getBlockAttrsChecked(id), raw = await getBlockKramdownChecked(id);
  requireState(hash(attrs) === hash(Object.fromEntries(Object.entries(actual).filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)))) &&
    raw.id === id && raw.kramdown.replace(/\n\{:[^\n]*\}\s*$/, "").trim() === row.markdown);
  if (paragraph) requireState(row.type === "p" && ["p", "NodeParagraph"].includes(state.treeInfos[id]?.type) &&
    row.content === row.markdown && homepageMcpDiaryReviewContentSchema.shape.fields.element.shape.content.safeParse(row.markdown).success &&
    Object.keys(attrs).length === 1 && attrs.id === id && !(await getChildBlocksChecked(id)).length);
  return row;
}

async function readFieldState(docId: string, label: string, insertedId?: string) {
  const state = await readReviewState(docId, insertedId), mapping = state.config.templateFieldMapping;
  const active = getActiveReviewFields(mapping, "day");
  requireState(active.includes(label) && new Set(active.map(normalizeHeadingTitle)).size === active.length);
  const located = await findDayWorkspaceHeadingBlock(docId, "newTasks", state.config.headingStructure, mapping, state.top);
  const headings = located.headings, day = headings.find((h) => h.id === state.root.block.id)!;
  const endOf = (h: typeof day): number => headings.find((next) => next.index > h.index && next.level <= h.level)?.index ?? state.top.length;
  const reviews = headings.filter((h) => h.index > day.index && h.index < endOf(day) && headingTitleMatchesAliases(h.title, getFieldAliases(mapping, "reviewSections", "day", "reviewRoot")));
  requireState(reviews.length === 1 && reviews[0].level === day.level + 1);
  const review = reviews[0];
  const candidates = headings.filter((h) => h.index > review.index && h.index < endOf(review));
  const aliases = active.map((name, i) => getReviewFieldLookupAliases(mapping, "day", name, i));
  requireState(candidates.every((h) => aliases.filter((a) => headingTitleMatchesAliases(h.title, a)).length <= 1));
  const matches = candidates.filter((h) => headingTitleMatchesAliases(h.title, aliases[active.indexOf(label)]));
  requireState(matches.length === 1 && matches[0].level === review.level + 1 && aliases[active.indexOf(label)].some((a) => normalizeHeadingTitle(a) === matches[0].title));
  const field = matches[0], end = endOf(field), body = state.top.slice(field.index + 1, end);
  for (const heading of [review, field]) {
    const row = await checkedBlock(state, heading.id);
    requireState(row.type === "h" && row.subtype === `h${heading.level}` && row.markdown === `${"#".repeat(heading.level)} ${heading.title}`);
  }
  const loaded = await loadReviewContent(docId, "day", state.config.headingStructure, mapping);
  requireState(!loaded.reason && loaded.fields.filter((f) => f.label === label && !f.missing).length === 1);
  const otherFields = hash(loaded.fields.filter((f) => f.label !== label));
  return { ...state, review, field, body, end, boundaryId: state.top[end]?.id ?? null, loaded, otherFields };
}

async function prepareReviewContent(input: ContentInput) {
  const { label, content } = input.fields[0], state = await readFieldState(input.docId, label);
  requireState(state.body.length <= 1);
  const old = state.body.length ? await checkedBlock(state, state.body[0].id, true) : null;
  const oldContent = old?.markdown ?? "";
  requireState(state.loaded.fields.find((f) => f.label === label)!.content === oldContent);
  if (oldContent === content) throw new HomepageMcpDiaryTargetUnavailable("正文已经一致，无需修改，未生成确认。");
  const stateFingerprint = hash([state.fingerprint, state.loaded, label, old?.id ?? null, state.boundaryId]);
  let insertedId: string | undefined;
  const contentTarget: NonNullable<ToolRuntimeContext["diaryReviewContentTarget"]> = {
    docId: state.doc.id, notebookId: state.target.notebookId, date: state.target.date, period: "day", label, content,
    dayRootId: state.root.block.id, reviewRootId: state.review.id, headingBlockId: state.field.id, paragraphId: old?.id ?? null,
    oldContentFingerprint: hash(oldContent), boundaryId: state.boundaryId, completed: state.completed, stateFingerprint,
    readTarget: async () => { if ((await prepareReviewContent(input)).stateFingerprint !== stateFingerprint) throw new Error("diary_review_conflict"); },
    verifyInserted: async (id: string) => {
      if (insertedId || !/^\d{14}-[a-z0-9]{7}$/.test(id) || state.rows.some((row) => row.id === id)) throw new Error("review_insert_identity_invalid");
      insertedId = id;
      if (!await verifyReviewContent(prepared, true)) throw new Error("review_insert_result_unknown");
    },
  };
  const values = [state.doc.title!, state.doc.id, state.target.date, state.completed ? "已完成" : "未完成", state.review.title, state.review.id,
    label, state.field.id, old?.id ?? "无", oldContent || "（原字段为空）", content, "1"];
  const prepared = { contentTarget, state, stateFingerprint, insertedId: () => insertedId,
    preview: homepageMcpWritePreviewSchema.parse({ action: "manage_review", operationName: HOMEPAGE_MCP_DIARY_REVIEW_CONTENT.name,
      consequence: HOMEPAGE_MCP_DIARY_REVIEW_CONTENT.consequence, targetName: state.doc.title!, targetId: state.field.id, affectedCount: 1,
      details: HOMEPAGE_MCP_DIARY_REVIEW_CONTENT.labels.map((label, i) => ({ label, value: values[i] })) }) };
  return prepared;
}

async function verifyReviewContent(before: Awaited<ReturnType<typeof prepareReviewContent>>, inserted: boolean): Promise<boolean> {
  const id = before.insertedId(), target = before.contentTarget, state = before.state;
  if (!id) return false;
  const removedId = !inserted ? target.paragraphId : null;
  const insertionIndex = state.boundaryId ? state.end : state.field.index + 1;
  const expectedTop = state.top.map((block) => block.id);
  expectedTop.splice(insertionIndex, 0, id);
  const topIds = expectedTop.filter((oldId) => oldId !== removedId);
  const orders = { ...state.orders, [target.docId]: topIds };
  for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const after = await readFieldState(target.docId, target.label, id);
      const row = await checkedBlock(after, id, true);
      if (row.markdown !== target.content || after.rows.length !== state.rows.length + 1 - (removedId ? 1 : 0)) continue;
      requireState(after.root.raw === state.root.raw && after.completed === state.completed && hash(after.target) === hash(state.target) &&
        after.review.id === state.review.id && after.field.id === state.field.id && after.boundaryId === state.boundaryId &&
        after.otherFields === state.otherFields && after.indexes === state.indexes && after.quickRecordsId === state.quickRecordsId &&
        hash(after.top.map((block) => block.id)) === hash(topIds) && hash(after.orders) === hash(orders) &&
        state.rows.filter((old) => old.id !== removedId).every((old) => {
          const current = after.rows.find((r) => r.id === old.id);
          return !!current && rowFingerprint(current) === rowFingerprint(old) && after.parents[old.id] === state.parents[old.id];
        }) && hash(after.body.map((block) => block.id)) === hash(topIds.slice(topIds.indexOf(state.field.id) + 1,
          state.boundaryId ? topIds.indexOf(state.boundaryId) : topIds.length)));
      if (inserted && target.paragraphId) await checkedBlock(after, target.paragraphId, true);
      if (removedId) requireState(!after.rows.some((r) => r.id === removedId) && (await checkBlocksExist([removedId]))[removedId] === false);
      if (!inserted) requireState(after.body.length === 1 && after.body[0].id === id && after.loaded.fields.find((f) => f.label === target.label)!.content === target.content);
      return true;
    } catch { /* 插入或删除只发出一次；有限回读失败保留现场。 */ }
  }
  return false;
}
