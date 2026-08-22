import type { AttributeView, AttributeViewKeyValue } from "@/api";
import type { ReadAttributeViewOutput } from "../../contracts/read-attribute-view.contract";

export interface NormalizedAttributeViewKey {
  keyId: string;
  name: string;
  type: string;
  icon?: string;
}

export interface NormalizedAttributeViewRow {
  rowId: string;
  boundBlockId?: string;
  title?: string;
  cells: Record<string, {
    keyId: string;
    name: string;
    type: string;
    text: string;
    raw?: unknown;
  }>;
}

interface RowAccumulator {
  rowId: string;
  boundBlockId?: string;
  values: Map<string, unknown>;
}

const MAX_CELL_TEXT_LENGTH = 200;
const MAX_ROW_FIELDS = 30;

export function normalizeFieldName(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function truncateAttributeViewText(text: string, maxLength = MAX_CELL_TEXT_LENGTH): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function normalizeRawKeyValue(item: any): AttributeViewKeyValue | null {
  const key = item?.key || item;
  const keyId = safeString(key?.id ?? key?.keyID ?? item?.keyID);
  const name = safeString(key?.name ?? key?.keyName ?? item?.name);
  if (!keyId || !name) return null;

  return {
    key: {
      id: keyId,
      name,
      type: safeString(key?.type ?? item?.type) || "text",
    },
    values: Array.isArray(item?.values) ? item.values : [],
  };
}

export function normalizeAttributeViewKeyValues(raw: any): AttributeViewKeyValue[] {
  const source =
    (Array.isArray(raw) && raw) ||
    (Array.isArray(raw?.keys) && raw.keys) ||
    (Array.isArray(raw?.data) && raw.data) ||
    (Array.isArray(raw?.keyValues) && raw.keyValues) ||
    (Array.isArray(raw?.av?.keyValues) && raw.av.keyValues) ||
    (Array.isArray(raw?.data?.keys) && raw.data.keys) ||
    [];

  return source
    .map(normalizeRawKeyValue)
    .filter((item): item is AttributeViewKeyValue => item !== null);
}

export function mergeAttributeViewSchema(av: AttributeView, rawKeys: any): AttributeView {
  const schemaKeyValues = normalizeAttributeViewKeyValues(rawKeys);
  if (schemaKeyValues.length === 0) return av;

  const mergedKeyValues = schemaKeyValues.map((schemaKeyValue) => {
    const dataKeyValue = av.keyValues.find((item) => item.key.id === schemaKeyValue.key.id);
    return {
      ...schemaKeyValue,
      values: dataKeyValue?.values || schemaKeyValue.values || [],
    };
  });

  for (const dataKeyValue of av.keyValues) {
    if (!mergedKeyValues.some((item) => item.key.id === dataKeyValue.key.id)) {
      mergedKeyValues.push(dataKeyValue);
    }
  }

  return { ...av, keyValues: mergedKeyValues };
}

export function normalizeAttributeViewSchema(av: AttributeView): NormalizedAttributeViewKey[] {
  return (av.keyValues || [])
    .map((keyValue: any) => ({
      keyId: safeString(keyValue?.key?.id ?? keyValue?.keyID),
      name: safeString(keyValue?.key?.name ?? keyValue?.name),
      type: safeString(keyValue?.key?.type ?? keyValue?.type) || "text",
      icon: safeString(keyValue?.key?.icon ?? keyValue?.icon) || undefined,
    }))
    .filter((item) => item.keyId && item.name);
}

function normalizeView(raw: any, fallbackViewId?: string | null) {
  const viewId = safeString(raw?.id ?? raw?.viewID ?? raw?.viewId) || fallbackViewId || null;
  return {
    viewId,
    name: safeString(raw?.name) || undefined,
    type: safeString(raw?.type ?? raw?.viewType) || undefined,
  };
}

export function normalizeAttributeViewViews(av: AttributeView, renderResult: any, requestedViewId?: string | null) {
  const source =
    (Array.isArray(renderResult?.views) && renderResult.views) ||
    (Array.isArray(renderResult?.data?.views) && renderResult.data.views) ||
    (Array.isArray(av.views) && av.views) ||
    (Array.isArray((av.raw as any)?.views) && (av.raw as any).views) ||
    [];
  const views = source.map((view: any) => normalizeView(view)).filter((view: any) => view.viewId);

  if (views.length === 0 && (renderResult?.viewID || renderResult?.viewId || requestedViewId)) {
    views.push(normalizeView(renderResult, requestedViewId ?? null));
  }

  return views;
}

/**
 * 从单元格值中提取可读文本。
 * 递归处理嵌套对象，避免输出 [object Object]。
 */
export function extractAttributeViewCellText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return truncateAttributeViewText(String(value));
  }

  // 不是对象时，安全转为字符串
  if (typeof value !== "object") {
    return truncateAttributeViewText(String(value));
  }

  // 优先读取常见的内容字段
  const direct =
    value.text?.content ??
    value.block?.content ??
    value.number?.content ??
    value.date?.content ??
    value.url?.content ??
    value.email?.content ??
    value.phone?.content ??
    value.template?.content ??
    value.content ??
    value.name ??
    value.label ??
    value.title;
  if (direct !== undefined && direct !== null) {
    // 如果 direct 仍是对象，递归解析
    if (typeof direct === "object") {
      return extractAttributeViewCellText(direct);
    }
    return truncateAttributeViewText(String(direct));
  }

  // value.value 可能是嵌套对象，需要递归
  if (value.value !== undefined && value.value !== null) {
    if (typeof value.value === "object") {
      return extractAttributeViewCellText(value.value);
    }
    return truncateAttributeViewText(String(value.value));
  }

  if (value.checkbox?.checked !== undefined) {
    return value.checkbox.checked ? "true" : "false";
  }

  const selectValues = Array.isArray(value.mSelect)
    ? value.mSelect
    : Array.isArray(value.select)
      ? value.select
      : [];
  if (selectValues.length > 0) {
    return truncateAttributeViewText(
      selectValues
        .map((item: any) => {
          if (item === null || item === undefined) return "";
          if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
            return String(item);
          }
          if (typeof item !== "object") return String(item);
          // 对象类型：优先读取 content/name/label/title
          const itemText =
            item.content ??
            item.name ??
            item.label ??
            item.title ??
            item.text?.content ??
            item.value?.content;
          if (itemText !== undefined && itemText !== null) {
            // 如果提取到的值仍是对象，递归
            if (typeof itemText === "object") {
              return extractAttributeViewCellText(itemText);
            }
            return String(itemText);
          }
          // 最后兜底：递归解析整个 item
          return extractAttributeViewCellText(item);
        })
        .filter(Boolean)
        .join(", "),
    );
  }

  // 最后兜底：尝试提取有意义的字符串值，避免 [object Object]
  if (typeof value.toString === "function") {
    const str = value.toString();
    if (str !== "[object Object]") {
      return truncateAttributeViewText(str);
    }
  }

  return "";
}

