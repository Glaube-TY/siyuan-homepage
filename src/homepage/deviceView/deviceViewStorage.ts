import {
    copyFileChecked,
    getFileOrNullChecked,
    putFileChecked,
    readDirChecked,
    removeFileChecked,
} from "@/api";
import {
    getDeviceDescriptorPath,
    getSurfaceBackupPath,
    getSurfaceBackupsRoot,
    getSurfaceLayoutPath,
    getSurfaceManifestPath,
    getSurfaceViewPath,
    getWidgetPath,
    assertDeviceViewSegment,
    assertDeviceViewSurface,
} from "./deviceViewPaths";
import {
    DEVICE_VIEW_SCHEMA_VERSION,
    type DeviceDescriptor,
    type DeviceLayoutItem,
    type DeviceLayoutSection,
    type DeviceViewContext,
    type DeviceViewLayout,
    type DeviceViewManifest,
    type DeviceViewMetadata,
    type DeviceViewSettings,
    type DeviceWidgetDocument,
} from "./deviceViewTypes";
import { createDeviceViewBlockedError } from "./deviceViewErrors";
import { dispatchDeviceViewChanged } from "./deviceViewEvents";
import { cloneJsonSafe, hasSameJsonSemantic, isJsonSafe, isPlainJsonObject } from "./jsonSafe";

const writeQueues = new Map<string, Promise<void>>();

function assertStorageContext(context: DeviceViewContext): void {
    assertDeviceViewSegment(context.physicalDeviceId, "physicalDeviceId");
    assertDeviceViewSegment(context.scopeId, "scopeId");
    assertDeviceViewSurface(context.surface);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
    const allowedSet = new Set(allowed);
    const unknownKey = Object.keys(value).find((key) => !allowedSet.has(key));
    if (unknownKey) throw new Error(`${label} 包含未知字段 ${unknownKey}`);
}

async function decodeJson(raw: unknown, path: string): Promise<unknown> {
    let text: string;
    if (raw instanceof Blob) text = await raw.text();
    else if (typeof raw === "string") text = raw;
    else if (raw instanceof ArrayBuffer) text = new TextDecoder().decode(raw);
    else if (ArrayBuffer.isView(raw)) {
        const view = raw as ArrayBufferView;
        text = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    } else if (isPlainJsonObject(raw)) {
        return cloneJsonSafe(raw, `设备视图文件 ${path}`);
    } else {
        throw new Error(`设备视图文件 ${path} 返回了不支持的数据类型`);
    }
    if (!text.trim()) throw new Error(`设备视图文件 ${path} 为空`);
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`设备视图文件 ${path} JSON 损坏: ${String(error)}`);
    }
}

function validateMetadata(
    value: unknown,
    context: DeviceViewContext,
    path: string,
): asserts value is Record<string, unknown> & DeviceViewMetadata {
    if (!isPlainJsonObject(value)) {
        throw createDeviceViewBlockedError(
            context,
            "device_view_manifest_unreadable",
            `设备视图文件 ${path} 不是普通对象`,
        );
    }
    if (value.schema !== "siyuan-homepage-device-view") {
        throw createDeviceViewBlockedError(
            context,
            "device_view_schema_unrecognized",
            `设备视图文件 ${path} schema 无效（期望 siyuan-homepage-device-view，实际 ${String(value.schema)}）`,
        );
    }
    if (value.version !== DEVICE_VIEW_SCHEMA_VERSION) {
        throw createDeviceViewBlockedError(
            context,
            "device_view_version_mismatch",
            `设备视图文件 ${path} version 无效（期望 ${DEVICE_VIEW_SCHEMA_VERSION}，实际 ${String(value.version)}）`,
        );
    }
    if (!Number.isInteger(value.revision) || Number(value.revision) < 1) {
        throw new Error(`设备视图文件 ${path} revision 无效`);
    }
    if (typeof value.updatedAt !== "string" || !value.updatedAt) {
        throw new Error(`设备视图文件 ${path} updatedAt 无效`);
    }
    if (value.deviceId !== context.scopeId || value.surface !== context.surface) {
        throw new Error(`设备视图文件 ${path} 不属于当前 scope 或 surface`);
    }
}

