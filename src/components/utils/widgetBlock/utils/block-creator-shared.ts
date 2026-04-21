import type { Plugin } from 'siyuan';

export interface AddBlockOptions {
    containerSelector: string;
    WidgetBlockClass: any;
    afterAppend?: (plugin: Plugin) => void | Promise<void>;
    containerEl?: HTMLElement | null;
}

export function addCustomBlockToContainer(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    options: AddBlockOptions
): void {
    const container = options.containerEl || document.querySelector(options.containerSelector);

    const widget = new options.WidgetBlockClass(plugin, currentBlockForSettingsRef);
    widget.appendTo(container);

    if (options.afterAppend) {
        options.afterAppend(plugin);
    }
}