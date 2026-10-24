import SHA256 from "crypto-js/sha256";
import { getBlockInfo, getBlockAttrsChecked, getBlockKramdownChecked, getBlockTreeInfos, getChildBlocksChecked, checkBlocksExist, SiyuanApiError } from "@/api";
import { readTaskIndexSnapshot } from "@/components/tools/siyuanComponentDataApi";
import { getEnhancedDiaryIndexEntriesStrict } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryIndex";
import { formatDiaryAttrDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { findDayWorkspaceHeadingBlock, extractOperationBlockIds, type EnhancedDiaryInsertResult } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { getDayWorkspaceSectionPathAliases, matchesRootHeadingWithMapping } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTemplateFieldMapping";
import { normalizeHeadingTitle } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryMarkdownSections";
import { buildWorkspaceTaskMigrationSourceMarkdown, buildWorkspaceTaskMigrationLogMarkdown, type WorkspaceTaskMigrationContext, type WorkspaceTaskMigrationObservation } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";
import { loadDataStrict } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import { HOMEPAGE_MCP_DIARY_TASK_MIGRATION, homepageMcpDiaryTaskMigrationSchema, homepageMcpWritePreviewSchema } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { readHomepageMcpDiaryDocumentState, readMutationTask, diaryAttributes, rowFingerprint, nativeOrders, HomepageMcpDiaryTargetUnavailable } from "./homepage-mcp-diary-task-write";

const hash = (value: unknown): string => SHA256(JSON.stringify(value)).toString();
const ID = /^\d{14}-[a-z0-9]{7}$/;
type State = Awaited<ReturnType<typeof readHomepageMcpDiaryDocumentState>>;
type Row = State["rows"][number];
const requireState = (valid: unknown): void => { if (!valid) throw new HomepageMcpDiaryTargetUnavailable("迁移来源、目标或索引无法可靠核对，未生成确认；请先通过强化日记工作台准备合法的现有任务列表。"); };
class MigrationVerificationFailure extends Error {
  constructor(reason: string, readonly conflict = false, readonly checks?: Record<string, boolean | number | string>) { super(reason); }
}
const same = (a: unknown, b: unknown): boolean => hash(a) === hash(b);
function localDate(value: string): Date {
  requireState(/^\d{8}$/.test(value));
  const date = new Date(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6));
  requireState(formatDiaryAttrDate(date) === value);
  return date;
}
async function logSection(state: State) {
  const found = await findDayWorkspaceHeadingBlock(state.doc.id, "taskLog", state.config.headingStructure, state.config.templateFieldMapping, state.top);
  requireState(found.found && found.heading);
  let parent = found.headings.find((h) => h.level === 1 && matchesRootHeadingWithMapping(h.title, "day", state.config.templateFieldMapping))!;
  for (const aliases of getDayWorkspaceSectionPathAliases(state.config.templateFieldMapping, "taskLog")) {
    const end = found.headings.find((h) => h.index > parent.index && h.level <= parent.level)?.index ?? state.top.length;
    const matches = found.headings.filter((h) => h.index > parent.index && h.index < end &&
      aliases.some((a) => normalizeHeadingTitle(h.title) === normalizeHeadingTitle(a)));
    requireState(matches.length === 1);
    parent = matches[0];
  }
  requireState(parent.id === found.heading!.id);
  const migrated = await findDayWorkspaceHeadingBlock(state.doc.id, "migratedTasks", state.config.headingStructure, state.config.templateFieldMapping, state.top);
  const end = found.headings.find((h) => h.index > parent.index && h.level <= parent.level)?.index ?? state.top.length;
  const migrationEnd = found.headings.find((h) => h.index > migrated.heading!.index && h.level <= migrated.heading!.level)?.index ?? state.top.length;
  requireState(parent.index >= migrationEnd || migrated.heading!.index >= end);
  return { headingId: parent.id, end, boundaryId: state.top[end]?.id ?? null };
}
async function auxiliaryState() {
  const results = await Promise.all(["enhanced-diary-project-index.json", "enhanced-diary-project-record-index.json"].map(async (key) => {
    const read = await loadDataStrict<Record<string, unknown>>(key);
    requireState(read.status === "ok" && read.data && !Array.isArray(read.data));
    if (read.status !== "ok") throw new Error("migration_index_unreadable");
    const { updatedAt: _updatedAt, ...business } = read.data;
    requireState(JSON.stringify(business).length <= 1_000_000);
    return business;
  }));
  return hash(results);
}
function aggregateUnchanged(before: Row, after: Row, children: Row[]): boolean {
  return rowFingerprint(before, true) === rowFingerprint(after, true) &&
    after.content === children.map((row) => row.content).join("") &&
    [children.map((row) => row.markdown).join("\n"), children.map((row) => row.markdown).join("\n\n")].includes(after.markdown);
}
function indexBusiness(item: object): unknown {
  const { updated: _updated, indexedAt: _indexedAt, lastVerifiedAt: _verified, source: _source, ...rest } = item as Record<string, unknown>;
  if (typeof rest.ial === "string") rest.ial = diaryAttributes(rest.ial);
  return rest;
}

