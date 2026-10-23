import SHA256 from "crypto-js/sha256";
import { getAttributeViewItemIDsByBoundIDsChecked, lsNotebooksChecked } from "../../api";
import { getBlockByIdReadonly, getBlockAttrsReadonly, sqlSelectReadonly } from "../../features/kb/services/siyuan/read-only-kernel";
import { readAttributeViewSafeOutput } from "../../features/kb/services/agent-workbench/tools/siyuan/impl/read-attribute-view.impl";
import {
  HOMEPAGE_MCP_DATABASE_WRITES, HOMEPAGE_MCP_DATABASE_BOUND_ADD, homepageMcpDatabaseUpdateSchema, homepageMcpDatabaseClearSchema, homepageMcpDatabaseAddSchema, homepageMcpWritePreviewSchema,
  type HomepageMcpDatabaseClear, type HomepageMcpDatabaseWriteAction, type HomepageMcpWritePreview,
} from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { fingerprintHomepageMcpValue } from "./homepage-mcp-write-access";

interface PreparedDatabaseCellWrite {
  action: "update_cell" | "clear_cell";
  preview: HomepageMcpWritePreview;
  stateFingerprint: string;
  metadataFingerprint: string;
  otherCellsFingerprint: string;
  oldTextFingerprint: string;
}
interface PreparedDatabaseRowWrite {
  action: "add_rows";
  preview: HomepageMcpWritePreview;
  stateFingerprint: string;
  rowIds: string[];
  metadataFingerprint: string;
  viewsFingerprint: string;
  rowsFingerprint: string;
  source?: { blockId: string; businessFingerprint: string; databaseIds: string[] };
}
export type PreparedDatabaseWrite = PreparedDatabaseCellWrite | PreparedDatabaseRowWrite;

