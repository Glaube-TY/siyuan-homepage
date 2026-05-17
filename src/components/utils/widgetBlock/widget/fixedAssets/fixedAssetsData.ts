import {
    addAttributeViewKey,
    appendAttributeViewDetachedBlocksWithValues,
    getAttributeView,
    getAttributeViewKeysByAvID,
    removeAttributeViewKey,
    setAttributeViewBlockAttr,
    type AttributeView,
    type AttributeViewKeyValue,
} from "@/api";

export const FIXED_ASSET_FIELD_ALIASES = {
    assetId: ["assetId", "资产ID", "dataId", "记录ID", "数据ID"],
    title: ["title", "标题", "资产名", "资产名称", "物品名称", "名称", "主键", "name"],
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
};

type FixedAssetField = keyof typeof FIXED_ASSET_FIELD_ALIASES;

const FIXED_ASSET_FIELD_DEFINITIONS: Record<FixedAssetField, { name: string; type: string; icon: string }> = {
    assetId: { name: "资产ID", type: "text", icon: "iconKey" },
    title: { name: "资产名", type: "text", icon: "iconEdit" },
    category: { name: "分类", type: "text", icon: "iconTags" },
    icon: { name: "图标", type: "text", icon: "iconEmoji" },
    purchasePrice: { name: "购买价格", type: "text", icon: "iconDollar" },
    extraCost: { name: "附加成本", type: "text", icon: "iconAdd" },
    purchaseDate: { name: "购买日期", type: "text", icon: "iconCalendar" },
    retireDate: { name: "退役日期", type: "text", icon: "iconCalendar" },
    warrantyDate: { name: "过保日期", type: "text", icon: "iconCalendar" },
    expectedDays: { name: "预计天数", type: "text", icon: "iconClock" },
    costMode: { name: "均价方式", type: "text", icon: "iconRefresh" },
    note: { name: "备注", type: "text", icon: "iconInfo" },
    createdAt: { name: "创建时间", type: "text", icon: "iconCalendar" },
    updatedAt: { name: "更新时间", type: "text", icon: "iconRefresh" },
    archived: { name: "已归档", type: "text", icon: "iconArchive" },
};

interface FixedAssetKeyMap {
    assetId: AttributeViewKeyValue;
    title: AttributeViewKeyValue;
    category: AttributeViewKeyValue;
    icon: AttributeViewKeyValue;
    purchasePrice: AttributeViewKeyValue;
    extraCost: AttributeViewKeyValue;
    purchaseDate: AttributeViewKeyValue;
    retireDate: AttributeViewKeyValue;
    warrantyDate: AttributeViewKeyValue;
    expectedDays: AttributeViewKeyValue;
    costMode: AttributeViewKeyValue;
    note: AttributeViewKeyValue;
    createdAt: AttributeViewKeyValue;
    updatedAt: AttributeViewKeyValue;
    archived: AttributeViewKeyValue;
}

export type FixedAssetCostMode = "elapsed" | "expectedLife" | "retireDate";

export interface FixedAssetRecord {
    id: string;
    name: string;
    category: string;
    icon: string;
    purchasePrice: number;
    extraCost: number;
    purchaseDate: string;
    retireDate?: string;
    warrantyDate?: string;
    expectedDays?: number;
    costMode: FixedAssetCostMode;
    note?: string;
    createdAt: string;
    updatedAt: string;
}

export interface FixedAssetsStoreStatus {
    ok: boolean;
    databaseId?: string;
    missingFields: string[];
    message: string;
}

export interface FixedAssetsLoadResult {
    assets: FixedAssetRecord[];
    status: FixedAssetsStoreStatus;
}

interface FixedAssetStore {
    avID: string;
    av: AttributeView;
    keys: FixedAssetKeyMap;
    status: FixedAssetsStoreStatus;
}

interface FixedAssetRow {
    itemID: string;
    values: Map<string, any>;
}