function validateLayoutItem(value: unknown, index: number, path: string): DeviceLayoutItem {
    if (!isPlainJsonObject(value) || typeof value.id !== "string" || !value.id.trim()) {
        throw new Error(`设备布局 ${path} order[${index}] 无效`);
    }
    assertOnlyKeys(value, ["id", "style", "index"], `设备布局 ${path} order[${index}]`);
    assertDeviceViewSegment(value.id, `设备布局 ${path} order[${index}].id`);
    if (value.style !== null && typeof value.style !== "string") {
        throw new Error(`设备布局 ${path} order[${index}].style 无效`);
    }
    if (!Number.isInteger(value.index) || value.index !== index) {
        throw new Error(`设备布局 ${path} order[${index}].index 不连续`);
    }
    return { id: value.id, style: value.style as string | null, index };
}

function validateLayoutItems(value: unknown, path: string): DeviceLayoutItem[] {
    if (!Array.isArray(value)) throw new Error(`设备布局 ${path} order 不是数组`);
    const seen = new Set<string>();
    const result: DeviceLayoutItem[] = [];
    for (let i = 0; i < value.length; i++) {
        const item = validateLayoutItem(value[i], i, path);
        if (seen.has(item.id)) throw new Error(`设备布局 ${path} order 包含重复组件 ${item.id}`);
        seen.add(item.id);
        result.push(item);
    }
    return result;
}

function validateSectionWidgetIds(value: unknown, sectionId: string, path: string): string[] {
    if (!Array.isArray(value)) throw new Error(`设备布局 ${path} sections.${sectionId}.widgetIds 不是数组`);
    const seen = new Set<string>();
    return value.map((id, index) => {
        if (typeof id !== "string" || !id.trim()) throw new Error(`设备布局 ${path} sections.${sectionId}.widgetIds[${index}] 无效`);
        assertDeviceViewSegment(id, `设备布局 ${path} sections.${sectionId}.widgetIds[${index}]`);
        if (seen.has(id)) throw new Error(`设备布局 ${path} 分栏 ${sectionId} 包含重复组件 ${id}`);
        seen.add(id);
        return id;
    });
}

function validateDeviceLayoutSection(value: unknown, sectionId: string, path: string): DeviceLayoutSection {
    if (!isPlainJsonObject(value)) throw new Error(`设备布局 ${path} sections.${sectionId} 不是普通对象`);
    assertOnlyKeys(value, ["widgetIds", "widgetLayoutNumber", "widgetGap"], `设备布局 ${path} sections.${sectionId}`);
    const widgetIds = validateSectionWidgetIds(value.widgetIds, sectionId, path);
    const widgetLayoutNumber = value.widgetLayoutNumber;
    const widgetGap = value.widgetGap;
    if (widgetLayoutNumber !== undefined && (typeof widgetLayoutNumber !== "number" || !Number.isInteger(widgetLayoutNumber) || widgetLayoutNumber <= 0)) {
        throw new Error(`设备布局 ${path} sections.${sectionId}.widgetLayoutNumber 无效`);
    }
    if (widgetGap !== undefined && (typeof widgetGap !== "number" || !Number.isFinite(widgetGap) || widgetGap < 0)) {
        throw new Error(`设备布局 ${path} sections.${sectionId}.widgetGap 无效`);
    }
    const section: DeviceLayoutSection = { widgetIds };
    if (typeof widgetLayoutNumber === "number") section.widgetLayoutNumber = widgetLayoutNumber;
    if (typeof widgetGap === "number") section.widgetGap = widgetGap;
    return section;
}

