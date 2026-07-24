import type { Plugin } from 'siyuan';
import { WidgetBlock } from "./sidebarWidgetBlock";
import { saveLayoutForContainer, restoreLayoutForContainer } from "../widgetBlock/utils/layout-shared";

export async function saveLayout(plugin: Plugin, containerEl?: HTMLElement | null) {
    await saveLayoutForContainer(plugin, {
        containerSelector: ".sidebar-widget",
        layoutFileName: "desktop-sidebar",
        containerEl,
    });
}

export async function restoreLayout(plugin: Plugin, currentBlockForSettingsRef: { value: HTMLElement | null }, containerEl?: HTMLElement | null) {
    return await restoreLayoutForContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".sidebar-widget",
        layoutFileName: "desktop-sidebar",
        WidgetBlockClass: WidgetBlock,
        containerEl,
    });
}
