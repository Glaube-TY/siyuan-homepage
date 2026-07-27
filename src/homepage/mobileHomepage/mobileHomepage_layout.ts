import type { Plugin } from "siyuan";
import { WidgetBlock } from "./mobileWidgetBlock";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewMigrated } from "@/homepage/deviceView/deviceViewMigration";
import { readDeviceViewLayout, updateDeviceViewLayout } from "@/homepage/deviceView/deviceViewStorage";
import { loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import { stringifyWidgetConfigForMount, type LayoutItem } from "../../components/utils/widgetBlock/utils/layout-shared";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

export const MOBILE_LAYOUT_SURFACE = "mobile-homepage" as const;

// Module-level serial save queue for mobile homepage (single shared scope).
// Ensures saves execute in call order: drag-1 → drag-2 → click-完成.
// Previous failures do not block subsequent saves; each caller receives the real task Promise.
let mobileLayoutSaveQueue: Promise<void> = Promise.resolve();

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

export async function saveLayout(plugin: Plugin, containerEl: HTMLElement | null): Promise<void> {
    // Must receive an explicit container element — no global DOM fallback.
    // This prevents saving the wrong instance when multiple mobile homepage
    // instances coexist (e.g. preview + settings dialog).
    if (!containerEl || !(containerEl instanceof HTMLElement)) {
        throw new Error("移动主页保存失败：未传入有效的容器元素");
    }

    // Capture DOM snapshot synchronously BEFORE any await.
    // If we wait until the queue processes this task, the DOM may have changed
    // due to subsequent edits or component destruction.
    const snapshot = readCurrentOrder(containerEl);

    // Serial save queue: chain tasks so they execute one at a time in call order.
    const previous = mobileLayoutSaveQueue;

    let resolveTask!: (value: void) => void;
    let rejectTask!: (reason: unknown) => void;
    const taskPromise = new Promise<void>((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
    });

    const queued = previous.catch(() => undefined).then(async () => {
        try {
            const context = await getReadyContext(plugin);

            // Use updateDeviceViewLayout WITHOUT expectedRevision.
            // The storage layer's own per-path write queue reads the latest revision
            // inside the queue, so there is no self-conflict between concurrent saves.
            const result = await updateDeviceViewLayout(
                context,
                (latest) => ({ ...latest, order: snapshot }),
            );

            // Post-save semantic verification against the captured snapshot
            const resultIds = result.order.map((item) => item.id);
            const snapshotIds = snapshot.map((item) => item.id);
            if (
                resultIds.length !== snapshotIds.length
                || !resultIds.every((id, i) => id === snapshotIds[i])
            ) {
                throw new Error("移动主页布局保存后校验失败：组件顺序与快照不一致");
            }
            for (let i = 0; i < snapshot.length; i++) {
                if (result.order[i].style !== snapshot[i].style) {
                    throw new Error(
                        `移动主页布局保存后校验失败：组件 ${snapshot[i].id} 的 style 与快照不一致`,
                    );
                }
                if (result.order[i].index !== snapshot[i].index) {
                    throw new Error(
                        `移动主页布局保存后校验失败：组件 ${snapshot[i].id} 的 index 与快照不一致`,
                    );
                }
            }

            resolveTask();
        } catch (error) {
            rejectTask(error);
        }
    });

    // Update queue tail: absorb errors so the next task still runs.
    mobileLayoutSaveQueue = queued.catch(() => undefined);

    return taskPromise;
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
