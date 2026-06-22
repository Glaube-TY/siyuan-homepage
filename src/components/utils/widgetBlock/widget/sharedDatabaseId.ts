export type DatabaseWidgetType = "fixedAssets" | "CYBMOK" | "focus" | "countdown" | "reviewDocs";

export type DatabaseIdResolveResult = {
    databaseId: string;
    sourceWidgetId?: string;
    source: "self" | "existing-widget" | "none";
};

type WidgetConfig = {
    type?: string;
    data?: Record<string, any>;
    [key: string]: any;
};

function parseConfig(value: unknown): WidgetConfig | null {
    if (!value) return null;
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn("[sharedDatabaseId] 无法解析组件配置", error);
            return null;
        }
    }
    if (typeof value === "object") {
        return value as WidgetConfig;
    }
    return null;
}

function addWidgetId(ids: Set<string>, value: unknown): void {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (id) ids.add(id);
}

function addWidgetIds(ids: Set<string>, values: unknown): void {
    if (!Array.isArray(values)) return;
    values.forEach((value) => addWidgetId(ids, value));
}

function addProfileWidgetIds(ids: Set<string>, profiles: unknown): void {
    if (!profiles || typeof profiles !== "object") return;
    const profileList = Array.isArray(profiles)
        ? profiles
        : Object.values(profiles as Record<string, unknown>);

    profileList.forEach((profile: any) => {
        addWidgetIds(ids, profile?.order);
        addWidgetIds(ids, profile?.hiddenWidgetIds);
    });
}

export function getDatabaseIdField(type: DatabaseWidgetType): string {
    if (type === "fixedAssets") return "fixedAssetsDatabaseId";
    if (type === "CYBMOK") return "CYBMOKDatabaseId";
    if (type === "countdown") return "countdownDatabaseId";
    if (type === "reviewDocs") return "reviewDocsDatabaseId";
    return "focusDatabaseId";
}

export function readDatabaseIdFromWidgetConfig(
    type: DatabaseWidgetType,
    config: unknown
): string {
    const parsedConfig = parseConfig(config);
    if (!parsedConfig || parsedConfig.type !== type) {
        return "";
    }

    const data = parsedConfig.data || {};
    const databaseId =
        type === "fixedAssets"
            ? data.fixedAssetsDatabaseId
            : type === "CYBMOK"
                ? data.CYBMOKDatabaseId || data.cybmokDatabaseId
                : type === "countdown"
                    ? data.countdownDatabaseId
                    : type === "reviewDocs"
                        ? data.reviewDocsDatabaseId
                        : data.focusDatabaseId;

    return typeof databaseId === "string" ? databaseId.trim() : "";
}

export async function collectKnownWidgetIds(plugin: any): Promise<string[]> {
    const ids = new Set<string>();

    try {
        const layout = parseConfig(await plugin.loadData("widgetLayout.json")) || {};
        addWidgetIds(ids, layout?.defaultOrder);
        addWidgetIds(ids, layout?.order);
        addProfileWidgetIds(ids, layout?.profiles);
    } catch (error) {
        console.warn("[sharedDatabaseId] 读取 widgetLayout.json 失败", error);
    }

    if (typeof document !== "undefined") {
        document
            .querySelectorAll<HTMLElement>(".custom-content > .widget-block")
            .forEach((element) => addWidgetId(ids, element.id));
    }

    return Array.from(ids);
}

export async function resolveDatabaseIdFromExistingWidgets(
    plugin: any,
    type: DatabaseWidgetType,
    currentBlockId?: string,
    selfConfig?: unknown
): Promise<DatabaseIdResolveResult> {
    const selfDatabaseId = readDatabaseIdFromWidgetConfig(type, selfConfig);
    if (selfDatabaseId) {
        return {
            databaseId: selfDatabaseId,
            sourceWidgetId: currentBlockId,
            source: "self",
        };
    }

    const widgetIds = await collectKnownWidgetIds(plugin);
    for (const widgetId of widgetIds) {
        if (currentBlockId && widgetId === currentBlockId) continue;

        try {
            const config = await plugin.loadData(`widget-${widgetId}.json`);
            const databaseId = readDatabaseIdFromWidgetConfig(type, config);
            if (databaseId) {
                return {
                    databaseId,
                    sourceWidgetId: widgetId,
                    source: "existing-widget",
                };
            }
        } catch (error) {
            console.warn(`[sharedDatabaseId] 读取 widget-${widgetId}.json 失败`, error);
        }
    }

    return {
        databaseId: "",
        source: "none",
    };
}

export async function syncDatabaseIdToSameTypeWidgets(
    plugin: any,
    type: DatabaseWidgetType,
    databaseId: string,
    currentBlockId?: string
): Promise<void> {
    const normalizedDatabaseId = databaseId.trim();
    if (!normalizedDatabaseId) {
        return;
    }

    const field = getDatabaseIdField(type);
    const widgetIds = await collectKnownWidgetIds(plugin);
    for (const widgetId of widgetIds) {
        if (currentBlockId && widgetId === currentBlockId) continue;

        try {
            const config = parseConfig(await plugin.loadData(`widget-${widgetId}.json`));
            if (!config || config.type !== type) continue;

            const nextConfig = {
                ...config,
                data: {
                    ...(config.data || {}),
                    [field]: normalizedDatabaseId,
                },
            };

            await plugin.saveData(`widget-${widgetId}.json`, nextConfig);
        } catch (error) {
            console.warn(`[sharedDatabaseId] 同步 widget-${widgetId}.json 失败`, error);
        }
    }
}
