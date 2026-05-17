import {
    addAttributeViewKey,
    appendAttributeViewDetachedBlocksWithValues,
    getAttributeView,
    getAttributeViewKeysByAvID,
    readDir,
    removeFile,
    setAttributeViewBlockAttr,
    type AttributeView,
    type AttributeViewKeyValue,
} from "@/api";

export const FOCUS_FIELD_ALIASES = {
    title: ["title", "标题", "统计", "主键", "name"],
    recordId: ["recordId", "记录ID", "dataId"],
    totalFocusTime: ["totalFocusTime", "累计专注时长", "专注总时长"],
    totalFocusTimes: ["totalFocusTimes", "累计专注次数", "专注总次数"],
    updatedAt: ["updatedAt", "更新时间"],
};

type FocusField = keyof typeof FOCUS_FIELD_ALIASES;

const FOCUS_FIELD_DEFINITIONS: Record<FocusField, { name: string; type: string; icon: string }> = {
    title: { name: "统计", type: "block", icon: "iconInfo" },
    recordId: { name: "记录ID", type: "text", icon: "iconKey" },
    totalFocusTime: { name: "累计专注时长", type: "number", icon: "iconClock" },
    totalFocusTimes: { name: "累计专注次数", type: "number", icon: "iconHeart" },
    updatedAt: { name: "更新时间", type: "text", icon: "iconRefresh" },
};

interface FocusKeyMap {
    title: AttributeViewKeyValue;
    recordId: AttributeViewKeyValue;
    totalFocusTime: AttributeViewKeyValue;
    totalFocusTimes: AttributeViewKeyValue;
    updatedAt: AttributeViewKeyValue;
}

export interface FocusStatistics {
    totalFocusTime: number;
    totalFocusTimes: number;
}

export interface FocusStoreStatus {
    ok: boolean;
    databaseId?: string;
    missingFields: string[];
    message: string;
}

interface FocusStore {
    avID: string;
    av: AttributeView;
    keys: FocusKeyMap;
    status: FocusStoreStatus;
}

interface FocusRow {
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
): FocusStoreStatus {
    return { ok, databaseId, missingFields, message };
}

function findKey(
    keyValues: AttributeViewKeyValue[],
    field: FocusField
): AttributeViewKeyValue | null {
    if (field === "title") {
        const primaryKey = keyValues.find((item) => item.key.type === "block");
        if (primaryKey) return primaryKey;
    }

    const aliases = FOCUS_FIELD_ALIASES[field].map(normalizeFieldName);
    const aliasMatch = keyValues.find((item) => aliases.includes(normalizeFieldName(item.key.name)));
    if (aliasMatch) return aliasMatch;

    return null;
}

function resolveKeyMap(av: AttributeView): { keys: Partial<FocusKeyMap>; missingFields: string[] } {
    const keys: Partial<FocusKeyMap> = {};
    const missingFields: string[] = [];

    (Object.keys(FOCUS_FIELD_ALIASES) as FocusField[]).forEach((field) => {
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
    if (!key?.id || !key?.name) return null;
    return {
        key: { id: key.id, name: key.name, type: key.type || item?.type || "text" },
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

    if (!av) return null;

    const schemaKeyValues = normalizeAttributeViewKeyValues(rawKeys);
    if (schemaKeyValues.length === 0) return av;

    const mergedKeyValues = schemaKeyValues.map((schemaKeyValue) => {
        const dataKeyValue = av.keyValues.find((item) => item.key.id === schemaKeyValue.key.id);
        return { ...schemaKeyValue, values: dataKeyValue?.values || schemaKeyValue.values || [] };
    });

    for (const dataKeyValue of av.keyValues) {
        if (!mergedKeyValues.some((item) => item.key.id === dataKeyValue.key.id)) {
            mergedKeyValues.push(dataKeyValue);
        }
    }

    return { ...av, keyValues: mergedKeyValues };
}

function createSiyuanLikeId(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const timestamp = [
        now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()),
        pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds()),
    ].join("");
    const random = Math.random().toString(36).slice(2, 9).padEnd(7, "0");
    return `${timestamp}-${random}`;
}

async function ensureFocusFields(avID: string, av: AttributeView): Promise<AttributeView> {
    const { missingFields } = resolveKeyMap(av);
    const fieldsToCreate = missingFields.filter((field) => field !== "title") as FocusField[];
    if (fieldsToCreate.length === 0) return av;

    let previousKeyID = av.keyValues[av.keyValues.length - 1]?.key.id || "";
    for (const field of fieldsToCreate) {
        const definition = FOCUS_FIELD_DEFINITIONS[field];
        const keyID = createSiyuanLikeId();
        await addAttributeViewKey(avID, keyID, definition.name, definition.type, definition.icon, previousKeyID);
        previousKeyID = keyID;
    }

    return await loadAttributeViewWithSchema(avID) || av;
}

async function loadFocusStore(databaseId: string | undefined): Promise<FocusStore | null> {
    const avID = databaseId?.trim();
    if (!avID) return null;

    const av = await loadAttributeViewWithSchema(avID);
    if (!av) return null;

    let ensuredAv = await ensureFocusFields(avID, av);
    const { keys, missingFields } = resolveKeyMap(ensuredAv);
    if (missingFields.length > 0) {
        return {
            avID,
            av: ensuredAv,
            keys: keys as FocusKeyMap,
            status: createStatus(false, `番茄钟数据库字段自动初始化失败：${missingFields.join("、")}`, avID, missingFields),
        };
    }

    return {
        avID,
        av: ensuredAv,
        keys: keys as FocusKeyMap,
        status: createStatus(true, "数据库可用", avID),
    };
}

function groupRows(av: AttributeView): FocusRow[] {
    const rowMap = new Map<string, FocusRow>();

    for (const keyValue of av.keyValues) {
        for (const value of keyValue.values || []) {
            const itemID = value?.itemID || value?.blockID || value?.id || "";
            if (!itemID) continue;

            if (!rowMap.has(itemID)) {
                rowMap.set(itemID, { itemID, values: new Map<string, any>() });
            }
            rowMap.get(itemID)?.values.set(keyValue.key.id, value);
        }
    }

    return Array.from(rowMap.values());
}

function extractTextFromValue(value: any): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value.text?.content != null) return String(value.text.content);
    if (value.block?.content != null) return String(value.block.content);
    if (value.number?.content != null) return String(value.number.content);
    if (value.content != null) return String(value.content);
    return "";
}

