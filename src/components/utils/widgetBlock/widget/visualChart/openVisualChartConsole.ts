import { getFrontend } from "siyuan";
import { mount } from "svelte";
import { svelteDialog } from "@/libs/dialog";
import { visualChartConfigFromWidgetContent, writeVisualChartConfigToWidgetContent } from "@/features/visual-chart/visual-chart-config";
import type { VisualChartConfig } from "@/features/visual-chart/visual-chart-types";
import type { WidgetContextMenuAction } from "../../widgetContextMenuActions";
import VisualChartConsole from "./VisualChartConsole.svelte";

interface OpenVisualChartConsoleOptions {
    content: Record<string, unknown>;
    onSave: (content: Record<string, unknown>) => void | Promise<void>;
}

export function openVisualChartConsole(options: OpenVisualChartConsoleOptions): void {
    const mobile = getFrontend().includes("mobile");
    const initialConfig = visualChartConfigFromWidgetContent(options.content);
    let ref: ReturnType<typeof svelteDialog>;
    ref = svelteDialog({
        title: "",
        width: mobile ? "100vw" : "calc(100vw - 32px)",
        height: mobile ? "100dvh" : "calc(100vh - 40px)",
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
        disabled: (context) => !context.hasPersistedConfig || !context.plugin?.ADVANCED,
        execute: async (context) => {
            const content = await context.loadConfig();
            if (!content) throw new Error("图表配置不存在，请先完成组件内容设置");
            openVisualChartConsole({ content, onSave: context.saveConfig });
        },
    },
]);
