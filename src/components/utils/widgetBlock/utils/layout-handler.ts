import type { Plugin } from 'siyuan';
import { WidgetBlock } from "../WidgetBlock";
import { saveLayoutForContainer, restoreLayoutForContainer } from "./layout-shared";

export async function saveLayout(plugin: Plugin, containerEl?: HTMLElement | null) {
    await saveLayoutForContainer(plugin, {
        containerSelector: ".custom-content",
        layoutFileName: "widgetLayout.json",
        containerEl,
    });
}

export async function restoreLayout(plugin: Plugin, currentBlockForSettingsRef: { value: HTMLElement | null }, containerEl?: HTMLElement | null) {
    await restoreLayoutForContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".custom-content",
        layoutFileName: "widgetLayout.json",
        WidgetBlockClass: WidgetBlock,
        containerEl,
    });
}