function readRowField(row: FocusRow, key: AttributeViewKeyValue): string {
    return extractTextFromValue(row.values.get(key.key.id));
}

function createBlockValue(keyID: string, content: string): any {
    return { keyID, block: { content } };
}

function createTextValue(keyID: string, content: string): any {
    return { keyID, text: { content } };
}

function createNumberValue(keyID: string, content: string): any {
    return { keyID, number: { content: Number(content) || 0 } };
}

export async function getFocusStoreStatus(databaseId: string | undefined): Promise<FocusStoreStatus> {
    const avID = databaseId?.trim();
    if (!avID) {
        return createStatus(false, "请先在组件设置中填写番茄钟统计数据库 ID");
    }

    const store = await loadFocusStore(avID);
    if (!store) {
        return createStatus(false, "无法读取番茄钟统计数据库，请检查数据库 ID", avID);
    }

    return store.status;
}

const FOCUS_SINGLETON_ID = "focus-statistics";

function findSingletonRow(store: FocusStore): FocusRow | null {
    if (!store.status.ok) return null;
    return groupRows(store.av).find((row) => {
        const rowRecordId = readRowField(row, store.keys.recordId);
        return rowRecordId === FOCUS_SINGLETON_ID;
    }) || null;
}

export async function loadFocusStatistics(databaseId: string | undefined): Promise<FocusStatistics> {
    const status = await getFocusStoreStatus(databaseId);
    if (!status.ok) {
        return { totalFocusTime: 0, totalFocusTimes: 0 };
    }

    const store = await loadFocusStore(databaseId);
    if (!store || !store.status.ok) {
        return { totalFocusTime: 0, totalFocusTimes: 0 };
    }

    const rows = groupRows(store.av);
    let maxTotalFocusTime = 0;
    let maxTotalFocusTimes = 0;

    for (const row of rows) {
        const rowRecordId = readRowField(row, store.keys.recordId);
        if (rowRecordId !== FOCUS_SINGLETON_ID) continue;

        const rowTime = Math.max(0, Number(readRowField(row, store.keys.totalFocusTime)) || 0);
        const rowTimes = Math.max(0, Number(readRowField(row, store.keys.totalFocusTimes)) || 0);

        if (rowTime > maxTotalFocusTime) maxTotalFocusTime = rowTime;
        if (rowTimes > maxTotalFocusTimes) maxTotalFocusTimes = rowTimes;
    }

    return {
        totalFocusTime: maxTotalFocusTime,
        totalFocusTimes: maxTotalFocusTimes,
    };
}

export async function saveFocusStatistics(
    databaseId: string | undefined,
    totalFocusTime: number,
    totalFocusTimes: number
): Promise<void> {
    const store = await loadFocusStore(databaseId);
    if (!store || !store.status.ok) {
        throw new Error(store?.status.message || "番茄钟统计数据库不可用");
    }

    const now = new Date().toISOString();
    const row = findSingletonRow(store);

    if (row && row.itemID) {
        try {
            await setAttributeViewBlockAttr(
                store.avID, store.keys.totalFocusTime.key.id, row.itemID,
                createNumberValue(store.keys.totalFocusTime.key.id, String(totalFocusTime))
            );
            await setAttributeViewBlockAttr(
                store.avID, store.keys.totalFocusTimes.key.id, row.itemID,
                createNumberValue(store.keys.totalFocusTimes.key.id, String(totalFocusTimes))
            );
            await setAttributeViewBlockAttr(
                store.avID, store.keys.updatedAt.key.id, row.itemID,
                createTextValue(store.keys.updatedAt.key.id, now)
            );
            return;
        } catch (e) {
            console.warn("[focusData] 更新已有统计行失败，fallback append 新行", e);
        }
    }

    await appendAttributeViewDetachedBlocksWithValues(store.avID, [
        [
            createBlockValue(store.keys.title.key.id, "番茄钟统计"),
            createTextValue(store.keys.recordId.key.id, FOCUS_SINGLETON_ID),
            createNumberValue(store.keys.totalFocusTime.key.id, String(totalFocusTime)),
            createNumberValue(store.keys.totalFocusTimes.key.id, String(totalFocusTimes)),
            createTextValue(store.keys.updatedAt.key.id, now),
        ],
    ]);
}

