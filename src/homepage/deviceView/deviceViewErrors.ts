import { getDeviceRoot } from "./deviceViewPaths";
import type { DeviceViewContext, DeviceViewSurface } from "./deviceViewTypes";

export type DeviceViewAccessBlockedCode =
    | "device_view_schema_unrecognized"
    | "device_view_version_mismatch"
    | "device_view_manifest_unreadable";

export interface DeviceViewAccessBlockedDetails {
    code: DeviceViewAccessBlockedCode;
    deviceId: string;
    surface: DeviceViewSurface;
    deviceRootPath: string;
    reason: string;
    safeMessage: string;
}

export class DeviceViewAccessBlockedError extends Error {
    public readonly code: DeviceViewAccessBlockedCode;
    public readonly deviceId: string;
    public readonly surface: DeviceViewSurface;
    public readonly deviceRootPath: string;
    public readonly safeMessage: string;

    constructor(details: DeviceViewAccessBlockedDetails) {
        super(details.reason);
        this.name = "DeviceViewAccessBlockedError";
        this.code = details.code;
        this.deviceId = details.deviceId;
        this.surface = details.surface;
        this.deviceRootPath = details.deviceRootPath;
        this.safeMessage = details.safeMessage;
    }
}

const notifiedKeys = new Set<string>();

function stateKey(deviceId: string, surface: DeviceViewSurface): string {
    return `${deviceId}:${surface}`;
}

export function markDeviceViewBlockedNotified(
    deviceId: string,
    surface: DeviceViewSurface,
): boolean {
    const key = stateKey(deviceId, surface);
    if (notifiedKeys.has(key)) return false;
    notifiedKeys.add(key);
    return true;
}

export function hasDeviceViewBlockedNotified(deviceId: string, surface: DeviceViewSurface): boolean {
    return notifiedKeys.has(stateKey(deviceId, surface));
}

export function createDeviceViewBlockedError(
    context: DeviceViewContext,
    code: DeviceViewAccessBlockedCode,
    reason: string,
): DeviceViewAccessBlockedError {
    const deviceRootPath = getDeviceRoot(context.plugin, context.scopeId);
    const safeMessage = [
        "设备视图访问被阻断，插件已停止自动写入，防止覆盖无法识别的数据。",
        `当前设备目录：${deviceRootPath}`,
        "请手动检查该目录中的文件；插件不会自动删除或覆盖不兼容的数据。",
    ].join("\n");
    return new DeviceViewAccessBlockedError({
        code,
        deviceId: context.scopeId,
        surface: context.surface,
        deviceRootPath,
        reason,
        safeMessage,
    });
}

export function formatDeviceViewBlockedUserMessage(error: DeviceViewAccessBlockedError): string {
    return error.safeMessage;
}

export type DeviceViewTemporarilyIncompleteMissingType = "layout" | "view" | "widget" | "manifest";

export class DeviceViewTemporarilyIncompleteError extends Error {
    public readonly deviceId: string;
    public readonly surface: DeviceViewSurface;
    public readonly missingType: DeviceViewTemporarilyIncompleteMissingType;

    constructor(details: {
        deviceId: string;
        surface: DeviceViewSurface;
        missingType: DeviceViewTemporarilyIncompleteMissingType;
    }) {
        super(
            `当前设备 ${details.surface} 视图文件暂不完整：缺少 ${details.missingType}。` +
            "同步完成后将自动重试，请勿手动重建目录。",
        );
        this.name = "DeviceViewTemporarilyIncompleteError";
        this.deviceId = details.deviceId;
        this.surface = details.surface;
        this.missingType = details.missingType;
    }
}
