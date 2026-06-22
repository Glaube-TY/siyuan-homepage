import {
    addAttributeViewKeyChecked,
    appendAttributeViewDetachedBlocksWithValuesChecked,
    getAttributeView,
    getAttributeViewKeysByAvID,
    type AttributeView,
    type AttributeViewKeyValue,
} from "@/api";
import { toLocalDateString } from "./reviewDocsSchedule";
import type { ReviewLogEntry, ReviewLogStats } from "./reviewDocsTypes";

const REVIEW_LOG_FIELD_ALIASES = {
    title: ["title", "复习内容", "标题", "主键", "name"],
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
};

type ReviewLogField = keyof typeof REVIEW_LOG_FIELD_ALIASES;

const REVIEW_LOG_FIELD_DEFINITIONS: Record<ReviewLogField, { name: string; type: string; icon: string }> = {
    title: { name: "复习内容", type: "block", icon: "iconRefresh" },
    logId: { name: "日志ID", type: "text", icon: "iconKey" },
    reviewId: { name: "复习计划ID", type: "text", icon: "iconKey" },
    targetId: { name: "目标块ID", type: "text", icon: "iconBlock" },
    targetRootId: { name: "所属文档ID", type: "text", icon: "iconFile" },
    targetType: { name: "目标类型", type: "text", icon: "iconTags" },
    targetTitle: { name: "标题快照", type: "text", icon: "iconEdit" },
    targetPath: { name: "路径快照", type: "text", icon: "iconFolder" },
    action: { name: "操作", type: "text", icon: "iconRefresh" },
    actionAt: { name: "操作时间", type: "text", icon: "iconCalendar" },
    previousDueDate: { name: "原复习日期", type: "text", icon: "iconCalendar" },
    nextDueDate: { name: "下次复习日期", type: "text", icon: "iconCalendar" },
    reviewCountBefore: { name: "原复习次数", type: "number", icon: "iconList" },
    reviewCountAfter: { name: "复习次数", type: "number", icon: "iconList" },
    intervalIndexBefore: { name: "原间隔索引", type: "number", icon: "iconSort" },
    intervalIndexAfter: { name: "间隔索引", type: "number", icon: "iconSort" },
    plan: { name: "计划类型", type: "text", icon: "iconTags" },
    intervals: { name: "间隔配置", type: "text", icon: "iconCalendar" },
    category: { name: "分类", type: "text", icon: "iconTags" },
    priority: { name: "优先级", type: "text", icon: "iconStar" },
    note: { name: "备注", type: "text", icon: "iconEdit" },
    createdAt: { name: "创建时间", type: "text", icon: "iconCalendar" },
    archived: { name: "已归档", type: "text", icon: "iconArchive" },
};

interface ReviewLogKeyMap {
    title: AttributeViewKeyValue;
    logId: AttributeViewKeyValue;
    reviewId: AttributeViewKeyValue;
    targetId: AttributeViewKeyValue;
    targetRootId: AttributeViewKeyValue;
    targetType: AttributeViewKeyValue;
    targetTitle: AttributeViewKeyValue;
    targetPath: AttributeViewKeyValue;
    action: AttributeViewKeyValue;
    actionAt: AttributeViewKeyValue;
    previousDueDate: AttributeViewKeyValue;
    nextDueDate: AttributeViewKeyValue;
    reviewCountBefore: AttributeViewKeyValue;
    reviewCountAfter: AttributeViewKeyValue;
    intervalIndexBefore: AttributeViewKeyValue;
    intervalIndexAfter: AttributeViewKeyValue;
    plan: AttributeViewKeyValue;
    intervals: AttributeViewKeyValue;
    category: AttributeViewKeyValue;
    priority: AttributeViewKeyValue;
    note: AttributeViewKeyValue;
    createdAt: AttributeViewKeyValue;
    archived: AttributeViewKeyValue;
}

export interface ReviewLogStoreStatus {
    ok: boolean;
    databaseId?: string;
    missingFields: string[];
    message: string;
}

export interface ReviewLogWriteResult {
    ok: boolean;
    skipped: boolean;
    message: string;
}

interface ReviewLogStore {
    avID: string;
    av: AttributeView;
    keys: ReviewLogKeyMap;
    status: ReviewLogStoreStatus;
}