function validateLayout(value: unknown, context: DeviceViewContext, path: string): DeviceViewLayout {
    validateMetadata(value, context, path);
    assertOnlyKeys(value, [
        "schema", "version", "revision", "updatedAt", "deviceId", "surface", "order",
        "widgetLayoutNumber", "widgetGap", "activeSectionId", "sections", "componentSectionsModeEnabled",
    ], `设备布局 ${path}`);
    if (!Array.isArray(value.order)) throw new Error(`设备布局 ${path} 缺少 order 字段`);
    const order = validateLayoutItems(value.order, path);
    const meta = value as DeviceViewMetadata;
    const layout: DeviceViewLayout = {
        schema: meta.schema,
        version: meta.version,
        revision: meta.revision,
        updatedAt: meta.updatedAt,
        deviceId: meta.deviceId,
        surface: meta.surface,
        order,
    };
    if (value.widgetLayoutNumber !== undefined) {
        if (typeof value.widgetLayoutNumber !== "number" || !Number.isInteger(value.widgetLayoutNumber) || value.widgetLayoutNumber <= 0) throw new Error(`设备布局 ${path} widgetLayoutNumber 无效`);
        layout.widgetLayoutNumber = value.widgetLayoutNumber;
    }
    if (value.widgetGap !== undefined) {
        if (typeof value.widgetGap !== "number" || !Number.isFinite(value.widgetGap) || value.widgetGap < 0) throw new Error(`设备布局 ${path} widgetGap 无效`);
        layout.widgetGap = value.widgetGap;
    }
    if (value.activeSectionId !== undefined) {
        if (typeof value.activeSectionId !== "string") throw new Error(`设备布局 ${path} activeSectionId 类型无效`);
        assertDeviceViewSegment(value.activeSectionId, `设备布局 ${path} activeSectionId`);
        layout.activeSectionId = value.activeSectionId;
    }
    if (value.componentSectionsModeEnabled !== undefined) {
        if (typeof value.componentSectionsModeEnabled !== "boolean") throw new Error(`设备布局 ${path} componentSectionsModeEnabled 类型无效`);
        layout.componentSectionsModeEnabled = value.componentSectionsModeEnabled;
    }
    if (value.sections !== undefined) {
        if (!isPlainJsonObject(value.sections)) throw new Error(`设备布局 ${path} sections 类型无效`);
        const sections: Record<string, DeviceLayoutSection> = {};
        const assignedWidgets = new Set<string>();
        const orderIds = new Set(order.map((item) => item.id));
        for (const [sectionId, rawSection] of Object.entries(value.sections as Record<string, unknown>)) {
            assertDeviceViewSegment(sectionId, `设备布局 ${path} sectionId`);
            const section = validateDeviceLayoutSection(rawSection, sectionId, path);
            for (const widgetId of section.widgetIds) {
                if (!orderIds.has(widgetId)) throw new Error(`设备布局 ${path} 分栏 ${sectionId} 引用了 order 外组件 ${widgetId}`);
                if (assignedWidgets.has(widgetId)) throw new Error(`设备布局 ${path} 组件 ${widgetId} 重复属于多个分栏`);
                assignedWidgets.add(widgetId);
            }
            sections[sectionId] = section;
        }
        if (layout.activeSectionId !== undefined && !sections[layout.activeSectionId]) {
            throw new Error(`设备布局 ${path} activeSectionId 不属于现有分栏`);
        }
        layout.sections = sections;
    }
    if (!isJsonSafe(layout)) throw new Error(`设备布局 ${path} 不是 JSON-safe 数据`);
    return layout;
}

function validateSettings(value: unknown, context: DeviceViewContext, path: string): DeviceViewSettings {
    validateMetadata(value, context, path);
    if (!isPlainJsonObject(value.config) || !isJsonSafe(value.config)) throw new Error(`设备视图配置 ${path} 无效`);
    return cloneJsonSafe(value as unknown as DeviceViewSettings, `设备视图配置 ${path}`);
}

function validateManifest(value: unknown, context: DeviceViewContext, path: string): DeviceViewManifest {
    validateMetadata(value, context, path);
    if (
        value.status !== "complete"
        ||
        !isPlainJsonObject(value.migration)
        || value.migration.state !== "complete"
        || (value.migration.source !== "legacy-root" && value.migration.source !== "fresh" && value.migration.source !== "recovered-target")
        || typeof value.migration.completedAt !== "string"
    ) throw new Error(`设备视图清单 ${path} 未完成`);
    return value as unknown as DeviceViewManifest;
}

function validateWidget(value: unknown, context: DeviceViewContext, instanceId: string, path: string): DeviceWidgetDocument {
    validateMetadata(value, context, path);
    if (value.instanceId !== instanceId) throw new Error(`组件文件 ${path} instanceId 不匹配`);
    if (!isPlainJsonObject(value.config) || typeof value.config.type !== "string" || !value.config.type.trim() || !isJsonSafe(value.config)) {
        throw new Error(`组件文件 ${path} 配置无效`);
    }
    return value as unknown as DeviceWidgetDocument;
}

