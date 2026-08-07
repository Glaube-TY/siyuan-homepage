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

    // 桌面端新增组件后直接进入内容选择，避免用户误把空草稿当成已创建组件。
    requestAnimationFrame(() => {
        const contentButton = widget?.element?.querySelector?.(".block-content-button");
        if (
            widget?.element?.isConnected
            && widget.element.dataset.widgetDraft === "true"
            && contentButton instanceof HTMLButtonElement
        ) {
            contentButton.click();
        }
    });

    return widget;
}
