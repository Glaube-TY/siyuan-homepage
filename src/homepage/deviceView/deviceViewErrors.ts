import { getDeviceRoot } from "./deviceViewPaths";
import type { DeviceViewContext, DeviceViewSurface } from "./deviceViewTypes";

export type DeviceViewMigrationBlockedCode =
    | "device_view_schema_unrecognized"
    | "device_view_version_mismatch"
    | "device_view_manifest_unreadable"
    | "legacy_profile_ambiguous";

export interface DeviceViewMigrationBlockedDetails {
    code: DeviceViewMigrationBlockedCode;
    deviceId: string;
    surface: DeviceViewSurface;
    deviceRootPath: string;
    reason: string;
    safeMessage: string;
}

export class DeviceViewMigrationBlockedError extends Error {
    public readonly code: DeviceViewMigrationBlockedCode;
    public readonly deviceId: string;
    public readonly surface: DeviceViewSurface;
    public readonly deviceRootPath: string;
    public readonly safeMessage: string;

    constructor(details: DeviceViewMigrationBlockedDetails) {
        super(details.reason);
        this.name = "DeviceViewMigrationBlockedError";
        this.code = details.code;
        this.deviceId = details.deviceId;
        this.surface = details.surface;
        this.deviceRootPath = details.deviceRootPath;
        this.safeMessage = details.safeMessage;
    }
}

const blockedStates = new Map<string, DeviceViewMigrationBlockedError>();
const notifiedKeys = new Set<string>();

function stateKey(deviceId: string, surface: DeviceViewSurface): string {
    return `${deviceId}:${surface}`;
}

export function recordDeviceViewBlockedState(error: DeviceViewMigrationBlockedError): void {
    blockedStates.set(stateKey(error.deviceId, error.surface), error);
}

export function getDeviceViewBlockedState(
    deviceId: string,
    surface: DeviceViewSurface,
): DeviceViewMigrationBlockedError | undefined {
    return blockedStates.get(stateKey(deviceId, surface));
}

export function isDeviceViewMigrationBlocked(
    deviceId: string,
    surface: DeviceViewSurface,
): boolean {
    return blockedStates.has(stateKey(deviceId, surface));
}

export function isDeviceViewMigrationBlockedForContext(context: DeviceViewContext): boolean {
    return isDeviceViewMigrationBlocked(context.scopeId, context.surface);
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
    code: DeviceViewMigrationBlockedCode,
    reason: string,
): DeviceViewMigrationBlockedError {
    const deviceRootPath = getDeviceRoot(context.plugin, context.scopeId);
    const safeMessage = [
        "设备视图迁移被阻断，插件已停止自动转换，防止覆盖旧数据。",
        `当前设备目录：${deviceRootPath}`,
        "请先备份并检查该目录；插件不会自动删除、覆盖或借用其他设备目录。",
    ].join("\n");
    return new DeviceViewMigrationBlockedError({
        code,
        deviceId: context.scopeId,
        surface: context.surface,
        deviceRootPath,
        reason,
        safeMessage,
    });
}

export function formatDeviceViewBlockedUserMessage(error: DeviceViewMigrationBlockedError): string {
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
