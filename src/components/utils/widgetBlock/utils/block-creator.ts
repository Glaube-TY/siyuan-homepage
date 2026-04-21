import { WidgetBlock } from '../WidgetBlock';
import { addCustomBlockToContainer } from './block-creator-shared';
import { saveLayout } from './layout-handler';

export function addCustomBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
) {
    addCustomBlockToContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".custom-content",
        WidgetBlockClass: WidgetBlock,
        afterAppend: () => {
            saveLayout(plugin, containerEl);
        },
        containerEl,
    });
}