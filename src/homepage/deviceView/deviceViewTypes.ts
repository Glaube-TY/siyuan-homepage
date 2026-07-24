export const DEVICE_VIEW_SCHEMA_VERSION = 2;

export type DeviceViewSurface =
    | "desktop-homepage"
    | "desktop-sidebar"
    | "mobile-homepage";

export function deviceViewSurfaceHasSettings(surface: DeviceViewSurface): boolean {
    return surface !== "desktop-sidebar";
}

export interface DeviceViewContext {
    plugin: any;
    /** 物理设备 ID（用于设备管理、日志和同步来源追踪）。 */
    physicalDeviceId: string;
    /** 仅用于 4.8.4 root profile 精确匹配，不得作为 device-view scope。 */
    legacyProfileCandidateIds: string[];
    /** 视图存储作用域 ID：PC 用物理 deviceId，移动端固定为 "mobile-shared" */
    scopeId: string;
    surface: DeviceViewSurface;
    /** 是否为共享移动作用域 */
    isMobileShared: boolean;
}

export interface DeviceViewMetadata {
    schema: "siyuan-homepage-device-view";
    version: number;
    revision: number;
    updatedAt: string;
    deviceId: string;
    surface: DeviceViewSurface;
}

export interface DeviceLayoutItem {
    id: string;
    style: string | null;
    index: number;
}

export interface DeviceLayoutSection {
    /** 分栏成员 ID 列表，顺序由全局 layout.order 过滤得出。 */
    widgetIds: string[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
}

export interface DeviceViewLayout extends DeviceViewMetadata {
    /** 当前 surface 全部组件的全局唯一顺序。 */
    order: DeviceLayoutItem[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
    activeSectionId?: string;
    sections?: Record<string, DeviceLayoutSection>;
    componentSectionsModeEnabled?: boolean;
}

export interface DeviceViewSettings extends DeviceViewMetadata {
    config: Record<string, unknown>;
}

export interface DeviceWidgetDocument extends DeviceViewMetadata {
    instanceId: string;
    config: Record<string, unknown>;
}

export interface DeviceViewManifest extends DeviceViewMetadata {
    status: "complete";
    migration: {
        state: "complete";
        source: "legacy-root" | "fresh" | "recovered-target";
        completedAt: string;
        unresolvedLegacyWidgetIds?: string[];
    };
}

export interface DeviceDescriptor {
    schema: "siyuan-homepage-device";
    version: number;
    revision: number;
    updatedAt: string;
    physicalDeviceId: string;
    deviceName: string;
    platform: string;
    arch: string;
    hostname: string;
    isMobile: boolean;
}

export interface DeviceViewSnapshot {
    layout: DeviceViewLayout;
    widgetRevisions: Record<string, number>;
    signature: string;
}
