import type { Plugin } from 'siyuan';
import { WidgetBlock } from "../WidgetBlock";
import { saveLayoutForContainer, restoreLayoutForContainer } from "./layout-shared";

export async function saveLayout(plugin: Plugin) {
    await saveLayoutForContainer(plugin, {
        containerSelector: ".custom-content",
        layoutFileName: "widgetLayout.json",
    });
}

export async function restoreLayout(plugin: Plugin, currentBlockForSettingsRef: { value: HTMLElement | null }) {
    await restoreLayoutForContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".custom-content",
        layoutFileName: "widgetLayout.json",
        WidgetBlockClass: WidgetBlock,
    });
}
