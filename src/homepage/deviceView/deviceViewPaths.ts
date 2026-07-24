import type { DeviceViewContext, DeviceViewSurface } from "./deviceViewTypes";

const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;

export function assertDeviceViewSegment(value: string, label: string): string {
    if (value !== value.trim() || value === "." || value === ".." || !SAFE_SEGMENT_PATTERN.test(value)) {
        throw new Error(`${label} 不是合法的设备视图路径段`);
    }
    return value;
}

export function getPluginStorageRoot(plugin: any): string {
    const pluginName = assertDeviceViewSegment(String(plugin?.name || "siyuan-homepage"), "插件名称");
    return `/data/storage/petal/${pluginName}`;
}

export function getDeviceViewsRoot(plugin: any): string {
    return `${getPluginStorageRoot(plugin)}/device-views`;
}

export function getDeviceRoot(plugin: any, deviceId: string): string {
    return `${getDeviceViewsRoot(plugin)}/${assertDeviceViewSegment(deviceId, "deviceId")}`;
}

export function getDeviceDescriptorPath(context: DeviceViewContext): string {
    return `${getDeviceRoot(context.plugin, context.physicalDeviceId)}/device.json`;
}

/**
 * 解析设备视图存储作用域 ID。
 * - desktop-homepage/desktop-sidebar → 物理 deviceId（逐设备隔离）
 * - mobile-homepage → "mobile-shared"（所有移动端共享）
 */
export function resolveDeviceViewScopeId(physicalDeviceId: string, surface: DeviceViewSurface): string {
    if (surface === "mobile-homepage") return "mobile-shared";
    return physicalDeviceId;
}

export function getScopeRoot(context: DeviceViewContext): string {
    return `${getDeviceViewsRoot(context.plugin)}/${assertDeviceViewSegment(context.scopeId, "scopeId")}`;
}

export function getSurfaceRoot(context: DeviceViewContext): string {
    return `${getScopeRoot(context)}/${context.surface}`;
}

export function getSurfaceManifestPath(context: DeviceViewContext): string {
    return `${getSurfaceRoot(context)}/manifest.json`;
}

export function getSurfaceViewPath(context: DeviceViewContext): string {
    return `${getSurfaceRoot(context)}/view.json`;
}

export function getSurfaceLayoutPath(context: DeviceViewContext): string {
    return `${getSurfaceRoot(context)}/layout.json`;
}

export function getSurfaceWidgetsRoot(context: DeviceViewContext): string {
    return `${getSurfaceRoot(context)}/widgets`;
}

export function getWidgetPath(context: DeviceViewContext, instanceId: string): string {
    const safeId = assertDeviceViewSegment(instanceId, "组件实例 ID");
    return `${getSurfaceWidgetsRoot(context)}/${safeId}.json`;
}

export function getSurfaceBackupsRoot(context: DeviceViewContext): string {
    return `${getSurfaceRoot(context)}/backups`;
}

export function getSurfaceBackupPath(context: DeviceViewContext, label: string): string {
    return `${getSurfaceBackupsRoot(context)}/${assertDeviceViewSegment(label, "备份标签")}.json`;
}

export function assertDeviceViewSurface(value: string): DeviceViewSurface {
    if (value === "desktop-homepage" || value === "desktop-sidebar" || value === "mobile-homepage") {
        return value;
    }
    throw new Error(`未知设备视图 surface: ${value}`);
}
