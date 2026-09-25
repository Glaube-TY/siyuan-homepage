import { readDirOrNullChecked } from "@/api";
import { getCurrentDeviceInfo, type DeviceInfo } from "@/homepage/utils/deviceProfile";
import {
    createEmptyLayout,
    createEmptySettings,
    readDeviceDescriptor,
    readDeviceViewLayout,
    readDeviceViewManifest,
    readDeviceViewSettings,
    readDeviceWidget,
    writeDeviceDescriptor,
    writeInitialDeviceViewFiles,
} from "./deviceViewStorage";
import { DeviceViewTemporarilyIncompleteError } from "./deviceViewErrors";
import {
    DEVICE_VIEW_SCHEMA_VERSION,
    deviceViewSurfaceHasSettings,
    type DeviceViewContext,
    type DeviceViewLayout,
    type DeviceViewMetadata,
    type DeviceViewSettings,
    type DeviceWidgetDocument,
} from "./deviceViewTypes";
import { ensureDesktopHomepageSectionsMigrated } from "./desktopHomepageSectionModel";
import { getSurfaceRoot } from "./deviceViewPaths";
import { cloneJsonSafe } from "./jsonSafe";

const readinessTasks = new Map<string, Promise<void>>();
const readyKeys = new Set<string>();

function readinessKey(context: DeviceViewContext): string {
    return `${context.scopeId}:${context.surface}`;
}

function incomplete(context: DeviceViewContext, missingType: "layout" | "view" | "widget" | "manifest") {
    return new DeviceViewTemporarilyIncompleteError({
        deviceId: context.scopeId,
        surface: context.surface,
        missingType,
    });
}

async function verifyCurrentView(context: DeviceViewContext): Promise<void> {
    const layout = context.surface === "desktop-homepage"
        ? await readDeviceViewLayout(context, { allowUnmigrated: true })
        : await readDeviceViewLayout(context);
    if (!layout) throw incomplete(context, "layout");
    if (deviceViewSurfaceHasSettings(context.surface) && !await readDeviceViewSettings(context)) {
        throw incomplete(context, "view");
    }
    if (context.surface === "desktop-homepage") {
        await ensureDesktopHomepageSectionsMigrated(context);
        if (!await readDeviceViewLayout(context)) throw incomplete(context, "layout");
    }
}

function isRemoteDesktopView(context: DeviceViewContext, info: DeviceInfo): boolean {
    return info.isRemoteKernel === true
        && (info.frontend === "desktop" || info.frontend === "desktop-window")
        && (context.surface === "desktop-homepage" || context.surface === "desktop-sidebar");
}

function recontextualize<T extends DeviceViewMetadata>(
    document: T,
    context: DeviceViewContext,
    updatedAt: string,
): T {
    return {
        ...cloneJsonSafe(document, `恢复 ${context.surface} 文档`),
        schema: "siyuan-homepage-device-view",
        version: DEVICE_VIEW_SCHEMA_VERSION,
        revision: 1,
        updatedAt,
        deviceId: context.scopeId,
        surface: context.surface,
    };
}

async function writeCurrentDeviceDescriptor(context: DeviceViewContext, info: DeviceInfo): Promise<void> {
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
}