function validateDeviceDescriptor(value: unknown, context: DeviceViewContext, path: string): DeviceDescriptor {
    if (!isPlainJsonObject(value)) throw new Error(`设备描述文件 ${path} 不是普通对象`);
    if (value.schema !== "siyuan-homepage-device" || value.version !== DEVICE_VIEW_SCHEMA_VERSION) throw new Error(`设备描述文件 ${path} schema/version 无效`);
    if (!Number.isInteger(value.revision) || Number(value.revision) < 1) throw new Error(`设备描述文件 ${path} revision 无效`);
    const descriptorId = typeof value.physicalDeviceId === "string"
        ? value.physicalDeviceId
        : value.deviceId;
    if (typeof value.updatedAt !== "string" || !value.updatedAt || descriptorId !== context.physicalDeviceId) {
        throw new Error(`设备描述文件 ${path} 身份无效`);
    }
    if (
        typeof value.deviceName !== "string"
        || typeof value.platform !== "string"
        || typeof value.arch !== "string"
        || typeof value.hostname !== "string"
        || typeof value.isMobile !== "boolean"
    ) throw new Error(`设备描述文件 ${path} 设备信息无效`);
    return {
        ...(value as unknown as DeviceDescriptor),
        physicalDeviceId: descriptorId as string,
    };
}

async function readDocument<T>(path: string, validate: (value: unknown) => T): Promise<T | null> {
    const raw = await getFileOrNullChecked(path);
    if (raw === null) return null;
    return validate(await decodeJson(raw, path));
}

function metadata(context: DeviceViewContext, revision: number): DeviceViewMetadata {
    return {
        schema: "siyuan-homepage-device-view",
        version: DEVICE_VIEW_SCHEMA_VERSION,
        revision,
        updatedAt: new Date().toISOString(),
        deviceId: context.scopeId,
        surface: context.surface,
    };
}

function withoutMetadata(value: DeviceViewMetadata): Record<string, unknown> {
    const record = value as unknown as Record<string, unknown>;
    const { schema: _schema, version: _version, revision: _revision, updatedAt: _updatedAt, deviceId: _deviceId, surface: _surface, ...content } = record;
    return content;
}

/**
 * 将对象递归转换为键名稳定的可比较形式：
 * - 普通对象按 key 排序；
 * - 数组保留原顺序；
 * - 基本值直接返回。
 *
 * 用于写后语义校验，避免 JSON 字段顺序不同导致误判。
 */
function hasSameDocumentContent(
    left: DeviceViewMetadata,
    right: DeviceViewMetadata,
): boolean {
    return hasSameJsonSemantic(withoutMetadata(left), withoutMetadata(right));
}

export async function writeJson(path: string, value: unknown): Promise<void> {
    const body = JSON.stringify(cloneJsonSafe(value, `设备视图文件 ${path}`), null, 2);
    if (!body) throw new Error(`无法序列化设备视图文件 ${path}`);
    await putFileChecked(path, false, new Blob([body], { type: "application/json;charset=utf-8" }));
}

async function inWriteQueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = writeQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => current);
    writeQueues.set(key, queued);
    await previous.catch(() => undefined);
    try {
        return await task();
    } finally {
        release();
        if (writeQueues.get(key) === queued) writeQueues.delete(key);
    }
}

export function createEmptyLayout(context: DeviceViewContext): DeviceViewLayout {
    return { ...metadata(context, 1), order: [] };
}

export function createEmptySettings(context: DeviceViewContext): DeviceViewSettings {
    return { ...metadata(context, 1), config: {} };
}

export async function readDeviceViewLayout(context: DeviceViewContext): Promise<DeviceViewLayout | null> {
    assertStorageContext(context);
    const path = getSurfaceLayoutPath(context);
    return readDocument(path, (value) => validateLayout(value, context, path));
}

export async function readDeviceViewSettings(context: DeviceViewContext): Promise<DeviceViewSettings | null> {
    assertStorageContext(context);
    const path = getSurfaceViewPath(context);
    return readDocument(path, (value) => validateSettings(value, context, path));
}

export async function readDeviceViewManifest(context: DeviceViewContext): Promise<DeviceViewManifest | null> {
    assertStorageContext(context);
    const path = getSurfaceManifestPath(context);
    return readDocument(path, (value) => validateManifest(value, context, path));
}

export async function readDeviceWidget(context: DeviceViewContext, instanceId: string): Promise<DeviceWidgetDocument | null> {
    assertStorageContext(context);
    const path = getWidgetPath(context, instanceId);
    return readDocument(path, (value) => validateWidget(value, context, instanceId, path));
}

