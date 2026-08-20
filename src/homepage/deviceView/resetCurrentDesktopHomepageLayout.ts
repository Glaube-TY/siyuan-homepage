import {
    assertDesktopHomepageCoordinatedSnapshot,
    normalizeLayoutItems,
    readCoordinatedSnapshotForContext,
    runInSurfaceTransaction,
    saveLayoutDataForContext,
    type CoordinatedSnapshot,
    type WidgetLayoutData,
} from "@/components/utils/widgetBlock/utils/layout-shared";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { cloneJsonSafe, hasSameJsonSemantic } from "@/homepage/deviceView/jsonSafe";
import { readWidgetInstanceDocument } from "@/homepage/deviceView/widgetInstanceRepository";
import type { DeviceViewContext, DeviceWidgetDocument } from "@/homepage/deviceView/deviceViewTypes";

/**
 * 重置当前设备 desktop-homepage 的组件布局（纯重置，不创建任何备份）。
 *
 * 本函数只允许执行以下操作：
 * 1. 固定当前 desktop-homepage 的设备视图上下文；
 * 2. 进入当前 surface 的串行事务队列；
 * 3. 重新读取最新 layout 和 view；
 * 4. 清空当前设备 profile 中的全局组件 order；
 * 5. 清空当前设备各分栏中的 widgetIds；
 * 6. 清空仍用于兼容的顶层 order；
 * 7. 保存修改后的 layout；
 * 8. 写入后重新读取 layout 并验证组件顺序已经清空；
 * 9. 验证 view 配置没有被修改；
 * 10. 验证组件配置文件没有被删除（写前后所有被引用组件实例文档存在且 revision/config 一致）；
 * 11. 验证任务、记账、日记等共享业务数据没有被删除（本函数只写 layout.json，不触碰任何业务数据存储；
 *     存储于组件实例配置文档中的业务数据通过前后一致性校验保证）。
 *
 * 本函数不得：创建备份文件、创建恢复点、写入 backups 目录、删除组件配置文件、
 * 删除共享组件业务数据、删除任务/记账/日记/AI 会话、修改移动主页、
 * 修改桌面侧边栏、修改其他设备的主页、新增任何恢复功能。
 */
export interface ResetCurrentDesktopHomepageLayoutOperations {
    context?: DeviceViewContext;
    readSnapshot?: (context: DeviceViewContext) => Promise<CoordinatedSnapshot>;
    saveLayoutData?: (
        context: DeviceViewContext,
        layout: WidgetLayoutData,
        options?: { expectedRevision?: number },
    ) => Promise<void>;
    readWidgetDocument?: (context: DeviceViewContext, widgetId: string) => Promise<DeviceWidgetDocument | null>;
}

export async function resetCurrentDesktopHomepageLayout(
    plugin: any,
    operations: ResetCurrentDesktopHomepageLayoutOperations = {},
): Promise<void> {
    const context = operations.context ?? getCurrentDeviceViewContext(plugin, "desktop-homepage");
    if (!plugin || !context.plugin || !context.scopeId || context.surface !== "desktop-homepage" || context.plugin !== plugin) {
        throw new Error("桌面主页重置只支持 desktop-homepage context，且要求固定 plugin 与 context 一致");
    }
    const readSnapshot = operations.readSnapshot ?? readCoordinatedSnapshotForContext;
    const saveLayout = operations.saveLayoutData ?? saveLayoutDataForContext;
    const readWidgetDocument = operations.readWidgetDocument ?? readWidgetInstanceDocument;
    const queueKey = `${context.scopeId}:${context.surface}`;
    await runInSurfaceTransaction(queueKey, async () => {
        const snapshot = await readSnapshot(context);
        if (!snapshot.view) throw new Error("桌面主页协调快照缺少 view.json");
        assertDesktopHomepageCoordinatedSnapshot(snapshot, context);

        // 收集当前被引用的组件实例 ID（全局 order + 各分栏 widgetIds），用于写后校验配置未被删除。
        const referencedWidgetIds = collectReferencedWidgetIds(snapshot.layout.layout, context.scopeId);
        const beforeDocuments = new Map<string, { revision: number; config: Record<string, unknown> }>();
        for (const widgetId of referencedWidgetIds) {
            const document = await readWidgetDocument(context, widgetId);
            if (!document) throw new Error(`重置前组件 ${widgetId} 配置缺失`);
            if (
                document.deviceId !== context.scopeId
                || document.surface !== context.surface
                || document.instanceId !== widgetId
            ) {
                throw new Error(`组件 ${widgetId} 文档与固定 context 不一致`);
            }
            if (!Number.isInteger(document.revision) || document.revision <= 0) {
                throw new Error(`组件 ${widgetId} 文档无效`);
            }
            beforeDocuments.set(widgetId, { revision: document.revision, config: document.config });
        }

        const nextLayout = cloneJsonSafe(snapshot.layout.layout, "重置前布局");
        const profile = nextLayout.profiles?.[context.scopeId];
        if (!profile || !Array.isArray(profile.order)) throw new Error("当前设备 profile 缺失，拒绝重置");
        profile.order = [];
        if (profile.sections) {
            for (const section of Object.values(profile.sections)) section.widgetIds = [];
        }
        nextLayout.order = [];
        await saveLayout(context, nextLayout, { expectedRevision: snapshot.layout.revision });

        // 写后验证：layout 组件顺序已清空、view 配置未被修改。
        const verified = await readSnapshot(context);
        if (!verified.view || !hasSameJsonSemantic(verified.view, snapshot.view)) {
            throw new Error("重置后 view 发生变化，请人工检查");
        }
        assertDesktopHomepageCoordinatedSnapshot(verified, context);
        const verifiedProfile = verified.layout.layout.profiles?.[context.scopeId];
        if (
            !verifiedProfile
            || verifiedProfile.order.length !== 0
            || Object.values(verifiedProfile.sections || {}).some((section) => section.widgetIds.length !== 0)
        ) {
            throw new Error("重置布局写后校验失败");
        }

        // 写后验证：组件配置文件未被删除、内容未变（其中保存的业务数据随之保留）。
        for (const widgetId of referencedWidgetIds) {
            const document = await readWidgetDocument(context, widgetId);
            const before = beforeDocuments.get(widgetId);
            if (
                !document
                || document.revision !== before.revision
                || !hasSameJsonSemantic(document.config, before.config)
            ) {
                throw new Error(`重置后组件 ${widgetId} 配置发生变化，请人工检查`);
            }
        }
    });
}

/**
 * 收集当前设备 profile 引用的全部组件 ID（全局 order + 各分栏 widgetIds），只用于重置前/后一致性校验。
 */
function collectReferencedWidgetIds(layout: WidgetLayoutData, deviceId: string): Set<string> {
    const ids = new Set<string>();
    const profile = layout?.profiles?.[deviceId];
    for (const item of normalizeLayoutItems(profile?.order || layout?.order)) {
        if (item.id) ids.add(item.id);
    }
    Object.values(profile?.sections || {}).forEach((section) => {
        for (const id of section?.widgetIds || []) {
            if (id) ids.add(id);
        }
    });
    return ids;
}
