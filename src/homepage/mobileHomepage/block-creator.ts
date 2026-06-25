import { WidgetBlock } from "./mobileWidgetBlock";
import { addCustomBlockToContainer } from "../../components/utils/widgetBlock/utils/block-creator-shared";
import { saveLayout } from "./mobileHomepage_layout";

export function createMobileWidgetBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl: HTMLElement | null,
    id?: string,
    runtimeContext: { previewMode?: boolean } = {},
): WidgetBlock | null {
    if (!containerEl) return null;

    // Ensure unique ID within the container
    let finalId = id;
    if (finalId && containerEl.querySelector(`#${CSS.escape(finalId)}`)) {
        finalId = undefined; // force generation of a new unique ID
    }

    const widget = new WidgetBlock(plugin, currentBlockForSettingsRef, finalId, undefined, "", runtimeContext);
    widget.appendTo(containerEl);
    return widget;
}

export function addCustomBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
) {
    addCustomBlockToContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".mobile-homepage-widget",
        WidgetBlockClass: WidgetBlock,
        afterAppend: () => {
            saveLayout(plugin, containerEl);
        },
        containerEl,
    });
}
