import { WidgetBlock } from "@/components/utils/widgetBlock/WidgetBlock";
import { saveLayout } from "./mobileHomepage_layout";

export function addCustomBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
) {
    const container = document.querySelector(".mobile-homepage-widget");

    const widget = new WidgetBlock(plugin, currentBlockForSettingsRef);
    widget.appendTo(container);

    saveLayout(plugin);
}