import { WidgetBlock } from "@/components/utils/widgetBlock/WidgetBlock";
import { saveLayout } from "./widget_layout";

export function addCustomBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
) {
    const container = document.querySelector(".sidebar-widget");

    const widget = new WidgetBlock(plugin, currentBlockForSettingsRef);
    widget.appendTo(container);

    saveLayout(plugin);
}