import { WidgetBlock } from "./sidebarWidgetBlock";
import { addCustomBlockToContainer } from "../widgetBlock/utils/block-creator-shared";
import { saveLayout } from "./widget_layout";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";

export function addCustomBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
) {
    addCustomBlockToContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".sidebar-widget",
        WidgetBlockClass: WidgetBlock,
        afterAppend: () => {
            saveLayout(plugin, containerEl);
        },
        containerEl,
        widgetOptions: { deviceViewContext: getCurrentDeviceViewContext(plugin, "desktop-sidebar") },
    });
}
