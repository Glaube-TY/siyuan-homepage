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
            let layout: any;
            try {
                const raw = await plugin.loadData(fileName);
                if (!raw) continue;
                layout = typeof raw === "string" ? JSON.parse(raw) : raw;
                if (!layout || typeof layout !== "object") continue;
            } catch {
                // 单个 layout 文件读取或解析失败时跳过，继续检查其它 layout
                continue;
            }

            let ids: string[];
            try {
                ids = collectWidgetIds(layout);
            } catch {
                continue;
            }

            for (const id of ids) {
                if (id === currentBlockId) continue;
                try {
                    const widgetRaw = await plugin.loadData(`widget-${id}.json`);
                    if (!widgetRaw) continue;
                    const widget = typeof widgetRaw === "string" ? JSON.parse(widgetRaw) : widgetRaw;
                    if (widget?.type === "musicPlayer") {
                        return { exists: true, existingBlockId: id };
                    }
                } catch {
                    // 单个 widget 文件读取或解析失败时跳过，继续检查其它 widget
                }
            }
        }

        return { exists: false };
    } catch {
        // 兜底：保证设置弹窗不会崩溃
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

    const addFromProfile = (profile: any) => {
        if (!profile || typeof profile !== "object") return;
        if (profile.defaultOrder) addFromArray(profile.defaultOrder);
        if (profile.order) addFromArray(profile.order);
    };

    if (layout.defaultOrder) addFromArray(layout.defaultOrder);
    if (layout.order) addFromArray(layout.order);

    // profiles 可能是数组 [{defaultOrder?: [...], order?: [...]}] 或对象 Record<string, {defaultOrder?: [...], order?: [...]}>
    if (layout.profiles) {
        if (Array.isArray(layout.profiles)) {
            for (const profile of layout.profiles) {
                addFromProfile(profile);
            }
        } else if (typeof layout.profiles === "object") {
            const values = Object.values(layout.profiles) as any[];
            for (const profile of values) {
                addFromProfile(profile);
            }
        }
    }

    return [...ids];
}
