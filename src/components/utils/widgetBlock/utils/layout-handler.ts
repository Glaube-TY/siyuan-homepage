import type { Plugin } from 'siyuan';
import { WidgetBlock } from "../WidgetBlock";
import {
    restoreLayoutForContainer,
    saveLayoutForContainer,
    saveLayoutForContainerExpected,
    type RestoreLayoutResult,
    type SaveLayoutForContainerResult,
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
    /** 已确认的合法空布局（仅 Agent explicit-storage-refresh 严格条件下传 true）。默认 false。 */
    confirmedEmptyLayout?: boolean;
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
        deviceViewContext: runtimeOptions.deviceViewContext,
        expectedLayoutRevision: runtimeOptions.expectedLayoutRevision,
    });
}

/**
 * 带结果的主页布局保存（乐观并发控制）。
 * 成功返回 committed layoutRevision；revision 冲突返回 expected/actual，由调用方提示并刷新。
 */
export async function saveLayoutWithResult(
    plugin: Plugin,
    containerEl?: HTMLElement | null,
    runtimeOptions: HomepageLayoutRuntimeOptions = {},
): Promise<SaveLayoutForContainerResult> {
    return await saveLayoutForContainerExpected(plugin, {
        containerSelector: ".custom-content",
        layoutFileName: "desktop-homepage",
        containerEl,
        sectionsEnabled: runtimeOptions.sectionsEnabled,
        sectionId: runtimeOptions.sectionId,
        committedWidgetIds: runtimeOptions.committedWidgetIds,
        deviceViewContext: runtimeOptions.deviceViewContext,
        expectedLayoutRevision: runtimeOptions.expectedLayoutRevision,
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
        confirmedEmptyLayout: runtimeOptions.confirmedEmptyLayout,
    });
}
