import {
    addAttributeViewKeyChecked,
    appendAttributeViewDetachedBlocksWithValuesChecked,
    getAttributeView,
    getAttributeViewKeysByAvID,
    readDir,
    removeFile,
    setAttributeViewBlockAttrWithCellChecked,
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
    const nonBlockMatch = keyValues.find(
        (item) => item.key.type !== "block" && aliases.includes(normalizeFieldName(item.key.name))
    );
    if (nonBlockMatch) return nonBlockMatch;

    if (field === "date") {
        const primaryKey = keyValues.find((item) => item.key.type === "block");
        if (primaryKey) return primaryKey;
    }

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
        await addAttributeViewKeyChecked(avID, keyID, definition.name, definition.type, definition.icon, previousKeyID);
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

function readCYBMOKRowDate(row: CYBMOKRow, store: CYBMOKStore): string {
    const dateValue = readRowField(row, store.keys.date);
    if (dateValue) return dateValue;
    return readRowField(row, store.keys.title);
}

function dedupeValueEntries(entries: any[]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const entry of entries) {
        const keyID = entry?.keyID;
        if (!keyID) continue;
        if (seen.has(keyID)) continue;
        seen.add(keyID);
        result.push(entry);
    }
    return result;
}

function createCYBMOKValueEntries(store: CYBMOKStore, dateStr: string, count: number, now: string): any[] {
    return dedupeValueEntries([
        createBlockValue(store.keys.title.key.id, dateStr),
        createTextValue(store.keys.date.key.id, dateStr),
        createNumberValue(store.keys.count.key.id, String(count)),
        createTextValue(store.keys.createdAt.key.id, now),
        createTextValue(store.keys.updatedAt.key.id, now),
    ]);
}

// ========== append value constructors (带 keyID，用于 appendAttributeViewDetachedBlocksWithValues) ==========

function createAppendBlockValue(keyID: string, content: string): any {
    return { keyID, block: { content } };
}

function createAppendTextValue(keyID: string, content: string): any {
    return { keyID, text: { content } };
}

function createAppendNumberValue(keyID: string, content: string): any {
    return { keyID, number: { content: Number(content) || 0, isNotEmpty: true } };
}

// ========== set value constructors (不带 keyID，用于 setAttributeViewBlockAttr) ==========

function createSetTextValue(content: string): any {
    return { text: { content } };
}

function createSetNumberValue(content: string): any {
    return { number: { content: Number(content) || 0, isNotEmpty: true } };
}

// ========== 兼容旧函数名（仅用于 createCYBMOKValueEntries） ==========

function createBlockValue(keyID: string, content: string): any {
    return createAppendBlockValue(keyID, content);
}

function createTextValue(keyID: string, content: string): any {
    return createAppendTextValue(keyID, content);
}

function createNumberValue(keyID: string, content: string): any {
    return createAppendNumberValue(keyID, content);
}

// ========== row/cell 辅助函数 ==========

function getCellID(row: CYBMOKRow, keyID: string): string | undefined {
    return row.values.get(keyID)?.id;
}

function getRowID(row: CYBMOKRow): string {
    return row.itemID;
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
        const date = readCYBMOKRowDate(row, store);
        const count = Math.max(0, Number(readRowField(row, store.keys.count)) || 0);
        return { itemID: row.itemID, date, count };
    });
}