const ORDINARY_TYPES = new Set(["block", "text", "number", "checkbox", "date", "select", "mSelect", "url", "email", "phone"]);
const nodeId = /^\d{14}-[a-z0-9]{7}$/;
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("数据库返回结构无效。");
  return value as Record<string, any>;
}
function digest(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized.length > 1_000_000) throw new Error("数据库状态超出审批边界。");
  return fingerprintHomepageMcpValue(JSON.parse(serialized));
}
function display(value: string, limit = 800): string {
  // 审批不保存疑似凭据或完整路径；遇到这类文本时拒绝生成预览。
  if (/(?:authorization|bearer|token|api[_-]?key|password|secret|cookie)\s*[=:： ]/i.test(value) ||
    /(?:[a-z]:[\\/]|\\\\|(?:^|[\s"'=])\/[\w.~-]+\/)/i.test(value)) throw new Error("审批目标含敏感信息，无法安全展示。");
  const escaped = Array.from(value, (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    ? JSON.stringify(char).slice(1, -1) : char).join("");
  const shown = escaped.length > limit ? `${escaped.slice(0, limit)}（已截断，原文 ${value.length} 字符）` : escaped || "（空文本）";
  return shown + (escaped === value ? "" : "（控制字符以转义形式显示）");
}

/** shortcut: 首期仅支持文档直属普通段落；其他块需取得内容和结构不变的实机证据后扩展。 */
async function readBoundSource(blockId: string) {
  if (!nodeId.test(blockId)) throw new Error("原始块 ID 无效。");
  const block = record(await getBlockByIdReadonly(blockId));
  const fields = ["id", "root_id", "parent_id", "box", "path", "type", "subtype", "content", "tag", "created", "updated", "hash"];
  if (fields.some((key) => typeof block[key] !== "string") || block.id !== blockId ||
    !nodeId.test(block.root_id) || !nodeId.test(block.box) || block.parent_id !== block.root_id ||
    block.type !== "p" || block.subtype !== "" || !block.content.trim()) throw new Error("仅支持身份完整的文档直属普通段落。");
  const root = record(await getBlockByIdReadonly(block.root_id));
  const notebooks = await lsNotebooksChecked();
  if (!Array.isArray(notebooks?.notebooks) || notebooks.notebooks.filter((item) => item.id === block.box && item.closed === false).length !== 1 ||
    root.id !== block.root_id || root.root_id !== root.id || root.type !== "d" || root.box !== block.box || root.path !== block.path ||
    typeof root.content !== "string" || !root.content.trim()) throw new Error("原始块所属文档或可用笔记本无法核对。");
  const rows = await sqlSelectReadonly(`select id, markdown from blocks where id = '${blockId}'`, { maxLimit: 1, allowedTables: ["blocks"] });
  if (rows.length !== 1 || rows[0].id !== blockId || typeof rows[0].markdown !== "string") throw new Error("无法核对原始块正文及格式。");
  const attrs = record(await getBlockAttrsReadonly(blockId));
  if (attrs.id !== blockId || Object.values(attrs).some((value) => typeof value !== "string")) throw new Error("原始块属性无效。");
  const databaseIds = attrs["custom-avs"] ? attrs["custom-avs"].split(",") as string[] : [];
  if (databaseIds.some((id) => !nodeId.test(id)) || new Set(databaseIds).size !== databaseIds.length) throw new Error("原始块数据库关联状态无效。");
  // 3.8.8 关联会改变 custom-avs、派生 av-names 和 SQL hash/ial；正文与其他属性仍逐项核对。
  const { updated: _updated, hash: _hash, ...businessBlock } = block;
  const { updated: _attrUpdated, "custom-avs": _avs, "av-names": _names, ...businessAttrs } = attrs;
  return {
    summary: display(block.content, 120), documentTitle: display(root.content, 200), documentId: root.id as string,
    databaseIds, businessFingerprint: digest([businessBlock, rows[0].markdown, businessAttrs, root.id, root.content]),
    approvalFingerprint: digest([block, rows[0].markdown, attrs, root]),
  };
}

async function readBoundItemId(databaseId: string, blockId: string): Promise<string> {
  const mapping = record(await getAttributeViewItemIDsByBoundIDsChecked(databaseId, [blockId]));
  const itemId = mapping[blockId];
  if (Object.keys(mapping).length !== 1 || typeof itemId !== "string" || (itemId !== "" && !nodeId.test(itemId))) {
    throw new Error("官方绑定块与条目映射无法可靠核对。");
  }
  return itemId;
}

async function readTarget(args: HomepageMcpDatabaseClear) {
  const output = await readAttributeViewSafeOutput({
    databaseId: args.databaseId, includeRows: true, includeRaw: true, rowLimit: 500, renderView: false,
  });
  const av = record(record(output.raw).av);
  const rows = output.rows;
  if (av.id !== args.databaseId || output.database.databaseId !== av.id || typeof av.name !== "string" || !av.name.trim() ||
    output.database.name !== av.name || !Array.isArray(av.keyValues) || !Array.isArray(rows) || rows.length > 500 ||
    output.truncated || output.rowCount !== rows.length ||
    output.schema.length > 30 || new Set(output.schema.map((key) => key.keyId)).size !== output.schema.length ||
    new Set(rows.map((row) => row.rowId)).size !== rows.length) throw new Error("无法可靠核对数据库身份或读取范围。");
  const keyValues = av.keyValues.map(record);
  if (keyValues.length !== output.schema.length || output.schema.some((field) => {
    const matches = keyValues.filter((item) => item.key?.id === field.keyId);
    return matches.length !== 1 || matches[0].key.name !== field.name || matches[0].key.type !== field.type;
  })) throw new Error("字段元数据无法一致核对。");
  const key = output.schema.find((item) => item.keyId === args.keyId);
  const rawKey = keyValues.filter((item) => item.key?.id === args.keyId);
  if (!key || rawKey.length !== 1 || key.type !== "text" || rawKey[0].key.type !== "text" ||
    key.name !== args.expectedFieldName || rawKey[0].key.name !== args.expectedFieldName) throw new Error("字段不是匹配名称的普通文本字段。");
  const row = rows.find((item) => item.rowId === args.rowId);
  if (!row || !nodeId.test(row.rowId) || output.schema.some((item) => item.keyId === row.rowId) ||
    rows.some((item) => item.boundBlockId === args.rowId && item.rowId !== args.rowId)) throw new Error("目标不是当前读取范围内的真实条目 ID。");
  const rawCell = record(row.cells[args.keyId]?.raw);
  const columnValues = rawKey[0].values;
  if (!Array.isArray(columnValues) || columnValues.filter((value) => value?.blockID === row.rowId).length !== 1 ||
    !columnValues.some((value) => digest(value) === digest(rawCell))) throw new Error("无法从原始字段列唯一确认目标单元格。");
  if (rawCell.type !== "text" || rawCell.keyID !== args.keyId || rawCell.blockID !== row.rowId ||
    typeof rawCell.id !== "string" || !nodeId.test(rawCell.id) || typeof rawCell.text?.content !== "string" ||
    rows.some((item) => Object.values(item.cells).some((cell) => {
      const raw = cell.raw as Record<string, unknown> | undefined;
      return raw?.id === args.rowId || raw?.cellID === args.rowId || raw?.cellId === args.rowId;
    }))) throw new Error("无法可靠核对原始单元格及完整文本。");
  const primary = output.schema.filter((item) => item.type === "block");
  if (primary.length !== 1) throw new Error("无法可靠识别条目标题。");
  const titleCell = record(row.cells[primary[0].keyId]?.raw);
  if (titleCell.blockID !== row.rowId || titleCell.keyID !== primary[0].keyId || typeof titleCell.block?.content !== "string" ||
    !titleCell.block.content.trim()) throw new Error("无法可靠识别条目标题。");
  const otherCells = rows.map((item) => digest([item.rowId, output.schema.filter((field) => ORDINARY_TYPES.has(field.type)).map((field) => {
    if (item.rowId === args.rowId && field.keyId === args.keyId) return [field.keyId, "<target>"];
    const raw = item.cells[field.keyId]?.raw;
    if (raw === undefined) return [field.keyId, null];
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...business } = record(raw);
    if (business.block) {
      const { created: _created, updated: _updated, ...block } = record(business.block);
      business.block = block;
    }
    return [field.keyId, digest(business)];
  })]));
  const metadataFingerprint = digest([av.id, av.name, output.schema, rows.map((item) => digest([item.rowId, item.boundBlockId ?? null])),
    row.rowId, titleCell.block.content, rawCell.id, rawCell.keyID, rawCell.blockID, rawCell.type]);
  return { name: av.name as string, title: titleCell.block.content as string, oldText: rawCell.text.content as string,
    metadataFingerprint, otherCellsFingerprint: digest(otherCells), targetFingerprint: digest(rawCell) };
}

export async function prepareHomepageMcpDatabaseWrite(action: HomepageMcpDatabaseWriteAction, args: Record<string, unknown>): Promise<PreparedDatabaseWrite> {
  if (action === "add_rows") {
    const input = homepageMcpDatabaseAddSchema.parse(args);
    const state = await readRowCreationState(input.databaseId);
    if ("blockIds" in input) {
      const blockId = input.blockIds[0];
      const source = await readBoundSource(blockId);
      if (state.primaryValues.some((value) => value.block.id === blockId) || source.databaseIds.includes(input.databaseId) ||
        await readBoundItemId(input.databaseId, blockId) !== "") throw new Error("原始块已关联到目标数据库，或关联状态不一致。");
      const preview = homepageMcpWritePreviewSchema.parse({
        action, operationName: HOMEPAGE_MCP_DATABASE_BOUND_ADD.name, consequence: HOMEPAGE_MCP_DATABASE_BOUND_ADD.consequence,
        targetName: source.summary, targetId: blockId, affectedCount: 1,
        details: [
          { label: "数据库名称", value: display(state.name) }, { label: "数据库 ID", value: input.databaseId },
          { label: "原始块摘要", value: source.summary }, { label: "原始 blockId", value: blockId },
          { label: "原始块类型", value: "p（普通段落）" }, { label: "所属文档", value: source.documentTitle },
          { label: "所属文档 ID", value: source.documentId }, { label: "操作方式", value: "绑定已有块" },
          { label: "新增数量", value: "1" }, { label: "当前数据库记录数量", value: String(state.rowIds.length) },
          { label: "新增 itemID", value: "执行后由思源内核生成，原始 blockId 不是新 itemID" },
        ],
      });
      return { action, preview, rowIds: state.rowIds, metadataFingerprint: state.metadataFingerprint,
        viewsFingerprint: state.viewsFingerprint, rowsFingerprint: state.rowsFingerprint,
        source: { blockId, businessFingerprint: source.businessFingerprint, databaseIds: source.databaseIds },
        stateFingerprint: digest([state.metadataFingerprint, state.viewsFingerprint, state.rowsFingerprint, source.approvalFingerprint, preview]) };
    }
    const operation = HOMEPAGE_MCP_DATABASE_WRITES.add_rows;
    const preview = homepageMcpWritePreviewSchema.parse({
      action, operationName: operation.name, consequence: operation.consequence,
      targetName: display(input.detachedRows[0].title), targetId: null, affectedCount: 1,
      details: [
        { label: "数据库名称", value: display(state.name) }, { label: "数据库 ID", value: input.databaseId },
        { label: "新条目标题", value: display(input.detachedRows[0].title) }, { label: "类型", value: "脱离块记录" },
        { label: "新增数量", value: "1" }, { label: "当前数据库记录数量", value: String(state.rowIds.length) },
      ],
    });
    return { action, preview, rowIds: state.rowIds, metadataFingerprint: state.metadataFingerprint,
      viewsFingerprint: state.viewsFingerprint, rowsFingerprint: state.rowsFingerprint,
      stateFingerprint: digest([state.metadataFingerprint, state.viewsFingerprint, state.rowsFingerprint, preview]) };
  }
  if (action !== "update_cell" && action !== "clear_cell") throw new Error("未知数据库写入操作。");
  const input = (action === "clear_cell" ? homepageMcpDatabaseClearSchema : homepageMcpDatabaseUpdateSchema).parse(args);
  const target = await readTarget(input);
  if (action === "clear_cell" && target.oldText.length === 0) throw new Error("目标文本已经为空，不能重复清空。");
  const operation = HOMEPAGE_MCP_DATABASE_WRITES[action];
  const preview = homepageMcpWritePreviewSchema.parse({
    action, operationName: operation.name, consequence: operation.consequence,
    targetName: display(target.title), targetId: input.rowId, affectedCount: 1,
    details: [
      { label: "数据库名称", value: display(target.name) }, { label: "数据库 ID", value: input.databaseId },
      { label: "条目标题", value: display(target.title) }, { label: "条目 ID", value: input.rowId },
      { label: "字段名称", value: display(input.expectedFieldName) }, { label: "字段 ID", value: input.keyId },
      { label: "原始文本值", value: display(target.oldText) },
      action === "clear_cell" ? { label: "清空后的目标状态", value: "（空文本）" }
        : { label: "准备写入的新文本值", value: display(homepageMcpDatabaseUpdateSchema.parse(args).valueText) },
    ],
  });
  return { action, preview, metadataFingerprint: target.metadataFingerprint, otherCellsFingerprint: target.otherCellsFingerprint,
    oldTextFingerprint: digest(target.oldText),
    stateFingerprint: SHA256(JSON.stringify([target.metadataFingerprint, target.otherCellsFingerprint, target.targetFingerprint, preview])).toString() };
}

export async function verifyHomepageMcpDatabaseWrite(action: HomepageMcpDatabaseWriteAction, args: Record<string, unknown>, prepared: PreparedDatabaseWrite, data: unknown): Promise<boolean> {
  if (action !== prepared.action) return false;
  if (action === "add_rows" && prepared.action === "add_rows") {
    const input = homepageMcpDatabaseAddSchema.parse(args);
    const envelope = record(data), result = record(envelope.result);
    if (envelope.action !== action || result.status !== "success" || result.databaseId !== input.databaseId || result.addedCount !== 1 ||
      !Array.isArray(result.rowIds) || result.rowIds.length !== 1 || typeof result.rowIds[0] !== "string" || !nodeId.test(result.rowIds[0]) ||
      prepared.rowIds.includes(result.rowIds[0])) return false;
    const newId = result.rowIds[0];
    const actual = await readRowCreationState(input.databaseId, newId);
    const primary = actual.primaryValues.find((value) => value.blockID === newId);
    if (!(actual.rowIds.length === prepared.rowIds.length + 1 && actual.rowIds.includes(newId) &&
      actual.rowIds.filter((id) => id !== newId).every((id) => prepared.rowIds.includes(id)) &&
      actual.metadataFingerprint === prepared.metadataFingerprint && actual.viewsFingerprint === prepared.viewsFingerprint &&
      actual.rowsFingerprint === prepared.rowsFingerprint)) return false;
    if ("blockIds" in input) {
      const blockId = input.blockIds[0];
      if (prepared.source?.blockId !== blockId || newId === blockId ||
        !Array.isArray(result.affectedBlockIds) || result.affectedBlockIds.length !== 1 || result.affectedBlockIds[0] !== blockId ||
        !primary || primary.isDetached === true || primary.block.id !== blockId ||
        actual.primaryValues.filter((value) => value.block.id === blockId).length !== 1 ||
        await readBoundItemId(input.databaseId, blockId) !== newId) return false;
      const source = await readBoundSource(blockId);
      return source.businessFingerprint === prepared.source.businessFingerprint &&
        digest(source.databaseIds) === digest([...prepared.source.databaseIds, input.databaseId]);
    }
    return !prepared.source &&
      (result.affectedBlockIds === undefined || (Array.isArray(result.affectedBlockIds) && result.affectedBlockIds.length === 0)) &&
      primary?.isDetached === true && !primary.block.id && primary.block.content === input.detachedRows[0].title;
  }
  if ((action !== "update_cell" && action !== "clear_cell") || prepared.action === "add_rows") return false;
  const input = (action === "clear_cell" ? homepageMcpDatabaseClearSchema : homepageMcpDatabaseUpdateSchema).parse(args);
  const envelope = record(data), result = record(envelope.result);
  if (envelope.action !== action || result.status !== "success" || result.databaseId !== input.databaseId) return false;
  let newText = "";
  if (action === "clear_cell") {
    if (result.rowId !== input.rowId || result.keyId !== input.keyId || result.fieldName !== input.expectedFieldName ||
      typeof result.oldValueText !== "string" || digest(result.oldValueText) !== prepared.oldTextFingerprint) return false;
  } else if (action === "update_cell") {
    newText = homepageMcpDatabaseUpdateSchema.parse(args).valueText;
    if (result.total !== 1 || result.successCount !== 1 || result.failedCount !== 0 || !Array.isArray(result.results) || result.results.length !== 1) return false;
    const saved = record(result.results[0]);
    if (saved.status !== "success" || saved.rowId !== input.rowId || saved.keyId !== input.keyId ||
      saved.fieldName !== input.expectedFieldName || saved.newValueText !== newText) return false;
  }
  // 3.8.8 实测保留带身份的空 text 记录；缺失记录不作为清空成功的证据。
  const actual = await readTarget(input);
  return actual.oldText === newText && actual.metadataFingerprint === prepared.metadataFingerprint &&
    actual.otherCellsFingerprint === prepared.otherCellsFingerprint;
}

/** 只读原始列和视图；省略的空 values/itemIds 是 3.8.8 的正常空库形态，显式异常值仍拒绝。 */
async function readRowCreationState(databaseId: string, newId?: string) {
  const output = await readAttributeViewSafeOutput({ databaseId, includeRows: true, includeRaw: true, rowLimit: 500, renderView: false });
  const av = record(record(output.raw).av);
  if (JSON.stringify(av).length > 1_000_000 || av.id !== databaseId || typeof av.name !== "string" || !av.name.trim() ||
    output.database.name !== av.name || !Array.isArray(av.keyValues) || !Array.isArray(av.views) || av.views.length === 0 ||
    !Array.isArray(output.rows) || output.schema.length === 0 || output.schema.length > 30 || av.keyValues.length !== output.schema.length) {
    throw new Error("无法完整读取数据库状态。");
  }
  const columns = av.keyValues.map(record);
  const keyIds = columns.map((column) => record(column.key).id);
  if (keyIds.some((id) => typeof id !== "string" || !nodeId.test(id)) || new Set(keyIds).size !== keyIds.length ||
    output.schema.some((field) => {
      const column = columns.find((item) => item.key.id === field.keyId);
      return !column || column.key.name !== field.name || column.key.type !== field.type;
    })) throw new Error("数据库字段身份不完整或冲突。");
  const primary = columns.filter((column) => column.key.type === "block");
  if (primary.length !== 1) throw new Error("数据库缺少唯一的 block 主字段。");
  const rowIds = new Set<string>();
  const views = av.views.map((source) => {
    const view = record(source);
    const ids = view.itemIds === undefined ? [] : view.itemIds;
    if (!nodeId.test(view.id) || !Array.isArray(ids) || view.itemIDs !== undefined || new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== "string" || !nodeId.test(id) || keyIds.includes(id))) throw new Error("视图行身份无法核对。");
    ids.forEach((id) => rowIds.add(id));
    return { ...view, id: view.id, itemIds: ids.filter((id) => id !== newId) };
  });
  if (new Set(views.map((view) => view.id)).size !== views.length || rowIds.size > (newId ? 501 : 500) ||
    output.rowCount !== rowIds.size || output.rows.length !== Math.min(rowIds.size, 500) ||
    new Set(output.rows.map((row) => row.rowId)).size !== output.rows.length || output.rows.some((row) => !rowIds.has(row.rowId)) ||
    output.truncated !== (rowIds.size > 500)) throw new Error("条目身份缺失或超出安全范围。");
  const cellIds = new Set<string>();
  const cellsByKey = columns.map((column) => {
    const values = column.values === undefined ? [] : column.values;
    if (!Array.isArray(values)) throw new Error("原始字段列不完整。");
    const seen = new Set<string>();
    const cells = new Map<string, string>();
    for (const source of values) {
      const value = record(source);
      if (!rowIds.has(value.blockID) || seen.has(value.blockID) || value.keyID !== column.key.id || value.type !== column.key.type ||
        typeof value.id !== "string" || !nodeId.test(value.id) || rowIds.has(value.id) || keyIds.includes(value.id) || cellIds.has(value.id) ||
        [value.itemID, value.itemId, value.rowID, value.rowId].some((id) => id !== undefined && id !== value.blockID)) throw new Error("原始单元格身份冲突或无法解释。");
      seen.add(value.blockID);
      cellIds.add(value.id);
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...business } = value;
      if (business.block) {
        const { created: _created, updated: _updated, ...block } = record(business.block);
        business.block = block;
      }
      cells.set(value.blockID, digest(business));
    }
    return cells;
  });
  const primaryValues = primary[0].values === undefined ? [] : primary[0].values as Record<string, any>[];
  if (primaryValues.length !== rowIds.size || primaryValues.some((value) => typeof value.block?.content !== "string" ||
    (value.isDetached === true ? !!value.block.id :
      (value.isDetached !== undefined && value.isDetached !== false) || typeof value.block.id !== "string" || !nodeId.test(value.block.id)))) {
    throw new Error("无法完整核对条目标题或绑定关系。");
  }
  const { keyValues: _keyValues, views: _views, ...metadata } = av;
  return {
    name: av.name as string, rowIds: [...rowIds], primaryValues,
    metadataFingerprint: digest([metadata, columns.map(({ values: _values, ...column }) => digest(column))]),
    viewsFingerprint: SHA256(JSON.stringify(views.map((view) => digest(view)))).toString(),
    rowsFingerprint: SHA256(JSON.stringify(primaryValues.filter((value) => value.blockID !== newId).map((value) =>
      digest([value.blockID, cellsByKey.map((cells) => cells.get(value.blockID) ?? null)])))).toString(),
  };
}