/**
 * 严格读取真实 rowId/itemID。
 * 只允许 itemID、itemId、rowID、rowId 作为真实 rowId 来源。
 * 不允许 blockID、blockId、boundBlockID、boundBlockId、id 推导 rowId。
 */
export function readStrictItemId(value: any): string {
  return safeString(value?.itemID ?? value?.itemId ?? value?.rowID ?? value?.rowId);
}

/**
 * 读取 render row 的 itemID。
 * 对 renderAttributeView 的 row 对象，如果它有 cells 数组，则允许 row.id 作为 itemID。
 * 这个规则只限 render row，不得用于 cell.id、普通对象 id、SQL block id。
 */
function readRenderRowItemId(value: any): string {
  // 先尝试标准字段
  const strictId = readStrictItemId(value);
  if (strictId) return strictId;

  // 只有当 row 有 cells 数组时（render row 特征），才允许 row.id 作为 itemID
  if (value && Array.isArray(value.cells) && value.cells.length > 0) {
    const id = safeString(value?.id);
    if (id) return id;
  }

  return "";
}

/**
 * 读取可能的 boundBlockId。
 * 只读取 blockID、blockId、boundBlockID、boundBlockId。
 */
export function readPossibleBoundBlockId(value: any): string | undefined {
  const blockId = safeString(value?.boundBlockID ?? value?.boundBlockId ?? value?.blockID ?? value?.blockId);
  return blockId || undefined;
}

