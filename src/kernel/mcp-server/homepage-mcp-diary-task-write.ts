import SHA256 from "crypto-js/sha256";
import { getBlockTreeInfos, getChildBlocksChecked, sqlChecked } from "@/api";
import { readTaskIndexSnapshot } from "@/components/tools/siyuanComponentDataApi";
import { normalizeEnhancedDiaryConfig } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryConfig";
import { formatDiaryAttrDate, lookupDiaryDocumentForDate } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryDoc";
import { findDayWorkspaceHeadingBlock } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryBlockLocator";
import { getDayWorkspaceSectionPathAliases, matchesRootHeadingWithMapping } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTemplateFieldMapping";
import { normalizeHeadingTitle } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryMarkdownSections";
import { ENHANCED_DIARY_CONFIG_FILE } from "@/components/utils/widgetBlock/widget/enhancedDiary/enhancedDiaryTypes";
import { loadDataStrict } from "@/features/kb/services/agent-workbench/storage/notebrain-plugin-storage";
import type { ToolRuntimeContext } from "@/features/kb/services/agent-workbench/contracts/tool-contract";
import { generateTaskLine, parseTaskLine } from "@/features/task-data/task-parser";
import { HOMEPAGE_MCP_DIARY_TASK_WRITES, homepageMcpDiaryTaskCreateSchema, type HomepageMcpWritePreview } from "@/features/agent-platform/mcp-server/homepage-mcp-write-preview";

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
  return { doc, rows, top, target, tasks, listChildren, parents, inSection,
    stateFingerprint: hash([stored.data, date, doc, rows, top, listChildren, treeInfos]) };
}

export async function prepareHomepageMcpDiaryTaskWrite(args: Record<string, unknown>): Promise<PreparedDiaryTaskWrite> {
  const input = homepageMcpDiaryTaskCreateSchema.parse(args);
  const parsed = parseTaskLine(generateTaskLine(input.task));
  if (parsed.taskname !== input.task.taskname || Object.values(parsed.parsed).some((value) => Array.isArray(value) ? value.length > 0 : !!value)) {
    throw new HomepageMcpDiaryTargetUnavailable("任务名称会被解释为任务元数据或属性，请使用普通任务名称。");
  }
  const state = await readState();
  return {
    target: state.target, stateFingerprint: state.stateFingerprint,
    rows: state.rows.map((row) => ({ id: row.id, fingerprint: rowFingerprint(row), listFingerprint: rowFingerprint(row, true) })),
    topIds: state.top.map((block) => block.id), listChildren: state.listChildren, parents: state.parents,
    preview: {
      action: "manage_task", operationName: HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_task.name,
      consequence: HOMEPAGE_MCP_DIARY_TASK_WRITES.manage_task.consequence,
      targetName: state.doc.title!, targetId: state.doc.id, affectedCount: 1,
      details: [
        { label: "日记文档标题", value: state.doc.title! }, { label: "日记文档 ID", value: state.doc.id },
        { label: "本地日期", value: state.target.date }, { label: "任务名称", value: input.task.taskname },
        { label: "插入区域", value: "新任务" }, { label: "当前区域任务数量", value: String(state.tasks.length) },
      ],
    },
  };
}

export async function verifyHomepageMcpDiaryTaskWrite(args: Record<string, unknown>, before: PreparedDiaryTaskWrite, data: unknown): Promise<boolean> {
  const input = homepageMcpDiaryTaskCreateSchema.parse(args);
  if (!record(data) || data.action !== "manage_task") return false;
  const result = data.result;
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
