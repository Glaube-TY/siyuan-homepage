import { getDeviceRoot } from "./deviceViewPaths";
import type { DeviceViewContext, DeviceViewSurface } from "./deviceViewTypes";

export type DeviceViewAccessBlockedCode =
    | "device_view_schema_unrecognized"
    | "device_view_version_mismatch"
    | "device_view_manifest_unreadable"
    | "desktop_section_migration_blocked"
    | "desktop_section_layout_corrupted";

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

export class DeviceViewRevisionConflictError extends Error {
    public readonly code = "view_revision_conflict";
    constructor(message: string) {
        super(message);
        this.name = "DeviceViewRevisionConflictError";
    }
}

export const DEFAULT_HOMEPAGE_NOT_READY_MESSAGE = "主页数据暂不可用，请刷新页面后重试。";

export function getSafeDeviceViewErrorMessage(error: unknown): string {
    return error instanceof DeviceViewAccessBlockedError
        ? error.safeMessage
        : DEFAULT_HOMEPAGE_NOT_READY_MESSAGE;
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

function classifySectionBlockedReason(reason: string): string {
    if (/未知.*模型版本|componentSectionsModelVersion/.test(reason)) {
        return "未知分栏模型版本";
    }
    if (/重复组件|order.*重复/.test(reason)) {
        return "存在重复全局组件 ID";
    }
    if (/重复.*ID|重复 ID/.test(reason)) {
        return "存在重复分栏或组件 ID";
    }
    if (/名称重复|同名/.test(reason)) {
        return "存在同名分栏";
    }
    if (/名称.*空|名称.*长度/.test(reason)) {
        return "分栏名称无效或超长";
    }
    if (/活动分栏/.test(reason)) {
        return "活动分栏配置无效";
    }
    if (/未归属|未分配/.test(reason)) {
        return "存在未归属任何分栏的组件";
    }
    if (/重复属于多个分栏|同时属于多个分栏|重复归属/.test(reason)) {
        return "组件重复归属于多个分栏";
    }
    if (/不连续|片段/.test(reason)) {
        return "分栏组件在全局顺序中片段不连续";
    }
    if (/出现顺序/.test(reason)) {
        return "分栏组件出现顺序与分栏列表不一致";
    }
    if (/清理/.test(reason)) {
        return "旧视图分栏字段清理失败";
    }
    if (/缺少.*模型标记|未迁移/.test(reason)) {
        return "桌面分栏数据尚未迁移";
    }
    return "分栏结构异常";
}

export function createDeviceViewBlockedError(
    context: DeviceViewContext,
    code: DeviceViewAccessBlockedCode,
    reason: string,
): DeviceViewAccessBlockedError {
    const deviceRootPath = getDeviceRoot(context.plugin, context.scopeId);
    let safeMessage: string;
    if (code === "desktop_section_migration_blocked" || code === "desktop_section_layout_corrupted") {
        const categoryDesc = classifySectionBlockedReason(reason);
        safeMessage = [
            `桌面主页分栏数据存在冲突或损坏（原因：${categoryDesc}），插件已停止自动写入，防止覆盖数据。`,
            "请手动检查设备视图配置；插件不会自动删除或覆盖已有配置。",
        ].join("\n");
    } else {
        safeMessage = [
            "设备视图访问被阻断，插件已停止自动写入，防止覆盖无法识别的数据。",
            "请手动检查设备视图配置；插件不会自动删除或覆盖不兼容的数据。",
        ].join("\n");
    }
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
