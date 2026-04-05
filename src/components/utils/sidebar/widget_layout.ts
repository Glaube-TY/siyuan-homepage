import type { Plugin } from 'siyuan';
import { WidgetBlock } from "./sidebarWidgetBlock";
import { saveLayoutForContainer, restoreLayoutForContainer } from "../widgetBlock/utils/layout-shared";

export async function saveLayout(plugin: Plugin) {
    await saveLayoutForContainer(plugin, {
        containerSelector: ".sidebar-widget",
        layoutFileName: "sidebarWidgetLayout.json",
    });
}

export async function restoreLayout(plugin: Plugin, currentBlockForSettingsRef: { value: HTMLElement | null }) {
    await restoreLayoutForContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".sidebar-widget",
        layoutFileName: "sidebarWidgetLayout.json",
        WidgetBlockClass: WidgetBlock,
    });
}
