// 可重建的 AI runtime cache，不是用户业务数据，也不写入 Widget Config。
export const DAILY_QUOTE_AI_CACHE_SCHEMA = "daily-quote-ai-cache" as const;
export const DAILY_QUOTE_AI_CACHE_VERSION = 1 as const;

export interface DailyQuoteAiCacheRecord {
    schema: typeof DAILY_QUOTE_AI_CACHE_SCHEMA;
    version: typeof DAILY_QUOTE_AI_CACHE_VERSION;
    instanceId: string;
    localDate: string;
    configKey: string;
    text: string;
    generatedAt: string;
}

const warnedInvalidInstanceIds = new Set<string>();
const INVALID_CACHE_VALUE = Symbol("invalid-daily-quote-ai-cache");

function normalizeCacheInstanceId(instanceId: unknown): string | null {
    const value = typeof instanceId === "string" ? instanceId.trim() : "";
    if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) return value;

    const warningKey = String(instanceId ?? "");
    if (!warnedInvalidInstanceIds.has(warningKey)) {
        warnedInvalidInstanceIds.add(warningKey);
        console.warn("[dailyQuoteAi] instanceId 不适合作为 runtime cache 文件名，本次不使用持久缓存", instanceId);
    }
    return null;
}

export function buildDailyQuoteAiCachePath(instanceId: unknown): string | null {
    const safeInstanceId = normalizeCacheInstanceId(instanceId);
    return safeInstanceId ? `daily-quote/ai-cache/${safeInstanceId}.json` : null;
}

function parseCacheValue(raw: unknown): unknown {
    if (typeof raw !== "string") return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return INVALID_CACHE_VALUE;
    }
}

function isValidCacheRecord(
    value: unknown,
    expected: Pick<DailyQuoteAiCacheRecord, "instanceId" | "localDate" | "configKey">,
): value is DailyQuoteAiCacheRecord {
    if (!value || typeof value !== "object") return false;
    const record = value as Partial<DailyQuoteAiCacheRecord>;
    return record.schema === DAILY_QUOTE_AI_CACHE_SCHEMA
        && record.version === DAILY_QUOTE_AI_CACHE_VERSION
        && record.instanceId === expected.instanceId
        && record.localDate === expected.localDate
        && record.configKey === expected.configKey
        && typeof record.text === "string"
        && record.text.trim().length > 0
        && typeof record.generatedAt === "string"
        && record.generatedAt.trim().length > 0;
}

export async function loadDailyQuoteAiCache(
    plugin: any,
    expected: Pick<DailyQuoteAiCacheRecord, "instanceId" | "localDate" | "configKey">,
): Promise<DailyQuoteAiCacheRecord | null> {
    const path = buildDailyQuoteAiCachePath(expected.instanceId);
    if (!path) return null;

    try {
        const parsed = parseCacheValue(await plugin.loadData(path));
        if (parsed === null || parsed === undefined || parsed === "") return null;
        if (parsed === INVALID_CACHE_VALUE) {
            console.warn("[dailyQuoteAi] runtime cache JSON 无法解析，忽略并重新生成", path);
            return null;
        }
        if (isValidCacheRecord(parsed, expected)) return parsed;
        console.warn("[dailyQuoteAi] runtime cache schema 或内容无效，忽略并重新生成", path);
        return null;
    } catch (error) {
        console.warn("[dailyQuoteAi] runtime cache 读取失败，忽略并重新生成", path, error);
        return null;
    }
}

export async function saveDailyQuoteAiCache(
    plugin: any,
    record: DailyQuoteAiCacheRecord,
): Promise<boolean> {
    const path = buildDailyQuoteAiCachePath(record.instanceId);
    if (!path) return false;

    await plugin.saveData(path, record);
    const saved = parseCacheValue(await plugin.loadData(path));
    if (!isValidCacheRecord(saved, record)) {
        throw new Error(`runtime cache 写后校验失败：${path}`);
    }
    return true;
}