export async function migrateLegacyFocusStatisticsIfNeeded(databaseId: string | undefined, plugin: any): Promise<void> {
    if (!databaseId?.trim()) return;

    const pluginName = plugin?.name || "siyuan-homepage";
    const storageDir = `data/storage/petal/${pluginName}`;
    const legacyFileName = "widget-focus-statistics.json";

    let fileExists = false;
    try {
        const dirEntries = await readDir(storageDir);
        fileExists = Array.isArray(dirEntries) && dirEntries.some(
            (entry: any) => entry?.name === legacyFileName
        );
    } catch {
        return;
    }
    if (!fileExists) return;

    let legacy: any = null;
    try {
        legacy = await plugin.loadData(legacyFileName);
    } catch {
        return;
    }

    if (!legacy) {
        try {
            await removeFile(`${storageDir}/${legacyFileName}`);
        } catch {
            console.warn("[focusData] 删除空的旧 widget-focus-statistics.json 失败，不影响使用");
        }
        return;
    }

    const legacyTotalFocusTime = Math.max(0, Number(legacy.totalFocusTime) || 0);
    const legacyTotalFocusTimes = Math.max(0, Number(legacy.totalFocusTimes) || 0);

    if (legacyTotalFocusTime === 0 && legacyTotalFocusTimes === 0) {
        try {
            await removeFile(`${storageDir}/${legacyFileName}`);
        } catch {
            console.warn("[focusData] 删除空的旧 widget-focus-statistics.json 失败，不影响使用");
        }
        return;
    }

    const store = await loadFocusStore(databaseId);
    if (!store || !store.status.ok) return;

    const now = new Date().toISOString();
    const row = findSingletonRow(store);

    if (row && row.itemID) {
        const existingTotalFocusTime = Math.max(0, Number(readRowField(row, store.keys.totalFocusTime)) || 0);
        const existingTotalFocusTimes = Math.max(0, Number(readRowField(row, store.keys.totalFocusTimes)) || 0);

        if (existingTotalFocusTime >= legacyTotalFocusTime && existingTotalFocusTimes >= legacyTotalFocusTimes) {
            // 已有数据均已超过旧数据，无需迁移，直接删旧文件
        } else {
            const finalTotalFocusTime = Math.max(existingTotalFocusTime, legacyTotalFocusTime);
            const finalTotalFocusTimes = Math.max(existingTotalFocusTimes, legacyTotalFocusTimes);

            try {
                await setAttributeViewBlockAttr(
                    store.avID, store.keys.totalFocusTime.key.id, row.itemID,
                    createNumberValue(store.keys.totalFocusTime.key.id, String(finalTotalFocusTime))
                );
                await setAttributeViewBlockAttr(
                    store.avID, store.keys.totalFocusTimes.key.id, row.itemID,
                    createNumberValue(store.keys.totalFocusTimes.key.id, String(finalTotalFocusTimes))
                );
                await setAttributeViewBlockAttr(
                    store.avID, store.keys.updatedAt.key.id, row.itemID,
                    createTextValue(store.keys.updatedAt.key.id, now)
                );
            } catch {
                await appendAttributeViewDetachedBlocksWithValues(store.avID, [
                    [
                        createBlockValue(store.keys.title.key.id, "番茄钟统计"),
                        createTextValue(store.keys.recordId.key.id, FOCUS_SINGLETON_ID),
                        createNumberValue(store.keys.totalFocusTime.key.id, String(finalTotalFocusTime)),
                        createNumberValue(store.keys.totalFocusTimes.key.id, String(finalTotalFocusTimes)),
                        createTextValue(store.keys.updatedAt.key.id, now),
                    ],
                ]);
            }
        }
    } else {
        await appendAttributeViewDetachedBlocksWithValues(store.avID, [
            [
                createBlockValue(store.keys.title.key.id, "番茄钟统计"),
                createTextValue(store.keys.recordId.key.id, FOCUS_SINGLETON_ID),
                createNumberValue(store.keys.totalFocusTime.key.id, String(legacyTotalFocusTime)),
                createNumberValue(store.keys.totalFocusTimes.key.id, String(legacyTotalFocusTimes)),
                createTextValue(store.keys.updatedAt.key.id, now),
            ],
        ]);
    }

    try {
        await removeFile(`${storageDir}/${legacyFileName}`);
    } catch (err) {
        console.warn("[focusData] 迁移后删除旧 widget-focus-statistics.json 失败，不影响使用", err);
    }
}
