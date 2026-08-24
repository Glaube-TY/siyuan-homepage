import {
    refreshTaskIndexAfterBroadCommit,
    refreshTaskIndexByRootIds,
} from "@/components/tools/siyuanComponentDataApi";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";

export const TASK_DATA_UPDATED_EVENT = "siyuan-homepage:task-data-updated";

const TASK_DATA_SYNC_DEBOUNCE_MS = 120;

let runtimeEventBus: any = null;
let runtimeStarted = false;
let runtimeGeneration = 0;
let pendingRootIds = new Set<string>();
let pendingBroadCommit = false;
let refreshTimer: number | null = null;
let refreshFlight: Promise<void> | null = null;

export function normalizeRootIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .filter((rootId): rootId is string => typeof rootId === "string")
            .map((rootId) => rootId.trim())
            .filter(Boolean),
    ));
}

export interface DatabaseIndexCommitIntent {
    rootIds: string[];
    broad: boolean;
}

export function isDatabaseIndexCommit(value: unknown): value is { cmd: "databaseIndexCommit"; data?: unknown } {
    return Boolean(value && typeof value === "object" && (value as { cmd?: unknown }).cmd === "databaseIndexCommit");
}

export function parseDatabaseIndexCommitIntent(value: unknown): DatabaseIndexCommitIntent | null {
    if (!isDatabaseIndexCommit(value)) return null;
    const message = value as { cmd: "databaseIndexCommit"; data?: unknown };
    const data = message.data && typeof message.data === "object" && !Array.isArray(message.data)
        ? message.data as { rootIDs?: unknown; backlinkFull?: unknown }
        : undefined;
    return {
        rootIds: normalizeRootIds(data?.rootIDs),
        broad: data?.backlinkFull === true,
    };
}

export function selectChangedTaskDataResult(
    results: ComponentMigrationStatus[],
): ComponentMigrationStatus | undefined {
    return results.find((result) => result.lastStatus === "success" && result.changed === true);
}

export function shouldDispatchTaskDataUpdated(
    result: { lastStatus?: string; changed?: boolean } | undefined,
    runtimeActive = true,
    generationMatches = true,
): boolean {
    return runtimeActive && generationMatches && result?.lastStatus === "success" && result.changed === true;
}

function scheduleRefresh(): void {
    if (!runtimeStarted) return;
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    const generation = runtimeGeneration;
    refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void flushPendingRootIds(generation);
    }, TASK_DATA_SYNC_DEBOUNCE_MS);
}

async function flushPendingRootIds(generation: number): Promise<void> {
    if (!runtimeStarted || generation !== runtimeGeneration || refreshFlight || (pendingRootIds.size === 0 && !pendingBroadCommit)) return;
    const rootIds = Array.from(pendingRootIds);
    const broadCommit = pendingBroadCommit;
    pendingRootIds.clear();
    pendingBroadCommit = false;
    const flight = (async () => {
        const results: ComponentMigrationStatus[] = [];
        if (rootIds.length > 0) {
            try {
                const result = await refreshTaskIndexByRootIds(rootIds);
                results.push(result);
                if (result.lastStatus === "error") {
                    console.warn("[task-data-runtime] database-index-commit targeted 任务索引刷新失败", result.lastMessage);
                }
            } catch (error) {
                console.warn("[task-data-runtime] database-index-commit targeted 任务索引刷新异常", error);
            }
        }
        if (broadCommit) {
            try {
                const result = await refreshTaskIndexAfterBroadCommit();
                results.push(result);
                if (result.lastStatus === "error") {
                    console.warn("[task-data-runtime] database-index-commit broad 任务索引刷新失败", result.lastMessage);
                }
            } catch (error) {
                console.warn("[task-data-runtime] database-index-commit broad 任务索引刷新异常", error);
            }
        }
        const changedResult = selectChangedTaskDataResult(results);
        if (!shouldDispatchTaskDataUpdated(changedResult, runtimeStarted, generation === runtimeGeneration)) return;
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(TASK_DATA_UPDATED_EVENT, { detail: changedResult }));
        }
    })();
    refreshFlight = flight;
    try {
        await flight;
    } catch (error) {
        console.warn("[task-data-runtime] database-index-commit 任务索引刷新异常", error);
    } finally {
        if (refreshFlight === flight) refreshFlight = null;
        if (runtimeStarted && generation === runtimeGeneration && (pendingRootIds.size > 0 || pendingBroadCommit)) scheduleRefresh();
    }
}

function handleWsMain(event: CustomEvent<unknown>): void {
    const intent = parseDatabaseIndexCommitIntent(event?.detail);
    if (!intent) return;
    intent.rootIds.forEach((rootId) => pendingRootIds.add(rootId));
    if (intent.broad) pendingBroadCommit = true;
    if (intent.rootIds.length === 0 && !intent.broad) return;
    scheduleRefresh();
}

export function startTaskDataRuntime(plugin: any): void {
    if (runtimeStarted) return;
    const eventBus = plugin?.eventBus;
    if (!eventBus || typeof eventBus.on !== "function" || typeof eventBus.off !== "function") {
        console.warn("[task-data-runtime] EventBus 不可用，任务索引实时同步未启动");
        return;
    }
    runtimeGeneration += 1;
    runtimeEventBus = eventBus;
    runtimeStarted = true;
    pendingRootIds.clear();
    pendingBroadCommit = false;
    try {
        eventBus.on("ws-main", handleWsMain);
    } catch (error) {
        runtimeEventBus = null;
        runtimeStarted = false;
        console.warn("[task-data-runtime] 注册 ws-main 监听失败", error);
    }
}

export function destroyTaskDataRuntime(): void {
    runtimeGeneration += 1;
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    refreshTimer = null;
    pendingRootIds.clear();
    pendingBroadCommit = false;
    try {
        runtimeEventBus?.off("ws-main", handleWsMain);
    } catch (error) {
        console.warn("[task-data-runtime] 移除 ws-main 监听失败", error);
    }
    runtimeEventBus = null;
    runtimeStarted = false;
    refreshFlight = null;
}