function normalizeFieldName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "");
}

function createStatus(
    ok: boolean,
    message: string,
    databaseId?: string,
    missingFields: string[] = []
): FixedAssetsStoreStatus {
    return {
        ok,
        databaseId,
        missingFields,
        message,
    };
}

function findKey(
    keyValues: AttributeViewKeyValue[],
    field: FixedAssetField
): AttributeViewKeyValue | null {
    if (field === "title") {
        const primaryKey = keyValues.find((item) => item.key.type === "block");
        if (primaryKey) return primaryKey;
    }

    const aliases = FIXED_ASSET_FIELD_ALIASES[field].map(normalizeFieldName);
    const aliasMatch = keyValues.find((item) => aliases.includes(normalizeFieldName(item.key.name)));
    if (aliasMatch) return aliasMatch;

    return null;
}

function resolveKeyMap(av: AttributeView): { keys: Partial<FixedAssetKeyMap>; missingFields: string[] } {
    const keys: Partial<FixedAssetKeyMap> = {};
    const missingFields: string[] = [];

    (Object.keys(FIXED_ASSET_FIELD_ALIASES) as FixedAssetField[]).forEach((field) => {
        const key = findKey(av.keyValues, field);
        if (key) {
            keys[field] = key;
        } else {
            missingFields.push(field);
        }
    });

    return { keys, missingFields };
}

function normalizeRawKeyValue(item: any): AttributeViewKeyValue | null {
    const key = item?.key || item;
    if (!key?.id || !key?.name) {
        return null;
    }

    return {
        key: {
            id: key.id,
            name: key.name,
            type: key.type || item?.type || "text",
        },
        values: item?.values || [],
    };
}

