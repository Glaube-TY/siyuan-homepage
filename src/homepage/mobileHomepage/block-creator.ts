import { WidgetBlock } from "./mobileWidgetBlock";
import { addCustomBlockToContainer } from "../../components/utils/widgetBlock/utils/block-creator-shared";
import { saveLayout } from "./mobileHomepage_layout";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

export function createMobileWidgetBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl: HTMLElement | null,
    id?: string,
    runtimeContext: { previewMode?: boolean; deviceViewContext?: DeviceViewContext } = {},
): WidgetBlock | null {
    if (!containerEl) return null;

    // Ensure unique ID within the container
    let finalId = id;
    if (finalId && containerEl.querySelector(`#${CSS.escape(finalId)}`)) {
        finalId = undefined; // force generation of a new unique ID
    }

    const widget = new WidgetBlock(plugin, currentBlockForSettingsRef, finalId, undefined, "", {
        ...runtimeContext,
        deviceViewContext: runtimeContext.deviceViewContext || getCurrentDeviceViewContext(plugin, "mobile-homepage"),
    });
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
        widgetOptions: { deviceViewContext: getCurrentDeviceViewContext(plugin, "mobile-homepage") },
    });
}
