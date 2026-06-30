import type { Plugin } from 'siyuan';
import { WidgetBlock } from "../WidgetBlock";
import { saveLayoutForContainer, restoreLayoutForContainer } from "./layout-shared";

export interface HomepageLayoutRuntimeOptions {
    sectionsEnabled?: boolean;
    sectionId?: string | null;
}

export async function saveLayout(
    plugin: Plugin,
    containerEl?: HTMLElement | null,
    runtimeOptions: HomepageLayoutRuntimeOptions = {},
) {
    await saveLayoutForContainer(plugin, {
        containerSelector: ".custom-content",
        layoutFileName: "widgetLayout.json",
        containerEl,
        sectionsEnabled: runtimeOptions.sectionsEnabled,
        sectionId: runtimeOptions.sectionId,
    });
}

export async function restoreLayout(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
    runtimeOptions: HomepageLayoutRuntimeOptions = {},
) {
    await restoreLayoutForContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".custom-content",
        layoutFileName: "widgetLayout.json",
        WidgetBlockClass: WidgetBlock,
        containerEl,
        sectionsEnabled: runtimeOptions.sectionsEnabled,
        sectionId: runtimeOptions.sectionId,
    });
}