function normalizeAttributeViewKeyValues(raw: any): AttributeViewKeyValue[] {
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

async function loadAttributeViewWithSchema(avID: string): Promise<AttributeView | null> {
    const [av, rawKeys] = await Promise.all([
        getAttributeView(avID),
        getAttributeViewKeysByAvID(avID),
    ]);

    if (!av) {
        return null;
    }

    const schemaKeyValues = normalizeAttributeViewKeyValues(rawKeys);
    if (schemaKeyValues.length === 0) {
        return av;
    }

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

    return {
        ...av,
        keyValues: mergedKeyValues,
    };
}

function createSiyuanLikeId(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const timestamp = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join("");
    const random = Math.random().toString(36).slice(2, 9).padEnd(7, "0");
    return `${timestamp}-${random}`;
}

async function ensureFixedAssetFields(avID: string, av: AttributeView): Promise<AttributeView> {
    const { missingFields } = resolveKeyMap(av);
    const fieldsToCreate = missingFields.filter((field) => field !== "title") as FixedAssetField[];
    if (fieldsToCreate.length === 0) {
        return av;
    }

    let previousKeyID = av.keyValues[av.keyValues.length - 1]?.key.id || "";
    for (const field of fieldsToCreate) {
        const definition = FIXED_ASSET_FIELD_DEFINITIONS[field];
        const keyID = createSiyuanLikeId();
        await addAttributeViewKey(
            avID,
            keyID,
            definition.name,
            definition.type,
            definition.icon,
            previousKeyID
        );
        previousKeyID = keyID;
    }

    return await loadAttributeViewWithSchema(avID) || av;
}

function isUnusedDefaultSelectKey(
    keyValue: AttributeViewKeyValue,
    requiredKeyIDs: Set<string>
): boolean {
    if (requiredKeyIDs.has(keyValue.key.id)) {
        return false;
    }

    const normalizedName = normalizeFieldName(keyValue.key.name);
    const normalizedType = normalizeFieldName(keyValue.key.type);
    const isDefaultSelectName = ["单选", "select", "singleselect", "single-select"].includes(normalizedName);
    const isSelectType = normalizedType === "select" || normalizedType === "mselect";
    if (!isDefaultSelectName || !isSelectType) {
        return false;
    }

    return (keyValue.values || []).every((value) => !extractTextFromValue(value).trim());
}

async function cleanupUnusedDefaultFields(
    avID: string,
    av: AttributeView,
    keys: FixedAssetKeyMap
): Promise<AttributeView> {
    const requiredKeyIDs = new Set(
        Object.values(keys)
            .map((keyValue) => keyValue.key.id)
            .filter(Boolean)
    );
    const fieldsToRemove = av.keyValues.filter((keyValue) => isUnusedDefaultSelectKey(keyValue, requiredKeyIDs));
    if (fieldsToRemove.length === 0) {
        return av;
    }

    for (const field of fieldsToRemove) {
        try {
            await removeAttributeViewKey(avID, field.key.id);
        } catch (error) {
            console.warn("[fixedAssets] 清理默认数据库列失败", field.key.name, error);
        }
    }

    return await loadAttributeViewWithSchema(avID) || av;
}

async function loadFixedAssetStore(databaseId: string | undefined): Promise<FixedAssetStore | null> {
    const avID = databaseId?.trim();

    if (!avID) {
        return null;
    }

    const av = await loadAttributeViewWithSchema(avID);
    if (!av) {
        return null;
    }

    let ensuredAv = await ensureFixedAssetFields(avID, av);
    let { keys, missingFields } = resolveKeyMap(ensuredAv);
    if (missingFields.length > 0) {
        return {
            avID,
            av: ensuredAv,
            keys: keys as FixedAssetKeyMap,
            status: createStatus(
                false,
                `固定资产数据库字段自动初始化失败：${missingFields.join("、")}`,
                avID,
                missingFields
            ),
        };
    }

    ensuredAv = await cleanupUnusedDefaultFields(avID, ensuredAv, keys as FixedAssetKeyMap);
    ({ keys, missingFields } = resolveKeyMap(ensuredAv));
    if (missingFields.length > 0) {
        return {
            avID,
            av: ensuredAv,
            keys: keys as FixedAssetKeyMap,
            status: createStatus(
                false,
                `固定资产数据库字段自动初始化失败：${missingFields.join("、")}`,
                avID,
                missingFields
            ),
        };
    }

    return {
        avID,
        av: ensuredAv,
        keys: keys as FixedAssetKeyMap,
        status: createStatus(true, "数据库可用", avID),
    };
}

function getValueItemID(value: any): string {
    return value?.itemID || value?.blockID || value?.id || "";
}

function extractTextFromValue(value: any): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value.text?.content != null) return String(value.text.content);
    if (value.block?.content != null) return String(value.block.content);
    if (value.number?.content != null) return String(value.number.content);
    if (value.date?.content != null) return String(value.date.content);
    if (value.mSelect?.[0]?.content != null) return String(value.mSelect[0].content);
    if (value.mAsset?.[0]?.content != null) return String(value.mAsset[0].content);
    if (value.content != null) return String(value.content);
    return "";
}

function groupRows(av: AttributeView): FixedAssetRow[] {
    const rowMap = new Map<string, FixedAssetRow>();

    for (const keyValue of av.keyValues) {
        for (const value of keyValue.values || []) {
            const itemID = getValueItemID(value);
            if (!itemID) continue;

            if (!rowMap.has(itemID)) {
                rowMap.set(itemID, {
                    itemID,
                    values: new Map<string, any>(),
                });
            }

            rowMap.get(itemID)?.values.set(keyValue.key.id, value);
        }
    }

    return Array.from(rowMap.values());
}

function readRowField(row: FixedAssetRow, key: AttributeViewKeyValue): string {
    return extractTextFromValue(row.values.get(key.key.id));
}

function readNumberField(row: FixedAssetRow, key: AttributeViewKeyValue): number {
    return Math.max(0, Number(readRowField(row, key)) || 0);
}

