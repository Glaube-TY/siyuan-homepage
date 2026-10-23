import SHA256 from "crypto-js/sha256";
import { readAttributeViewSafeOutput } from "../../features/kb/services/agent-workbench/tools/siyuan/impl/read-attribute-view.impl";
import {
  HOMEPAGE_MCP_DATABASE_WRITES, homepageMcpDatabaseUpdateSchema, homepageMcpDatabaseClearSchema, homepageMcpWritePreviewSchema,
  type HomepageMcpDatabaseClear, type HomepageMcpDatabaseWriteAction, type HomepageMcpWritePreview,
} from "../../features/agent-platform/mcp-server/homepage-mcp-write-preview";
import { fingerprintHomepageMcpValue } from "./homepage-mcp-write-access";

export interface PreparedDatabaseWrite {
  preview: HomepageMcpWritePreview;
  stateFingerprint: string;
  metadataFingerprint: string;
  otherCellsFingerprint: string;
  oldTextFingerprint: string;
}

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
function display(value: string): string {
  // 审批不保存疑似凭据或完整路径；遇到这类文本时拒绝生成预览。
  if (/(?:authorization|bearer|token|api[_-]?key|password|secret|cookie)\s*[=:： ]/i.test(value) ||
    /(?:[a-z]:[\\/]|\\\\|(?:^|[\s"'=])\/[\w.~-]+\/)/i.test(value)) throw new Error("审批目标含敏感信息，无法安全展示。");
  const escaped = Array.from(value, (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    ? JSON.stringify(char).slice(1, -1) : char).join("");
  const shown = escaped.length > 800 ? `${escaped.slice(0, 800)}（已截断，原文 ${value.length} 字符）` : escaped || "（空文本）";
  return shown + (escaped === value ? "" : "（控制字符以转义形式显示）");
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
  return { preview, metadataFingerprint: target.metadataFingerprint, otherCellsFingerprint: target.otherCellsFingerprint,
    oldTextFingerprint: digest(target.oldText),
    stateFingerprint: SHA256(JSON.stringify([target.metadataFingerprint, target.otherCellsFingerprint, target.targetFingerprint, preview])).toString() };
}

export async function verifyHomepageMcpDatabaseWrite(action: HomepageMcpDatabaseWriteAction, args: Record<string, unknown>, prepared: PreparedDatabaseWrite, data: unknown): Promise<boolean> {
  const input = (action === "clear_cell" ? homepageMcpDatabaseClearSchema : homepageMcpDatabaseUpdateSchema).parse(args);
  const envelope = record(data), result = record(envelope.result);
  if (envelope.action !== action || result.status !== "success" || result.databaseId !== input.databaseId) return false;
  let newText = "";
  if (action === "clear_cell") {
    if (result.rowId !== input.rowId || result.keyId !== input.keyId || result.fieldName !== input.expectedFieldName ||
      typeof result.oldValueText !== "string" || digest(result.oldValueText) !== prepared.oldTextFingerprint) return false;
  } else {
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
