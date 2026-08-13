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
    const widget = addCustomBlockToContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".custom-content",
        WidgetBlockClass: WidgetBlock,
        containerEl,
        widgetOptions: {
            ...runtimeOptions,
            deviceViewContext: runtimeOptions.deviceViewContext || getCurrentDeviceViewContext(plugin, "desktop-homepage"),
        },
    });

    // 空白组件也是用户已经创建的组件：先写配置与布局，再允许拖动。
    void widget.persistInitialEmptyContent();

    return widget;
}
