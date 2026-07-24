import type { Plugin } from "siyuan";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { ensureCurrentDeviceViewMigrated } from "@/homepage/deviceView/deviceViewMigration";
import { readDeviceViewLayout } from "@/homepage/deviceView/deviceViewStorage";
import { deleteWidgetInstance, loadWidgetInstanceConfig, readWidgetInstanceDocument } from "@/homepage/deviceView/widgetInstanceRepository";
import { runInSurfaceTransaction } from "@/components/utils/widgetBlock/utils/layout-shared";

export async function getWidgetTypeFromBlock(
    plugin: Plugin,
    block: HTMLElement,
): Promise<string | undefined> {
    if (block.dataset.widgetType) return block.dataset.widgetType;
    const context = getCurrentDeviceViewContext(plugin, "mobile-homepage");
    await ensureCurrentDeviceViewMigrated(context);
    const config = await loadWidgetInstanceConfig(context, block.id);
    return typeof config?.type === "string" ? config.type : undefined;
}

export async function getWidgetReferenceLabels(
    plugin: Plugin,
    widgetId: string,
    fixedContext?: ReturnType<typeof getCurrentDeviceViewContext>,
): Promise<string[]> {
    const context = fixedContext ?? getCurrentDeviceViewContext(plugin, "mobile-homepage");
    await ensureCurrentDeviceViewMigrated(context);
    const layout = await readDeviceViewLayout(context);
    return layout?.order.some((item) => item.id === widgetId) ? ["当前移动主页"] : [];
}

export async function removeWidgetConfigIfUnreferenced(
    plugin: Plugin,
    widgetId: string,
): Promise<{ removedConfig: boolean; remainingReferences: string[] }> {
    const context = getCurrentDeviceViewContext(plugin, "mobile-homepage");
    await ensureCurrentDeviceViewMigrated(context);
    return runInSurfaceTransaction(`${context.scopeId}:${context.surface}`, async () => {
        const document = await readWidgetInstanceDocument(context, widgetId);
        const remainingReferences = await getWidgetReferenceLabels(plugin, widgetId, context);
        if (remainingReferences.length > 0) return { removedConfig: false, remainingReferences };
        if (document) await deleteWidgetInstance(context, widgetId, document.revision);
        return { removedConfig: Boolean(document), remainingReferences: [] };
    });
}
