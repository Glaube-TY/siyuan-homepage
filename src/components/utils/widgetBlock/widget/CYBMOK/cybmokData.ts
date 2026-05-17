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

export const CYBMOK_FIELD_ALIASES = {
    title: ["title", "标题", "日期", "主键", "name"],
    date: ["date", "日期", "日"],
    count: ["count", "功德数", "次数"],
    createdAt: ["createdAt", "创建时间"],
    updatedAt: ["updatedAt", "更新时间"],
};

type CYBMOKField = keyof typeof CYBMOK_FIELD_ALIASES;

const CYBMOK_FIELD_DEFINITIONS: Record<CYBMOKField, { name: string; type: string; icon: string }> = {
    title: { name: "日期", type: "block", icon: "iconCalendar" },
    date: { name: "日期", type: "text", icon: "iconCalendar" },
    count: { name: "功德数", type: "number", icon: "iconHeart" },
    createdAt: { name: "创建时间", type: "text", icon: "iconCalendar" },
    updatedAt: { name: "更新时间", type: "text", icon: "iconRefresh" },
};

interface CYBMOKKeyMap {
    title: AttributeViewKeyValue;
    date: AttributeViewKeyValue;
    count: AttributeViewKeyValue;
    createdAt: AttributeViewKeyValue;
    updatedAt: AttributeViewKeyValue;
}

export interface CYBMOKStats {
    totalMerit: number;
    maxMeritDate: { date: string; count: number };
}

export interface CYBMOKStoreStatus {
    ok: boolean;
    databaseId?: string;
    missingFields: string[];
    message: string;
}

interface CYBMOKStore {
    avID: string;
    av: AttributeView;
    keys: CYBMOKKeyMap;
    status: CYBMOKStoreStatus;
}

interface CYBMOKRow {
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
): CYBMOKStoreStatus {
    return { ok, databaseId, missingFields, message };
}

function findKey(
    keyValues: AttributeViewKeyValue[],
    field: CYBMOKField
): AttributeViewKeyValue | null {
    if (field === "title") {
        const primaryKey = keyValues.find((item) => item.key.type === "block");
        if (primaryKey) return primaryKey;
    }

    const aliases = CYBMOK_FIELD_ALIASES[field].map(normalizeFieldName);
    const aliasMatch = keyValues.find((item) => aliases.includes(normalizeFieldName(item.key.name)));
    if (aliasMatch) return aliasMatch;

    return null;
}