export async function readDeviceDescriptor(context: DeviceViewContext): Promise<DeviceDescriptor | null> {
    assertStorageContext(context);
    const path = getDeviceDescriptorPath(context);
    return readDocument(path, (value) => validateDeviceDescriptor(value, context, path));
}


function normalizeLayoutForWrite(layout: DeviceViewLayout): DeviceViewLayout {
    // 防御性收口：仅保留运行期最终字段，避免外部 mutate 函数意外写入其他键。
    const sections = layout.sections
        ? Object.fromEntries(
            Object.entries(layout.sections).map(([sectionId, section]) => [
                sectionId,
                {
                    widgetIds: [...section.widgetIds],
                    ...(section.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: section.widgetLayoutNumber } : {}),
                    ...(section.widgetGap !== undefined ? { widgetGap: section.widgetGap } : {}),
                } satisfies DeviceLayoutSection,
            ]),
        )
        : undefined;
    const result: DeviceViewLayout = {
        schema: layout.schema,
        version: layout.version,
        revision: layout.revision,
        updatedAt: layout.updatedAt,
        deviceId: layout.deviceId,
        surface: layout.surface,
        order: layout.order.map((item) => ({ id: item.id, style: item.style, index: item.index })),
        ...(layout.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: layout.widgetLayoutNumber } : {}),
        ...(layout.widgetGap !== undefined ? { widgetGap: layout.widgetGap } : {}),
        ...(layout.activeSectionId !== undefined ? { activeSectionId: layout.activeSectionId } : {}),
        ...(layout.componentSectionsModeEnabled !== undefined ? { componentSectionsModeEnabled: layout.componentSectionsModeEnabled } : {}),
        ...(sections ? { sections } : {}),
    };
    return cloneJsonSafe(result, "设备布局写入数据");
}

export async function updateDeviceViewLayout(
    context: DeviceViewContext,
    mutate: (layout: DeviceViewLayout) => DeviceViewLayout,
    options: { expectedRevision?: number } = {},
): Promise<DeviceViewLayout> {
    assertStorageContext(context);
    const path = getSurfaceLayoutPath(context);
    return inWriteQueue(path, async () => {
        const latest = await readDeviceViewLayout(context);
        if (!latest) throw new Error(`设备布局 ${path} 缺失，拒绝以运行期状态重新创建`);
        if (options.expectedRevision !== undefined && latest.revision !== options.expectedRevision) {
            throw new Error(`设备布局 ${path} 已被并发更新，拒绝覆盖最新 revision`);
        }
        const mutated = mutate(cloneJsonSafe(latest, "设备布局 mutator 输入"));
        validateLayout(mutated, context, path);

        // 布局内容未变化时不增加 revision、不写盘、不派发事件。
        if (hasSameDocumentContent(latest, mutated)) {
            return latest;
        }

        const document: DeviceViewLayout = { ...normalizeLayoutForWrite(mutated), ...metadata(context, latest.revision + 1) };
        const normalized = validateLayout(document, context, path);
        await writeJson(path, normalized);
        const verified = await readDeviceViewLayout(context);
        if (!verified || verified.revision !== normalized.revision || !hasSameDocumentContent(verified, normalized)) {
            throw new Error(`设备布局 ${path} 写入后校验失败`);
        }
        dispatchDeviceViewChanged(context, "layout");
        return verified;
    });
}

export async function replaceDeviceViewLayout(
    context: DeviceViewContext,
    next: Omit<DeviceViewLayout, keyof DeviceViewMetadata>,
    options: { expectedRevision?: number } = {},
): Promise<DeviceViewLayout> {
    return updateDeviceViewLayout(
        context,
        (latest) => ({ ...cloneJsonSafe(latest), ...cloneJsonSafe(next) }),
        { expectedRevision: options.expectedRevision },
    );
}

