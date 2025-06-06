import { WidgetBlock } from '../WidgetBlock';

export function addCustomBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
) {
    const container = document.querySelector(".custom-content");

    const widget = new WidgetBlock(plugin, currentBlockForSettingsRef);
    widget.appendTo(container);
}