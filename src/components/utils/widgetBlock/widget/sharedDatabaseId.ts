import { readDir } from "@/api";

export type DatabaseWidgetType = "fixedAssets" | "CYBMOK" | "focus" | "countdown" | "reviewDocs";

export interface LegacyWidgetConfigRecord {
    widgetId: string;
    path: string;
    config: Record<string, any>;
}

export function parseLegacyWidgetConfig(value: unknown): Record<string, any> | null {
    if (!value) return null;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch (error) {
            console.warn("[legacySharedWidgetDataDiscovery] 无法解析组件配置", error);
            return null;
        }
    }
    return typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function addWidgetId(ids: Set<string>, value: unknown): void {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
}

function addWidgetIds(ids: Set<string>, values: unknown): void {
    if (Array.isArray(values)) values.forEach((value) => addWidgetId(ids, value));
}

function addProfileWidgetIds(ids: Set<string>, profiles: unknown): void {
    if (!profiles || typeof profiles !== "object") return;
    const list = Array.isArray(profiles) ? profiles : Object.values(profiles as Record<string, unknown>);
    for (const profile of list as any[]) {
        addWidgetIds(ids, profile?.defaultOrder);
        addWidgetIds(ids, profile?.order);
        addWidgetIds(ids, profile?.hiddenWidgetIds);
    }
}

export async function collectKnownWidgetIds(plugin: any): Promise<string[]> {
    const ids = new Set<string>();
    try {
        const layout = parseLegacyWidgetConfig(await plugin.loadData("widgetLayout.json")) || {};
        addWidgetIds(ids, layout.defaultOrder);
        addWidgetIds(ids, layout.order);
        addWidgetIds(ids, layout.hiddenWidgetIds);
        addProfileWidgetIds(ids, layout.profiles);
    } catch (error) {
        console.warn("[legacySharedWidgetDataDiscovery] 读取 widgetLayout.json 失败", error);
    }

    if (typeof document !== "undefined") {
        document.querySelectorAll<HTMLElement>(".custom-content > .widget-block, .widget-block[id]")
            .forEach((element) => addWidgetId(ids, element.id));
    }

    const storageDir = `/data/storage/petal/${plugin?.name || "siyuan-homepage"}`;
    try {
        const entries = await readDir(storageDir);
        for (const entry of Array.isArray(entries) ? entries : []) {
            const match = String(entry?.name || "").match(/^widget-(.+)\.json$/);
            if (match) addWidgetId(ids, match[1]);
        }
    } catch (error) {
        console.warn("[legacySharedWidgetDataDiscovery] 扫描旧组件配置失败", error);
    }
    return Array.from(ids);
}

export async function collectLegacyWidgetConfigs(plugin: any): Promise<LegacyWidgetConfigRecord[]> {
    const result: LegacyWidgetConfigRecord[] = [];
    for (const widgetId of await collectKnownWidgetIds(plugin)) {
        const path = `widget-${widgetId}.json`;
        try {
            const config = parseLegacyWidgetConfig(await plugin.loadData(path));
            if (config) result.push({ widgetId, path, config });
        } catch (error) {
            console.warn(`[legacySharedWidgetDataDiscovery] 读取 ${path} 失败`, error);
        }
    }
    return result;
}

export function readDatabaseIdsFromWidgetConfig(
    type: DatabaseWidgetType,
    config: Record<string, any>,
): string[] {
    if (config.type !== type) return [];
    const data = config.data || {};
    const values = type === "fixedAssets"
        ? [data.fixedAssetsDatabaseId]
        : type === "CYBMOK"
            ? [data.CYBMOKDatabaseId, data.cybmokDatabaseId]
            : type === "countdown"
                ? [data.countdownDatabaseId]
                : type === "reviewDocs"
                    ? [data.reviewDocsDatabaseId]
                    : [data.focusDatabaseId];
    return values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim());
}

export function collectLegacyDatabaseIds(
    configs: LegacyWidgetConfigRecord[],
    countdownNotifyDatabaseId = "",
): Record<DatabaseWidgetType, string[]> {
    const ids: Record<DatabaseWidgetType, Set<string>> = {
        fixedAssets: new Set(),
        CYBMOK: new Set(),
        focus: new Set(),
        countdown: new Set(),
        reviewDocs: new Set(),
    };
    for (const record of configs) {
        for (const type of Object.keys(ids) as DatabaseWidgetType[]) {
            readDatabaseIdsFromWidgetConfig(type, record.config).forEach((id) => ids[type].add(id));
        }
    }
    if (countdownNotifyDatabaseId.trim()) ids.countdown.add(countdownNotifyDatabaseId.trim());
    return Object.fromEntries(Object.entries(ids).map(([type, values]) => [type, Array.from(values)])) as Record<DatabaseWidgetType, string[]>;
}
