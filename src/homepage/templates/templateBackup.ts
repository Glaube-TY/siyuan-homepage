import {
    readCoordinatedSnapshotForContext,
    runInSurfaceTransaction,
    saveLayoutDataForContext,
    validateLayoutViewSectionConsistency,
    type ComponentSectionsViewSnapshot,
    type CoordinatedSnapshot,
    type WidgetLayoutData,
} from "@/components/utils/widgetBlock/utils/layout-shared";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import { cloneJsonSafe, hasSameJsonSemantic, isPlainJsonObject } from "@/homepage/deviceView/jsonSafe";
import { writeDeviceViewBackup } from "@/homepage/deviceView/deviceViewStorage";
import { readWidgetInstanceDocument } from "@/homepage/deviceView/widgetInstanceRepository";
import { normalizeComponentSections, normalizeComponentSectionsNavAlign } from "@/homepage/homepageSetting/config";
import { collectBackupReferencedWidgetIds } from "./templateBackupScope";

export interface TemplateBackupEntry {
    id: string;
    createdAt: number;
    templateId?: string;
    templateName?: string;
    deviceId: string;
    reason: string;
    widgetLayoutSnapshot: WidgetLayoutData;
    createdWidgetIds?: string[];
    widgetConfigsSnapshot: Record<string, Record<string, unknown>>;
    widgetRevisions: Record<string, number>;
    viewSectionSnapshot: ComponentSectionsViewSnapshot;
}

export interface CreateTemplateBackupInput {
    templateId?: string;
    templateName?: string;
    deviceId?: string | null;
    reason: string;
    createdWidgetIds?: string[];
}

const TEMPLATE_BACKUP_PREFIX = "manual-template-";

function assertSameCoordinatedSnapshot(start: CoordinatedSnapshot, latest: CoordinatedSnapshot): void {
    if (!start.view || !latest.view) throw new Error("桌面主页协调快照缺少 view.json");
    if (
        start.layout.deviceId !== latest.layout.deviceId
        || start.layout.surface !== latest.layout.surface
        || start.layout.revision !== latest.layout.revision
        || !hasSameJsonSemantic(start.layout.layout, latest.layout.layout)
        || start.view.revision !== latest.view.revision
        || !hasSameJsonSemantic(start.view, latest.view)
    ) {
        throw new Error("创建备份期间 layout/view 已发生变化，停止备份");
    }
}