export async function updateDeviceViewSettings(
    context: DeviceViewContext,
    mutate: (config: Record<string, unknown>) => Record<string, unknown>,
    options: { expectedRevision?: number } = {},
): Promise<DeviceViewSettings> {
    assertStorageContext(context);
    const path = getSurfaceViewPath(context);
    return inWriteQueue(path, async () => {
        const latest = await readDeviceViewSettings(context);
        if (!latest) throw new Error(`设备视图配置 ${path} 缺失，拒绝以局部配置重新创建`);
        if (options.expectedRevision !== undefined && latest.revision !== options.expectedRevision) {
            throw new Error(`设备视图配置 ${path} 已被并发更新，拒绝覆盖最新 revision`);
        }
        const config = mutate(cloneJsonSafe(latest.config, "设备视图配置 mutator 输入"));
        if (!isPlainJsonObject(config) || !isJsonSafe(config)) throw new Error("设备视图配置更新结果无效");
        const safeConfig = cloneJsonSafe(config, "设备视图配置更新结果");
        const unchangedCandidate: DeviceViewSettings = { ...latest, config: safeConfig };
        if (hasSameDocumentContent(latest, unchangedCandidate)) return latest;
        const document: DeviceViewSettings = { ...metadata(context, latest.revision + 1), config: safeConfig };
        await writeJson(path, document);
        const verified = await readDeviceViewSettings(context);
        if (!verified || verified.revision !== document.revision || !hasSameDocumentContent(verified, document)) {
            throw new Error(`设备视图配置 ${path} 写入后校验失败`);
        }
        dispatchDeviceViewChanged(context, "settings");
        return verified;
    });
}

export async function writeDeviceWidget(
    context: DeviceViewContext,
    instanceId: string,
    config: Record<string, unknown>,
    options: { mode?: "update" | "create" | "upsert"; expectedRevision?: number } = {},
): Promise<DeviceWidgetDocument> {
    assertStorageContext(context);
    const path = getWidgetPath(context, instanceId);
    return inWriteQueue(path, async () => {
        if (!isPlainJsonObject(config) || typeof config.type !== "string" || !config.type.trim() || !isJsonSafe(config)) {
            throw new Error(`拒绝写入无效组件配置: ${instanceId}`);
        }
        const latest = await readDeviceWidget(context, instanceId);
        const mode = options.mode ?? "update";
        if (!latest && mode === "update") {
            throw new Error(`组件 ${instanceId} 配置缺失，拒绝以运行期状态重新创建`);
        }
        if (latest && mode === "create") throw new Error(`组件 ${instanceId} 已存在，拒绝覆盖新建`);

        // expectedRevision 用于组件协调写入的并发控制：
        // - 0 表示期望组件文档不存在；
        // - >0 表示期望当前 revision 与之相等。
        if (options.expectedRevision !== undefined) {
            if (latest) {
                if (latest.revision !== options.expectedRevision) {
                    throw new Error(`组件 ${instanceId} 已被并发修改，期望 revision ${options.expectedRevision}，实际 ${latest.revision}`);
                }
            } else if (options.expectedRevision !== 0) {
                throw new Error(`组件 ${instanceId} 不存在，期望 revision ${options.expectedRevision} 与实际 0 不一致`);
            }
        }

        const safeConfig = cloneJsonSafe(config, `组件 ${instanceId} 配置`);
        if (latest && hasSameJsonSemantic(latest.config, safeConfig)) return latest;

        const document: DeviceWidgetDocument = {
            ...metadata(context, (latest?.revision ?? 0) + 1),
            instanceId,
            config: safeConfig,
        };
        await writeJson(path, document);
        const verified = await readDeviceWidget(context, instanceId);
        if (!verified || verified.revision !== document.revision || !hasSameDocumentContent(verified, document)) {
            throw new Error(`组件 ${instanceId} 写入后校验失败`);
        }
        dispatchDeviceViewChanged(context, "widget");
        return verified;
    });
}

export async function removeDeviceWidget(
    context: DeviceViewContext,
    instanceId: string,
    options: { expectedRevision?: number } = {},
): Promise<void> {
    assertStorageContext(context);
    const path = getWidgetPath(context, instanceId);
    await inWriteQueue(path, async () => {
        const latest = await readDeviceWidget(context, instanceId);
        if (!latest) {
            // expectedRevision=0 表示期望不存在，幂等删除成功；未提供时按原语义静默返回。
            if (options.expectedRevision !== undefined && options.expectedRevision !== 0) {
                throw new Error(`组件 ${instanceId} 不存在，期望 revision ${options.expectedRevision} 与实际 0 不一致`);
            }
            return;
        }

        if (options.expectedRevision !== undefined && latest.revision !== options.expectedRevision) {
            throw new Error(`组件 ${instanceId} 已被并发修改，期望 revision ${options.expectedRevision}，实际 ${latest.revision}`);
        }

        await removeFileChecked(path);
        if (await readDeviceWidget(context, instanceId)) throw new Error(`组件 ${instanceId} 删除后校验失败`);
        dispatchDeviceViewChanged(context, "widget");
    });
}