export async function prepareHomepageMcpDiaryMigrationWrite(args: Record<string, unknown>) {
  const input = homepageMcpDiaryTaskMigrationSchema.parse(args), blockId = input.target.blockId;
  const today = formatDiaryAttrDate(new Date());
  const info = await getBlockInfo(blockId);
  requireState(info && ID.test(info.rootID) && ID.test(info.box));
  // 历史身份先由真实块和严格日记索引建立，不能从任务名称或今天的任务快照推断。
  const entries = await getEnhancedDiaryIndexEntriesStrict(info.box);
  const sources = Object.entries(entries).filter(([, entry]) => entry.id === info.rootID);
  requireState(sources.length === 1 && sources[0][0] < today);
  const sourceDate = sources[0][0];
  const source = await readHomepageMcpDiaryDocumentState(localDate(sourceDate), "newTasks");
  const target = await readHomepageMcpDiaryDocumentState(localDate(today), "migratedTasks");
  requireState(source.doc.id === info.rootID && source.target.notebookId === info.box &&
    target.target.notebookId === info.box && source.doc.id !== target.doc.id &&
    same(source.config, target.config) && formatDiaryAttrDate(new Date()) === today);
  const mutation = await readMutationTask(source, blockId);
  requireState(!mutation.task.completed && sourceDate < today && !Array.from(source.doc.title!).some((char) => char === '"' || char.charCodeAt(0) === 92 || char.charCodeAt(0) < 32));
  const sourceListId = source.parents[blockId], sourceChildren = source.listChildren[sourceListId];
  requireState(sourceChildren?.length >= 2 && sourceChildren.every((id) => source.tasks.some((task) => task.id === id)));
  const section = await findDayWorkspaceHeadingBlock(target.doc.id, "migratedTasks", target.config.headingStructure, target.config.templateFieldMapping, target.top);
  const end = section.headings.find((h) => h.index > section.heading!.index && h.level <= section.heading!.level)?.index ?? target.top.length;
  const tail = target.top[end - 1];
  requireState(tail?.type === "l" && target.parents[tail.id] === target.doc.id);
  const targetChildren = target.listChildren[tail.id];
  requireState(targetChildren?.length && targetChildren.every((id) => target.tasks.some((task) => task.id === id)));
  requireState(aggregateUnchanged(source.rows.find((row) => row.id === sourceListId)!, source.rows.find((row) => row.id === sourceListId)!, sourceChildren.map((id) => source.rows.find((row) => row.id === id)!)) &&
    aggregateUnchanged(target.rows.find((row) => row.id === tail.id)!, target.rows.find((row) => row.id === tail.id)!, targetChildren.map((id) => target.rows.find((row) => row.id === id)!)));
  const previousTaskItemId = targetChildren[targetChildren.length - 1];
  requireState(target.treeInfos[previousTaskItemId]?.nextID === "" &&
    targetChildren.every((id) => target.parents[id] === tail.id &&
      !/siyuan-homepage migration anchor/.test(String(target.rows.find((row) => row.id === id)?.markdown))));
  const task = { ...mutation.task, sourceDate: sourceDate.slice(0, 4) + "-" + sourceDate.slice(4, 6) + "-" + sourceDate.slice(6),
    sourceDocId: source.doc.id, sourceDocTitle: source.doc.title!, isTodayTask: false, shouldMigrate: true };
  const log = await logSection(target), logMarkdown = buildWorkspaceTaskMigrationLogMarkdown(task);
  const index = await readTaskIndexSnapshot();
  requireState(index.fileExists && index.items.length <= 10_000);
  const auxiliary = await auxiliaryState();
  const sourceOrders = nativeOrders(source), targetOrders = nativeOrders(target);
  const stateFingerprint = hash([source.stateFingerprint, target.stateFingerprint, index.items, auxiliary, log]);
  const preview = homepageMcpWritePreviewSchema.parse({
    action: "manage_task", operationName: HOMEPAGE_MCP_DIARY_TASK_MIGRATION.name,
    consequence: HOMEPAGE_MCP_DIARY_TASK_MIGRATION.consequence, targetName: task.taskname, targetId: blockId, affectedCount: 1,
    details: [
      { label: "来源日记标题", value: source.doc.title! }, { label: "来源 docId", value: source.doc.id },
      { label: "来源日期", value: sourceDate }, { label: "任务 blockId", value: blockId },
      { label: "任务完整名称", value: task.taskname }, { label: "当前状态", value: "未完成" }, { label: "来源列表 ID", value: sourceListId },
      { label: "目标日记标题", value: target.doc.title! }, { label: "目标 docId", value: target.doc.id },
      { label: "目标日期", value: today }, { label: "迁移区域 headingId", value: target.target.headingId },
      { label: "目标列表 ID", value: tail.id }, { label: "插入位置", value: "现有末尾任务 " + previousTaskItemId + " 之后" },
      { label: "将追加的来源信息", value: buildWorkspaceTaskMigrationSourceMarkdown(task).replace(/\n/g, "；").replace(/迁移时间：\d{2}:\d{2}$/, "迁移时间：实际执行时生成") },
      { label: "将新增的任务日志", value: logMarkdown }, { label: "执行风险", value: HOMEPAGE_MCP_DIARY_TASK_MIGRATION.consequence },
    ],
  });
  type SourceReceipt = { rootId: string; ids: string[]; markdown: string; startedAt: number };
  type LogReceipt = { rootId: string; ids: string[] };
  let sourceReceipt: SourceReceipt | undefined, logReceipt: LogReceipt | undefined;
  let complete = false, stage = 0;
  const movedIds = [blockId, mutation.paragraphId];
  async function addedBlocks(state: State, old: State, rootId: string, markdown: string, provenance: boolean, excludedIds: string[] = []) {
    const added = state.rows.filter((row) => !old.rows.some((before) => before.id === row.id) && !movedIds.includes(row.id) && !excludedIds.includes(row.id));
    const expectedCount = provenance ? 5 : 3, expectedParent = provenance ? blockId : target.doc.id;
    const checks = { rootVisible: false, sqlCount: added.length, nativeCount: 0, expectedCount, parentMatches: false, structureComplete: false };
    const receiptCheck = (valid: unknown, reason: string, conflict = false): void => {
      if (!valid) throw new MigrationVerificationFailure(reason, conflict, { ...checks });
    };
    receiptCheck(added.length <= expectedCount, "receipt_unexpected_extra_blocks", true);
    try {
      receiptCheck((await checkBlocksExist([rootId]))[rootId], "receipt_root_not_visible");
      checks.rootVisible = true;
      const info = await getBlockInfo(rootId);
      receiptCheck(typeof info?.rootID === "string", "receipt_root_not_visible");
      receiptCheck(info.rootID === target.doc.id, "receipt_root_document_mismatch", true);
      const nativeItems = await getChildBlocksChecked(rootId), nativeIds = [rootId, ...nativeItems.map((item) => item.id)];
      const lines = markdown.split("\n");
      receiptCheck(nativeItems.length <= lines.length && new Set(nativeIds).size === nativeIds.length, "receipt_unexpected_extra_blocks", true);
      for (const item of nativeItems) {
        const paragraphs = await getChildBlocksChecked(item.id);
        receiptCheck(paragraphs.length <= 1, "receipt_unexpected_extra_blocks", true);
        nativeIds.push(...paragraphs.map((row) => row.id));
      }
      checks.nativeCount = nativeIds.length;
      const tree = await getBlockTreeInfos(nativeIds), root = tree[rootId];
      receiptCheck(root?.id === rootId && typeof root.parentID === "string", "receipt_native_tree_pending");
      checks.parentMatches = root!.parentID === expectedParent;
      receiptCheck(checks.parentMatches, "receipt_root_parent_mismatch", true);
      receiptCheck(root!.type === "NodeList" && root!.parentType === (provenance ? "NodeListItem" : "NodeDocument"), "receipt_structure_mismatch", true);
      receiptCheck(nativeIds.length === expectedCount && nativeIds.every((id) => tree[id]?.id === id), "receipt_native_tree_pending");
      receiptCheck(added.length === expectedCount && added.some((row) => row.id === rootId), "receipt_sql_rows_pending");
      receiptCheck(same(nativeIds.slice().sort(), added.map((row) => row.id).sort()), "receipt_structure_mismatch", true);
      const raw = await getBlockKramdownChecked(rootId), attrIds: string[] = [];
      receiptCheck(raw.id === rootId && typeof raw.kramdown === "string" && raw.kramdown.length <= 65_536, "receipt_structure_mismatch", true);
      const nativeMarkdown = raw.kramdown.replace(/\{:[^\n]*?\}/g, (ial) => {
        const attrs = diaryAttributes(ial);
        receiptCheck(Object.keys(attrs).length === 1 && nativeIds.includes(attrs.id), "receipt_attributes_mismatch", true);
        attrIds.push(attrs.id);
        return "";
      }).split(/\r?\n/).filter((line) => line.trim()).join("\n");
      receiptCheck(same(attrIds.slice().sort(), nativeIds.slice().sort()), "receipt_structure_mismatch", true);
      receiptCheck(nativeMarkdown === markdown, "receipt_content_mismatch", true);
      const list = added.find((row) => row.id === rootId && row.type === "l");
      const items = added.filter((row) => state.parents[row.id] === rootId), ordered = nativeOrders(state)[rootId];
      receiptCheck(list && ordered?.length === lines.length && items.length === lines.length &&
        list.markdown === markdown && state.parents[rootId] === expectedParent && same(ordered, nativeItems.map((row) => row.id)), "receipt_sql_rows_pending");
      for (let i = 0; i < lines.length; i++) {
        const item = items.find((row) => row.id === ordered[i]), paragraphs = added.filter((row) => state.parents[row.id] === item?.id);
        const body = lines[i].slice(2), content = provenance && i === 0 ? "迁移来源：" + task.sourceDocTitle : body;
        receiptCheck(item?.type === "i" && item.subtype !== "t" && item.markdown === lines[i] && item.content === " " + content &&
          paragraphs.length === 1 && paragraphs[0].type === "p" && paragraphs[0].markdown === body && paragraphs[0].content === content &&
          !state.rows.some((row) => state.parents[row.id] === paragraphs[0].id), "receipt_sql_rows_pending");
      }
      receiptCheck(list!.content === ordered.map((id) => items.find((row) => row.id === id)!.content).join(""), "receipt_sql_rows_pending");
      for (const row of added) {
        const native = tree[row.id];
        receiptCheck(native?.id === row.id && native.parentID === state.parents[row.id] &&
          native.type === (row.type === "l" ? "NodeList" : row.type === "i" ? "NodeListItem" : "NodeParagraph"), "receipt_native_tree_pending");
        const attrs = diaryAttributes(row.ial), actual = Object.fromEntries(Object.entries(await getBlockAttrsChecked(row.id))
          .filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)));
        receiptCheck(Object.keys(attrs).length === 1 && attrs.id === row.id && same(attrs, actual), "receipt_attributes_mismatch", true);
      }
      checks.structureComplete = true;
      return { ids: added.map((row) => row.id), checks };
    } catch (error) {
      if (error instanceof MigrationVerificationFailure) throw error;
      if (error instanceof SiyuanApiError) throw new MigrationVerificationFailure("receipt_read_api_failed", false, { ...checks, api: error.url || "unknown", apiCode: error.siyuanCode });
      if (error instanceof Error && error.message === "diary_attributes_invalid") throw new MigrationVerificationFailure("receipt_attributes_mismatch", true, { ...checks });
      throw new MigrationVerificationFailure("receipt_native_tree_pending", false, { ...checks });
    }
  }
  async function validate(stageNumber: number, sourceReceipt?: SourceReceipt, logReceipt?: LogReceipt) {
    const ensure = (valid: unknown, reason: string, conflict = false, checks?: Record<string, boolean | number | string>): void => {
      if (!valid) throw new MigrationVerificationFailure(reason, conflict, checks);
    };
    ensure(formatDiaryAttrDate(new Date()) === today, "date_changed", true);
    // 等待同轮并行读取收束后才重查；超时后的旧读取不保存回执或推进阶段。
    const reads = await Promise.allSettled([
      readHomepageMcpDiaryDocumentState(localDate(sourceDate), "newTasks"),
      readHomepageMcpDiaryDocumentState(localDate(today), "migratedTasks", stageNumber === 1 ? sourceReceipt?.rootId : stageNumber === 2 ? logReceipt?.rootId : undefined),
      getBlockInfo(blockId),
    ] as const);
    for (const read of reads) if (read.status === "rejected") throw read.reason;
    const [s, t, actualInfo] = reads.map((read) => { if (read.status === "rejected") throw read.reason; return read.value; }) as [State, State, Awaited<ReturnType<typeof getBlockInfo>>];
    ensure(actualInfo && typeof actualInfo.rootID === "string", "snapshot_incomplete");
    ensure(actualInfo.rootID === target.doc.id, "root_mismatch", actualInfo.rootID !== source.doc.id);
    const nativeTask = t.treeInfos[blockId], nativeList = t.treeInfos[tail.id];
    ensure(nativeTask?.id === blockId, "task_identity_missing");
    ensure(nativeTask.type === "NodeListItem", "task_type_mismatch", true, { actualType: String(nativeTask.type).slice(0, 32) });
    ensure(nativeTask.parentID === tail.id && nativeTask.parentType === "NodeList", "target_parent_mismatch",
      !!nativeTask.parentID && nativeTask.parentID !== sourceListId && nativeTask.parentID !== tail.id);
    ensure(nativeList?.type === "NodeList" && nativeList.parentID === target.doc.id && nativeList.parentType === "NodeDocument", "target_list_mismatch", true);
    const previous = t.treeInfos[previousTaskItemId];
    ensure(previous?.type === "NodeListItem" && previous.parentID === tail.id && previous.parentType === "NodeList", "previous_task_parent_mismatch", true);
    const sourceMembers = s.listChildren[sourceListId], targetMembers = t.listChildren[tail.id];
    ensure(Array.isArray(sourceMembers) && Array.isArray(targetMembers), "snapshot_incomplete");
    ensure(!sourceMembers.includes(blockId), "source_still_contains_task");
    const occurrences = targetMembers.filter((id) => id === blockId).length;
    ensure(occurrences === 1, occurrences ? "target_duplicate_task" : "target_missing_task");
    ensure(same(targetMembers, [...targetChildren, blockId]), "target_order_mismatch");
    ensure(same(sourceMembers, sourceChildren.filter((id) => id !== blockId)), "source_order_mismatch");
    ensure(same(s.target, source.target) && same(t.target, target.target), "document_identity_changed", true);
    ensure(await auxiliaryState() === auxiliary, "auxiliary_data_changed", true);
    let extraLog: string[] = [], receiptChecks: Record<string, boolean | number | string> = {};
    if (logReceipt) {
      const prior = { ...target, rows: [...target.rows, ...t.rows.filter((row) => sourceReceipt!.ids.includes(row.id))] };
      const verified = await addedBlocks(t, prior, logReceipt.rootId, logMarkdown, false);
      extraLog = verified.ids; receiptChecks = verified.checks;
    }
    const verifiedSource = sourceReceipt ? await addedBlocks(t, target, sourceReceipt.rootId, sourceReceipt.markdown, true, extraLog) : undefined;
    const extraSource = verifiedSource?.ids ?? [];
    if (stageNumber === 1 && verifiedSource) receiptChecks = verifiedSource.checks;
    if (sourceReceipt?.ids.length) ensure(same(extraSource.slice().sort(), sourceReceipt.ids.slice().sort()), "source_receipt_changed", true);
    if (logReceipt?.ids.length) ensure(same(extraLog.slice().sort(), logReceipt.ids.slice().sort()), "log_receipt_changed", true);
    ensure(same(await logSection(t), { ...log, end: log.end + (logReceipt ? 1 : 0) }), "log_scope_changed", true);
    const expectedTargetIds = [...target.rows.map((row) => row.id), ...movedIds, ...extraSource, ...extraLog].sort();
    ensure(same(s.rows.map((row) => row.id).sort(), source.rows.filter((row) => !movedIds.includes(row.id)).map((row) => row.id).sort()), "source_block_set_mismatch");
    ensure(same(t.rows.map((row) => row.id).sort(), expectedTargetIds), "target_block_set_mismatch");
    const moved = t.rows.find((row) => row.id === blockId)!, paragraph = t.rows.find((row) => row.id === mutation.paragraphId)!;
    const old = source.rows.find((row) => row.id === blockId)!, oldParagraph = source.rows.find((row) => row.id === mutation.paragraphId)!;
    const docRow = target.rows.find((row) => row.id === target.doc.id)!;
    const relocation = { root_id: target.doc.id, path: docRow.path, hpath: docRow.hpath };
    const expected: Row = { ...old, ...relocation, parent_id: tail.id };
    if (sourceReceipt) {
      expected.markdown = old.markdown + "\n\n" + sourceReceipt.markdown.split("\n").map((line) => "  " + line).join("\n");
      expected.content = String(old.content) + " 迁移来源：" + task.sourceDocTitle + " 迁移时间：" + sourceReceipt.markdown.split("迁移时间：")[1];
    }
    ensure(rowFingerprint(moved) === rowFingerprint(expected), "task_content_or_attributes_changed", true);
    ensure(rowFingerprint(paragraph) === rowFingerprint({ ...oldParagraph, ...relocation }), "task_paragraph_changed", true);
    ensure(t.parents[blockId] === tail.id && t.parents[mutation.paragraphId] === blockId, "task_children_parent_mismatch", true);
    for (const [oldState, current, listId] of [[source, s, sourceListId], [target, t, tail.id]] as const) {
      for (const row of oldState.rows) {
        if (movedIds.includes(row.id)) continue;
        const after = current.rows.find((item) => item.id === row.id)!;
        ensure(after && current.parents[row.id] === oldState.parents[row.id], "unrelated_block_parent_changed", true, { sourceDocument: oldState === source });
        if (row.id === listId) ensure(rowFingerprint(row, true) === rowFingerprint(after, true), "list_attributes_changed", true);
        else ensure(rowFingerprint(row) === rowFingerprint(after), "unrelated_block_changed", true, { sourceDocument: oldState === source });
      }
    }
    for (const [oldState, current, listId] of [[source, s, sourceListId], [target, t, tail.id]] as const) {
      const before = oldState.rows.find((row) => row.id === listId)!, after = current.rows.find((row) => row.id === listId)!;
      const children = current.listChildren[listId].map((id) => current.rows.find((item) => item.id === id)!);
      ensure(aggregateUnchanged(before, after, children), oldState === source ? "source_list_aggregate_mismatch" : "target_list_aggregate_mismatch");
    }
    const expectedSourceOrders = { ...sourceOrders };
    delete expectedSourceOrders[blockId];
    expectedSourceOrders[sourceListId] = sourceOrders[sourceListId].filter((id) => id !== blockId);
    const expectedTargetOrders = { ...targetOrders, [tail.id]: [...targetChildren, blockId], [blockId]: [mutation.paragraphId, ...(sourceReceipt ? [sourceReceipt.rootId] : [])] };
    if (logReceipt) {
      const docOrder = [...targetOrders[target.doc.id]], next = log.boundaryId ? docOrder.indexOf(log.boundaryId) : docOrder.length;
      docOrder.splice(next, 0, logReceipt.rootId); expectedTargetOrders[target.doc.id] = docOrder;
    }
    const ordered = nativeOrders(t);
    for (const id of [...extraSource, ...extraLog]) if (ordered[id]) expectedTargetOrders[id] = ordered[id];
    ensure(same(nativeOrders(s), expectedSourceOrders), "source_native_order_mismatch");
    ensure(same(Object.entries(ordered).sort(), Object.entries(expectedTargetOrders).sort()), "target_native_order_mismatch");
    ensure(same(s.top.map((r) => r.id), source.top.map((r) => r.id)), "source_top_order_changed", true);
    const expectedTop = target.top.map((r) => r.id);
    if (logReceipt) expectedTop.splice(log.end, 0, logReceipt.rootId);
    ensure(same(t.top.map((r) => r.id), expectedTop), "target_top_order_changed", true);
    const after = await readTaskIndexSnapshot();
    ensure(after.fileExists, "task_index_unreadable");
    if (stageNumber === 3) {
      ensure(after.items.length === index.items.length, "task_index_count_changed", true);
      for (const item of index.items) {
        const current = after.items.filter((row) => row.id === item.id);
        ensure(current.length === 1, "task_index_identity_changed", true);
        if (item.id === blockId) {
          const value = current[0];
          ensure((value.root_id || value.rootID) === target.doc.id && (!value.root_id || value.root_id === target.doc.id) &&
            (!value.rootID || value.rootID === target.doc.id) && (value.parent_id || value.parentID) === tail.id &&
            value.markdown === moved.markdown && value.content === moved.content && value.checked === false &&
            value.box === target.target.notebookId && !value.projectTargetId && !value.hiddenProjectTargetId && !value.visibleProjectTargetId, "moved_task_index_mismatch");
        } else ensure(same(indexBusiness(item), indexBusiness(current[0])), "unrelated_task_index_changed", true);
      }
    }
    const indexed = after.items.filter((item) => item.id === blockId);
    return { sourceReceipt: sourceReceipt ? { ...sourceReceipt, ids: extraSource } : undefined, logReceipt: logReceipt ? { ...logReceipt, ids: extraLog } : undefined,
      checks: { ...receiptChecks, rootMatches: true, parentMatches: true, sourceAbsent: true, targetOnce: true, memberOrderMatches: true,
      taskBodyAndAttributesMatch: true, otherBlocksMatch: true, indexAlreadyMoved: indexed.length === 1 && (indexed[0].root_id || indexed[0].rootID) === target.doc.id } };
  }
  async function check(stageNumber: number, candidateSource = sourceReceipt, candidateLog = logReceipt) {
    const phase = ["D", "F", "H", "J"][stageNumber], deadline = Date.now() + (stageNumber === 0 ? 12_000 : 20_000);
    const waits = stageNumber === 1 || stageNumber === 2 ? [0, 100, 250, 500, 1000, 1500, 2000] : [0, 100, 250, 500, 1000];
    for (const [attempt, wait] of waits.entries()) {
      if (Date.now() + wait >= deadline) break;
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const verified = await Promise.race([validate(stageNumber, candidateSource, candidateLog), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new MigrationVerificationFailure("read_deadline_exceeded")), Math.max(1, deadline - Date.now()));
        })]);
        context.observe({ phase, reason: "verified", state: "verified", attempt: attempt + 1, checks: verified.checks });
        return verified;
      } catch (error) {
        const reason = error instanceof MigrationVerificationFailure ? error.message : error instanceof SiyuanApiError ? "read_api_failed" :
          error instanceof Error && /^(diary_[a-z_]+|new_tasks_[a-z_]+)$/.test(error.message) ? error.message : "snapshot_incomplete";
        const conflict = error instanceof MigrationVerificationFailure && error.conflict;
        context.observe({ phase, reason, state: conflict ? "conflict" : "incomplete", attempt: attempt + 1,
          checks: error instanceof MigrationVerificationFailure ? error.checks : error instanceof SiyuanApiError ? { api: error.url || "unknown", apiCode: error.siyuanCode ?? -1 } : undefined });
        if (conflict || Date.now() >= deadline) return false;
      } finally { if (timer !== undefined) clearTimeout(timer); }
    }
    return false;
  }
  const diagnostics: WorkspaceTaskMigrationObservation[] = [], startedAt = Date.now();
  const context: WorkspaceTaskMigrationContext = {
    diagnostics,
    observe: (observation) => {
      // 只保留本次调用的有界结构摘要，不保存正文、凭据或完整路径。
      if (diagnostics.length === 64) diagnostics.splice(1, 1);
      diagnostics.push({ ...observation, elapsedMs: Date.now() - startedAt });
    },
    sourceDocId: source.doc.id, sourceNotebookId: info.box, sourceDate, blockId, sourceListId,
    targetDocId: target.doc.id, targetDate: today, headingId: target.target.headingId, targetListId: tail.id,
    previousTaskItemId, taskLogHeadingId: log.headingId, sourceFingerprint: source.stateFingerprint, targetFingerprint: target.stateFingerprint,
    readTask: async () => {
      requireState(stage === 0);
      const current = await prepareHomepageMcpDiaryMigrationWrite(args);
      requireState(current.stateFingerprint === stateFingerprint);
      return task;
    },
    verifyMove: async () => { if (stage !== 0 || !await check(0)) return false; stage = 1; return true; },
    verifySource: async (operations, markdown, startedAt) => {
      context.observe({ phase: "F", reason: "source_receipt_read_started" });
      if (stage !== 1 || formatDiaryAttrDate(new Date(startedAt)) !== today || formatDiaryAttrDate(new Date()) !== today ||
        Date.now() < startedAt || Date.now() - startedAt > 30_000 || markdown !== buildWorkspaceTaskMigrationSourceMarkdown(task, new Date(startedAt))) return false;
      const ids = extractOperationBlockIds(operations);
      if (ids.length !== 1) return false;
      if (!ID.test(ids[0])) return false;
      const verified = await check(1, { rootId: ids[0], ids: [], markdown, startedAt });
      if (!verified) return false;
      sourceReceipt = verified.sourceReceipt;
      stage = 2; return true;
    },
    verifyLog: async (result: EnhancedDiaryInsertResult) => {
      context.observe({ phase: "H", reason: "log_receipt_read_started" });
      if (stage !== 2 || !result.ok || result.blockIds?.length !== 1) return false;
      if (!ID.test(result.blockIds[0])) return false;
      const verified = await check(2, sourceReceipt, { rootId: result.blockIds[0], ids: [] });
      if (!verified) return false;
      logReceipt = verified.logReceipt;
      stage = 3; return true;
    },
    verifyFinal: async () => { complete = stage === 3 && !!await check(3); return complete; },
  };
  return { preview, stateFingerprint, context, isComplete: () => complete };
}