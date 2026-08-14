import { mount } from "svelte";
import { svelteDialog } from "@/libs/dialog";
import { visualChartConfigFromWidgetContent, writeVisualChartConfigToWidgetContent } from "@/features/visual-chart/visual-chart-config";
import type { VisualChartConfig } from "@/features/visual-chart/visual-chart-types";
import type { WidgetContextMenuAction } from "../../widgetContextMenuActions";
import VisualChartConsole from "./VisualChartConsole.svelte";
import { isHomepageEntitlementGranted } from "@/features/entitlement/homepage-entitlement";

interface OpenVisualChartConsoleOptions {
    content: Record<string, unknown>;
    onSave: (content: Record<string, unknown>) => void | Promise<void>;
}

export function openVisualChartConsole(options: OpenVisualChartConsoleOptions): void {
    if (!isHomepageEntitlementGranted()) return;
    const initialConfig = visualChartConfigFromWidgetContent(options.content);
    let ref: ReturnType<typeof svelteDialog>;
    const closeOnEntitlementUnavailable = () => ref?.close();
    window.addEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable);
    ref = svelteDialog({
        title: "",
        mobileCloseControl: "content",
        width: "calc(100vw - 32px)",
        height: "calc(100vh - 40px)",
        callback: () => window.removeEventListener("homepage-advanced-unavailable", closeOnEntitlementUnavailable),
        constructor: (container) => mount(VisualChartConsole, {
            target: container,
            props: {
                initialConfig,
                onSave: async (config: VisualChartConfig) => {
                    await options.onSave(writeVisualChartConfigToWidgetContent(options.content, config));
                },
                onClose: () => ref.close(),
            },
        }),
    });
    ref.dialog.element.classList.add("visual-chart-console-host");
}

export const visualChartContextMenuActions: readonly WidgetContextMenuAction[] = Object.freeze([
    {
        id: "visual-chart.open-studio",
        label: "打开图表工作台",
        icon: "iconGraph",
        order: 10,
        disabled: (context) => !context.hasPersistedConfig || !isHomepageEntitlementGranted(),
        execute: async (context) => {
            if (!isHomepageEntitlementGranted()) throw new Error("可视化图表工作台需要高级会员权限");
            const content = await context.loadConfig();
            if (!content) throw new Error("图表配置不存在，请先完成组件内容设置");
            openVisualChartConsole({ content, onSave: context.saveConfig });
        },
    },
]);
