import type { DeviceViewContext, DeviceViewSurface } from "./deviceViewTypes";

export const DEVICE_VIEW_CHANGED_EVENT = "siyuan-homepage-device-view-changed";

export interface DeviceViewChangedDetail {
    deviceId: string;
    surface: DeviceViewSurface;
    reason: "layout" | "widget" | "settings" | "initialization";
}

export function dispatchDeviceViewChanged(context: DeviceViewContext, reason: DeviceViewChangedDetail["reason"]): void {
    window.dispatchEvent(new CustomEvent<DeviceViewChangedDetail>(DEVICE_VIEW_CHANGED_EVENT, {
        detail: { deviceId: context.scopeId, surface: context.surface, reason },
    }));
}

/**
 * Homepage Agent 对持久化 device-view / layout / widget storage 的外部写入事件。
 *
 * 与 homepage-settings-saved 的语义区分：
 * - homepage-settings-saved：用户在当前 Homepage 设置 UI 修改配置，尽量保留本地 active section（config-refresh）；
 * - homepage-agent-storage-changed：真实 device-view storage 已被外部（Agent）修改，
 *   应重新读取持久化状态，包括新的 activeSectionId / section structure / layout（explicit-storage-refresh）。
 *
 * 该事件默认不触发 plugin/index.ts 的完整 settings saved 流程，也不应被当作“整个主页设置已保存”。
 */
export const HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT = "homepage-agent-storage-changed";

export type HomepageAgentStorageChangeReason =
    | "widget-added"
    | "widget-updated"
    | "widget-moved"
    | "widget-removed"
    | "layout-updated"
    | "sections-updated"
    | "active-section-updated"
    | "unresolved-cleaned";

export interface HomepageAgentStorageChangedDetail {
    source: "agent";
    surface: "desktop-homepage" | "mobile-homepage";
    reason: HomepageAgentStorageChangeReason;
    affectedWidgetIds?: string[];
    affectedSectionIds?: string[];
    layoutRevision?: number;
    viewRevision?: number;
}

export function dispatchHomepageAgentStorageChanged(detail: HomepageAgentStorageChangedDetail): void {
    window.dispatchEvent(new CustomEvent<HomepageAgentStorageChangedDetail>(HOMEPAGE_AGENT_STORAGE_CHANGED_EVENT, {
        detail,
    }));
}
