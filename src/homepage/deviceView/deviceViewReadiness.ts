import { getCurrentDeviceInfo } from "@/homepage/utils/deviceProfile";
import {
    createEmptyLayout,
    createEmptySettings,
    readDeviceViewLayout,
    readDeviceViewManifest,
    readDeviceViewSettings,
    writeDeviceDescriptor,
    writeInitialDeviceViewFiles,
} from "./deviceViewStorage";
import { DeviceViewTemporarilyIncompleteError } from "./deviceViewErrors";
import {
    DEVICE_VIEW_SCHEMA_VERSION,
    deviceViewSurfaceHasSettings,
    type DeviceViewContext,
} from "./deviceViewTypes";

const readinessTasks = new Map<string, Promise<void>>();
const readyKeys = new Set<string>();

function readinessKey(context: DeviceViewContext): string {
    return `${context.scopeId}:${context.surface}`;
}

function incomplete(context: DeviceViewContext, missingType: "layout" | "view" | "manifest") {
    return new DeviceViewTemporarilyIncompleteError({
        deviceId: context.scopeId,
        surface: context.surface,
        missingType,
    });
}

async function verifyOrCreateCurrentView(context: DeviceViewContext): Promise<void> {
    const manifest = await readDeviceViewManifest(context);
    if (manifest) {
        if (!await readDeviceViewLayout(context)) throw incomplete(context, "layout");
        if (deviceViewSurfaceHasSettings(context.surface) && !await readDeviceViewSettings(context)) {
            throw incomplete(context, "view");
        }
        return;
    }

    // manifest 缺失但当前格式文件已经出现，通常表示同步尚未完成。
    // 这里绝不以空数据覆盖；完整文件到齐后由下一次读取继续。
    const layout = await readDeviceViewLayout(context);
    const settings = deviceViewSurfaceHasSettings(context.surface)
        ? await readDeviceViewSettings(context)
        : null;
    if (layout || settings) throw incomplete(context, "manifest");

    const info = getCurrentDeviceInfo();
    await writeDeviceDescriptor(context, {
        schema: "siyuan-homepage-device",
        version: DEVICE_VIEW_SCHEMA_VERSION,
        revision: 1,
        updatedAt: new Date().toISOString(),
        physicalDeviceId: context.physicalDeviceId,
        deviceName: info.deviceName,
        platform: info.os,
        arch: "unknown",
        hostname: info.deviceName,
        isMobile: info.frontend === "mobile" || info.frontend === "browser-mobile",
    });
    await writeInitialDeviceViewFiles(context, {
        layout: createEmptyLayout(context),
        settings: deviceViewSurfaceHasSettings(context.surface)
            ? createEmptySettings(context)
            : undefined,
        widgets: [],
    });
}

/**
 * 确保当前 Schema 2 设备视图可读；仅在目录完全为空时创建当前格式的空视图。
 */
export async function ensureCurrentDeviceViewReady(context: DeviceViewContext): Promise<void> {
    const key = readinessKey(context);
    if (readyKeys.has(key)) return;
    const existing = readinessTasks.get(key);
    if (existing) return existing;

    const task = verifyOrCreateCurrentView(context)
        .then(() => {
            readyKeys.add(key);
        })
        .finally(() => {
            if (readinessTasks.get(key) === task) readinessTasks.delete(key);
        });
    readinessTasks.set(key, task);
    return task;
}
