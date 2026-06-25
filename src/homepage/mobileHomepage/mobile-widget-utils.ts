import type { Plugin } from "siyuan";
import type { WidgetLayoutData, LayoutItem } from "../../components/utils/widgetBlock/utils/layout-shared";
import { MOBILE_LAYOUT_FILE } from "./mobileHomepage_layout";

const LAYOUT_REFERENCE_FILES = [
    { fileName: "widgetLayout.json", label: "桌面主页" },
    { fileName: "sidebarWidgetLayout.json", label: "侧边栏主页" },
    { fileName: MOBILE_LAYOUT_FILE, label: "移动端主页" },
];

function normalizeLayoutItems(items: unknown): LayoutItem[] {
    if (!Array.isArray(items)) return [];
    return items
        .map((item): LayoutItem | null => {
            if (typeof item !== "object" || item === null) return null;
            const raw = item as Record<string, unknown>;
            const id = typeof raw.id === "string" ? raw.id : "";
            if (!id) return null;
            return {
                id,
                style: typeof raw.style === "string" ? raw.style : null,
                index: typeof raw.index === "number" ? raw.index : 0,
            };
        })
        .filter((item): item is LayoutItem => !!item);
}

function orderContainsWidget(items: unknown, widgetId: string): boolean {
    return normalizeLayoutItems(items).some((item) => item.id === widgetId);
}

function layoutContainsWidget(layout: WidgetLayoutData | null, widgetId: string): boolean {
    if (!layout) return false;
    if (orderContainsWidget(layout.defaultOrder, widgetId)) return true;
    if (orderContainsWidget(layout.order, widgetId)) return true;
    if (layout.profiles) {
        for (const profile of Object.values(layout.profiles)) {
            if (orderContainsWidget(profile?.order, widgetId)) return true;
            if (Array.isArray(profile?.hiddenWidgetIds) && profile.hiddenWidgetIds.includes(widgetId)) {
                return true;
            }
        }
    }
    return false;
}

export async function getWidgetTypeFromBlock(
    plugin: Plugin,
    block: HTMLElement,
): Promise<string | undefined> {
    if (block.dataset.widgetType) return block.dataset.widgetType;
    try {
        const config = await plugin.loadData(`widget-${block.id}.json`);
        if (typeof config === "string") {
            const parsed = JSON.parse(config);
            return typeof parsed?.type === "string" ? parsed.type : undefined;
        }
        if (typeof config === "object" && config !== null && typeof (config as any).type === "string") {
            return (config as any).type;
        }
    } catch {
        // ignore invalid widget config
    }
    return undefined;
}

export async function getWidgetReferenceLabels(
    plugin: Plugin,
    widgetId: string,
): Promise<string[]> {
    const references: string[] = [];

    for (const { fileName, label } of LAYOUT_REFERENCE_FILES) {
        try {
            const layout = (await plugin.loadData(fileName)) as WidgetLayoutData | null;
            if (layoutContainsWidget(layout, widgetId)) {
                references.push(label);
            }
        } catch {
            // ignore missing or invalid layout file
        }
    }

    return references;
}

export async function removeWidgetConfigIfUnreferenced(
    plugin: Plugin,
    widgetId: string,
): Promise<{ removedConfig: boolean; remainingReferences: string[] }> {
    const remainingReferences = await getWidgetReferenceLabels(plugin, widgetId);
    if (remainingReferences.length > 0) {
        return { removedConfig: false, remainingReferences };
    }

    await plugin.removeData(`widget-${widgetId}.json`);
    return { removedConfig: true, remainingReferences: [] };
}