function readBoundBlockId(value: any, rowId: string): string | undefined {
  const blockId = readPossibleBoundBlockId(value);
  if (!blockId || blockId === rowId) return undefined;
  return blockId;
}

interface GroupRowsResult {
  rows: RowAccumulator[];
  skippedValues: number;
}

function groupRows(av: AttributeView): GroupRowsResult {
  // 收集所有 view 的 itemIds，用于验证 blockID 是否可以作为 itemID
  const itemIdsSet = new Set<string>();
  const views = (av as any)?.views ?? (av as any)?.raw?.views ?? [];
  for (const view of views) {
    const itemIds = view?.itemIds ?? view?.itemIDs ?? [];
    if (Array.isArray(itemIds)) {
      for (const id of itemIds) {
        if (id) itemIdsSet.add(String(id));
      }
    }
  }

  const rowMap = new Map<string, RowAccumulator>();
  let skippedValues = 0;

  for (const keyValue of av.keyValues || []) {
    for (const value of keyValue.values || []) {
      const rowId = readStrictItemId(value);
      if (!rowId) {
        // 尝试从 value.blockID 读取（仅当它出现在 itemIds 中时）
        const blockId = safeString(value?.blockID ?? value?.blockId);
        if (blockId && itemIdsSet.has(blockId)) {
          // blockID 在 itemIds 中，可以作为 itemID
          if (!rowMap.has(blockId)) {
            rowMap.set(blockId, {
              rowId: blockId,
              boundBlockId: readBoundBlockId(value, blockId),
              values: new Map<string, unknown>(),
            });
          }
          const row = rowMap.get(blockId);
          if (!row) continue;
          row.values.set(keyValue.key.id, value);
          row.boundBlockId = row.boundBlockId || readBoundBlockId(value, blockId);
        } else {
          skippedValues++;
        }
        continue;
      }

      if (!rowMap.has(rowId)) {
        rowMap.set(rowId, {
          rowId,
          boundBlockId: readBoundBlockId(value, rowId),
          values: new Map<string, unknown>(),
        });
      }
      const row = rowMap.get(rowId);
      if (!row) continue;
      row.values.set(keyValue.key.id, value);
      row.boundBlockId = row.boundBlockId || readBoundBlockId(value, rowId);
    }
  }

  return { rows: Array.from(rowMap.values()), skippedValues };
}

function buildRow(row: RowAccumulator, schema: NormalizedAttributeViewKey[], includeRaw: boolean): NormalizedAttributeViewRow {
  const cells: NormalizedAttributeViewRow["cells"] = {};
  const limitedSchema = schema.slice(0, MAX_ROW_FIELDS);

  for (const key of limitedSchema) {
    const rawValue = row.values.get(key.keyId);
    const cell: NormalizedAttributeViewRow["cells"][string] = {
      keyId: key.keyId,
      name: key.name,
      type: key.type,
      text: extractAttributeViewCellText(rawValue),
    };
    if (includeRaw) {
      cell.raw = rawValue;
    }
    cells[key.keyId] = cell;
  }

  const primaryKey = schema.find((key) => key.type === "block") ?? schema[0];
  const title = primaryKey ? cells[primaryKey.keyId]?.text : undefined;

  return {
    rowId: row.rowId,
    boundBlockId: row.boundBlockId,
    title: title || undefined,
    cells,
  };
}

export function findAttributeViewKeyById(schema: NormalizedAttributeViewKey[], keyId: string): NormalizedAttributeViewKey | undefined {
  return schema.find((key) => key.keyId === keyId);
}

