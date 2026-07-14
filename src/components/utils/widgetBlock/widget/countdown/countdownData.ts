import {
    COUNTDOWN_STORE_TRANSACTION_LOCK,
    loadSharedJson,
    mutateSharedJson,
    runSharedWidgetExclusive,
    type SharedRevisionedFile,
    type SharedWidgetMigrationMetadata,
} from "../sharedLocalStorage/sharedLocalStorage";
import {
    COUNTDOWN_EVENTS_FILE,
    COUNTDOWN_EVENTS_SCHEMA,
    SHARED_WIDGET_DATA_VERSION,
} from "../sharedLocalStorage/sharedWidgetStoragePaths";
import { assertSharedWidgetMigrationReady } from "../sharedLocalStorage/sharedWidgetMigration";

export interface CountdownEventRecord {
    id: string;
    name: string;
    date: string;
    anniversary: boolean;
    order: number;
    createdAt: string;
    updatedAt: string;
    archived?: boolean;
}

export type CountdownEventInput = Partial<CountdownEventRecord> & {
    name: string;
    date: string;
    anniversary?: boolean;
    order?: number;
};

export interface CountdownEventsFile extends SharedRevisionedFile {
    events: CountdownEventRecord[];
    migration?: SharedWidgetMigrationMetadata;
}

export interface CountdownStoreStatus {
    ok: boolean;
    missingFields: string[];
    message: string;
}

export interface CountdownLoadResult {
    events: CountdownEventRecord[];
    revision: number;
    status: CountdownStoreStatus;
}

export interface CountdownEditSnapshot {
    initialEvents: CountdownEventRecord[];
    initialEventIds: string[];
    baseRevision: number;
}

function finiteCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

function nowIso(): string {
    return new Date().toISOString();
}