async function createTemplateBackupInTransaction(
    context: ReturnType<typeof getCurrentDeviceViewContext>,
    input: CreateTemplateBackupInput,
): Promise<TemplateBackupEntry> {
    if (input.deviceId && input.deviceId !== context.scopeId) throw new Error("备份请求 deviceId 与固定 context 不一致");
    const start = await readCoordinatedSnapshotForContext(context);
        if (!start.view) throw new Error("桌面主页协调快照缺少 view.json");
        const consistency = validateLayoutViewSectionConsistency(start.layout.layout, context.scopeId, start.view.config);
        if (!consistency.ok) throw new Error(`备份前 layout/view 校验失败：${(consistency as { ok: false; reason: string }).reason}`);
        const scope = collectBackupReferencedWidgetIds(start.layout.layout, context.scopeId);
        if (!scope.ok) throw new Error(`备份组件范围无效：${(scope as { ok: false; reason: string }).reason}`);

        const widgetConfigsSnapshot: Record<string, Record<string, unknown>> = {};
        const widgetRevisions: Record<string, number> = {};
        for (const widgetId of scope.ids) {
            const document = await readWidgetInstanceDocument(context, widgetId);
            if (!document) throw new Error(`备份引用的组件 ${widgetId} 配置缺失`);
            if (document.deviceId !== context.scopeId || document.surface !== context.surface || document.instanceId !== widgetId) {
                throw new Error(`组件 ${widgetId} 文档与固定 context 不一致`);
            }
            if (!Number.isInteger(document.revision) || document.revision <= 0 || !isPlainJsonObject(document.config)) {
                throw new Error(`组件 ${widgetId} 文档无效`);
            }
            widgetConfigsSnapshot[widgetId] = cloneJsonSafe(document.config, `组件 ${widgetId} 配置`);
            widgetRevisions[widgetId] = document.revision;
        }

        const latest = await readCoordinatedSnapshotForContext(context);
        assertSameCoordinatedSnapshot(start, latest);
        for (const widgetId of scope.ids) {
            const document = await readWidgetInstanceDocument(context, widgetId);
            if (
                !document
                || document.revision !== widgetRevisions[widgetId]
                || !hasSameJsonSemantic(document.config, widgetConfigsSnapshot[widgetId])
            ) throw new Error(`创建备份期间组件 ${widgetId} 已发生变化`);
        }

        const createdAt = Date.now();
        const randomId = globalThis.crypto?.randomUUID?.();
        if (!randomId) throw new Error("当前环境无法生成安全备份 ID");
        const backup = cloneJsonSafe<TemplateBackupEntry>({
            id: `${TEMPLATE_BACKUP_PREFIX}${createdAt}-${randomId}`,
            createdAt,
            ...(input.templateId ? { templateId: input.templateId } : {}),
            ...(input.templateName ? { templateName: input.templateName } : {}),
            deviceId: context.scopeId,
            reason: input.reason,
            widgetLayoutSnapshot: start.layout.layout,
            ...(input.createdWidgetIds ? { createdWidgetIds: input.createdWidgetIds } : {}),
            widgetConfigsSnapshot,
            widgetRevisions,
            viewSectionSnapshot: {
                componentSectionsEnabled: start.view.config.componentSectionsEnabled === true,
                componentSections: normalizeComponentSections(start.view.config.componentSections),
                componentSectionsNavAlign: normalizeComponentSectionsNavAlign(start.view.config.componentSectionsNavAlign),
                settingsRevision: start.view.revision,
            },
        }, "手动界面备份");
        await writeDeviceViewBackup(context, backup.id, backup as unknown as Record<string, unknown>);
    return backup;
}

export async function createTemplateBackup(plugin: any, input: CreateTemplateBackupInput): Promise<TemplateBackupEntry> {
    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    const queueKey = `${context.scopeId}:${context.surface}`;
    return runInSurfaceTransaction(queueKey, () => createTemplateBackupInTransaction(context, input));
}

export async function backupAndResetCurrentInterface(plugin: any): Promise<void> {
    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    const queueKey = `${context.scopeId}:${context.surface}`;
    await runInSurfaceTransaction(queueKey, async () => {
        await createTemplateBackupInTransaction(context, {
            deviceId: context.scopeId,
            reason: "manual-current-interface-backup",
        });
        const snapshot = await readCoordinatedSnapshotForContext(context);
        if (!snapshot.view) throw new Error("桌面主页协调快照缺少 view.json");
        const nextLayout = cloneJsonSafe(snapshot.layout.layout, "重置前布局");
        const profile = nextLayout.profiles?.[context.scopeId];
        if (!profile || !Array.isArray(profile.order)) throw new Error("当前设备 profile 缺失，拒绝重置");
        profile.order = [];
        if (profile.sections) {
            for (const section of Object.values(profile.sections)) section.widgetIds = [];
        }
        nextLayout.order = [];
        await saveLayoutDataForContext(context, nextLayout, { expectedRevision: snapshot.layout.revision });
        const verified = await readCoordinatedSnapshotForContext(context);
        if (!verified.view || !hasSameJsonSemantic(verified.view, snapshot.view)) throw new Error("重置后 view 发生变化，请人工检查");
        const verifiedProfile = verified.layout.layout.profiles?.[context.scopeId];
        if (
            !verifiedProfile
            || verifiedProfile.order.length !== 0
            || Object.values(verifiedProfile.sections || {}).some((section) => section.widgetIds.length !== 0)
        ) throw new Error("重置布局写后校验失败");
    });
}
