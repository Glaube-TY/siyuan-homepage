import { WidgetBlock } from '../WidgetBlock';
import { addCustomBlockToContainer } from './block-creator-shared';
import { type HomepageLayoutRuntimeOptions } from './layout-handler';
import { getCurrentDeviceViewContext } from '@/homepage/deviceView/deviceViewContext';

export function addCustomBlock(
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
    runtimeOptions: HomepageLayoutRuntimeOptions = {},
) {
    addCustomBlockToContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".custom-content",
        WidgetBlockClass: WidgetBlock,
        containerEl,
        widgetOptions: {
            ...runtimeOptions,
            deviceViewContext: runtimeOptions.deviceViewContext || getCurrentDeviceViewContext(plugin, "desktop-homepage"),
        },
    });
}
