import type { Plugin } from "siyuan";
import { WidgetBlock } from "./mobileWidgetBlock";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewMigrated } from "@/homepage/deviceView/deviceViewMigration";
import { readDeviceViewLayout, replaceDeviceViewLayout } from "@/homepage/deviceView/deviceViewStorage";
import { loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import { stringifyWidgetConfigForMount, type LayoutItem } from "../../components/utils/widgetBlock/utils/layout-shared";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

export const MOBILE_LAYOUT_SURFACE = "mobile-homepage" as const;

function validateLayoutItems(items: LayoutItem[]): LayoutItem[] {
    const seen = new Set<string>();
    return items.map((item, index) => {
        if (!item.id) throw new Error(`移动主页布局第 ${index + 1} 项缺少组件 ID`);
        if (seen.has(item.id)) throw new Error(`移动主页布局包含重复组件 ${item.id}`);
        seen.add(item.id);
        return { ...item, index };
    });
}

function readCurrentOrder(container: Element): LayoutItem[] {
    return validateLayoutItems(Array.from(container.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element.classList.contains("widget-block") && Boolean(element.id))
        .map((element, index) => ({ id: element.id, style: element.getAttribute("style"), index })));
}

async function getReadyContext(plugin: Plugin): Promise<DeviceViewContext> {
    const context = getCurrentDeviceViewContext(plugin, MOBILE_LAYOUT_SURFACE);
    await ensureCurrentDeviceViewMigrated(context);
    return context;
}

export async function saveLayout(plugin: Plugin, containerEl?: HTMLElement | null): Promise<void> {
    const container = containerEl || document.querySelector(".mobile-homepage-widget");
    if (!container) return;
    const context = await getReadyContext(plugin);
    const latest = await readDeviceViewLayout(context);
    if (!latest) throw new Error("移动主页 layout.json 缺失");
    await replaceDeviceViewLayout(context, {
        order: readCurrentOrder(container),
        widgetLayoutNumber: latest.widgetLayoutNumber,
        widgetGap: latest.widgetGap,
        activeSectionId: latest.activeSectionId,
        sections: latest.sections,
        componentSectionsModeEnabled: latest.componentSectionsModeEnabled,
    }, { expectedRevision: latest.revision });
}

export async function restoreLayout(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
    runtimeContext: { previewMode?: boolean; deviceViewContext?: DeviceViewContext } = {},
): Promise<void> {
    const container = containerEl || document.querySelector(".mobile-homepage-widget");
    if (!(container instanceof HTMLElement)) return;
    container.dataset.layoutRestoreState = "restoring";
    const context = runtimeContext.deviceViewContext || await getReadyContext(plugin);

    let layout;
    try {
        layout = await readDeviceViewLayout(context);
        if (!layout) throw new Error("移动主页 layout.json 缺失");
    } catch (error) {
        container.dataset.layoutRestoreState = "incomplete";
        console.warn("[MobileLayout] 布局暂时不可读，保留已挂载组件:", error);
        return;
    }

    const order = validateLayoutItems(layout.order);
    const prepared: Array<{ item: LayoutItem; instance: WidgetBlock; contentJson: string }> = [];
    const existing = new Map<string, HTMLElement>();
    for (const child of Array.from(container.children)) {
        if (child instanceof HTMLElement && child.classList.contains("widget-block") && child.id) existing.set(child.id, child);
    }
    if (order.length === 0 && [...existing.values()].some((element) => (element as any).__widgetBlockInstance?.hasMountedContent?.())) {
        container.dataset.layoutRestoreState = "incomplete";
        console.warn("[MobileLayout] 空布局与当前健康组件冲突，本轮保留已挂载组件");
        return;
    }

    let allWidgetsComplete = true;
    for (const item of order) {
        try {
            const current = existing.get(item.id);
            if ((current as any)?.__widgetBlockInstance?.hasMountedContent?.()) continue;
            const config = await loadWidgetInstanceConfig(context, item.id);
            const contentJson = stringifyWidgetConfigForMount(config);
            if (!contentJson) throw new Error(`移动组件 ${item.id} 配置缺失或无效`);
            prepared.push({
                item,
                instance: new WidgetBlock(plugin, currentBlockForSettingsRef, item.id, item.style || undefined, "", {
                    ...runtimeContext,
                    deviceViewContext: context,
                }),
                contentJson,
            });
        } catch (error) {
            allWidgetsComplete = false;
            console.warn(`[MobileLayout] 组件 ${item.id} 暂时无法恢复，已继续处理其他健康组件:`, error);
        }
    }

    for (const { item, instance, contentJson } of prepared) {
        try {
            const old = existing.get(item.id);
            if (old?.parentElement === container) {
                (old as any).__widgetBlockInstance?.destroy?.();
                old.replaceWith(instance.element);
            } else {
                container.appendChild(instance.element);
            }
            instance.loadcontent = contentJson;
            instance.updateContent(contentJson, { deviceViewContext: context });
            existing.set(item.id, instance.element);
        } catch (error) {
            allWidgetsComplete = false;
            instance.destroy();
            instance.element.remove();
            existing.delete(item.id);
            console.warn(`[MobileLayout] 组件 ${item.id} 挂载失败，已保留其他健康组件:`, error);
        }
    }

    const expected = new Set(order.map((item) => item.id));
    if (allWidgetsComplete) {
        for (const [id, element] of existing) {
            if (expected.has(id)) continue;
            (element as any).__widgetBlockInstance?.destroy?.();
            element.remove();
        }
    }
    for (const item of order) {
        const element = existing.get(item.id);
        if (element) container.appendChild(element);
    }
    const healthyCount = order.filter((item) => (existing.get(item.id) as any)?.__widgetBlockInstance?.hasMountedContent?.()).length;
    container.dataset.layoutRestoreState = allWidgetsComplete && healthyCount === order.length ? "ready" : "incomplete";
}
