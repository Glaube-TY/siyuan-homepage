import {
  getAttributeView,
  getAttributeViewKeysByAvID,
  performTransactionsChecked,
  type AttributeView,
  type AttributeViewKeyValue,
} from "@/api";
import type { CYBMOKRecord } from "../CYBMOK/cybmokData";
import type { CountdownEventInput } from "../countdown/countdownData";
import type { FixedAssetRecord } from "../fixedAssets/fixedAssetsData";
import type { FocusStatistics } from "../focus/focusData";
import type { ReviewLogEntry } from "../reviewDocs/reviewDocsTypes";

export interface LegacyDatabaseRow<T> {
  databaseId: string;
  rowId: string;
  srcId: string;
  data: T;
}

export interface LegacyDatabaseScanResult<T> {
  databaseId: string;
  totalRowCount: number;
  recognizedRowCount: number;
  schemaMatched: boolean;
  rows: Array<LegacyDatabaseRow<T>>;
}

export function assertLegacyDatabaseScanSafe<T>(
  scan: LegacyDatabaseScanResult<T>,
): void {
  if (
    scan.totalRowCount > 0 &&
    (!scan.schemaMatched || scan.recognizedRowCount === 0)
  ) {
    throw new Error(
      `旧数据库存在记录，但无法确认组件数据结构，旧数据和配置均未删除：${scan.databaseId}`,
    );
  }
}

type LegacyRow = {
  rowId: string;
  srcId: string;
  values: Map<string, any>;
};

const ALIASES = {
  focus: {
    recordId: ["recordId", "记录ID", "dataId"],
    totalFocusTime: ["totalFocusTime", "累计专注时长", "专注总时长"],
    totalFocusTimes: ["totalFocusTimes", "累计专注次数", "专注总次数"],
  },
  cybmok: {
    title: ["title", "标题", "日期", "主键", "name"],
    date: ["date", "日期", "日"],
    count: ["count", "功德数", "次数"],
    createdAt: ["createdAt", "创建时间"],
    updatedAt: ["updatedAt", "更新时间"],
  },
  countdown: {
    title: ["title", "标题", "事件", "事件名称", "主键", "name"],
    eventId: ["eventId", "事件ID", "记录ID", "dataId"],
    name: ["name", "名称", "事件名称"],
    date: ["date", "日期", "事件日期"],
    anniversary: ["anniversary", "周年", "是否周年"],
    order: ["order", "排序", "序号"],
    createdAt: ["createdAt", "创建时间"],
    updatedAt: ["updatedAt", "更新时间"],
    archived: ["archived", "已归档", "归档", "已删除"],
  },
  fixedAssets: {
    assetId: ["assetId", "资产ID", "dataId", "记录ID", "数据ID"],
    title: [
      "title",
      "标题",
      "资产名",
      "资产名称",
      "物品名称",
      "名称",
      "主键",
      "name",
    ],
    category: ["category", "分类"],
    icon: ["icon", "图标"],
    purchasePrice: ["purchasePrice", "购买价格", "价格"],
    extraCost: ["extraCost", "附加成本", "附加项"],
    purchaseDate: ["purchaseDate", "购买日期", "购入日期"],
    retireDate: ["retireDate", "退役日期"],
    warrantyDate: ["warrantyDate", "过保日期"],
    expectedDays: ["expectedDays", "预计天数", "预计使用天数"],
    costMode: ["costMode", "均价方式", "计算均价方式"],
    note: ["note", "备注"],
    createdAt: ["createdAt", "创建时间"],
    updatedAt: ["updatedAt", "更新时间"],
    archived: ["archived", "已归档", "归档", "已删除"],
  },
  reviewDocs: {
    logId: ["logId", "日志ID", "记录ID"],
    reviewId: ["reviewId", "复习计划ID"],
    targetId: ["targetId", "目标块ID", "块ID"],
    targetRootId: ["targetRootId", "所属文档ID", "文档ID"],
    targetType: ["targetType", "目标类型"],
    targetTitle: ["targetTitle", "标题快照"],
    targetPath: ["targetPath", "路径快照"],
    action: ["action", "操作"],
    actionAt: ["actionAt", "操作时间"],
    previousDueDate: ["previousDueDate", "原复习日期"],
    nextDueDate: ["nextDueDate", "下次复习日期"],
    reviewCountBefore: ["reviewCountBefore", "原复习次数"],
    reviewCountAfter: ["reviewCountAfter", "复习次数"],
    intervalIndexBefore: ["intervalIndexBefore", "原间隔索引"],
    intervalIndexAfter: ["intervalIndexAfter", "间隔索引"],
    plan: ["plan", "计划类型"],
    intervals: ["intervals", "间隔配置"],
    category: ["category", "分类"],
    priority: ["priority", "优先级"],
    note: ["note", "备注"],
    createdAt: ["createdAt", "创建时间"],
    archived: ["archived", "已归档"],
  },
} as const;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeRawKeyValue(item: any): AttributeViewKeyValue | null {
  const key = item?.key || item;
  if (!key?.id || !key?.name) return null;
  return {
    key: { id: key.id, name: key.name, type: key.type || item?.type || "text" },
    values: item?.values || [],
  };
}

