import type { Plugin } from 'siyuan';
import { WidgetBlock } from "../WidgetBlock";
import {
    saveLayoutForContainer,
    restoreLayoutForContainer,
    type RestoreLayoutResult,
} from "./layout-shared";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

export interface HomepageLayoutRuntimeOptions {
    sectionsEnabled?: boolean;
    sectionId?: string | null;
    preservedWidgetElements?: Map<string, HTMLElement>;
    componentSectionContainers?: ReadonlyMap<string, HTMLElement>;
    deviceViewContext?: DeviceViewContext;
    readOnly?: boolean;
    expectedLayoutRevision?: number;
    expectedWidgetIds?: readonly string[];
    /** 本次需要显式提交到全局 order 的新组件 ID（写后验证通过）。 */
    committedWidgetIds?: string[];
    /** 新组件首次确认内容后回调，由外层保存布局并更新签名；返回 true 表示布局提交成功。 */
    onFirstContentCommitted?: (widgetId: string, options: HomepageLayoutRuntimeOptions) => boolean | Promise<boolean>;
}

export async function saveLayout(
    plugin: Plugin,
    containerEl?: HTMLElement | null,
    runtimeOptions: HomepageLayoutRuntimeOptions = {},
): Promise<boolean> {
    return await saveLayoutForContainer(plugin, {
        containerSelector: ".custom-content",
        layoutFileName: "desktop-homepage",
        containerEl,
        sectionsEnabled: runtimeOptions.sectionsEnabled,
        sectionId: runtimeOptions.sectionId,
        committedWidgetIds: runtimeOptions.committedWidgetIds,
    });
}

export async function restoreLayout(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    containerEl?: HTMLElement | null,
    runtimeOptions: HomepageLayoutRuntimeOptions = {},
): Promise<RestoreLayoutResult> {
    return restoreLayoutForContainer(plugin, currentBlockForSettingsRef, {
        containerSelector: ".custom-content",
        layoutFileName: "desktop-homepage",
        WidgetBlockClass: WidgetBlock,
        containerEl,
        sectionsEnabled: runtimeOptions.sectionsEnabled,
        sectionId: runtimeOptions.sectionId,
        preservedWidgetElements: runtimeOptions.preservedWidgetElements,
        componentSectionContainers: runtimeOptions.componentSectionContainers,
        deviceViewContext: runtimeOptions.deviceViewContext,
        readOnly: runtimeOptions.readOnly,
        expectedLayoutRevision: runtimeOptions.expectedLayoutRevision,
        expectedWidgetIds: runtimeOptions.expectedWidgetIds,
    });
}
