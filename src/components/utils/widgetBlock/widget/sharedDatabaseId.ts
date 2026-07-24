import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { getWidgetPath } from "@/homepage/deviceView/deviceViewPaths";
import { readDeviceViewLayout, readDeviceViewManifest } from "@/homepage/deviceView/deviceViewStorage";
import { loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import type { DeviceViewSurface } from "@/homepage/deviceView/deviceViewTypes";
import { isMobileDevice } from "@/homepage/utils/deviceProfile";

export type DatabaseWidgetType = "fixedAssets" | "CYBMOK" | "focus" | "countdown" | "reviewDocs";

export interface LegacyWidgetConfigRecord {
    widgetId: string;
    surface: DeviceViewSurface;
    path: string;
    config: Record<string, any>;
}

export function parseLegacyWidgetConfig(value: unknown): Record<string, any> | null {
    if (!value) return null;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function getActiveHomepageSurface(): DeviceViewSurface {
    return isMobileDevice() ? "mobile-homepage" : "desktop-homepage";
}

/**
 * 返回当前设备需要扫描的相关 surface：
 * - 桌面端：desktop-homepage、desktop-sidebar；
 * - 移动端：mobile-homepage。
 *
 * 第一铁律约束：不扫描其他设备目录；不在桌面端迁移其他设备的 mobile-homepage。
 */
function getActiveHomepageSurfaces(): DeviceViewSurface[] {
    return isMobileDevice()
        ? ["mobile-homepage"]
        : ["desktop-homepage", "desktop-sidebar"];
}

function collectLayoutReferencedIds(layout: { order: Array<{ id: string }>; sections?: Record<string, { widgetIds: string[] }> }): string[] {
    const ids = new Set<string>();
    for (const item of layout.order) {
        ids.add(item.id);
    }
    for (const section of Object.values(layout.sections || {})) {
        for (const id of section.widgetIds) {
            ids.add(id);
        }
    }
    return [...ids];
}

function buildReferenceSnapshot(layout: { order: Array<{ id: string }>; sections?: Record<string, { widgetIds: string[] }> }): string {
    const ids = collectLayoutReferencedIds(layout);
    return JSON.stringify({
        revision: (layout as unknown as Record<string, unknown>).revision,
        ids: [...ids].sort(),
    });
}

export async function collectKnownWidgetIds(
    plugin: any,
    surface: DeviceViewSurface = getActiveHomepageSurface(),
): Promise<string[]> {
    const ids = new Set<string>();
    const context = getCurrentDeviceViewContext(plugin, surface);
    const layout = await readDeviceViewLayout(context);
    if (!layout) {
        throw new Error(`当前设备 ${surface} 的 layout.json 缺失，共享组件迁移中止`);
    }
    layout.order.forEach((item) => ids.add(item.id));
    Object.values(layout.sections || {}).forEach((section) => {
        section.widgetIds.forEach((id) => ids.add(id));
    });
    return [...ids];
}

export async function collectLegacyWidgetConfigs(
    plugin: any,
    readySurfaces: readonly DeviceViewSurface[],
): Promise<LegacyWidgetConfigRecord[]> {
    // 共享组件迁移覆盖当前设备相关 surface：
    // - 桌面端扫描 desktop-homepage、desktop-sidebar；
    // - 移动端扫描 mobile-homepage。
    // 每个 surface 先完成自己的当前设备视图迁移，再读取布局和组件配置。
    // 通过 surface + widgetId 去重记录。不扫描其他设备目录。
    // 任一相关 surface 出现真实读取错误时抛错，整体共享组件迁移不得标记 complete。
    const activeSurfaces = getActiveHomepageSurfaces();
    if (
        readySurfaces.length !== activeSurfaces.length
        || activeSurfaces.some((surface) => !readySurfaces.includes(surface))
    ) {
        throw new Error("共享组件迁移未获得全部相关 surface 的 ready 授权");
    }
    const result: LegacyWidgetConfigRecord[] = [];
    const seen = new Set<string>();
    for (const currentSurface of readySurfaces) {
        const context = getCurrentDeviceViewContext(plugin, currentSurface);

        const firstLayout = await readDeviceViewLayout(context);
        if (!firstLayout) {
            throw new Error(`当前设备 ${currentSurface} 的 layout.json 缺失，共享组件迁移中止`);
        }
        const firstSnapshot = buildReferenceSnapshot(firstLayout);
        const referencedIds = collectLayoutReferencedIds(firstLayout);
        const manifest = await readDeviceViewManifest(context);
        if (!manifest) throw new Error(`当前设备 ${currentSurface} 的 manifest.json 缺失，共享组件迁移中止`);
        const unresolvedIds = new Set(manifest.migration.unresolvedLegacyWidgetIds ?? []);

        // 任一布局引用的组件配置为 null、损坏或读取失败时立即抛错，
        // 不静默跳过，不启动后续共享业务迁移和旧字段清理。
        const surfaceConfigs: LegacyWidgetConfigRecord[] = [];
        for (const widgetId of referencedIds) {
            const key = `${currentSurface}:${widgetId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const config = await loadWidgetInstanceConfig(context, widgetId);
            if (!config) {
                if (unresolvedIds.has(widgetId)) continue;
                throw new Error(`当前设备 ${currentSurface} 的组件 ${widgetId} 配置缺失或损坏，共享组件迁移中止`);
            }
            surfaceConfigs.push({ widgetId, surface: currentSurface, path: getWidgetPath(context, widgetId), config });
        }

        // 读取全部组件后重新读取布局；revision 或引用集合发生变化时中止本次迁移，
        // 不使用前后不一致的快照。
        const secondLayout = await readDeviceViewLayout(context);
        if (!secondLayout) {
            throw new Error(`当前设备 ${currentSurface} 的 layout.json 在组件读取后缺失，共享组件迁移中止`);
        }
        const secondSnapshot = buildReferenceSnapshot(secondLayout);
        if (secondSnapshot !== firstSnapshot) {
            throw new Error(`当前设备 ${currentSurface} 的布局在组件读取期间发生变化，共享组件迁移中止`);
        }

        result.push(...surfaceConfigs);
    }
    return result;
}

export function readDatabaseIdsFromWidgetConfig(type: DatabaseWidgetType, config: Record<string, any>): string[] {
    if (config.type !== type) return [];
    const data = config.data || {};
    const values = type === "fixedAssets"
        ? [data.fixedAssetsDatabaseId]
        : type === "CYBMOK"
            ? [data.CYBMOKDatabaseId, data.cybmokDatabaseId]
            : type === "countdown"
                ? [data.countdownDatabaseId]
                : type === "reviewDocs"
                    ? [data.reviewDocsDatabaseId]
                    : [data.focusDatabaseId];
    return values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim());
}

export function collectLegacyDatabaseIds(
    configs: LegacyWidgetConfigRecord[],
    countdownNotifyDatabaseId = "",
): Record<DatabaseWidgetType, string[]> {
    const ids: Record<DatabaseWidgetType, Set<string>> = {
        fixedAssets: new Set(), CYBMOK: new Set(), focus: new Set(), countdown: new Set(), reviewDocs: new Set(),
    };
    for (const record of configs) {
        for (const type of Object.keys(ids) as DatabaseWidgetType[]) {
            readDatabaseIdsFromWidgetConfig(type, record.config).forEach((id) => ids[type].add(id));
        }
    }
    if (countdownNotifyDatabaseId.trim()) ids.countdown.add(countdownNotifyDatabaseId.trim());
    return Object.fromEntries(Object.entries(ids).map(([type, values]) => [type, [...values]])) as Record<DatabaseWidgetType, string[]>;
}