function isArchived(value: string): boolean {
    return ["1", "true", "yes", "已删除", "归档", "已归档"].includes(value.trim().toLowerCase());
}

function toPositiveNumber(value: unknown): number {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

function normalizeCostMode(value: unknown): FixedAssetCostMode {
    if (value === "expectedLife" || value === "retireDate" || value === "elapsed") {
        return value;
    }
    return "elapsed";
}

function normalizeAsset(input: Partial<FixedAssetRecord>): FixedAssetRecord {
    const now = new Date().toISOString();
    return {
        id: input.id || createFixedAssetId(),
        name: input.name?.trim() || "未命名资产",
        category: input.category?.trim() || "未分类",
        icon: input.icon?.trim() || "▣",
        purchasePrice: toPositiveNumber(input.purchasePrice),
        extraCost: Math.max(0, Number(input.extraCost) || 0),
        purchaseDate: input.purchaseDate || new Date().toISOString().slice(0, 10),
        retireDate: input.retireDate || "",
        warrantyDate: input.warrantyDate || "",
        expectedDays: Math.max(0, Number(input.expectedDays) || 0),
        costMode: normalizeCostMode(input.costMode),
        note: input.note || "",
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
    };
}

function createTextValue(keyID: string, content: string): any {
    return {
        keyID,
        text: {
            content,
        },
    };
}

function createBlockValue(keyID: string, content: string): any {
    return {
        keyID,
        block: {
            content,
        },
    };
}

function createNumberValue(keyID: string, content: string): any {
    return {
        keyID,
        number: {
            content: Number(content) || 0,
        },
    };
}

function createSelectValue(keyID: string, content: string): any {
    return {
        keyID,
        mSelect: content ? [{ content }] : [],
    };
}

function createValueForKey(key: AttributeViewKeyValue, content: string): any {
    if (key.key.type === "block") {
        return createBlockValue(key.key.id, content);
    }
    if (key.key.type === "number") {
        return createNumberValue(key.key.id, content);
    }
    if (key.key.type === "select" || key.key.type === "mSelect") {
        return createSelectValue(key.key.id, content);
    }
    return createTextValue(key.key.id, content);
}

function extractAssets(store: FixedAssetStore): FixedAssetRecord[] {
    if (!store.status.ok) return [];

    return groupRows(store.av)
        .map((row) => {
            if (isArchived(readRowField(row, store.keys.archived))) {
                return null;
            }

            const name = readRowField(row, store.keys.title);
            if (!name.trim()) {
                return null;
            }

            return normalizeAsset({
                id: readRowField(row, store.keys.assetId) || row.itemID,
                name,
                category: readRowField(row, store.keys.category),
                icon: readRowField(row, store.keys.icon),
                purchasePrice: readNumberField(row, store.keys.purchasePrice),
                extraCost: readNumberField(row, store.keys.extraCost),
                purchaseDate: readRowField(row, store.keys.purchaseDate),
                retireDate: readRowField(row, store.keys.retireDate),
                warrantyDate: readRowField(row, store.keys.warrantyDate),
                expectedDays: readNumberField(row, store.keys.expectedDays),
                costMode: normalizeCostMode(readRowField(row, store.keys.costMode)),
                note: readRowField(row, store.keys.note),
                createdAt: readRowField(row, store.keys.createdAt),
                updatedAt: readRowField(row, store.keys.updatedAt),
            });
        })
        .filter((asset): asset is FixedAssetRecord => asset !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function findAssetRow(store: FixedAssetStore, assetId: string): FixedAssetRow | null {
    if (!store.status.ok) return null;

    return groupRows(store.av).find((row) => {
        const rowAssetId = readRowField(row, store.keys.assetId);
        return rowAssetId === assetId || row.itemID === assetId;
    }) || null;
}

async function setRowValue(
    store: FixedAssetStore,
    row: FixedAssetRow,
    key: AttributeViewKeyValue,
    content: string
): Promise<void> {
    await setAttributeViewBlockAttr(
        store.avID,
        key.key.id,
        row.itemID,
        createValueForKey(key, content)
    );
}

function assetToValueEntries(store: FixedAssetStore, asset: FixedAssetRecord): any[] {
    return [
        createValueForKey(store.keys.title, asset.name),
        createValueForKey(store.keys.assetId, asset.id),
        createValueForKey(store.keys.category, asset.category),
        createValueForKey(store.keys.icon, asset.icon),
        createValueForKey(store.keys.purchasePrice, String(asset.purchasePrice)),
        createValueForKey(store.keys.extraCost, String(asset.extraCost)),
        createValueForKey(store.keys.purchaseDate, asset.purchaseDate),
        createValueForKey(store.keys.retireDate, asset.retireDate || ""),
        createValueForKey(store.keys.warrantyDate, asset.warrantyDate || ""),
        createValueForKey(store.keys.expectedDays, String(asset.expectedDays || 0)),
        createValueForKey(store.keys.costMode, asset.costMode),
        createValueForKey(store.keys.note, asset.note || ""),
        createValueForKey(store.keys.createdAt, asset.createdAt),
        createValueForKey(store.keys.updatedAt, asset.updatedAt),
        createValueForKey(store.keys.archived, "false"),
    ];
}

export function createFixedAssetId(): string {
    return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getFixedAssetsStoreStatus(databaseId: string | undefined): Promise<FixedAssetsStoreStatus> {
    const avID = databaseId?.trim();

    if (!avID) {
        return createStatus(false, "请先在固定资产组件内容设置中填写数据库 ID");
    }

    const store = await loadFixedAssetStore(avID);
    if (!store) {
        return createStatus(false, "无法读取固定资产数据库，请检查数据库 ID", avID);
    }

    return store.status;
}

export async function loadFixedAssets(databaseId: string | undefined): Promise<FixedAssetsLoadResult> {
    const status = await getFixedAssetsStoreStatus(databaseId);
    if (!status.ok) {
        return {
            assets: [],
            status,
        };
    }

    const store = await loadFixedAssetStore(databaseId);
    if (!store || !store.status.ok) {
        return {
            assets: [],
            status,
        };
    }

    return {
        assets: extractAssets(store),
        status: store.status,
    };
}

export async function saveFixedAsset(
    databaseId: string | undefined,
    input: Partial<FixedAssetRecord>
): Promise<FixedAssetRecord> {
    const store = await loadFixedAssetStore(databaseId);
    if (!store || !store.status.ok) {
        throw new Error(store?.status.message || "固定资产数据库不可用");
    }

    const now = new Date().toISOString();
    const asset = normalizeAsset({
        ...input,
        updatedAt: now,
        createdAt: input.createdAt || now,
    });
    const row = findAssetRow(store, asset.id);

    if (row) {
        await setRowValue(store, row, store.keys.title, asset.name);
        await setRowValue(store, row, store.keys.assetId, asset.id);
        await setRowValue(store, row, store.keys.category, asset.category);
        await setRowValue(store, row, store.keys.icon, asset.icon);
        await setRowValue(store, row, store.keys.purchasePrice, String(asset.purchasePrice));
        await setRowValue(store, row, store.keys.extraCost, String(asset.extraCost));
        await setRowValue(store, row, store.keys.purchaseDate, asset.purchaseDate);
        await setRowValue(store, row, store.keys.retireDate, asset.retireDate || "");
        await setRowValue(store, row, store.keys.warrantyDate, asset.warrantyDate || "");
        await setRowValue(store, row, store.keys.expectedDays, String(asset.expectedDays || 0));
        await setRowValue(store, row, store.keys.costMode, asset.costMode);
        await setRowValue(store, row, store.keys.note, asset.note || "");
        await setRowValue(store, row, store.keys.updatedAt, asset.updatedAt);
        await setRowValue(store, row, store.keys.archived, "false");
    } else {
        await appendAttributeViewDetachedBlocksWithValues(store.avID, [
            assetToValueEntries(store, asset),
        ]);
    }

    return asset;
}

export async function archiveFixedAsset(databaseId: string | undefined, assetId: string): Promise<void> {
    const store = await loadFixedAssetStore(databaseId);
    if (!store || !store.status.ok) {
        throw new Error(store?.status.message || "固定资产数据库不可用");
    }

    const row = findAssetRow(store, assetId);
    if (!row) {
        throw new Error("资产记录不存在");
    }

    await setRowValue(store, row, store.keys.archived, "true");
    await setRowValue(store, row, store.keys.updatedAt, new Date().toISOString());
}

export function getAssetTotalCost(asset: Pick<FixedAssetRecord, "purchasePrice" | "extraCost">): number {
    return Math.max(0, Number(asset.purchasePrice) || 0) + Math.max(0, Number(asset.extraCost) || 0);
}

export function getDaysBetween(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const end = new Date(`${endDate}T00:00:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return 1;
    }
    return Math.floor((end - start) / 86400000) + 1;
}

export function getAssetCostDays(asset: FixedAssetRecord, now = new Date()): number {
    if (asset.costMode === "expectedLife" && asset.expectedDays && asset.expectedDays > 0) {
        return asset.expectedDays;
    }

    if (asset.costMode === "retireDate" && asset.retireDate) {
        return getDaysBetween(asset.purchaseDate, asset.retireDate);
    }

    return getDaysBetween(asset.purchaseDate, now.toISOString().slice(0, 10));
}

export function getAssetDailyCost(asset: FixedAssetRecord): number {
    return getAssetTotalCost(asset) / Math.max(1, getAssetCostDays(asset));
}

export type FixedAssetCostPeriod = "hour" | "day" | "week" | "month" | "quarter" | "year";

export interface FixedAssetCostPeriodMeta {
    value: FixedAssetCostPeriod;
    label: string;
    suffix: string;
    dailyMultiplier: number;
}

export const FIXED_ASSET_COST_PERIODS: Record<FixedAssetCostPeriod, FixedAssetCostPeriodMeta> = {
    hour: {
        value: "hour",
        label: "小时",
        suffix: "/时",
        dailyMultiplier: 1 / 24,
    },
    day: {
        value: "day",
        label: "日均",
        suffix: "/天",
        dailyMultiplier: 1,
    },
    week: {
        value: "week",
        label: "周均",
        suffix: "/周",
        dailyMultiplier: 7,
    },
    month: {
        value: "month",
        label: "月均",
        suffix: "/月",
        dailyMultiplier: 30.4375,
    },
    quarter: {
        value: "quarter",
        label: "季均",
        suffix: "/季",
        dailyMultiplier: 30.4375 * 3,
    },
    year: {
        value: "year",
        label: "年均",
        suffix: "/年",
        dailyMultiplier: 365.25,
    },
};

export function normalizeFixedAssetCostPeriod(
    value: unknown,
    fallback: FixedAssetCostPeriod = "day"
): FixedAssetCostPeriod {
    if (value === "hour" || value === "day" || value === "week" || 
        value === "month" || value === "quarter" || value === "year") {
        return value;
    }
    return fallback;
}

export function getCostByPeriod(
    dailyCost: number,
    period: FixedAssetCostPeriod
): number {
    const meta = FIXED_ASSET_COST_PERIODS[period] || FIXED_ASSET_COST_PERIODS.day;
    return dailyCost * meta.dailyMultiplier;
}

export function getAssetPeriodCost(
    asset: FixedAssetRecord,
    period: FixedAssetCostPeriod
): number {
    const dailyCost = getAssetDailyCost(asset);
    return getCostByPeriod(dailyCost, period);
}