export async function writeInitialDeviceViewFiles(
    context: DeviceViewContext,
    input: {
        layout: DeviceViewLayout;
        settings?: DeviceViewSettings;
        widgets: DeviceWidgetDocument[];
        unresolvedLegacyWidgetIds?: string[];
        source: "legacy-root" | "fresh" | "recovered-target";
        manifest?: DeviceViewManifest;
    },
): Promise<void> {
    assertStorageContext(context);
    const normalizedLayout = validateLayout(input.layout, context, getSurfaceLayoutPath(context));
    const normalizedSettings = input.settings
        ? validateSettings(input.settings, context, getSurfaceViewPath(context))
        : undefined;
    const normalizedWidgets = input.widgets.map((widget) =>
        validateWidget(widget, context, widget.instanceId, getWidgetPath(context, widget.instanceId))
    );
    const widgetIds = new Set<string>();
    for (const widget of normalizedWidgets) {
        if (widgetIds.has(widget.instanceId)) throw new Error(`迁移组件 ID 重复：${widget.instanceId}`);
        widgetIds.add(widget.instanceId);
    }
    const manifestPath = getSurfaceManifestPath(context);
    await inWriteQueue(manifestPath, async () => {
        if (await readDeviceViewManifest(context)) return;
        const existingLayout = await readDeviceViewLayout(context);
        if (existingLayout) {
            if (!hasSameDocumentContent(existingLayout, normalizedLayout)) throw new Error("迁移目标 layout.json 已存在冲突内容");
        } else {
            await writeJson(getSurfaceLayoutPath(context), normalizedLayout);
        }
        if (normalizedSettings) {
            const existingSettings = await readDeviceViewSettings(context);
            if (existingSettings) {
                if (!hasSameDocumentContent(existingSettings, normalizedSettings)) throw new Error("迁移目标 view.json 已存在冲突内容");
            } else {
                await writeJson(getSurfaceViewPath(context), normalizedSettings);
            }
        }
        for (const widget of normalizedWidgets) {
            const existingWidget = await readDeviceWidget(context, widget.instanceId);
            if (existingWidget) {
                if (!hasSameDocumentContent(existingWidget, widget)) throw new Error(`迁移目标组件 ${widget.instanceId} 已存在冲突内容`);
            } else {
                await writeJson(getWidgetPath(context, widget.instanceId), widget);
            }
        }
        const verifiedLayout = await readDeviceViewLayout(context);
        if (!verifiedLayout || !hasSameDocumentContent(verifiedLayout, normalizedLayout)) throw new Error("迁移布局写入校验失败");
        if (normalizedSettings) {
            const verifiedSettings = await readDeviceViewSettings(context);
            if (!verifiedSettings || !hasSameDocumentContent(verifiedSettings, normalizedSettings)) throw new Error("迁移视图配置写入校验失败");
        }
        for (const widget of normalizedWidgets) {
            const verifiedWidget = await readDeviceWidget(context, widget.instanceId);
            if (!verifiedWidget || !hasSameDocumentContent(verifiedWidget, widget)) throw new Error(`迁移组件 ${widget.instanceId} 写入校验失败`);
        }
        const manifest: DeviceViewManifest = input.manifest
            ? validateManifest(
                { ...cloneJsonSafe(input.manifest, "别名迁移 manifest"), deviceId: context.scopeId, surface: context.surface },
                context,
                manifestPath,
            )
            : {
                ...metadata(context, 1),
                status: "complete",
                migration: {
                    state: "complete",
                    source: input.source,
                    completedAt: new Date().toISOString(),
                    ...(input.unresolvedLegacyWidgetIds?.length
                        ? { unresolvedLegacyWidgetIds: [...input.unresolvedLegacyWidgetIds] }
                        : {}),
                },
            };
        await writeJson(manifestPath, manifest);
        const verifiedManifest = await readDeviceViewManifest(context);
        if (!verifiedManifest || !hasSameJsonSemantic(verifiedManifest, manifest)) throw new Error("迁移清单写入校验失败");
        dispatchDeviceViewChanged(context, "migration");
    });
}