export function findUniqueAttributeViewKeyByName(
  schema: NormalizedAttributeViewKey[],
  fieldName: string,
): { key?: NormalizedAttributeViewKey; status: "found" | "missing" | "ambiguous" } {
  const normalized = normalizeFieldName(fieldName);
  const matches = schema.filter((key) => normalizeFieldName(key.name) === normalized);
  if (matches.length === 1) return { key: matches[0], status: "found" };
  if (matches.length > 1) return { status: "ambiguous" };
  return { status: "missing" };
}

interface NormalizeRenderRowsResult {
  rows: RowAccumulator[];
  skippedRows: number;
  skippedValues: number;
  rowsSource: string;
}

/**
 * 从 cell/value 对象中读取 keyId。
 * 优先读取 cell.value.keyID / cell.value.keyId / cell.keyID / cell.keyId / cell.key?.id。
 * 只有当 id 与 schema 中某个 keyId 完全匹配时才使用 id。
 */
function readCellKeyId(cell: any, schemaKeyIds: Set<string>): string {
  // 优先从 cell.value 中读取 keyID（真实 API 路径）
  const valueKeyId = safeString(cell?.value?.keyID ?? cell?.value?.keyId);
  if (valueKeyId) return valueKeyId;

  // 然后从 cell 直接读取
  const directKeyId = safeString(cell?.keyID ?? cell?.keyId ?? cell?.key?.id);
  if (directKeyId) return directKeyId;

  // cell.id 只有在匹配 schema keyId 时才可用（注意：cell.id 通常是 cellID，不是 keyId）
  const cellId = safeString(cell?.id);
  if (cellId && schemaKeyIds.has(cellId)) return cellId;
  return "";
}

/**
 * 从单元格包装对象中提取实际值。
 * 如果值是 { value: {...}, cellID: "..." } 形式的包装对象，返回 value 部分。
 * 否则返回原值。
 */
function unwrapCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  // 如果是包装对象且有 value 属性，提取 value
  if ("value" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

function normalizeRenderRows(renderResult: any, schema: NormalizedAttributeViewKey[], viewId?: string | null): NormalizeRenderRowsResult | null {
  if (!renderResult) return null;

  const schemaKeyIds = new Set(schema.map((k) => k.keyId));

  // 优先使用 view.rows（真实 API 快照路径），然后是其他常见路径
  // 如果提供了 viewId，优先匹配 view.id 或 viewID
  let rawRows: any[] | null = null;
  let rowsSource = "";

  // 1. 优先检查 view.rows（真实 API 路径）
  const view = renderResult.view;
  if (view && Array.isArray(view.rows)) {
    // 如果提供了 viewId，验证 view 匹配
    const viewMatchId = safeString(view.id ?? view.viewID ?? view.viewId);
    if (!viewId || viewMatchId === viewId || !viewMatchId) {
      rawRows = view.rows;
      rowsSource = "renderAttributeView.view.rows";
    }
  }

  // 2. 检查 data.view.rows
  if (!rawRows && renderResult.data?.view && Array.isArray(renderResult.data.view.rows)) {
    const viewMatchId = safeString(renderResult.data.view.id ?? renderResult.data.view.viewID ?? renderResult.data.view.viewId);
    if (!viewId || viewMatchId === viewId || !viewMatchId) {
      rawRows = renderResult.data.view.rows;
      rowsSource = "renderAttributeView.data.view.rows";
    }
  }

  // 3. 兼容其他常见路径
  if (!rawRows) {
    rawRows =
      (Array.isArray(renderResult.rows) && renderResult.rows) ||
      (Array.isArray(renderResult.items) && renderResult.items) ||
      (Array.isArray(renderResult.data?.rows) && renderResult.data.rows) ||
      (Array.isArray(renderResult.data?.items) && renderResult.data.items) ||
      null;
    if (rawRows) {
      rowsSource = "renderAttributeView.rows/data.rows";
    }
  }

  if (!rawRows || rawRows.length === 0) return null;

  const rowMap = new Map<string, RowAccumulator>();
  let skippedRows = 0;
  let skippedValues = 0;

  for (const rawRow of rawRows) {
    // 使用 readRenderRowItemId 读取 rowId，支持 render row 的 row.id 作为 itemID
    const rowId = readRenderRowItemId(rawRow);
    if (!rowId) {
      skippedRows++;
      continue;
    }

    if (!rowMap.has(rowId)) {
      rowMap.set(rowId, {
        rowId,
        boundBlockId: readBoundBlockId(rawRow, rowId),
        values: new Map<string, unknown>(),
      });
    }
    const row = rowMap.get(rowId);
    if (!row) continue;
    row.boundBlockId = row.boundBlockId || readBoundBlockId(rawRow, rowId);

    // 从 rawRow.cells / rawRow.values / rawRow 字段中提取值
    // 兼容 cells 为数组的情况：每个 cell 可能有 keyID/keyId/id 和 value
    let cellsSource: Record<string, unknown> | null = null;
    if (rawRow.cells) {
      if (Array.isArray(rawRow.cells)) {
        // cells 为数组：转换为对象映射
        cellsSource = {};
        for (const cell of rawRow.cells) {
          const cellKeyId = readCellKeyId(cell, schemaKeyIds);
          if (cellKeyId) {
            // 优先使用 cell.value（真实 API 结构），否则使用 cell 本身
            (cellsSource as Record<string, unknown>)[cellKeyId] = cell?.value ?? cell;
          } else {
            skippedValues++;
          }
        }
      } else if (typeof rawRow.cells === "object") {
        cellsSource = rawRow.cells;
      }
    }

    if (!cellsSource && rawRow.values) {
      if (Array.isArray(rawRow.values)) {
        // values 为数组：转换为对象映射
        cellsSource = {};
        for (const val of rawRow.values) {
          const valKeyId = readCellKeyId(val, schemaKeyIds);
          if (valKeyId) {
            (cellsSource as Record<string, unknown>)[valKeyId] = val?.value ?? val;
          } else {
            skippedValues++;
          }
        }
      } else if (typeof rawRow.values === "object") {
        cellsSource = rawRow.values;
      }
    }

    if (cellsSource) {
      for (const key of schema) {
        const cellValue = cellsSource[key.keyId] ?? cellsSource[key.name];
        if (cellValue !== undefined) {
          // 解包单元格包装对象，避免展示 [object Object]
          row.values.set(key.keyId, unwrapCellValue(cellValue));
        }
      }
    } else {
      // 尝试从 rawRow 的直接字段中读取
      for (const key of schema) {
        const directValue = rawRow[key.keyId] ?? rawRow[key.name];
        if (directValue !== undefined) {
          row.values.set(key.keyId, unwrapCellValue(directValue));
        }
      }
    }
  }

  return { rows: Array.from(rowMap.values()), skippedRows, skippedValues, rowsSource };
}

/**
 * 检查 raw view 是否存在有效筛选、排序或分组约束。
 * 同时支持思源真实顶层数组形态与兼容嵌套形态。
 * 空筛选占位（字段/操作符/值均空）不算有效约束；value 为空不排除 is-empty 类操作。
 */
export function hasEffectiveViewConstraints(rawView: any): boolean {
  if (!rawView || typeof rawView !== "object") return false;
  const type = safeString(rawView.type ?? rawView.viewType);
  if (type === "kanban" || type === "gallery") return true;

  // group 为视图自身字段，非空即视为约束
  if (rawView.group && typeof rawView.group === "object" && Object.keys(rawView.group).length > 0) return true;

  // filters：支持顶层数组和嵌套 .filters
  const filterSource = Array.isArray(rawView.filters)
    ? rawView.filters
    : Array.isArray(rawView.filters?.filters) ? rawView.filters.filters : [];
  for (const f of filterSource) {
    if (!f || typeof f !== "object") continue;
    // 字段 + 操作符即可成立，value 可为空（is-empty 类）
    const col = safeString(f.column ?? f.field ?? f.keyID);
    const op = safeString(f.operator ?? f.condition);
    if (col && op) return true;
  }

  // sorts：支持顶层数组、嵌套 .sorts、sortRules 兼容
  const sortSource = Array.isArray(rawView.sorts)
    ? rawView.sorts
    : Array.isArray(rawView.sorts?.sorts) ? rawView.sorts.sorts
    : Array.isArray(rawView.sortRules) ? rawView.sortRules : [];
  for (const s of sortSource) {
    if (!s || typeof s !== "object") continue;
    const field = safeString(s.column ?? s.field);
    const dir = safeString(s.direction ?? s.order);
    if (field && dir) return true;
  }

  return false;
}

/**
 * 从原始 AV 结构收集所有真实 rowId/itemId 的权威共享边界。
 * blockID 准入只依赖 view itemIds 的不可变快照，keyValues 严格 itemID 不得反向扩大该快照。
 */
export function collectAttributeViewRowIds(av: AttributeView): Set<string> {
  const ids = new Set<string>();
  const views = (av as any)?.views ?? (av as any)?.raw?.views ?? [];

  // 固定不可变的 view itemIds 快照，blockID 准入仅依赖此快照
  const viewItemIdsSnapshot = new Set<string>();
  for (const view of views) {
    const itemIds = view?.itemIds ?? view?.itemIDs ?? [];
    if (Array.isArray(itemIds)) {
      for (const id of itemIds) { if (id) { ids.add(String(id)); viewItemIdsSnapshot.add(String(id)); } }
    }
  }

  for (const keyValue of av.keyValues ?? []) {
    for (const value of keyValue.values ?? []) {
      const rowId = readStrictItemId(value);
      if (rowId) { ids.add(rowId); continue; }
      // blockID 只有原本就在 view itemIds 快照中时才可当作 rowId
      const blockId = safeString(value?.blockID ?? value?.blockId);
      if (blockId && viewItemIdsSnapshot.has(blockId)) ids.add(blockId);
    }
  }
  return ids;
}

export function normalizeAttributeViewRead(params: {
  databaseId: string;
  av: AttributeView;
  renderResult?: any;
  viewId?: string | null;
  includeRows: boolean;
  rowLimit: number;
  includeRaw: boolean;
}): ReadAttributeViewOutput {
  const warnings: string[] = [];
  const schema = normalizeAttributeViewSchema(params.av);
  const views = normalizeAttributeViewViews(params.av, params.renderResult, params.viewId ?? null);
  const selectedViewId =
    params.viewId ||
    safeString(params.renderResult?.viewID ?? params.renderResult?.viewId) ||
    views[0]?.viewId ||
    null;

  // 合并语义：区分"Render 已执行但返回空"与"Render 未执行"。
  // 有约束视图：Render 已执行即为成员/顺序权威（含空结果）。
  // 无约束视图：Render 有行时合并 fallback，无行时走 fallback。
  const renderAttempted = params.includeRows && params.renderResult != null;
  const renderResult = params.includeRows ? normalizeRenderRows(params.renderResult, schema, params.viewId) : null;
  const fallbackGrouped = groupRows(params.av);

  const rawViews = (params.av as any)?.views ?? (params.av as any)?.raw?.views ?? [];
  const currentRawView = rawViews.find((v: any) => safeString(v?.id ?? v?.viewID ?? v?.viewId) === selectedViewId);
  const constrained = hasEffectiveViewConstraints(currentRawView);

  let groupedRows: RowAccumulator[];
  if (constrained && renderAttempted) {
    // 有约束 + Render 已执行：Render 是成员/顺序权威（含空结果）
    groupedRows = renderResult ? renderResult.rows : [];
    if (fallbackGrouped.rows.length > groupedRows.length) {
      warnings.push(`当前视图存在筛选/排序/分组约束，renderAttributeView 返回 ${groupedRows.length} 行为权威结果；原始数据中另有 ${fallbackGrouped.rows.length} 条未被当前视图渲染。`);
    }
  } else if (!constrained && renderResult && renderResult.rows.length > 0) {
    // 无约束 + Render 有行：Render 值优先，fallback 补充缺失 rowId 和字段
    const fallbackById = new Map(fallbackGrouped.rows.map((row) => [row.rowId, row]));
    const mergedById = new Map<string, RowAccumulator>();

    for (const renderRow of renderResult.rows) {
      const fallbackRow = fallbackById.get(renderRow.rowId);
      if (!fallbackRow) {
        mergedById.set(renderRow.rowId, renderRow);
        continue;
      }
      const values = new Map(fallbackRow.values);
      for (const [keyId, value] of renderRow.values) values.set(keyId, value);
      mergedById.set(renderRow.rowId, {
        rowId: renderRow.rowId,
        boundBlockId: renderRow.boundBlockId ?? fallbackRow.boundBlockId,
        values,
      });
    }
    for (const fallbackRow of fallbackGrouped.rows) {
      if (!mergedById.has(fallbackRow.rowId)) mergedById.set(fallbackRow.rowId, fallbackRow);
    }

    const orderedItemIds = Array.isArray(currentRawView?.itemIds ?? currentRawView?.itemIDs)
      ? ((currentRawView.itemIds ?? currentRawView.itemIDs) as unknown[]).map(String)
      : null;
    const mergedArray = Array.from(mergedById.values());
    if (orderedItemIds && orderedItemIds.length > 0) {
      const orderIndex = new Map(orderedItemIds.map((id, i) => [id, i]));
      mergedArray.sort((a, b) =>
        (orderIndex.get(a.rowId) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(b.rowId) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    groupedRows = mergedArray;

    if (fallbackGrouped.rows.length > renderResult.rows.length) {
      warnings.push(`renderAttributeView 仅返回 ${renderResult.rows.length} 行（可能为部分渲染），已从原始数据合并补充至 ${groupedRows.length} 行。`);
    }
  } else {
    // Render 未执行，或无约束且 Render 返回空
    groupedRows = fallbackGrouped.rows;
  }

  const truncated = params.includeRows && groupedRows.length > params.rowLimit;
  if (schema.length > MAX_ROW_FIELDS) {
    warnings.push(`每行最多返回 ${MAX_ROW_FIELDS} 个字段，已截断字段摘要。`);
  }
  if (truncated) {
    warnings.push(`行数超过 ${params.rowLimit}，已截断。可缩小视图、关键词或调整 rowLimit。`);
  }
  if (renderResult && renderResult.rows.length > 0) {
    warnings.push(`行数据来自 ${renderResult.rowsSource}。`);
  }
  if (renderResult && renderResult.skippedRows > 0) {
    warnings.push(`部分行缺少真实 rowId（itemID/rowID），已从可写行列表中跳过 ${renderResult.skippedRows} 行。`);
  }
  if (renderResult && renderResult.skippedValues > 0) {
    warnings.push(`部分单元格缺少明确 keyId，已跳过 ${renderResult.skippedValues} 个值。`);
  }
  // fallback 路径：keyValues 中有值但全部缺少 rowId
  if (!renderResult && fallbackGrouped.skippedValues > 0 && fallbackGrouped.rows.length === 0) {
    warnings.push("数据库返回了字段值，但缺少真实 rowId（itemID/rowID），为避免误写已不输出可写行。");
  } else if (!renderResult && fallbackGrouped.skippedValues > 0) {
    warnings.push(`部分 keyValues 缺少真实 rowId，已跳过 ${fallbackGrouped.skippedValues} 个值。`);
  }

  const rows = params.includeRows
    ? groupedRows
        .slice(0, params.rowLimit)
        .map((row) => buildRow(row, schema, params.includeRaw))
    : undefined;

  return {
    database: {
      databaseId: params.databaseId,
      name: params.av.name || "",
      views,
    },
    viewId: selectedViewId,
    schema,
    rows,
    rowCount: groupedRows.length,
    truncated,
    warnings: warnings.length > 0 ? warnings : undefined,
    raw: params.includeRaw ? { av: params.av.raw, renderResult: params.renderResult } : undefined,
  };
}
