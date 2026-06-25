import type { Plugin } from "siyuan";
import { WidgetBlock } from "./mobileWidgetBlock";
import { stringifyWidgetConfigForMount, type LayoutItem, type WidgetLayoutData } from "../../components/utils/widgetBlock/utils/layout-shared";

const MOBILE_LAYOUT_FILE = "mobileHomepageWidgetLayout.json";

function normalizeLayoutItem(item: unknown): LayoutItem | null {
    if (typeof item !== "object" || item === null) return null;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) return null;
    return {
        id,
        style: typeof raw.style === "string" ? raw.style : null,
        index: typeof raw.index === "number" ? raw.index : 0,
    };
}

function normalizeLayoutItems(items: unknown): LayoutItem[] {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeLayoutItem).filter((item): item is LayoutItem => !!item);
}

function getFirstProfileOrder(layout: WidgetLayoutData | null): LayoutItem[] {
    if (!layout?.profiles) return [];
    for (const profile of Object.values(layout.profiles)) {
        const order = normalizeLayoutItems(profile?.order);
        if (order.length > 0) return order;
    }
    return [];
}

function getMobileOrder(layout: WidgetLayoutData | null): LayoutItem[] {
    const defaultOrder = normalizeLayoutItems(layout?.defaultOrder);
    if (defaultOrder.length > 0) return defaultOrder;

    const legacyOrder = normalizeLayoutItems(layout?.order);
    if (legacyOrder.length > 0) return legacyOrder;

    return getFirstProfileOrder(layout);
}

function destroyExistingWidgets(container: Element): void {
    const existingBlocks = container.querySelectorAll(".widget-block");
    existingBlocks.forEach((block) => {
        const instance = (block as any).__widgetBlockInstance;
        if (instance && typeof instance.destroy === "function") {
            try {
                instance.destroy();
            } catch {
                // ignore widget cleanup errors
            }
        }
    });
}

function readCurrentOrder(container: Element): LayoutItem[] {
    return Array.from(container.children)
        .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains("widget-block"))
        .map((widgetBlockElement, index) => ({
            id: widgetBlockElement.id,
            style: widgetBlockElement.getAttribute("style"),
            index,
        }));
}

export async function saveLayout(plugin: Plugin, containerEl?: HTMLElement | null): Promise<void> {
    const container = containerEl || document.querySelector(".mobile-homepage-widget");
    if (!container) return;

    const currentOrder = readCurrentOrder(container);
    const layoutData: WidgetLayoutData = {
        defaultOrder: currentOrder,
        profiles: {},
    };

    await plugin.saveData(MOBILE_LAYOUT_FILE, layoutData);
}

export async function restoreLayout(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
    runtimeContext: { previewMode?: boolean } = {},
): Promise<void> {
    const container = containerEl || document.querySelector(".mobile-homepage-widget");
    if (!container) return;

    const layout = (await plugin.loadData(MOBILE_LAYOUT_FILE)) as WidgetLayoutData | null;
    const order = getMobileOrder(layout);

    destroyExistingWidgets(container);
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    if (order.length === 0) {
        return;
    }

    const widgetsToRestore: { widgetBlock: WidgetBlock; contentJson: string | null }[] = [];

    for (const item of order) {
        try {
            const widgetBlock = new WidgetBlock(
                plugin,
                currentBlockForSettingsRef,
                item.id,
                item.style || undefined,
                "",
                runtimeContext,
            );
            const contentData = await plugin.loadData(`widget-${item.id}.json`);
            const contentJson = contentData ? stringifyWidgetConfigForMount(contentData) : null;
            widgetsToRestore.push({ widgetBlock, contentJson });
        } catch (error) {
            console.warn(`[MobileLayout] 构建 widget ${item.id} 失败:`, error);
        }
    }

    for (const { widgetBlock } of widgetsToRestore) {
        container.appendChild(widgetBlock.element);
    }

    for (const { widgetBlock, contentJson } of widgetsToRestore) {
        if (!contentJson) continue;
        try {
            widgetBlock.loadcontent = contentJson;
            widgetBlock.updateContent(contentJson);
        } catch (error) {
            console.warn(`[MobileLayout] 更新 widget ${widgetBlock.id} 内容失败:`, error);
        }
    }
}

export { MOBILE_LAYOUT_FILE };