function findRowByDate(store: CYBMOKStore, date: string): CYBMOKRow | null {
    if (!store.status.ok) return null;
    return groupRows(store.av).find((row) => {
        const rowDate = readCYBMOKRowDate(row, store);
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

    const titleKeyID = store.keys.title.key.id;
    const dateKeyID = store.keys.date.key.id;
    const sameKeyID = titleKeyID === dateKeyID;

    if (sameKeyID) {
        console.warn("[cybmokData] title/date 使用同一数据库列，已自动去重写入", {
            databaseId: store.avID,
            dateStr,
        });
    }

    if (existingRow && existingRow.itemID) {
        const currentCount = Math.max(0, Number(readRowField(existingRow, store.keys.count)) || 0);
        const expectedCount = currentCount + 1;
        const rowID = getRowID(existingRow);
        const countCellID = getCellID(existingRow, store.keys.count.key.id);
        const updatedAtCellID = getCellID(existingRow, store.keys.updatedAt.key.id);

        try {
            await setAttributeViewBlockAttrWithCellChecked({
                avID: store.avID,
                keyID: store.keys.count.key.id,
                rowID,
                cellID: countCellID,
                value: createSetNumberValue(String(expectedCount)),
            });
            await setAttributeViewBlockAttrWithCellChecked({
                avID: store.avID,
                keyID: store.keys.updatedAt.key.id,
                rowID,
                cellID: updatedAtCellID,
                value: createSetTextValue(now),
            });
        } catch (e) {
            console.warn("[cybmokData] 更新已有行失败，fallback append 新行", {
                databaseId: store.avID,
                dateStr,
                existingRow: existingRow.itemID,
            }, e);
            const valueEntries = createCYBMOKValueEntries(store, dateStr, expectedCount, now);
            await appendAttributeViewDetachedBlocksWithValuesChecked(store.avID, [valueEntries]);
        }

        const refreshedStore = await loadCYBMOKStore(databaseId);
        if (!refreshedStore || !refreshedStore.status.ok) {
            throw new Error("木鱼数据库写入后重新加载失败");
        }
        const refreshedRow = findRowByDate(refreshedStore, dateStr);
        if (!refreshedRow) {
            console.warn("[cybmokData] 木鱼数据库写入后校验失败：读不到当天行", {
                databaseId: store.avID,
                dateStr,
                expected: expectedCount,
            });
            throw new Error("木鱼数据库写入后校验失败");
        }
        const refreshedCount = Math.max(0, Number(readRowField(refreshedRow, refreshedStore.keys.count)) || 0);
        if (refreshedCount < expectedCount) {
            console.warn("[cybmokData] 木鱼数据库写入后校验失败：count 不达标", {
                avID: store.avID,
                rowID: refreshedRow.itemID,
                cellID: getCellID(refreshedRow, refreshedStore.keys.count.key.id),
                keyID: refreshedStore.keys.count.key.id,
                expected: expectedCount,
                actual: refreshedCount,
            });
            throw new Error("木鱼数据库写入后校验失败");
        }
        return;
    }

    const valueEntries = createCYBMOKValueEntries(store, dateStr, 1, now);
    await appendAttributeViewDetachedBlocksWithValuesChecked(store.avID, [valueEntries]);

    const refreshedStore = await loadCYBMOKStore(databaseId);
    if (!refreshedStore || !refreshedStore.status.ok) {
        throw new Error("木鱼数据库写入后重新加载失败");
    }
    const refreshedRow = findRowByDate(refreshedStore, dateStr);
    if (!refreshedRow) {
        console.warn("[cybmokData] 木鱼数据库写入后校验失败：读不到当天行", {
            databaseId: store.avID,
            dateStr,
            expected: 1,
        });
        throw new Error("木鱼数据库写入后校验失败");
    }

    const refreshedRowID = getRowID(refreshedRow);
    const refreshedCountCellID = getCellID(refreshedRow, refreshedStore.keys.count.key.id);
    await setAttributeViewBlockAttrWithCellChecked({
        avID: refreshedStore.avID,
        keyID: refreshedStore.keys.count.key.id,
        rowID: refreshedRowID,
        cellID: refreshedCountCellID,
        value: createSetNumberValue("1"),
    });

    const finalStore = await loadCYBMOKStore(databaseId);
    if (!finalStore || !finalStore.status.ok) {
        throw new Error("木鱼数据库写入后重新加载失败");
    }
    const finalRow = findRowByDate(finalStore, dateStr);
    if (!finalRow) {
        console.warn("[cybmokData] 木鱼数据库写入后校验失败：读不到当天行", {
            databaseId: store.avID,
            dateStr,
            expected: 1,
        });
        throw new Error("木鱼数据库写入后校验失败");
    }
    const finalCount = Math.max(0, Number(readRowField(finalRow, finalStore.keys.count)) || 0);
    if (finalCount < 1) {
        console.warn("[cybmokData] 木鱼数据库写入后校验失败：count 不达标", {
            avID: store.avID,
            rowID: finalRow.itemID,
            cellID: getCellID(finalRow, finalStore.keys.count.key.id),
            keyID: finalStore.keys.count.key.id,
            expected: 1,
            actual: finalCount,
        });
        throw new Error("木鱼数据库写入后校验失败");
    }
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

            const finalCount = numCount;
            const rowID = getRowID(existingRow);
            const countCellID = getCellID(existingRow, store.keys.count.key.id);
            const updatedAtCellID = getCellID(existingRow, store.keys.updatedAt.key.id);

            try {
                await setAttributeViewBlockAttrWithCellChecked({
                    avID: store.avID,
                    keyID: store.keys.count.key.id,
                    rowID,
                    cellID: countCellID,
                    value: createSetNumberValue(String(finalCount)),
                });
                await setAttributeViewBlockAttrWithCellChecked({
                    avID: store.avID,
                    keyID: store.keys.updatedAt.key.id,
                    rowID,
                    cellID: updatedAtCellID,
                    value: createSetTextValue(now),
                });
            } catch {
                const valueEntries = createCYBMOKValueEntries(store, date, numCount, now);
                await appendAttributeViewDetachedBlocksWithValuesChecked(store.avID, [valueEntries]);
            }
        } else {
            const valueEntries = createCYBMOKValueEntries(store, date, numCount, now);
            await appendAttributeViewDetachedBlocksWithValuesChecked(store.avID, [valueEntries]);
        }
    }

    try {
        await removeFile(`${storageDir}/${legacyFileName}`);
    } catch (err) {
        console.warn("[cybmokData] 迁移后删除旧 CYBMOKData.json 失败，不影响使用", err);
    }
}