interface ReviewLogRow {
    itemID: string;
    values: Map<string, any>;
}

function createStatus(
    ok: boolean,
    message: string,
    databaseId?: string,
    missingFields: string[] = []
): ReviewLogStoreStatus {
    return { ok, databaseId, missingFields, message };
}

function normalizeFieldName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "");
}

function findKey(
    keyValues: AttributeViewKeyValue[],
    field: ReviewLogField
): AttributeViewKeyValue | null {
    if (field === "title") {
        const primaryKey = keyValues.find((item) => item.key.type === "block");
        if (primaryKey) return primaryKey;
    }

    const aliases = REVIEW_LOG_FIELD_ALIASES[field].map(normalizeFieldName);
    return keyValues.find((item) => aliases.includes(normalizeFieldName(item.key.name))) || null;
}

function resolveKeyMap(av: AttributeView): { keys: Partial<ReviewLogKeyMap>; missingFields: string[] } {
    const keys: Partial<ReviewLogKeyMap> = {};
    const missingFields: string[] = [];

    (Object.keys(REVIEW_LOG_FIELD_ALIASES) as ReviewLogField[]).forEach((field) => {
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

async function ensureReviewLogFields(avID: string, av: AttributeView): Promise<AttributeView> {
    const { missingFields } = resolveKeyMap(av);
    const fieldsToCreate = missingFields.filter((field) => field !== "title") as ReviewLogField[];
    if (fieldsToCreate.length === 0) return av;

    let previousKeyID = av.keyValues[av.keyValues.length - 1]?.key.id || "";
    for (const field of fieldsToCreate) {
        const definition = REVIEW_LOG_FIELD_DEFINITIONS[field];
        const keyID = createSiyuanLikeId();
        await addAttributeViewKeyChecked(avID, keyID, definition.name, definition.type, definition.icon, previousKeyID);
        previousKeyID = keyID;
    }

    return await loadAttributeViewWithSchema(avID) || av;
}

async function loadReviewLogStore(databaseId: string | undefined): Promise<ReviewLogStore | null> {
    const avID = databaseId?.trim();
    if (!avID) return null;

    const av = await loadAttributeViewWithSchema(avID);
    if (!av) return null;

    const ensuredAv = await ensureReviewLogFields(avID, av);
    const { keys, missingFields } = resolveKeyMap(ensuredAv);
    if (missingFields.length > 0) {
        return {
            avID,
            av: ensuredAv,
            keys: keys as ReviewLogKeyMap,
            status: createStatus(false, `复习日志数据库字段自动初始化失败：${missingFields.join("、")}`, avID, missingFields),
        };
    }

    return {
        avID,
        av: ensuredAv,
        keys: keys as ReviewLogKeyMap,
        status: createStatus(true, "数据库可用", avID),
    };
}

function groupRows(av: AttributeView): ReviewLogRow[] {
    const rowMap = new Map<string, ReviewLogRow>();

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

function readRowField(row: ReviewLogRow, key: AttributeViewKeyValue): string {
    return extractTextFromValue(row.values.get(key.key.id));
}

function createBlockValue(keyID: string, content: string): any {
    return { keyID, block: { content } };
}

function createTextValue(keyID: string, content: string): any {
    return { keyID, text: { content } };
}

function createNumberValue(keyID: string, content: number): any {
    return { keyID, number: { content: Number(content) || 0, isNotEmpty: true } };
}

function createValueForKey(key: AttributeViewKeyValue, content: string | number): any {
    if (key.key.type === "block") return createBlockValue(key.key.id, String(content));
    if (key.key.type === "number") return createNumberValue(key.key.id, Number(content));
    return createTextValue(key.key.id, String(content));
}

function logEntryToValueEntries(store: ReviewLogStore, entry: ReviewLogEntry): any[] {
    return [
        createValueForKey(store.keys.title, entry.targetTitle || entry.targetId),
        createTextValue(store.keys.logId.key.id, entry.logId),
        createTextValue(store.keys.reviewId.key.id, entry.reviewId),
        createTextValue(store.keys.targetId.key.id, entry.targetId),
        createTextValue(store.keys.targetRootId.key.id, entry.targetRootId),
        createTextValue(store.keys.targetType.key.id, entry.targetType),
        createTextValue(store.keys.targetTitle.key.id, entry.targetTitle),
        createTextValue(store.keys.targetPath.key.id, entry.targetPath),
        createTextValue(store.keys.action.key.id, entry.action),
        createTextValue(store.keys.actionAt.key.id, entry.actionAt),
        createTextValue(store.keys.previousDueDate.key.id, entry.previousDueDate),
        createTextValue(store.keys.nextDueDate.key.id, entry.nextDueDate),
        createNumberValue(store.keys.reviewCountBefore.key.id, entry.reviewCountBefore),
        createNumberValue(store.keys.reviewCountAfter.key.id, entry.reviewCountAfter),
        createNumberValue(store.keys.intervalIndexBefore.key.id, entry.intervalIndexBefore),
        createNumberValue(store.keys.intervalIndexAfter.key.id, entry.intervalIndexAfter),
        createTextValue(store.keys.plan.key.id, entry.plan),
        createTextValue(store.keys.intervals.key.id, entry.intervals),
        createTextValue(store.keys.category.key.id, entry.category),
        createTextValue(store.keys.priority.key.id, entry.priority),
        createTextValue(store.keys.note.key.id, entry.note),
        createTextValue(store.keys.createdAt.key.id, entry.createdAt),
        createTextValue(store.keys.archived.key.id, entry.archived),
    ];
}

export async function getReviewLogStoreStatus(databaseId: string | undefined): Promise<ReviewLogStoreStatus> {
    const avID = databaseId?.trim();
    if (!avID) {
        return createStatus(false, "填写复习日志数据库 ID 后启用日志和统计");
    }

    try {
        const store = await loadReviewLogStore(avID);
        if (!store) {
            return createStatus(false, "无法读取复习日志数据库，请检查数据库 ID", avID);
        }

        return store.status;
    } catch (error) {
        return createStatus(
            false,
            error instanceof Error ? error.message : "复习日志数据库不可用",
            avID
        );
    }
}

export async function appendReviewLog(
    databaseId: string | undefined,
    entry: ReviewLogEntry
): Promise<ReviewLogWriteResult> {
    const avID = databaseId?.trim();
    if (!avID) {
        return {
            ok: true,
            skipped: true,
            message: "未填写复习日志数据库 ID，已跳过日志记录",
        };
    }

    const store = await loadReviewLogStore(avID);
    if (!store || !store.status.ok) {
        return {
            ok: false,
            skipped: false,
            message: store?.status.message || "复习日志数据库不可用",
        };
    }

    await appendAttributeViewDetachedBlocksWithValuesChecked(store.avID, [
        logEntryToValueEntries(store, entry),
    ]);

    return {
        ok: true,
        skipped: false,
        message: "日志已记录",
    };
}

export async function loadReviewLogStats(databaseId: string | undefined): Promise<ReviewLogStats> {
    const avID = databaseId?.trim();
    if (!avID) {
        return {
            todayReviewed: null,
            totalLogs: 0,
            statusMessage: "填写复习日志数据库 ID 后启用统计",
        };
    }

    let store: ReviewLogStore | null = null;
    try {
        store = await loadReviewLogStore(avID);
    } catch (error) {
        return {
            todayReviewed: null,
            totalLogs: 0,
            statusMessage: error instanceof Error ? error.message : "无法读取复习日志数据库",
        };
    }

    if (!store || !store.status.ok) {
        return {
            todayReviewed: null,
            totalLogs: 0,
            statusMessage: store?.status.message || "无法读取复习日志数据库",
        };
    }

    const today = toLocalDateString();
    let todayReviewed = 0;
    let totalLogs = 0;

    for (const row of groupRows(store.av)) {
        const archived = readRowField(row, store.keys.archived).trim().toLowerCase();
        if (archived === "true" || archived === "1" || archived === "已归档") continue;

        totalLogs += 1;
        const action = readRowField(row, store.keys.action);
        const actionAt = readRowField(row, store.keys.actionAt);
        if ((action === "review" || action === "finish") && actionAt.slice(0, 10) === today) {
            todayReviewed += 1;
        }
    }

    return {
        todayReviewed,
        totalLogs,
        statusMessage: "",
    };
}