async function recoverLegacyRemoteView(context: DeviceViewContext, info: DeviceInfo): Promise<boolean> {
    if (!isRemoteDesktopView(context, info)) return false;
    const legacyId = info.legacyRemotePhysicalDeviceId;
    if (!legacyId?.startsWith("desktop-")) {
        throw new Error("Remote Desktop 缺少有效的旧设备视图身份，已停止空视图初始化");
    }
    const legacyContext: DeviceViewContext = {
        ...context,
        physicalDeviceId: legacyId,
        scopeId: legacyId,
        isMobileShared: false,
    };

    // A second readiness process may have completed this target while this one was reading.
    if (await readDeviceViewManifest(context)) return true;

    const legacyManifest = await readDeviceViewManifest(legacyContext);
    const allowUnmigrated = context.surface === "desktop-homepage";
    if (!legacyManifest) {
        const layout = allowUnmigrated
            ? await readDeviceViewLayout(legacyContext, { allowUnmigrated: true })
            : await readDeviceViewLayout(legacyContext);
        const settings = deviceViewSurfaceHasSettings(context.surface)
            ? await readDeviceViewSettings(legacyContext)
            : null;
        if (layout || settings || await readDirOrNullChecked(getSurfaceRoot(legacyContext)) !== null) {
            throw incomplete(legacyContext, "manifest");
        }
        return false;
    }

    await readDeviceDescriptor(legacyContext);
    let layout = allowUnmigrated
        ? await readDeviceViewLayout(legacyContext, { allowUnmigrated: true })
        : await readDeviceViewLayout(legacyContext);
    if (!layout) throw incomplete(legacyContext, "layout");
    let settings: DeviceViewSettings | null = null;
    if (deviceViewSurfaceHasSettings(context.surface)) {
        settings = await readDeviceViewSettings(legacyContext);
        if (!settings) throw incomplete(legacyContext, "view");
    }

    if (context.surface === "desktop-homepage") {
        let migratedLayout: DeviceViewLayout = layout;
        let migratedSettings = settings!;
        await ensureDesktopHomepageSectionsMigrated(legacyContext, {
            readLayout: async () => migratedLayout,
            readSettings: async () => migratedSettings,
            replaceLayout: async (_legacyContext, next, options) => {
                if (options?.expectedRevision !== undefined && options.expectedRevision !== migratedLayout.revision) {
                    throw new Error("legacy layout revision changed during in-memory migration");
                }
                migratedLayout = {
                    ...next,
                    revision: migratedLayout.revision + 1,
                    updatedAt: new Date().toISOString(),
                };
                return migratedLayout;
            },
            updateSettings: async (_legacyContext, mutator, options) => {
                if (options?.expectedRevision !== undefined && options.expectedRevision !== migratedSettings.revision) {
                    throw new Error("legacy settings revision changed during in-memory migration");
                }
                migratedSettings = {
                    ...migratedSettings,
                    revision: migratedSettings.revision + 1,
                    updatedAt: new Date().toISOString(),
                    config: mutator({ ...migratedSettings.config }),
                };
                return migratedSettings;
            },
        });
        layout = migratedLayout;
        settings = migratedSettings;
    }

    const widgets: DeviceWidgetDocument[] = [];
    for (const item of layout.order) {
        const widget = await readDeviceWidget(legacyContext, item.id);
        if (!widget) throw incomplete(legacyContext, "widget");
        widgets.push(widget);
    }

    // Recheck exact target scope before writing; never merge with a partial or concurrent target.
    if (await readDeviceViewManifest(context)) return true;
    if (await readDirOrNullChecked(getSurfaceRoot(context)) !== null) {
        const concurrentManifest = await readDeviceViewManifest(context);
        if (concurrentManifest) return true;
        throw incomplete(context, "manifest");
    }

    await writeCurrentDeviceDescriptor(context, info);
    const updatedAt = new Date().toISOString();
    await writeInitialDeviceViewFiles(context, {
        layout: recontextualize(layout, context, updatedAt),
        ...(settings ? { settings: recontextualize(settings, context, updatedAt) } : {}),
        widgets: widgets.map((widget) => recontextualize(widget, context, updatedAt)),
    }, { migrationSource: "recovered-target", requireEmpty: true });

    if (!await readDeviceViewManifest(context)) throw incomplete(context, "manifest");
    return true;
}

async function verifyOrCreateCurrentView(context: DeviceViewContext): Promise<void> {
    const manifest = await readDeviceViewManifest(context);
    if (manifest) {
        await verifyCurrentView(context);
        return;
    }

    // manifest 缺失但当前格式文件已经出现，通常表示同步尚未完成。
    // 这里绝不以空数据覆盖；完整文件到齐后由下一次读取继续。
    const layout = context.surface === "desktop-homepage"
        ? await readDeviceViewLayout(context, { allowUnmigrated: true })
        : await readDeviceViewLayout(context);
    const settings = deviceViewSurfaceHasSettings(context.surface)
        ? await readDeviceViewSettings(context)
        : null;
    if (layout || settings) {
        if (await readDeviceViewManifest(context)) {
            await verifyCurrentView(context);
            return;
        }
        throw incomplete(context, "manifest");
    }

    const info = getCurrentDeviceInfo();
    const canRecoverRemote = isRemoteDesktopView(context, info);
    if (canRecoverRemote) {
        if (await readDeviceViewManifest(context)) return verifyOrCreateCurrentView(context);
        if (await readDirOrNullChecked(getSurfaceRoot(context)) !== null) {
            if (await readDeviceViewManifest(context)) return verifyOrCreateCurrentView(context);
            throw incomplete(context, "manifest");
        }
        if (await recoverLegacyRemoteView(context, info)) return verifyOrCreateCurrentView(context);
    }

    await writeCurrentDeviceDescriptor(context, info);
    await writeInitialDeviceViewFiles(context, {
        layout: createEmptyLayout(context),
        settings: deviceViewSurfaceHasSettings(context.surface)
            ? createEmptySettings(context)
            : undefined,
        widgets: [],
    }, canRecoverRemote ? { requireEmpty: true } : undefined);
    if (!await readDeviceViewManifest(context)) throw incomplete(context, "manifest");
    await verifyCurrentView(context);
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