function createCountdownEventId(): string {
    return `countdown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEvent(input: CountdownEventInput, order: number): CountdownEventRecord {
    const now = nowIso();
    return {
        id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : createCountdownEventId(),
        name: input.name.trim() || "未命名事件",
        date: input.date.trim(),
        anniversary: Boolean(input.anniversary),
        order: Number.isFinite(Number(input.order)) ? Number(input.order) : order,
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
        archived: input.archived === true,
    };
}

export function createEmptyCountdownEventsFile(): CountdownEventsFile {
    return {
        schema: COUNTDOWN_EVENTS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: 0,
        updatedAt: nowIso(),
        events: [],
    };
}

export function normalizeCountdownEventsFile(raw: unknown): CountdownEventsFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("纪念日数据结构无效");
    const value = raw as Record<string, unknown>;
    if (value.schema !== COUNTDOWN_EVENTS_SCHEMA || value.version !== SHARED_WIDGET_DATA_VERSION) {
        throw new Error("纪念日数据 schema 或 version 不受支持");
    }
    if (!Array.isArray(value.events)) throw new Error("纪念日列表无效");
    const events = value.events.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("纪念日记录无效");
        const event = item as Record<string, unknown>;
        if (typeof event.id !== "string" || !event.id.trim()
            || typeof event.name !== "string" || typeof event.date !== "string") {
            throw new Error("纪念日关键字段无效");
        }
        return normalizeEvent(event as unknown as CountdownEventInput, index);
    });
    return {
        schema: COUNTDOWN_EVENTS_SCHEMA,
        version: SHARED_WIDGET_DATA_VERSION,
        revision: finiteCount(value.revision),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        events,
        migration: value.migration as SharedWidgetMigrationMetadata | undefined,
    };
}

export function sameCountdownEvent(left: CountdownEventRecord, right: CountdownEventRecord): boolean {
    const normalizedLeft = normalizeEvent(left, left.order);
    const normalizedRight = normalizeEvent(right, right.order);
    return normalizedLeft.id === normalizedRight.id
        && normalizedLeft.name === normalizedRight.name
        && normalizedLeft.date === normalizedRight.date
        && normalizedLeft.anniversary === normalizedRight.anniversary
        && normalizedLeft.order === normalizedRight.order
        && normalizedLeft.createdAt === normalizedRight.createdAt
        && normalizedLeft.updatedAt === normalizedRight.updatedAt
        && normalizedLeft.archived === normalizedRight.archived;
}

export function validateCountdownEventRecords(
    actual: CountdownEventRecord[],
    expected: CountdownEventRecord[],
    message = "纪念日写入后业务数据校验失败",
): void {
    const actualById = new Map(actual.map((event) => [event.id, event]));
    const expectedIds = new Set(expected.map((event) => event.id));
    if (actual.length !== expected.length
        || actualById.size !== actual.length
        || expectedIds.size !== expected.length
        || expected.some((event) => {
            const saved = actualById.get(event.id);
            return !saved || !sameCountdownEvent(saved, event);
        })) {
        throw new Error(message);
    }
}

function validateEvents(actual: CountdownEventsFile, expected: CountdownEventsFile): void {
    validateCountdownEventRecords(actual.events, expected.events);
}

export function mergeCountdownEvents(...lists: Array<CountdownEventInput[] | undefined | null>): CountdownEventRecord[] {
    const map = new Map<string, CountdownEventRecord>();
    let order = 0;
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const input of list) {
            if (!input?.name?.trim() || !input?.date?.trim()) continue;
            const normalized = normalizeEvent(input, order++);
            const key = input.id?.trim() || `${normalized.name}|${normalized.date}|${normalized.anniversary}`;
            const existing = map.get(key);
            if (!existing || (normalized.updatedAt && normalized.updatedAt > existing.updatedAt)) map.set(key, normalized);
        }
    }
    return Array.from(map.values())
        .sort((a, b) => a.order - b.order || a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "zh-CN"))
        .map((event, index) => ({ ...event, order: index }));
}

export async function getCountdownStoreStatus(): Promise<CountdownStoreStatus> {
    try {
        await assertSharedWidgetMigrationReady("countdown");
        const file = await loadSharedJson(COUNTDOWN_EVENTS_FILE, normalizeCountdownEventsFile);
        if (file?.migration?.status === "failed") {
            return { ok: false, missingFields: [], message: "旧数据迁移尚未完成，请重新加载插件后重试。" };
        }
        return {
            ok: true,
            missingFields: [],
            message: file?.migration?.cleanupStatus === "pending" ? "旧数据库清理待重试" : "本地数据已就绪",
        };
    } catch (error) {
        return { ok: false, missingFields: [], message: error instanceof Error ? error.message : "本地存储不可用" };
    }
}

async function loadCountdownEventsUnlocked(): Promise<CountdownLoadResult> {
    const file = await loadSharedJson(COUNTDOWN_EVENTS_FILE, normalizeCountdownEventsFile);
    const resolved = file || createEmptyCountdownEventsFile();
    return {
        events: resolved.events.filter((event) => !event.archived).sort((a, b) => a.order - b.order),
        revision: resolved.revision,
        status: { ok: true, missingFields: [], message: "本地数据已就绪" },
    };
}

export async function loadCountdownEvents(): Promise<CountdownLoadResult> {
    await assertSharedWidgetMigrationReady("countdown");
    return loadCountdownEventsUnlocked();
}

export function createCountdownEditSnapshot(result: CountdownLoadResult): CountdownEditSnapshot {
    return {
        initialEvents: structuredClone(result.events),
        initialEventIds: result.events.map((event) => event.id),
        baseRevision: result.revision,
    };
}

function comparableEvent(event: CountdownEventRecord): string {
    return JSON.stringify({
        name: event.name.trim(),
        date: event.date,
        anniversary: event.anniversary,
        order: event.order,
    });
}

async function saveCountdownEventsUnlocked(
    events: CountdownEventInput[],
    snapshot?: CountdownEditSnapshot,
): Promise<CountdownEventRecord[]> {
    const saved = await mutateSharedJson({
        store: "countdown",
        path: COUNTDOWN_EVENTS_FILE,
        createEmpty: createEmptyCountdownEventsFile,
        normalize: normalizeCountdownEventsFile,
        mutate: (file) => {
            const latestById = new Map(file.events.map((event) => [event.id, event]));
            const initialById = new Map((snapshot?.initialEvents || []).map((event) => [event.id, event]));
            const draft = events
                .filter((event) => event?.name?.trim() && event?.date?.trim())
                .map((event, index) => normalizeEvent(event, index));
            const draftIds = new Set(draft.map((event) => event.id));
            const now = nowIso();

            for (const event of draft) {
                const initial = initialById.get(event.id);
                const latest = latestById.get(event.id);
                const wasEdited = !initial || comparableEvent(event) !== comparableEvent(initial);
                if (!latest || wasEdited || !snapshot || snapshot.baseRevision === file.revision) {
                    latestById.set(event.id, {
                        ...latest,
                        ...event,
                        createdAt: latest?.createdAt || event.createdAt || now,
                        updatedAt: wasEdited ? now : (latest?.updatedAt || event.updatedAt || now),
                        archived: false,
                    });
                }
            }

            for (const id of snapshot?.initialEventIds || []) {
                if (draftIds.has(id)) continue;
                const existing = latestById.get(id);
                if (existing) latestById.set(id, { ...existing, archived: true, updatedAt: now });
            }

            const activeOrder = new Map(draft.map((event, index) => [event.id, index]));
            file.events = Array.from(latestById.values())
                .sort((a, b) => {
                    const aOrder = activeOrder.get(a.id);
                    const bOrder = activeOrder.get(b.id);
                    if (aOrder != null && bOrder != null) return aOrder - bOrder;
                    if (aOrder != null) return -1;
                    if (bOrder != null) return 1;
                    return a.order - b.order;
                })
                .map((event, index) => ({ ...event, order: index }));
        },
        validate: validateEvents,
    });
    return saved.events.filter((event) => !event.archived).sort((a, b) => a.order - b.order);
}

export async function saveCountdownEvents(
    events: CountdownEventInput[],
    snapshot?: CountdownEditSnapshot,
): Promise<CountdownEventRecord[]> {
    await assertSharedWidgetMigrationReady("countdown");
    return runSharedWidgetExclusive(
        COUNTDOWN_STORE_TRANSACTION_LOCK,
        () => saveCountdownEventsUnlocked(events, snapshot),
    );
}

export async function upsertCountdownEvent(event: CountdownEventInput): Promise<CountdownEventRecord> {
    await assertSharedWidgetMigrationReady("countdown");
    return runSharedWidgetExclusive(COUNTDOWN_STORE_TRANSACTION_LOCK, async () => {
        const loaded = await loadCountdownEventsUnlocked();
        const normalized = normalizeEvent(event, loaded.events.length);
        const events = loaded.events.filter((item) => item.id !== normalized.id).concat(normalized);
        const saved = await saveCountdownEventsUnlocked(events, createCountdownEditSnapshot(loaded));
        return saved.find((item) => item.id === normalized.id) || normalized;
    });
}

export async function archiveCountdownEvent(eventId: string): Promise<void> {
    await assertSharedWidgetMigrationReady("countdown");
    await runSharedWidgetExclusive(COUNTDOWN_STORE_TRANSACTION_LOCK, async () => {
        const loaded = await loadCountdownEventsUnlocked();
        await saveCountdownEventsUnlocked(
            loaded.events.filter((event) => event.id !== eventId),
            createCountdownEditSnapshot(loaded),
        );
    });
}
