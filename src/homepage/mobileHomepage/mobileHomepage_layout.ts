import type { Plugin } from 'siyuan';
import { WidgetBlock } from "./mobileWidgetBlock";
import { saveLayoutForContainer, restoreLayoutForContainer } from "../../components/utils/widgetBlock/utils/layout-shared";

export async function saveLayout(plugin: Plugin, containerEl?: HTMLElement | null) {
    await saveLayoutForContainer(plugin, {
        containerSelector: ".mobile-homepage-widget",
        layoutFileName: "mobileHomepageWidgetLayout.json",
        containerEl,
    });
}

export async function restoreLayout(plugin: Plugin, currentBlockForSettingsRef: { value: HTMLElement | null }, containerEl?: HTMLElement | null) {
    await restoreLayoutForContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".mobile-homepage-widget",
        layoutFileName: "mobileHomepageWidgetLayout.json",
        WidgetBlockClass: WidgetBlock,
        containerEl,
    });
}
