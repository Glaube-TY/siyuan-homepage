import {
    addAttributeViewKey,
    appendAttributeViewDetachedBlocksWithValues,
    getAttributeView,
    getAttributeViewKeysByAvID,
    setAttributeViewBlockAttr,
    type AttributeView,
    type AttributeViewKeyValue,
} from "@/api";

export interface CountdownEventRecord {
    id: string;
    name: string;
    date: string;
    anniversary: boolean;
    order: number;
    createdAt: string;
    updatedAt: string;
}

export interface CountdownStoreStatus {
    ok: boolean;
    databaseId?: string;
    missingFields: string[];
    message: string;
}

export interface CountdownLoadResult {
    events: CountdownEventRecord[];
    status: CountdownStoreStatus;
}

export type CountdownEventInput = Partial<CountdownEventRecord> & {
    name: string;
    date: string;
    anniversary?: boolean;
    order?: number;
};

const COUNTDOWN_FIELD_ALIASES = {
    title: ["title", "标题", "事件", "事件名称", "主键", "name"],
    eventId: ["eventId", "事件ID", "记录ID", "dataId"],
    name: ["name", "名称", "事件名称"],
    date: ["date", "日期", "事件日期"],
    anniversary: ["anniversary", "周年", "是否周年"],
    order: ["order", "排序", "序号"],
    createdAt: ["createdAt", "创建时间"],
    updatedAt: ["updatedAt", "更新时间"],
    archived: ["archived", "已归档", "归档", "已删除"],
};

type CountdownField = keyof typeof COUNTDOWN_FIELD_ALIASES;

const COUNTDOWN_FIELD_DEFINITIONS: Record<CountdownField, { name: string; type: string; icon: string }> = {
    title: { name: "事件名称", type: "block", icon: "iconCalendar" },
    eventId: { name: "事件ID", type: "text", icon: "iconKey" },
    name: { name: "事件名称", type: "text", icon: "iconEdit" },
    date: { name: "事件日期", type: "text", icon: "iconCalendar" },
    anniversary: { name: "周年", type: "text", icon: "iconRefresh" },
    order: { name: "排序", type: "number", icon: "iconSort" },
    createdAt: { name: "创建时间", type: "text", icon: "iconCalendar" },
    updatedAt: { name: "更新时间", type: "text", icon: "iconRefresh" },
    archived: { name: "已归档", type: "text", icon: "iconArchive" },
};

interface CountdownKeyMap {
    title: AttributeViewKeyValue;
    eventId: AttributeViewKeyValue;
    name: AttributeViewKeyValue;
    date: AttributeViewKeyValue;
    anniversary: AttributeViewKeyValue;
    order: AttributeViewKeyValue;
    createdAt: AttributeViewKeyValue;
    updatedAt: AttributeViewKeyValue;
    archived: AttributeViewKeyValue;
}

interface CountdownStore {
    avID: string;
    av: AttributeView;
    keys: CountdownKeyMap;
    status: CountdownStoreStatus;
}

interface CountdownRow {
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
): CountdownStoreStatus {
    return { ok, databaseId, missingFields, message };
}

function findKey(
    keyValues: AttributeViewKeyValue[],
    field: CountdownField
): AttributeViewKeyValue | null {
    if (field === "title") {
        const primaryKey = keyValues.find((item) => item.key.type === "block");
        if (primaryKey) return primaryKey;
    }

    const aliases = COUNTDOWN_FIELD_ALIASES[field].map(normalizeFieldName);
    return keyValues.find((item) => aliases.includes(normalizeFieldName(item.key.name))) || null;
}