export async function writeDeviceDescriptor(context: DeviceViewContext, descriptor: DeviceDescriptor): Promise<void> {
    assertStorageContext(context);
    const path = getDeviceDescriptorPath(context);
    await inWriteQueue(path, async () => {
        const existingRaw = await getFileOrNullChecked(path);
        let revision = 1;
        if (existingRaw !== null) {
            const existingValue = await decodeJson(existingRaw, path);
            const existing = validateDeviceDescriptor(existingValue, context, path);
            const unchanged = ["deviceName", "platform", "arch", "hostname", "isMobile"]
                .every((key) => existing[key] === (descriptor as unknown as Record<string, unknown>)[key]);
            const usesCanonicalIdentityField = isPlainJsonObject(existingValue)
                && existingValue.physicalDeviceId === context.physicalDeviceId
                && !("deviceId" in existingValue);
            if (unchanged && usesCanonicalIdentityField) return;
            revision = Number(existing.revision) + 1;
        }
        const next = { ...descriptor, revision, updatedAt: new Date().toISOString() };
        validateDeviceDescriptor(next, context, path);
        await writeJson(path, next);
        const verifiedRaw = await getFileOrNullChecked(path);
        if (verifiedRaw === null) throw new Error("设备描述文件写入后缺失");
        const verified = validateDeviceDescriptor(await decodeJson(verifiedRaw, path), context, path);
        if (JSON.stringify(verified) !== JSON.stringify(next)) {
            throw new Error("设备描述文件写入后校验失败");
        }
    });
}

export async function backupCurrentLayout(context: DeviceViewContext, reason: string): Promise<string | null> {
    assertStorageContext(context);
    const layout = await readDeviceViewLayout(context);
    if (!layout) return null;
    const compactTime = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = getSurfaceBackupPath(context, `${compactTime}-${reason}-layout`);
    await copyFileChecked({ path: getSurfaceLayoutPath(context), targetPath: backupPath });
    const copied = await getFileOrNullChecked(backupPath);
    if (copied === null) throw new Error("设备布局备份校验失败");
    const verifiedBackup = validateLayout(await decodeJson(copied, backupPath), context, backupPath);
    if (JSON.stringify(verifiedBackup) !== JSON.stringify(layout)) {
        throw new Error("设备布局备份内容与源文件不一致");
    }
    return backupPath;
}

export async function writeDeviceViewBackup(
    context: DeviceViewContext,
    label: string,
    payload: Record<string, unknown>,
): Promise<string> {
    assertStorageContext(context);
    if (!isPlainJsonObject(payload) || !isJsonSafe(payload)) throw new Error("设备视图备份内容无效");
    const path = getSurfaceBackupPath(context, label);
    await inWriteQueue(path, async () => {
        const existingRaw = await getFileOrNullChecked(path);
        let revision = 1;
        if (existingRaw !== null) {
            const existing = await decodeJson(existingRaw, path);
            validateMetadata(existing, context, path);
            revision = existing.revision + 1;
        }
        const document = { ...cloneJsonSafe(payload, "设备视图备份内容"), ...metadata(context, revision) };
        await writeJson(path, document);
        const raw = await getFileOrNullChecked(path);
        if (raw === null) throw new Error("设备视图备份写入校验失败");
        const verified = await decodeJson(raw, path);
        validateMetadata(verified, context, path);
        if (verified.revision !== revision || !hasSameJsonSemantic(verified, document)) throw new Error("设备视图备份写后语义校验失败");
    });
    return path;
}

export async function readDeviceViewBackups(
    context: DeviceViewContext,
    namePrefix = "",
): Promise<Array<{ path: string; data: Record<string, unknown> }>> {
    assertStorageContext(context);
    let entries;
    try {
        entries = await readDirChecked(getSurfaceBackupsRoot(context));
    } catch (error) {
        if (String(error).includes("code=404")) return [];
        throw error;
    }
    const names = entries
        .filter((entry) => entry?.isDir !== true && String(entry.name).endsWith(".json") && String(entry.name).startsWith(namePrefix))
        .map((entry) => String(entry.name))
        .sort();
    const result: Array<{ path: string; data: Record<string, unknown> }> = [];
    for (const name of names) {
        const path = `${getSurfaceBackupsRoot(context)}/${name}`;
        const raw = await getFileOrNullChecked(path);
        if (raw === null) throw new Error(`设备视图备份目录列出了文件但读取缺失：${path}`);
        const data = await decodeJson(raw, path);
        validateMetadata(data, context, path);
        result.push({ path, data });
    }
    return result;
}
