import { WidgetBlock } from "./mobileWidgetBlock";
import { addCustomBlockToContainer } from "../../components/utils/widgetBlock/utils/block-creator-shared";
import { saveLayout } from "./mobileHomepage_layout";

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