function normalizeSchema(raw: any): AttributeViewKeyValue[] {
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

async function loadAttributeViewReadOnly(
  databaseId: string,
): Promise<AttributeView | null> {
  const [av, rawKeys] = await Promise.all([
    getAttributeView(databaseId),
    getAttributeViewKeysByAvID(databaseId),
  ]);
  if (!av) return null;
  const schema = normalizeSchema(rawKeys);
  if (schema.length === 0) return av;
  const keyValues = schema.map((key) => ({
    ...key,
    values:
      av.keyValues.find((item) => item.key.id === key.key.id)?.values ||
      key.values ||
      [],
  }));
  for (const key of av.keyValues)
    if (!keyValues.some((item) => item.key.id === key.key.id))
      keyValues.push(key);
  return { ...av, keyValues };
}

function groupRows(av: AttributeView): LegacyRow[] {
  const rows = new Map<string, LegacyRow>();
  for (const keyValue of av.keyValues) {
    for (const value of keyValue.values || []) {
      const rowId =
        value?.itemID ||
        value?.itemId ||
        value?.rowID ||
        value?.rowId ||
        value?.blockID ||
        value?.blockId ||
        value?.id ||
        "";
      if (!rowId) continue;
      const srcId =
        value?.boundBlockID ||
        value?.boundBlockId ||
        value?.blockID ||
        value?.blockId ||
        rowId;
      if (!rows.has(rowId))
        rows.set(rowId, { rowId, srcId, values: new Map() });
      const row = rows.get(rowId)!;
      row.values.set(keyValue.key.id, value);
      if (srcId !== rowId) row.srcId = srcId;
    }
  }
  return Array.from(rows.values());
}

function stringContent(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function extractArrayContent(value: unknown, joinValues: boolean): string {
  if (!Array.isArray(value)) return "";
  const contents = value
    .map((item) => stringContent(item?.content ?? item?.name ?? item?.value))
    .map((item) => item.trim())
    .filter(Boolean);
  return joinValues ? contents.join(",") : contents[0] || "";
}

function extractText(value: any, joinValues = false): string {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (value.date?.isNotEmpty === false || value.number?.isNotEmpty === false)
    return "";
  const scalar =
    value.text?.content ??
    value.block?.content ??
    value.number?.content ??
    value.date?.content;
  if (scalar !== null && scalar !== undefined) return stringContent(scalar);
  const multiSelect = extractArrayContent(value.mSelect, joinValues);
  if (multiSelect) return multiSelect;
  const singleSelect = Array.isArray(value.sSelect)
    ? extractArrayContent(value.sSelect, false)
    : stringContent(
        value.sSelect?.content ?? value.sSelect?.name ?? value.sSelect?.value,
      );
  if (singleSelect) return singleSelect;
  const assets = extractArrayContent(value.mAsset, joinValues);
  if (assets) return assets;
  if (typeof value.checkbox?.checked === "boolean")
    return String(value.checkbox.checked);
  return stringContent(value.content);
}

type LegacyDateMode = "raw" | "local-date" | "iso";

function normalizeDateCellText(value: string, mode: LegacyDateMode): string {
  if (mode === "raw" || !value.trim()) return value;
  const text = value.trim();
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (mode === "local-date" && compact)
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  if (mode === "local-date" && /^\d{4}-\d{2}-\d{2}/.test(text))
    return text.slice(0, 10);
  const numeric = /^\d{10,13}$/.test(text) ? Number(text) : NaN;
  const date = Number.isFinite(numeric)
    ? new Date(text.length === 10 ? numeric * 1000 : numeric)
    : new Date(text);
  if (!Number.isFinite(date.getTime())) return value;
  if (mode === "iso") return date.toISOString();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function findKey(
  av: AttributeView,
  aliases: readonly string[],
  preferBlock = false,
): AttributeViewKeyValue | null {
  if (preferBlock) {
    const primary = av.keyValues.find((item) => item.key.type === "block");
    if (primary) return primary;
  }
  const names = aliases.map(normalizeName);
  return (
    av.keyValues.find((item) => names.includes(normalizeName(item.key.name))) ||
    null
  );
}

function createReader(av: AttributeView, row: LegacyRow) {
  return (
    aliases: readonly string[],
    preferBlock = false,
    joinValues = false,
    dateMode: LegacyDateMode = "raw",
  ): string => {
    const key = findKey(av, aliases, preferBlock);
    if (!key) return "";
    const text = extractText(row.values.get(key.key.id), joinValues);
    return key.key.type === "date"
      ? normalizeDateCellText(text, dateMode)
      : text;
  };
}

function truthy(value: string): boolean {
  return [
    "1",
    "true",
    "yes",
    "是",
    "周年",
    "已归档",
    "归档",
    "已删除",
  ].includes(value.trim().toLowerCase());
}

function numberValue(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function createStableLegacyReviewLogId(
  databaseId: string,
  rowId: string,
): string {
  return `legacy-review:${encodeURIComponent(databaseId)}:${encodeURIComponent(rowId)}`;
}

async function readRows<T>(
  databaseId: string,
  schemaMatches: (av: AttributeView) => boolean,
  parse: (av: AttributeView, row: LegacyRow) => T | null,
): Promise<LegacyDatabaseScanResult<T>> {
  const av = await loadAttributeViewReadOnly(databaseId);
  if (!av) throw new Error(`无法读取旧数据库：${databaseId}`);
  const groupedRows = groupRows(av);
  const totalRowCount = Math.max(
    groupedRows.length,
    ...av.keyValues.map((keyValue) =>
      Array.isArray(keyValue.values) ? keyValue.values.length : 0,
    ),
  );
  const rows = groupedRows
    .map((row) => {
      const data = parse(av, row);
      return data
        ? { databaseId, rowId: row.rowId, srcId: row.srcId, data }
        : null;
    })
    .filter((row): row is LegacyDatabaseRow<T> => row !== null);
  return {
    databaseId,
    totalRowCount,
    recognizedRowCount: rows.length,
    schemaMatched: schemaMatches(av),
    rows,
  };
}

export function readLegacyFocusDatabase(
  databaseId: string,
): Promise<LegacyDatabaseScanResult<FocusStatistics>> {
  return readRows(
    databaseId,
    (av) =>
      Boolean(
        findKey(av, ALIASES.focus.recordId) &&
          findKey(av, ALIASES.focus.totalFocusTime) &&
          findKey(av, ALIASES.focus.totalFocusTimes),
      ),
    (av, row) => {
      const read = createReader(av, row);
      if (read(ALIASES.focus.recordId) !== "focus-statistics") return null;
      return {
        totalFocusTime: numberValue(read(ALIASES.focus.totalFocusTime)),
        totalFocusTimes: numberValue(read(ALIASES.focus.totalFocusTimes)),
      };
    },
  );
}

export function readLegacyCYBMOKDatabase(
  databaseId: string,
): Promise<LegacyDatabaseScanResult<CYBMOKRecord>> {
  return readRows(
    databaseId,
    (av) =>
      Boolean(
        findKey(av, ALIASES.cybmok.count) &&
          (findKey(av, ALIASES.cybmok.date) ||
            findKey(av, ALIASES.cybmok.title, true)),
      ),
    (av, row) => {
      const read = createReader(av, row);
      const date =
        read(ALIASES.cybmok.date, false, false, "local-date") ||
        read(ALIASES.cybmok.title, true);
      const countText = read(ALIASES.cybmok.count);
      if (!date || !countText) return null;
      return {
        date,
        count: numberValue(countText),
        createdAt: read(ALIASES.cybmok.createdAt, false, false, "iso"),
        updatedAt: read(ALIASES.cybmok.updatedAt, false, false, "iso"),
      };
    },
  );
}

export function readLegacyCountdownDatabase(
  databaseId: string,
): Promise<LegacyDatabaseScanResult<CountdownEventInput>> {
  return readRows(
    databaseId,
    (av) =>
      Boolean(
        findKey(av, ALIASES.countdown.date) &&
          (findKey(av, ALIASES.countdown.name) ||
            findKey(av, ALIASES.countdown.title, true)),
      ),
    (av, row) => {
      const read = createReader(av, row);
      const name =
        read(ALIASES.countdown.name) || read(ALIASES.countdown.title, true);
      const date = read(ALIASES.countdown.date, false, false, "local-date");
      if (!name.trim() || !date.trim()) return null;
      return {
        id: read(ALIASES.countdown.eventId),
        name,
        date,
        anniversary: truthy(read(ALIASES.countdown.anniversary)),
        order: numberValue(read(ALIASES.countdown.order)),
        createdAt: read(ALIASES.countdown.createdAt, false, false, "iso"),
        updatedAt: read(ALIASES.countdown.updatedAt, false, false, "iso"),
        archived: truthy(read(ALIASES.countdown.archived)),
      };
    },
  );
}

export function readLegacyFixedAssetsDatabase(
  databaseId: string,
): Promise<LegacyDatabaseScanResult<FixedAssetRecord>> {
  return readRows(
    databaseId,
    (av) =>
      Boolean(
        findKey(av, ALIASES.fixedAssets.purchaseDate) &&
          findKey(av, ALIASES.fixedAssets.title, true),
      ),
    (av, row) => {
      const read = createReader(av, row);
      const name = read(ALIASES.fixedAssets.title, true);
      const purchaseDate = read(
        ALIASES.fixedAssets.purchaseDate,
        false,
        false,
        "local-date",
      );
      if (!name.trim() || !purchaseDate.trim()) return null;
      const mode = read(ALIASES.fixedAssets.costMode);
      return {
        id: read(ALIASES.fixedAssets.assetId),
        name,
        category: read(ALIASES.fixedAssets.category),
        icon: read(ALIASES.fixedAssets.icon) || "📦",
        purchasePrice: numberValue(read(ALIASES.fixedAssets.purchasePrice)),
        extraCost: numberValue(read(ALIASES.fixedAssets.extraCost)),
        purchaseDate,
        retireDate:
          read(ALIASES.fixedAssets.retireDate, false, false, "local-date") ||
          undefined,
        warrantyDate:
          read(ALIASES.fixedAssets.warrantyDate, false, false, "local-date") ||
          undefined,
        expectedDays:
          numberValue(read(ALIASES.fixedAssets.expectedDays)) || undefined,
        costMode:
          mode === "expectedLife" || mode === "retireDate" ? mode : "elapsed",
        note: read(ALIASES.fixedAssets.note) || undefined,
        createdAt: read(ALIASES.fixedAssets.createdAt, false, false, "iso"),
        updatedAt: read(ALIASES.fixedAssets.updatedAt, false, false, "iso"),
        archived: truthy(read(ALIASES.fixedAssets.archived)),
      };
    },
  );
}

export function readLegacyReviewDocsDatabase(
  databaseId: string,
): Promise<LegacyDatabaseScanResult<ReviewLogEntry>> {
  return readRows(
    databaseId,
    (av) =>
      Boolean(
        findKey(av, ALIASES.reviewDocs.targetId) &&
          findKey(av, ALIASES.reviewDocs.action),
      ),
    (av, row) => {
      const read = createReader(av, row);
      const targetId = read(ALIASES.reviewDocs.targetId);
      const action = read(ALIASES.reviewDocs.action);
      if (
        !targetId ||
        ![
          "create",
          "review",
          "postpone",
          "update",
          "finish",
          "remove",
        ].includes(action)
      )
        return null;
      return {
        logId:
          read(ALIASES.reviewDocs.logId) ||
          createStableLegacyReviewLogId(databaseId, row.rowId),
        reviewId: read(ALIASES.reviewDocs.reviewId),
        targetId,
        targetRootId: read(ALIASES.reviewDocs.targetRootId),
        targetType:
          read(ALIASES.reviewDocs.targetType) === "doc" ? "doc" : "block",
        targetTitle: read(ALIASES.reviewDocs.targetTitle),
        targetPath: read(ALIASES.reviewDocs.targetPath),
        action: action as ReviewLogEntry["action"],
        actionAt: read(ALIASES.reviewDocs.actionAt, false, false, "iso"),
        previousDueDate: read(
          ALIASES.reviewDocs.previousDueDate,
          false,
          false,
          "local-date",
        ),
        nextDueDate: read(
          ALIASES.reviewDocs.nextDueDate,
          false,
          false,
          "local-date",
        ),
        reviewCountBefore: numberValue(
          read(ALIASES.reviewDocs.reviewCountBefore),
        ),
        reviewCountAfter: numberValue(
          read(ALIASES.reviewDocs.reviewCountAfter),
        ),
        intervalIndexBefore: numberValue(
          read(ALIASES.reviewDocs.intervalIndexBefore),
        ),
        intervalIndexAfter: numberValue(
          read(ALIASES.reviewDocs.intervalIndexAfter),
        ),
        plan: read(ALIASES.reviewDocs.plan),
        intervals: read(ALIASES.reviewDocs.intervals, false, true),
        category: read(ALIASES.reviewDocs.category),
        priority: read(ALIASES.reviewDocs.priority),
        note: read(ALIASES.reviewDocs.note),
        createdAt: read(ALIASES.reviewDocs.createdAt, false, false, "iso"),
        archived: read(ALIASES.reviewDocs.archived),
      };
    },
  );
}

export async function removeLegacyAttributeViewRows(
  databaseId: string,
  rows: Array<{ rowId: string; srcId?: string }>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += 50) {
    const batch = rows.slice(index, index + 50);
    await performTransactionsChecked([
      {
        doOperations: [
          {
            action: "removeAttrViewBlock",
            avID: databaseId,
            srcIDs: batch.map((row) => row.srcId || row.rowId),
          },
        ],
        undoOperations: [],
      },
    ]);
  }
}

export async function verifyLegacyRowsRemoved(
  databaseId: string,
  rowIds: string[],
): Promise<void> {
  const av = await loadAttributeViewReadOnly(databaseId);
  if (!av) throw new Error(`旧数据库清理后无法重新读取：${databaseId}`);
  const remaining = new Set(groupRows(av).map((row) => row.rowId));
  const notRemoved = rowIds.filter((rowId) => remaining.has(rowId));
  if (notRemoved.length > 0)
    throw new Error(`旧数据库行删除校验失败：${databaseId}`);
}

export async function getRemainingLegacyRowIds(
  databaseId: string,
  rowIds: string[],
): Promise<string[]> {
  const av = await loadAttributeViewReadOnly(databaseId);
  if (!av) throw new Error(`旧数据库清理后无法重新读取：${databaseId}`);
  const remaining = new Set(groupRows(av).map((row) => row.rowId));
  return rowIds.filter((rowId) => remaining.has(rowId));
}

export async function getLegacyAttributeViewRowIds(
  databaseId: string,
): Promise<string[]> {
  const av = await loadAttributeViewReadOnly(databaseId);
  if (!av) throw new Error(`无法读取旧数据库：${databaseId}`);
  return groupRows(av).map((row) => row.rowId);
}
