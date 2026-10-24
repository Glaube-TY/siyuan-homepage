import SHA256 from "crypto-js/sha256";
import { checkBlocksExist, getBlockAttrsChecked, getBlockKramdownChecked, getBlockTreeInfos, getChildBlocksChecked, sqlChecked } from "@/api";
import { readTaskIndexSnapshot } from "@/components/tools/siyuanComponentDataApi";
import { normalizeEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { formatDiaryAttrDate, lookupDiaryDocumentForDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { findDayWorkspaceHeadingBlock, type EnhancedDiaryInsertResult } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { getDayWorkspaceSectionPathAliases, matchesRootHeadingWithMapping } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTemplateFieldMapping";
import { normalizeHeadingTitle } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryMarkdownSections";
import { ENHANCED_DIARY_CONFIG_FILE } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import { loadDataStrict } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import type { ToolRuntimeContext } from "@/features/kb/services/agent-workbench/contracts/tool-contract";
import { generateTaskLine, parseTaskLine } from "@/features/task-data/task-parser";
import { HOMEPAGE_MCP_DIARY_TASK_WRITES, HOMEPAGE_MCP_DIARY_TASK_MUTATIONS, HOMEPAGE_MCP_DIARY_TASK_DELETE_WARNING, HOMEPAGE_MCP_DIARY_TASK_LOG_DELETE, homepageMcpDiaryTaskWriteSchema, type HomepageMcpWritePreview } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { buildWorkspaceTaskDeletionLogMarkdown, type EnhancedDiaryWorkspaceTask } from "@/components/utils/widgetBlock/widget/enhancedDiary/workspace/enhancedDiaryWorkspaceTaskService";

const ID = /^\d{14}-[a-z0-9]{7}$/;
const MAX_BLOCKS = 1000;
const hash = (value: unknown): string => SHA256(JSON.stringify(value)).toString();
type Row = Record<string, unknown> & { id: string; type: string; parent_id: string; markdown: string; ial: string };

export class HomepageMcpDiaryTargetUnavailable extends Error {}

export interface PreparedDiaryTaskWrite {
  preview: HomepageMcpWritePreview;
  stateFingerprint: string;
  target: NonNullable<ToolRuntimeContext["diaryTaskCreateTarget"]>;
  rows: Array<{ id: string; fingerprint: string; listFingerprint: string }>;
  topIds: string[];
  listChildren: Record<string, string[]>;
  parents: Record<string, string>;
  orders?: Record<string, string[]>;
  mutation?: { task: EnhancedDiaryWorkspaceTask; paragraphId: string; expectedLine: string; indexFingerprint: string };
  deletion?: { listId: string; expectedListFingerprint: string };
  loggedDeletion?: { headingId: string; boundaryId: string | null; insertionIndex: number; markdown: string; markdownFingerprint: string; after?: PreparedDiaryTaskWrite };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function diaryAttributes(ial: string): Record<string, string> {
  let remaining = /^\{:\s*([\s\S]*?)\s*\}$/.exec(ial)?.[1];
  if (remaining === undefined) throw new Error("diary_attributes_invalid");
  const attributes = new Map<string, string>();
  while (remaining) {
    const match = /^([^\s={}"]+)="([^"]*)"(?:\s+|$)/.exec(remaining);
    if (!match || attributes.has(match[1])) throw new Error("diary_attributes_invalid");
    attributes.set(match[1], match[2]);
    remaining = remaining.slice(match[0].length);
  }
  attributes.delete("updated");
  return Object.fromEntries([...attributes].sort(([a], [b]) => a.localeCompare(b)));
}

function rowFingerprint(row: Row, list = false): string {
  // updated/hash/长度和 SQL sort 是内核派生值；实际子块顺序另行核对。
  const { updated: _updated, hash: _hash, length: _length, fcontent: _fcontent, sort: _sort, ...business } = row;
  business.ial = JSON.stringify(diaryAttributes(row.ial));
  if (list) { delete business.content; delete business.markdown; }
  return hash(business);
}

async function readState(expectedBlockId?: string) {
  const stored = await loadDataStrict<Record<string, unknown>>(ENHANCED_DIARY_CONFIG_FILE);
  if (stored.status !== "ok" || !record(stored.data) || typeof stored.data.dailyNotebookId !== "string" || !ID.test(stored.data.dailyNotebookId)) {
    throw new HomepageMcpDiaryTargetUnavailable("请先正确配置强化日记笔记本，未生成写入确认。");
  }
  const config = normalizeEnhancedDiaryConfig(stored.data);
  for (const key of ["headingStructure", "templateFieldMapping"] as const) {
    if (stored.data[key] !== undefined && hash(stored.data[key]) !== hash(config[key])) throw new Error("diary_config_invalid");
  }
  const now = new Date();
  const date = formatDiaryAttrDate(now);
  const lookup = await lookupDiaryDocumentForDate(now, config.dailyNotebookId, { strictIndexRead: true, pruneStale: false });
  if (lookup.status !== "exists") throw new HomepageMcpDiaryTargetUnavailable(lookup.status === "missing"
    ? "请先在强化日记工作台创建今日日记，MCP 不会自动创建日记。" : "今日日记无法可靠读取，未生成写入确认。");
  const doc = lookup.doc;
  if (!ID.test(doc.id) || !doc.title || doc.content.length > 1_000_000) throw new Error("diary_unbounded");
  const top = await getChildBlocksChecked(doc.id);
  if (top.length > MAX_BLOCKS || new Set(top.map((block) => block.id)).size !== top.length) throw new Error("diary_structure_invalid");
  const located = await findDayWorkspaceHeadingBlock(doc.id, "newTasks", config.headingStructure, config.templateFieldMapping, top);
  if (!located.found || !located.heading) throw new Error("new_tasks_missing");
  const roots = located.headings.filter((heading) => heading.level === 1 && matchesRootHeadingWithMapping(heading.title, "day", config.templateFieldMapping));
  if (roots.length !== 1) throw new Error("diary_root_ambiguous");
  let parent = roots[0];
  for (const aliases of getDayWorkspaceSectionPathAliases(config.templateFieldMapping, "newTasks")) {
    const boundary = located.headings.find((heading) => heading.index > parent.index && heading.level <= parent.level)?.index ?? top.length;
    const matches = located.headings.filter((heading) => heading.index > parent.index && heading.index < boundary && aliases.some((alias) => {
      const title = normalizeHeadingTitle(heading.title), expected = normalizeHeadingTitle(alias);
      return title === expected || title.startsWith(expected + " ");
    }));
    if (matches.length !== 1) throw new Error("new_tasks_ambiguous");
    parent = matches[0];
  }
  if (parent.id !== located.heading.id) throw new Error("new_tasks_scope_invalid");
  const end = located.headings.find((heading) => heading.index > parent.index && heading.level <= parent.level)?.index ?? top.length;
  const sectionIds = new Set(top.slice(parent.index + 1, end).map((block) => block.id));
  const readRows = () => sqlChecked(`select * from blocks where root_id='${doc.id}' order by id limit ${MAX_BLOCKS + 1}`) as Promise<Row[]>;
  let rows = await readRows();
  if (expectedBlockId) {
    // 原生插入先对块树可见，SQL 索引稍后提交；只有限回读，绝不重放写入。
    for (const wait of [100, 250, 500, 1000, 1500, 2000]) {
      if (rows.some((row) => row.id === expectedBlockId) && top.every((block) => rows.some((row) => row.id === block.id))) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
      rows = await readRows();
    }
  }
  if (!rows.length || rows.length > MAX_BLOCKS || JSON.stringify(rows).length > 1_000_000 ||
    new Set(rows.map((row) => row.id)).size !== rows.length || rows.some((row) => !ID.test(row.id) || row.root_id !== doc.id ||
      row.box !== config.dailyNotebookId || typeof row.type !== "string" || typeof row.parent_id !== "string" ||
      typeof row.markdown !== "string" || typeof row.ial !== "string") || rows.filter((row) => row.type === "d" && row.id === doc.id).length !== 1 ||
    top.some((block) => !rows.some((row) => row.id === block.id))) throw new Error("diary_rows_invalid");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const treeInfos = await getBlockTreeInfos(rows.map((row) => row.id));
  const parents: Record<string, string> = {};
  for (const row of rows) {
    const info = treeInfos[row.id];
    if (!info?.type || info.id !== row.id || typeof info.parentID !== "string") throw new Error("diary_tree_not_current");
    parents[row.id] = info.parentID;
  }
  if (parents[doc.id] !== "" || top.some((block) => parents[block.id] !== doc.id)) throw new Error("diary_tree_scope_invalid");
  for (const row of rows) {
    let id = row.id;
    const seen = new Set<string>();
    while (id !== doc.id) {
      if (seen.has(id) || !byId.has(id) || !parents[id]) throw new Error("diary_tree_scope_invalid");
      seen.add(id);
      id = parents[id];
    }
  }
  const inSection = (row: Row): boolean => {
    const visited = new Set<string>();
    let current: Row | undefined = row;
    while (current && !visited.has(current.id)) {
      if (sectionIds.has(current.id)) return true;
      visited.add(current.id);
      current = byId.get(current.parent_id);
    }
    return false;
  };
  const tasks = rows.filter((row) => row.type === "i" && row.subtype === "t" && inSection(row));
  const listChildren: Record<string, string[]> = {};
  for (const row of rows.filter((row) => row.type === "l" && inSection(row))) {
    const children = await getChildBlocksChecked(row.id);
    if (children.length > MAX_BLOCKS || children.some((child) => byId.get(child.id)?.parent_id !== row.id)) throw new Error("diary_list_invalid");
    listChildren[row.id] = children.map((child) => child.id);
  }
  if (date !== formatDiaryAttrDate(new Date())) throw new Error("diary_date_changed");
  const target = { docId: doc.id, notebookId: config.dailyNotebookId!, date, headingId: parent.id, configFingerprint: hash(config) };
  return { doc, rows, top, target, tasks, listChildren, parents, inSection, config, treeInfos,
    stateFingerprint: hash([stored.data, date, doc, rows, top, listChildren, treeInfos]) };
}

function nativeOrders(state: Awaited<ReturnType<typeof readState>>): Record<string, string[]> {
  const orders: Record<string, string[]> = {};
  for (const parent of new Set(Object.values(state.parents).filter(Boolean))) {
    const children = state.rows.filter((row) => state.parents[row.id] === parent).map((row) => state.treeInfos[row.id]);
    const first = children.filter((child) => child.previousID === "");
    if (first.length !== 1) throw new Error("diary_sibling_order_invalid");
    const ordered: string[] = [];
    let current = first[0];
    while (current) {
      if (ordered.includes(current.id) || typeof current.nextID !== "string") throw new Error("diary_sibling_order_invalid");
      ordered.push(current.id);
      if (!current.nextID) break;
      const next = children.find((child) => child.id === current.nextID);
      if (!next || next.previousID !== current.id) throw new Error("diary_sibling_order_invalid");
      current = next;
    }
    if (ordered.length !== children.length) throw new Error("diary_sibling_order_invalid");
    orders[parent] = ordered;
  }
  return Object.fromEntries(Object.entries(orders).sort(([a], [b]) => a.localeCompare(b)));
}

async function readLogSection(state: Awaited<ReturnType<typeof readState>>) {
  const locate = async (key: "taskLog" | "quickRecords") => {
    const found = await findDayWorkspaceHeadingBlock(state.doc.id, key, state.config.headingStructure, state.config.templateFieldMapping, state.top);
    const roots = found.headings.filter((heading) => heading.level === 1 && matchesRootHeadingWithMapping(heading.title, "day", state.config.templateFieldMapping));
    if (!found.found || !found.heading || roots.length !== 1) throw new HomepageMcpDiaryTargetUnavailable("现有任务日志或随手记区域缺失或不唯一，未生成确认。");
    let parent = roots[0];
    for (const aliases of getDayWorkspaceSectionPathAliases(state.config.templateFieldMapping, key)) {
      const end = found.headings.find((heading) => heading.index > parent.index && heading.level <= parent.level)?.index ?? state.top.length;
      const matches = found.headings.filter((heading) => heading.index > parent.index && heading.index < end && aliases.some((alias) => {
        const title = normalizeHeadingTitle(heading.title), expected = normalizeHeadingTitle(alias);
        return title === expected || title.startsWith(expected + " ");
      }));
      if (matches.length !== 1) throw new HomepageMcpDiaryTargetUnavailable("任务日志或随手记标题存在歧义，未生成确认。");
      parent = matches[0];
    }
    if (parent.id !== found.heading.id) throw new Error("diary_log_scope_invalid");
    const boundary = found.headings.find((heading) => heading.index > parent.index && heading.level <= parent.level);
    return { heading: parent, end: boundary?.index ?? state.top.length, boundaryId: boundary?.id ?? null };
  };
  const log = await locate("taskLog"), quick = await locate("quickRecords");
  const taskIndex = state.top.findIndex((block) => block.id === state.target.headingId);
  const taskHeading = await findDayWorkspaceHeadingBlock(state.doc.id, "newTasks", state.config.headingStructure, state.config.templateFieldMapping, state.top);
  const taskEnd = taskHeading.headings.find((heading) => heading.index > taskIndex && heading.level <= taskHeading.heading!.level)?.index ?? state.top.length;
  if (log.heading.id === quick.heading.id || taskIndex < 0 ||
    taskIndex >= log.heading.index && taskIndex < log.end ||
    log.heading.index >= taskIndex && log.heading.index < taskEnd ||
    quick.heading.index >= log.heading.index && quick.heading.index < log.end ||
    log.heading.index >= quick.heading.index && log.heading.index < quick.end) throw new Error("diary_log_scope_overlap");
  return log;
}

function ordinaryName(name: string): boolean {
  const parsed = parseTaskLine(generateTaskLine({ taskname: name }));
  return parsed.taskname === name && !Object.values(parsed.parsed).some((value) => Array.isArray(value) ? value.length > 0 : !!value);
}

function taskLine(markdown: string): string {
  // 思源 3.8.8 将完成标记规范化为大写 X；只比较该标记的等价形式。
  return markdown.replace(/^- \[X\]/, "- [x]");
}

async function readMutationTask(state: Awaited<ReturnType<typeof readState>>, blockId: string) {
  const row = state.tasks.find((item) => item.id === blockId);
  if (!row) throw new HomepageMcpDiaryTargetUnavailable("目标不是现有今日日记新任务区域中的任务，未生成确认。");
  const parsed = parseTaskLine(row.markdown);
  const completed = /\[[xX]\]/.test(parsed.taskCheck);
  const line = generateTaskLine({ taskname: parsed.taskname, completed });
  const list = state.rows.find((item) => item.id === state.parents[row.id] && item.type === "l");
  const children = state.rows.filter((item) => state.parents[item.id] === row.id);
  if (!ordinaryName(parsed.taskname) || /[\\`*_\[\]<>~{}]/.test(parsed.taskname) || taskLine(row.markdown) !== line ||
    !list || !state.top.some((item) => item.id === list.id) || !state.listChildren[list.id]?.includes(row.id) ||
    children.length !== 1 || children[0].type !== "p" || children[0].markdown !== parsed.taskname ||
    children[0].content !== parsed.taskname || ![parsed.taskname, " " + parsed.taskname].includes(String(row.content)) || state.rows.some((item) => state.parents[item.id] === children[0].id) ||
    [row, children[0]].some((item) => diaryAttributes(item.ial).id !== item.id || Object.entries(diaryAttributes(item.ial)).some(([key, value]) => key !== "id" || value !== item.id))) {
    throw new HomepageMcpDiaryTargetUnavailable("首期仅支持结构完整、无隐藏属性、项目关系或复杂 Markdown 的普通任务。");
  }
  const raw = await getBlockKramdownChecked(row.id);
  const native = /^- (\{:[^\n]*?\})(\[[ xX]\] [^\n]+)\n\s*(\{:[^\n]*?\})\s*$/.exec(raw.kramdown);
  if (raw.id !== row.id || (native ? taskLine("- " + native[2]) !== line ||
    hash(diaryAttributes(native[1])) !== hash(diaryAttributes(row.ial)) || hash(diaryAttributes(native[3])) !== hash(diaryAttributes(children[0].ial))
    : taskLine(raw.kramdown) !== line)) throw new Error("diary_task_not_current");
  for (const block of [row, children[0]]) {
    const attrs = await getBlockAttrsChecked(block.id);
    const expected = diaryAttributes(block.ial);
    const actual = Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)));
    if (hash(actual) !== hash(expected)) throw new Error("diary_task_attributes_changed");
  }
  const snapshot = await readTaskIndexSnapshot();
  const indexed = snapshot.items.filter((item) => item.id === row.id);
  const item = indexed[0];
  if (!snapshot.fileExists || indexed.length !== 1 || (item.root_id || item.rootID) !== state.target.docId ||
    item.root_id && item.root_id !== state.target.docId || item.rootID && item.rootID !== state.target.docId ||
    item.box !== state.target.notebookId || taskLine(item.markdown) !== line || item.content !== parsed.taskname || item.checked !== completed ||
    item.projectTargetId || item.hiddenProjectTargetId || item.visibleProjectTargetId || item.rootProjectId ||
    item.projectPath?.length || item.projectRelationStatus && item.projectRelationStatus !== "none") throw new Error("diary_task_index_conflict");
  const task: EnhancedDiaryWorkspaceTask = {
    id: row.id, blockId: row.id, rootId: state.target.docId, box: state.target.notebookId,
    hpath: typeof row.hpath === "string" ? row.hpath : undefined,
    markdown: line, taskname: parsed.taskname, completed, ...parsed.parsed,
    sourceKind: "new", isTodayTask: true, isOverdue: false, shouldMigrate: false, projectRelationStatus: "none",
  };
  return { task, paragraphId: children[0].id, indexFingerprint: hash(snapshot.items.filter((item) => item.id !== row.id)) };
}

export async function prepareHomepageMcpDiaryTaskWrite(args: Record<string, unknown>): Promise<PreparedDiaryTaskWrite> {
  const input = homepageMcpDiaryTaskWriteSchema.parse(args);
  if ((input.operation === "create" || input.operation === "update") && (!ordinaryName(input.task.taskname) || input.operation === "update" && /[\\`*_\[\]<>~{}]/.test(input.task.taskname))) {
    throw new HomepageMcpDiaryTargetUnavailable("任务名称会被解释为任务元数据或属性，请使用普通任务名称。");
  }
  const state = await readState();
  const mutation = input.operation === "create" ? undefined : await readMutationTask(state, input.target.blockId);
  if (mutation && (input.operation === "set_status" ? mutation.task.completed === input.completed : input.operation === "update" && mutation.task.taskname === input.task.taskname)) {
    throw new HomepageMcpDiaryTargetUnavailable("任务已是请求的状态或名称，无需修改，未生成写入确认。");
  }
  let deletion: PreparedDiaryTaskWrite["deletion"];
  if (input.operation === "delete") {
    const listId = state.parents[input.target.blockId];
    const children = state.listChildren[listId];
    const list = state.rows.find((row) => row.id === listId && row.type === "l");
    if (!list || !children || children.length < 2 || new Set(children).size !== children.length ||
      children.some((id) => !state.tasks.some((task) => task.id === id))) {
      throw new HomepageMcpDiaryTargetUnavailable("首期只允许删除仍有其他任务保留的完整任务列表中的一条任务，不能删除最后一条任务或父列表。");
    }
    const items = children.map((id) => state.rows.find((row) => row.id === id)!);
    if (list.markdown !== items.map((row) => row.markdown).join("\n") || list.content !== items.map((row) => row.content).join("")) throw new Error("diary_list_aggregate_unverified");
    const remaining = items.filter((row) => row.id !== input.target.blockId);
    deletion = { listId, expectedListFingerprint: rowFingerprint({ ...list,
      content: remaining.map((row) => row.content).join(""), markdown: remaining.map((row) => row.markdown).join("\n") }) };
  }
  let loggedDeletion: PreparedDiaryTaskWrite["loggedDeletion"];
  if (input.operation === "delete" && input.deleteMode === "log") {
    const log = await readLogSection(state);
    const markdown = buildWorkspaceTaskDeletionLogMarkdown({ ...mutation!.task, sourceDocId: state.doc.id, sourceDate: state.target.date, sourceDocTitle: state.target.date });
    loggedDeletion = { headingId: log.heading.id, boundaryId: log.boundaryId, insertionIndex: log.end, markdown, markdownFingerprint: hash(markdown) };
  }
  const operation = loggedDeletion ? HOMEPAGE_MCP_DIARY_TASK_LOG_DELETE : input.operation === "create" ? HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_task : HOMEPAGE_MCP_DIARY_TASK_MUTATIONS[input.operation];
  return {
    target: state.target, stateFingerprint: hash([state.stateFingerprint, mutation]), deletion, loggedDeletion, orders: loggedDeletion ? nativeOrders(state) : undefined,
    mutation: mutation && { ...mutation, expectedLine: generateTaskLine({ taskname: input.operation === "update" ? input.task.taskname : mutation.task.taskname,
      completed: input.operation === "set_status" ? input.completed : mutation.task.completed }) },
    rows: state.rows.map((row) => ({ id: row.id, fingerprint: rowFingerprint(row), listFingerprint: rowFingerprint(row, true) })),
    topIds: state.top.map((block) => block.id), listChildren: state.listChildren, parents: state.parents,
    preview: {
      action: "manage_task", operationName: operation.name, consequence: operation.consequence,
      targetName: mutation ? mutation.task.taskname : state.doc.title!, targetId: mutation ? mutation.task.blockId : state.doc.id, affectedCount: loggedDeletion ? 2 : 1,
      details: mutation ? [
        { label: "日记文档标题", value: state.doc.title! }, { label: "日记文档 ID", value: state.doc.id },
        { label: "本地日期", value: state.target.date }, { label: "任务 blockId", value: mutation.task.blockId },
        ...(input.operation === "delete" ? [
          { label: "任务名称", value: mutation.task.taskname }, { label: "当前状态", value: mutation.task.completed ? "完成" : "未完成" },
          { label: "所属区域", value: "新任务" },
          ...(loggedDeletion ? [
            { label: "日志目标区域", value: "任务日志" }, { label: "日志标题 ID", value: loggedDeletion.headingId },
            { label: "预期日志正文", value: loggedDeletion.markdown },
            { label: "操作步骤", value: "写入一条日志 → 核对日志及原任务 → 删除原任务 → 回读" },
            { label: "影响范围", value: "新增 1 条日志，删除 1 条任务" },
          ] : [{ label: "预计删除的任务数量", value: "1" }, { label: "删除模式", value: "直接删除，不写日志" }]),
          { label: "删除风险", value: HOMEPAGE_MCP_DIARY_TASK_DELETE_WARNING },
        ] : input.operation === "set_status" ? [
          { label: "任务名称", value: mutation.task.taskname }, { label: "当前状态", value: mutation.task.completed ? "完成" : "未完成" },
          { label: "目标状态", value: input.completed ? "完成" : "未完成" },
        ] : [{ label: "原任务名称", value: mutation.task.taskname }, { label: "新任务名称", value: input.operation === "update" ? input.task.taskname : "" }]),
      ] : [
        { label: "日记文档标题", value: state.doc.title! }, { label: "日记文档 ID", value: state.doc.id },
        { label: "本地日期", value: state.target.date }, { label: "任务名称", value: input.operation === "create" ? input.task.taskname : "" },
        { label: "插入区域", value: "新任务" }, { label: "当前区域任务数量", value: String(state.tasks.length) },
      ],
    },
  };
}

export async function verifyHomepageMcpDiaryTaskLog(before: PreparedDiaryTaskWrite, result: EnhancedDiaryInsertResult): Promise<boolean> {
  const log = before.loggedDeletion;
  if (!log || !before.mutation || !result.ok || !result.blockIds?.length || result.blockIds.some((id) => !ID.test(id)) || hash(log.markdown) !== log.markdownFingerprint) return false;
  for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const after = await readState();
      const region = await readLogSection(after);
      const oldIds = new Set(before.rows.map((row) => row.id));
      const added = after.rows.filter((row) => !oldIds.has(row.id));
      if (added.length !== 3) continue;
      const orders = nativeOrders(after);
      const list = added.find((row) => row.type === "l"), item = added.find((row) => row.type === "i"), paragraph = added.find((row) => row.type === "p");
      if (!list || !item || !paragraph || item.subtype === "t" || list.markdown !== log.markdown || item.markdown !== log.markdown || paragraph.markdown !== log.markdown.slice(2) ||
        after.parents[list.id] !== before.target.docId || after.parents[item.id] !== list.id || after.parents[paragraph.id] !== item.id ||
        result.blockIds.some((id) => !added.some((row) => row.id === id)) ||
        hash(after.target) !== hash(before.target) || region.heading.id !== log.headingId || region.boundaryId !== log.boundaryId ||
        region.end !== log.insertionIndex + 1 || log.insertionIndex <= region.heading.index ||
        hash(after.top.map((block) => block.id)) !== hash([...before.topIds.slice(0, log.insertionIndex), list.id, ...before.topIds.slice(log.insertionIndex)]) ||
        hash(after.listChildren) !== hash(before.listChildren) || after.rows.length !== before.rows.length + 3 ||
        hash(Object.fromEntries(Object.entries(orders).filter(([id]) => oldIds.has(id)).map(([id, children]) => [id, children.filter((child) => oldIds.has(child))]))) !== hash(before.orders) ||
        !before.rows.every((row) => after.parents[row.id] === before.parents[row.id] && rowFingerprint(after.rows.find((current) => current.id === row.id)!) === row.fingerprint)) return false;
      for (const row of added) {
        const attrs = diaryAttributes(row.ial);
        const actual = Object.fromEntries(Object.entries(await getBlockAttrsChecked(row.id)).filter(([key]) => key !== "updated").sort(([a], [b]) => a.localeCompare(b)));
        if (Object.keys(attrs).length !== 1 || attrs.id !== row.id || hash(actual) !== hash(attrs)) return false;
      }
      if ((await getChildBlocksChecked(list.id)).map((row) => row.id).join() !== item.id ||
        (await getChildBlocksChecked(item.id)).map((row) => row.id).join() !== paragraph.id || (await getChildBlocksChecked(paragraph.id)).length) return false;
      const raw = await getBlockKramdownChecked(paragraph.id);
      if (raw.id !== paragraph.id || raw.kramdown.replace(/\n\{:[^\n]*\}\s*$/, "").trim() !== log.markdown.slice(2)) return false;
      const current = await readMutationTask(after, before.mutation.task.blockId);
      if (hash(current.task) !== hash(before.mutation.task) || current.paragraphId !== before.mutation.paragraphId || current.indexFingerprint !== before.mutation.indexFingerprint) return false;
      // 最终删除回读以日志已被严格核对的状态为基线，不能再拿写日志前的整文档指纹比较。
      log.after = { ...before, loggedDeletion: undefined,
        rows: after.rows.map((row) => ({ id: row.id, fingerprint: rowFingerprint(row), listFingerprint: rowFingerprint(row, true) })),
        topIds: after.top.map((block) => block.id), listChildren: after.listChildren, parents: after.parents, orders };
      return true;
    } catch { /* 只补偿读取；不能重放日志或继续删除无法确认的任务。 */ }
  }
  return false;
}

export async function verifyHomepageMcpDiaryTaskWrite(args: Record<string, unknown>, before: PreparedDiaryTaskWrite, data: unknown): Promise<boolean> {
  const input = homepageMcpDiaryTaskWriteSchema.parse(args);
  if (!record(data) || data.action !== "manage_task") return false;
  const result = data.result;
  if (input.operation === "delete") {
    if (input.deleteMode === "log") {
      if (!before.loggedDeletion?.after) return false;
      before = before.loggedDeletion.after;
    }
    if (!before.mutation || !before.deletion || !record(result) || result.operation !== "delete" || result.changed !== true ||
      result.blockId !== input.target.blockId || result.taskname !== before.mutation.task.taskname) return false;
    const removed = new Set([input.target.blockId, before.mutation.paragraphId]);
    for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      let after;
      try { after = await readState(); }
      catch { continue; }
      if (after.rows.some((row) => removed.has(row.id))) continue;
      if (hash(after.target) !== hash(before.target) || after.rows.length !== before.rows.length - removed.size ||
        hash(after.top.map((block) => block.id)) !== hash(before.topIds) ||
        hash(after.parents) !== hash(Object.fromEntries(Object.entries(before.parents).filter(([id]) => !removed.has(id)))) ||
        hash(after.listChildren) !== hash(Object.fromEntries(Object.entries(before.listChildren).map(([id, children]) =>
          [id, id === before.deletion!.listId ? children.filter((child) => child !== input.target.blockId) : children])))) return false;
      if (before.orders && hash(nativeOrders(after)) !== hash(Object.fromEntries(Object.entries(before.orders)
        .filter(([id]) => !removed.has(id)).map(([id, children]) => [id, children.filter((child) => !removed.has(child))])))) return false;
      if (!before.rows.filter((row) => !removed.has(row.id)).every((row) => {
        const current = after.rows.find((item) => item.id === row.id);
        return !!current && rowFingerprint(current) === (row.id === before.deletion!.listId ? before.deletion!.expectedListFingerprint : row.fingerprint);
      })) return false;
      try {
        const exists = await checkBlocksExist([before.target.docId, before.deletion.listId, ...removed]);
        if (exists[before.target.docId] !== true || exists[before.deletion.listId] !== true || [...removed].some((id) => exists[id] !== false)) continue;
        const snapshot = await readTaskIndexSnapshot();
        if (snapshot.fileExists && !snapshot.items.some((item) => item.id === input.target.blockId) && hash(snapshot.items) === before.mutation.indexFingerprint) return true;
      } catch { /* 仅有限补偿读取，任何失败都不能触发第二次删除。 */ }
    }
    return false;
  }
  if (input.operation !== "create") {
    if (!before.mutation || !record(result) || result.operation !== input.operation || result.changed !== true || result.blockId !== input.target.blockId) return false;
    // 更新可见性也会落后于原生块树；仅补偿读取，不再次执行任务修改。
    for (const wait of [0, 100, 250, 500, 1000, 1500, 2000]) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      const after = await readState();
      if (hash(after.target) !== hash(before.target) || after.rows.length !== before.rows.length ||
        hash(after.top.map((item) => item.id)) !== hash(before.topIds) || hash(after.listChildren) !== hash(before.listChildren) || hash(after.parents) !== hash(before.parents)) return false;
      let current;
      try { current = await readMutationTask(after, input.target.blockId); }
      catch { continue; }
      if (current.paragraphId !== before.mutation.paragraphId || current.indexFingerprint !== before.mutation.indexFingerprint) return false;
      if (current.task.markdown !== before.mutation.expectedLine) continue;
      const listId = before.parents[input.target.blockId];
      return before.rows.every((old) => {
        const row = after.rows.find((item) => item.id === old.id);
        if (!row) return false;
        if (row.id === listId) return rowFingerprint(row, true) === old.listFingerprint;
        if (row.id === input.target.blockId || row.id === current.paragraphId) {
          return rowFingerprint(row, true) === old.listFingerprint;
        }
        return rowFingerprint(row) === old.fingerprint;
      });
    }
    return false;
  }
  if (!record(result) || result.operation !== "create" || result.changed !== true || result.docId !== before.target.docId ||
    typeof result.blockId !== "string" || !ID.test(result.blockId) || result.taskname !== input.task.taskname || result.projectTargetId) return false;
  const after = await readState(result.blockId);
  if (hash(after.target) !== hash(before.target)) return false;
  const oldIds = new Set(before.rows.map((row) => row.id));
  const added = after.rows.filter((row) => !oldIds.has(row.id));
  const task = added.find((row) => row.id === result.blockId && row.type === "i" && row.subtype === "t");
  if (!task || !after.inSection(task) || added.filter((row) => row.type === "i").length !== 1 ||
    added.filter((row) => row.type === "p").length !== 1 || added.filter((row) => row.type === "l").length > 1 ||
    added.some((row) => !["i", "p", "l"].includes(row.type)) || after.rows.length !== before.rows.length + added.length ||
    parseTaskLine(task.markdown).taskname !== input.task.taskname) return false;
  const parsed = parseTaskLine(task.markdown);
  if (parsed.taskCheck !== "- [ ]" && parsed.taskCheck !== "* [ ]" ||
    Object.values(parsed.parsed).some((value) => Array.isArray(value) ? value.length > 0 : !!value)) return false;
  const list = after.rows.find((row) => row.id === task.parent_id && row.type === "l");
  if (!list || !after.top.some((block) => block.id === list.id) || added.some((row) => {
    const attrs = diaryAttributes(row.ial);
    return row.type === "p" && row.parent_id !== task.id || row.type === "l" && row.id !== list.id ||
      Object.keys(attrs).length !== 1 || attrs.id !== row.id;
  })) return false;
  if (hash(after.top.filter((block) => oldIds.has(block.id)).map((block) => block.id)) !== hash(before.topIds)) return false;
  for (const row of before.rows) {
    const current = after.rows.find((item) => item.id === row.id);
    if (!current || after.parents[row.id] !== before.parents[row.id] || (current.id === list.id
      ? rowFingerprint(current, true) !== row.listFingerprint : rowFingerprint(current) !== row.fingerprint)) return false;
  }
  for (const [id, children] of Object.entries(before.listChildren)) {
    if (hash(after.listChildren[id]?.filter((child) => oldIds.has(child))) !== hash(children)) return false;
  }
  if (!after.listChildren[list.id] || after.listChildren[list.id].filter((id) => !oldIds.has(id)).join() !== task.id) return false;
  const snapshot = await readTaskIndexSnapshot();
  const indexed = snapshot.items.filter((item) => item.id === task.id);
  return snapshot.fileExists && indexed.length === 1 && (indexed[0].root_id || indexed[0].rootID) === before.target.docId &&
    parseTaskLine(indexed[0].markdown || indexed[0].content || "").taskname === input.task.taskname &&
    !indexed[0].projectTargetId && !indexed[0].hiddenProjectTargetId && !indexed[0].visibleProjectTargetId;
}