function resolveKeyMap(av: AttributeView): { keys: Partial<CYBMOKKeyMap>; missingFields: string[] } {
    const keys: Partial<CYBMOKKeyMap> = {};
    const missingFields: string[] = [];

    (Object.keys(CYBMOK_FIELD_ALIASES) as CYBMOKField[]).forEach((field) => {
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

async function ensureCYBMOKFields(avID: string, av: AttributeView): Promise<AttributeView> {
    const { missingFields } = resolveKeyMap(av);
    const fieldsToCreate = missingFields.filter((field) => field !== "title") as CYBMOKField[];
    if (fieldsToCreate.length === 0) return av;

    let previousKeyID = av.keyValues[av.keyValues.length - 1]?.key.id || "";
    for (const field of fieldsToCreate) {
        const definition = CYBMOK_FIELD_DEFINITIONS[field];
        const keyID = createSiyuanLikeId();
        await addAttributeViewKey(avID, keyID, definition.name, definition.type, definition.icon, previousKeyID);
        previousKeyID = keyID;
    }

    return await loadAttributeViewWithSchema(avID) || av;
}

async function loadCYBMOKStore(databaseId: string | undefined): Promise<CYBMOKStore | null> {
    const avID = databaseId?.trim();
    if (!avID) return null;

    const av = await loadAttributeViewWithSchema(avID);
    if (!av) return null;

    let ensuredAv = await ensureCYBMOKFields(avID, av);
    const { keys, missingFields } = resolveKeyMap(ensuredAv);
    if (missingFields.length > 0) {
        return {
            avID,
            av: ensuredAv,
            keys: keys as CYBMOKKeyMap,
            status: createStatus(false, `木鱼数据库字段自动初始化失败：${missingFields.join("、")}`, avID, missingFields),
        };
    }

    return {
        avID,
        av: ensuredAv,
        keys: keys as CYBMOKKeyMap,
        status: createStatus(true, "数据库可用", avID),
    };
}

function groupRows(av: AttributeView): CYBMOKRow[] {
    const rowMap = new Map<string, CYBMOKRow>();

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

function readRowField(row: CYBMOKRow, key: AttributeViewKeyValue): string {
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

export async function getCYBMOKStoreStatus(databaseId: string | undefined): Promise<CYBMOKStoreStatus> {
    const avID = databaseId?.trim();
    if (!avID) {
        return createStatus(false, "请先在组件设置中填写木鱼数据库 ID");
    }

    const store = await loadCYBMOKStore(avID);
    if (!store) {
        return createStatus(false, "无法读取木鱼数据库，请检查数据库 ID", avID);
    }

    return store.status;
}

function parseCYBMOKRows(store: CYBMOKStore): Array<{ itemID: string; date: string; count: number }> {
    return groupRows(store.av).map((row) => {
        const date = readRowField(row, store.keys.date);
        const count = Math.max(0, Number(readRowField(row, store.keys.count)) || 0);
        return { itemID: row.itemID, date, count };
    });
}

function findRowByDate(store: CYBMOKStore, date: string): CYBMOKRow | null {
    if (!store.status.ok) return null;
    return groupRows(store.av).find((row) => {
        const rowDate = readRowField(row, store.keys.date);
        return rowDate === date;
    }) || null;
}

export async function loadCYBMOKStats(databaseId: string | undefined): Promise<CYBMOKStats> {
    const status = await getCYBMOKStoreStatus(databaseId);
    if (!status.ok) {
        return { totalMerit: 0, maxMeritDate: { date: "暂无", count: 0 } };
    }

    const store = await loadCYBMOKStore(databaseId);
    if (!store || !store.status.ok) {
        return { totalMerit: 0, maxMeritDate: { date: "暂无", count: 0 } };
    }

    const rows = parseCYBMOKRows(store);

    const dateAgg = new Map<string, number>();
    for (const row of rows) {
        const key = row.date || "";
        const prev = dateAgg.get(key) || 0;
        dateAgg.set(key, prev + row.count);
    }

    let totalMerit = 0;
    let maxDate = "";
    let maxCount = 0;

    for (const [date, count] of dateAgg) {
        totalMerit += count;
        if (count > maxCount) {
            maxCount = count;
            maxDate = date;
        }
    }

    const formattedDate =
        maxDate.length === 8
            ? `${maxDate.slice(0, 4)}年${maxDate.slice(4, 6)}月${maxDate.slice(6, 8)}日`
            : maxDate || "暂无";

    return {
        totalMerit,
        maxMeritDate: { date: formattedDate, count: maxCount },
    };
}

export async function recordCYBMOKKnock(databaseId: string | undefined, dateStr: string): Promise<void> {
    const store = await loadCYBMOKStore(databaseId);
    if (!store || !store.status.ok) {
        throw new Error(store?.status.message || "木鱼数据库不可用");
    }

    const now = new Date().toISOString();
    const existingRow = findRowByDate(store, dateStr);

    if (existingRow && existingRow.itemID) {
        const currentCount = Math.max(0, Number(readRowField(existingRow, store.keys.count)) || 0);

        try {
            await setAttributeViewBlockAttr(
                store.avID, store.keys.count.key.id, existingRow.itemID,
                createNumberValue(store.keys.count.key.id, String(currentCount + 1))
            );
            await setAttributeViewBlockAttr(
                store.avID, store.keys.updatedAt.key.id, existingRow.itemID,
                createTextValue(store.keys.updatedAt.key.id, now)
            );
            return;
        } catch (e) {
            console.warn("[cybmokData] 更新已有行失败，fallback append 新行", e);
        }
    }

    await appendAttributeViewDetachedBlocksWithValues(store.avID, [
        [
            createBlockValue(store.keys.title.key.id, dateStr),
            createTextValue(store.keys.date.key.id, dateStr),
            createNumberValue(store.keys.count.key.id, "1"),
            createTextValue(store.keys.createdAt.key.id, now),
            createTextValue(store.keys.updatedAt.key.id, now),
        ],
    ]);
}

export async function migrateLegacyCYBMOKIfNeeded(databaseId: string | undefined, plugin: any): Promise<void> {
    if (!databaseId?.trim()) return;

    const pluginName = plugin?.name || "siyuan-homepage";
    const storageDir = `data/storage/petal/${pluginName}`;
    const legacyFileName = "CYBMOKData.json";

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

    let legacyRaw: any = null;
    try {
        legacyRaw = await plugin.loadData(legacyFileName);
    } catch {
        return;
    }

    if (!legacyRaw) {
        try {
            await removeFile(`${storageDir}/${legacyFileName}`);
        } catch {
            console.warn("[cybmokData] 删除空的旧 CYBMOKData.json 失败，不影响使用");
        }
        return;
    }

    let legacyData: Record<string, number> = {};
    if (typeof legacyRaw === "string") {
        try {
            legacyData = JSON.parse(legacyRaw);
        } catch {
            return;
        }
    } else if (typeof legacyRaw === "object") {
        legacyData = legacyRaw;
    }

    const entries = Object.entries(legacyData).filter(
        ([, count]) => Number(count) > 0
    );

    if (entries.length === 0) {
        try {
            await removeFile(`${storageDir}/${legacyFileName}`);
        } catch {
            console.warn("[cybmokData] 删除空的旧 CYBMOKData.json 失败，不影响使用");
        }
        return;
    }

    const store = await loadCYBMOKStore(databaseId);
    if (!store || !store.status.ok) return;

    const now = new Date().toISOString();

    for (const [date, legacyCount] of entries) {
        const numCount = Math.max(0, Number(legacyCount) || 0);
        const existingRow = findRowByDate(store, date);

        if (existingRow && existingRow.itemID) {
            const existingCount = Math.max(0, Number(readRowField(existingRow, store.keys.count)) || 0);
            if (existingCount >= numCount) continue;

            const diff = numCount - existingCount;
            const finalCount = numCount;

            try {
                await setAttributeViewBlockAttr(
                    store.avID, store.keys.count.key.id, existingRow.itemID,
                    createNumberValue(store.keys.count.key.id, String(finalCount))
                );
                await setAttributeViewBlockAttr(
                    store.avID, store.keys.updatedAt.key.id, existingRow.itemID,
                    createTextValue(store.keys.updatedAt.key.id, now)
                );
            } catch {
                await appendAttributeViewDetachedBlocksWithValues(store.avID, [
                    [
                        createBlockValue(store.keys.title.key.id, date),
                        createTextValue(store.keys.date.key.id, date),
                        createNumberValue(store.keys.count.key.id, String(diff)),
                        createTextValue(store.keys.createdAt.key.id, now),
                        createTextValue(store.keys.updatedAt.key.id, now),
                    ],
                ]);
            }
        } else {
            await appendAttributeViewDetachedBlocksWithValues(store.avID, [
                [
                    createBlockValue(store.keys.title.key.id, date),
                    createTextValue(store.keys.date.key.id, date),
                    createNumberValue(store.keys.count.key.id, String(numCount)),
                    createTextValue(store.keys.createdAt.key.id, now),
                    createTextValue(store.keys.updatedAt.key.id, now),
                ],
            ]);
        }
    }

    try {
        await removeFile(`${storageDir}/${legacyFileName}`);
    } catch (err) {
        console.warn("[cybmokData] 迁移后删除旧 CYBMOKData.json 失败，不影响使用", err);
    }
}