function resolveKeyMap(av: AttributeView): { keys: Partial<CountdownKeyMap>; missingFields: string[] } {
    const keys: Partial<CountdownKeyMap> = {};
    const missingFields: string[] = [];

    (Object.keys(COUNTDOWN_FIELD_ALIASES) as CountdownField[]).forEach((field) => {
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

async function ensureCountdownFields(avID: string, av: AttributeView): Promise<AttributeView> {
    const { missingFields } = resolveKeyMap(av);
    const fieldsToCreate = missingFields.filter((field) => field !== "title") as CountdownField[];
    if (fieldsToCreate.length === 0) return av;

    let previousKeyID = av.keyValues[av.keyValues.length - 1]?.key.id || "";
    for (const field of fieldsToCreate) {
        const definition = COUNTDOWN_FIELD_DEFINITIONS[field];
        const keyID = createSiyuanLikeId();
        await addAttributeViewKey(avID, keyID, definition.name, definition.type, definition.icon, previousKeyID);
        previousKeyID = keyID;
    }

    return await loadAttributeViewWithSchema(avID) || av;
}

async function loadCountdownStore(databaseId: string | undefined): Promise<CountdownStore | null> {
    const avID = databaseId?.trim();
    if (!avID) return null;

    const av = await loadAttributeViewWithSchema(avID);
    if (!av) return null;

    const ensuredAv = await ensureCountdownFields(avID, av);
    const { keys, missingFields } = resolveKeyMap(ensuredAv);
    if (missingFields.length > 0) {
        return {
            avID,
            av: ensuredAv,
            keys: keys as CountdownKeyMap,
            status: createStatus(false, `倒数日数据库字段自动初始化失败：${missingFields.join("、")}`, avID, missingFields),
        };
    }

    return {
        avID,
        av: ensuredAv,
        keys: keys as CountdownKeyMap,
        status: createStatus(true, "数据库可用", avID),
    };
}

function groupRows(av: AttributeView): CountdownRow[] {
    const rowMap = new Map<string, CountdownRow>();

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

function readRowField(row: CountdownRow, key: AttributeViewKeyValue): string {
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

function createValueForKey(key: AttributeViewKeyValue, content: string): any {
    if (key.key.type === "block") return createBlockValue(key.key.id, content);
    if (key.key.type === "number") return createNumberValue(key.key.id, content);
    return createTextValue(key.key.id, content);
}

function isTruthy(value: string): boolean {
    return ["1", "true", "yes", "是", "周年"].includes(value.trim().toLowerCase());
}

function isArchived(value: string): boolean {
    return ["1", "true", "yes", "已删除", "归档", "已归档"].includes(value.trim().toLowerCase());
}

function createCountdownEventId(): string {
    return `countdown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEvent(input: CountdownEventInput, order: number): CountdownEventRecord {
    const now = new Date().toISOString();
    return {
        id: input.id || createCountdownEventId(),
        name: input.name?.trim() || "未命名事件",
        date: input.date || new Date().toISOString().slice(0, 10),
        anniversary: Boolean(input.anniversary),
        order: Number.isFinite(Number(input.order)) ? Number(input.order) : order,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
    };
}

function extractEvents(store: CountdownStore): CountdownEventRecord[] {
    if (!store.status.ok) return [];

    return groupRows(store.av)
        .map((row) => {
            if (isArchived(readRowField(row, store.keys.archived))) return null;
            const name = readRowField(row, store.keys.name) || readRowField(row, store.keys.title);
            const date = readRowField(row, store.keys.date);
            if (!name.trim() || !date.trim()) return null;

            return normalizeEvent(
                {
                    id: readRowField(row, store.keys.eventId) || row.itemID,
                    name,
                    date,
                    anniversary: isTruthy(readRowField(row, store.keys.anniversary)),
                    order: Number(readRowField(row, store.keys.order)) || 0,
                    createdAt: readRowField(row, store.keys.createdAt),
                    updatedAt: readRowField(row, store.keys.updatedAt),
                },
                0
            );
        })
        .filter((event): event is CountdownEventRecord => event !== null)
        .sort((a, b) => a.order - b.order || a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "zh-CN"));
}

function findRowByEventId(store: CountdownStore, eventId: string): CountdownRow | null {
    if (!store.status.ok) return null;
    return groupRows(store.av).find((row) => {
        const rowEventId = readRowField(row, store.keys.eventId);
        return rowEventId === eventId || row.itemID === eventId;
    }) || null;
}

async function setRowValue(
    store: CountdownStore,
    row: CountdownRow,
    key: AttributeViewKeyValue,
    content: string
): Promise<void> {
    await setAttributeViewBlockAttr(store.avID, key.key.id, row.itemID, createValueForKey(key, content));
}

function eventToValueEntries(store: CountdownStore, event: CountdownEventRecord): any[] {
    return [
        createValueForKey(store.keys.title, event.name),
        createTextValue(store.keys.eventId.key.id, event.id),
        createTextValue(store.keys.name.key.id, event.name),
        createTextValue(store.keys.date.key.id, event.date),
        createTextValue(store.keys.anniversary.key.id, event.anniversary ? "true" : "false"),
        createNumberValue(store.keys.order.key.id, String(event.order)),
        createTextValue(store.keys.createdAt.key.id, event.createdAt),
        createTextValue(store.keys.updatedAt.key.id, event.updatedAt),
        createTextValue(store.keys.archived.key.id, "false"),
    ];
}

export async function getCountdownStoreStatus(databaseId: string | undefined): Promise<CountdownStoreStatus> {
    const avID = databaseId?.trim();
    if (!avID) {
        return createStatus(false, "请先在组件设置中填写倒数日数据库 ID");
    }

    const store = await loadCountdownStore(avID);
    if (!store) {
        return createStatus(false, "无法读取倒数日数据库，请检查数据库 ID", avID);
    }

    return store.status;
}

export async function loadCountdownEvents(databaseId: string | undefined): Promise<CountdownLoadResult> {
    const status = await getCountdownStoreStatus(databaseId);
    if (!status.ok) {
        return { events: [], status };
    }

    const store = await loadCountdownStore(databaseId);
    if (!store || !store.status.ok) {
        return { events: [], status };
    }

    return {
        events: extractEvents(store),
        status: store.status,
    };
}

export async function saveCountdownEvents(
    databaseId: string | undefined,
    inputEvents: CountdownEventInput[]
): Promise<CountdownEventRecord[]> {
    const store = await loadCountdownStore(databaseId);
    if (!store || !store.status.ok) {
        throw new Error(store?.status.message || "倒数日数据库不可用");
    }

    const now = new Date().toISOString();
    const existingRows = groupRows(store.av);
    const normalizedEvents = inputEvents
        .filter((event) => event.name?.trim() && event.date?.trim())
        .map((event, index) => normalizeEvent({ ...event, order: index, updatedAt: now }, index));
    const activeIds = new Set(normalizedEvents.map((event) => event.id));

    for (const event of normalizedEvents) {
        const row = findRowByEventId(store, event.id);
        if (row && row.itemID) {
            await setRowValue(store, row, store.keys.title, event.name);
            await setRowValue(store, row, store.keys.eventId, event.id);
            await setRowValue(store, row, store.keys.name, event.name);
            await setRowValue(store, row, store.keys.date, event.date);
            await setRowValue(store, row, store.keys.anniversary, event.anniversary ? "true" : "false");
            await setRowValue(store, row, store.keys.order, String(event.order));
            await setRowValue(store, row, store.keys.updatedAt, event.updatedAt);
            await setRowValue(store, row, store.keys.archived, "false");
        } else {
            await appendAttributeViewDetachedBlocksWithValues(store.avID, [eventToValueEntries(store, event)]);
        }
    }

    for (const row of existingRows) {
        const eventId = readRowField(row, store.keys.eventId) || row.itemID;
        if (!activeIds.has(eventId) && !isArchived(readRowField(row, store.keys.archived))) {
            await setRowValue(store, row, store.keys.archived, "true");
            await setRowValue(store, row, store.keys.updatedAt, now);
        }
    }

    return normalizedEvents;
}

export async function migrateLegacyCountdownEventsIfNeeded(
    databaseId: string | undefined,
    legacyEvents: CountdownEventInput[] | undefined
): Promise<CountdownEventRecord[]> {
    if (!databaseId?.trim()) return [];

    const existing = await loadCountdownEvents(databaseId);
    if (!existing.status.ok || existing.events.length > 0) {
        return existing.events;
    }

    const legacy = (legacyEvents || []).filter((event) => event.name?.trim() && event.date?.trim());
    if (legacy.length === 0) return [];

    return saveCountdownEvents(databaseId, legacy);
}
