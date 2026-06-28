/**
 * 检查主页和侧边栏是否已存在音乐播放器组件。
 * 当前编辑的 currentBlockId 不计入冲突。
 * 支持 profiles 为数组或对象结构。
 */
export async function checkExistingMusicPlayer(
    plugin: any,
    currentBlockId: string,
): Promise<{ exists: boolean; existingBlockId?: string }> {
    try {
        const layoutFiles = ["widgetLayout.json", "sidebarWidgetLayout.json"];

        for (const fileName of layoutFiles) {
            const raw = await plugin.loadData(fileName);
            if (!raw) continue;
            const layout = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (!layout || typeof layout !== "object") continue;

            const ids = collectWidgetIds(layout);
            for (const id of ids) {
                if (id === currentBlockId) continue;
                const widgetRaw = await plugin.loadData(`widget-${id}.json`);
                if (!widgetRaw) continue;
                const widget = typeof widgetRaw === "string" ? JSON.parse(widgetRaw) : widgetRaw;
                if (widget?.type === "musicPlayer") {
                    return { exists: true, existingBlockId: id };
                }
            }
        }

        return { exists: false };
    } catch {
        return { exists: false };
    }
}

function collectWidgetIds(layout: any): string[] {
    const ids = new Set<string>();

    const addFromArray = (arr: any[]) => {
        if (!Array.isArray(arr)) return;
        for (const item of arr) {
            if (typeof item === "string") ids.add(item);
            else if (item && typeof item === "object" && typeof item.id === "string") ids.add(item.id);
        }
    };

    if (layout.defaultOrder) addFromArray(layout.defaultOrder);
    if (layout.order) addFromArray(layout.order);

    // profiles 可能是数组 [{order: [...]}] 或对象 Record<string, {order: [...]}>
    if (layout.profiles) {
        if (Array.isArray(layout.profiles)) {
            for (const profile of layout.profiles) {
                if (profile && profile.order) addFromArray(profile.order);
            }
        } else if (typeof layout.profiles === "object") {
            const values = Object.values(layout.profiles) as any[];
            for (const profile of values) {
                if (profile && profile.order) addFromArray(profile.order);
            }
        }
    }

    return [...ids];
}
