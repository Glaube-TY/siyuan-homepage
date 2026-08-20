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
    /** 用户可见名称；桌面旧分栏可以省略，移动主页自定义分区必须提供。 */
    name?: string;
    /** 用户定义的显示顺序。 */
    index?: number;
    widgetLayoutNumber?: number;
    widgetGap?: number;
    createdAt?: number;
    updatedAt?: number;
}

export interface DeviceViewLayout extends DeviceViewMetadata {
    /** 当前 surface 全部组件的全局唯一顺序。 */
    order: DeviceLayoutItem[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
    activeSectionId?: string;
    sections?: Record<string, DeviceLayoutSection>;
    componentSectionsModeEnabled?: boolean;
    /** 桌面主页 5.0 单一事实源分栏模型版本标记（仅 desktop-homepage 使用，当前常量值为 1）。 */
    componentSectionsModelVersion?: number;
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
        /** 仅记录当前设备视图最初如何生成，不会触发任何迁移流程。 */
        source: "legacy-root" | "fresh" | "recovered-target";
        completedAt: string;
        /** 已生成清单中的来源诊断信息；当前运行不再据此启动迁移。 */
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
