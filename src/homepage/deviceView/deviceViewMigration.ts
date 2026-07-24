import { showMessage } from "siyuan";
import { getFileOrNullChecked, readDirOrNullChecked } from "@/api";
import { getCurrentDeviceInfo } from "@/homepage/utils/deviceProfile";
import {
    assertDeviceViewSegment,
    getPluginStorageRoot,
    getSurfaceLayoutPath,
    getSurfaceManifestPath,
    getSurfaceViewPath,
    getSurfaceWidgetsRoot,
    getWidgetPath,
} from "./deviceViewPaths";
import {
    createEmptySettings,
    readDeviceViewLayout,
    readDeviceViewManifest,
    readDeviceViewSettings,
    readDeviceWidget,
    writeDeviceDescriptor,
    writeInitialDeviceViewFiles,
    writeJson,
} from "./deviceViewStorage";
import {
    DEVICE_VIEW_SCHEMA_VERSION,
    type DeviceViewContext,
    type DeviceViewLayout,
    type DeviceViewManifest,
    type DeviceViewSettings,
    type DeviceViewSurface,
    type DeviceWidgetDocument,
} from "./deviceViewTypes";
import {
    createDeviceViewBlockedError,
    DeviceViewMigrationBlockedError,
    DeviceViewTemporarilyIncompleteError,
    recordDeviceViewBlockedState,
} from "./deviceViewErrors";
import {
    buildSectionSettingsConfig,
    getDesktopLayout,
    getSimpleLayout,
    isPlainObject,
    resolveLegacyProfile,
    type ResolvedLegacyProfile,
} from "./deviceViewLegacyLayout";
import { hasSameJsonSemantic, cloneJsonSafe, isJsonSafe } from "./jsonSafe";

const LEGACY_LAYOUT_NAMES: Record<DeviceViewSurface, string> = {
    "desktop-homepage": "widgetLayout.json",
    "desktop-sidebar": "sidebarWidgetLayout.json",
    "mobile-homepage": "mobileHomepageWidgetLayout.json",
};
const LEGACY_SETTINGS_NAME = "homepageSettingConfig.json";
const migrationTasks = new Map<string, Promise<void>>();
const readyMigrationKeys = new Set<string>();
const verifiedCompletedMigrationKeys = new Set<string>();
const incompleteMigrationWarningKeys = new Set<string>();

interface IncompleteMigrationCheck {
    lastCheck: number;
    nextCheck: number;
    missingCount: number;
    unreadableCount: number;
}
const INCOMPLETE_MIGRATION_CHECK_COOLDOWN_MS = 1000;
const INCOMPLETE_RETRY_COOLDOWN_MS = 3000;
const manifestMissingLoggedKeys = new Set<string>();
const incompleteMigrationChecks = new Map<string, IncompleteMigrationCheck>();

type ManifestlessTargetState =
    | { status: "empty" }
    | {
        status: "complete";
        layout: DeviceViewLayout;
        settings: DeviceViewSettings | null;
        widgets: DeviceWidgetDocument[];
        unresolvedLegacyWidgetIds: string[];
        semantic: Record<string, unknown>;
    }
    | { status: "incomplete"; reason: string };

async function readManifestlessTargetOnce(context: DeviceViewContext): Promise<ManifestlessTargetState> {
    const layoutRaw = await getFileOrNullChecked(getSurfaceLayoutPath(context));
    const viewRaw = context.surface === "desktop-sidebar"
        ? null
        : await getFileOrNullChecked(getSurfaceViewPath(context));
    const widgetEntries = await readDirOrNullChecked(getSurfaceWidgetsRoot(context));
    if (layoutRaw === null) {
        if (viewRaw === null && widgetEntries === null) return { status: "empty" };
        return { status: "incomplete", reason: "layout.json 缺失，但目标 scope 已存在其他文件" };
    }

    const layout = await readDeviceViewLayout(context);
    if (!layout) return { status: "incomplete", reason: "layout.json 在探测后消失" };
    const settings = context.surface === "desktop-sidebar"
        ? null
        : await readDeviceViewSettings(context);
    if (context.surface !== "desktop-sidebar" && !settings) {
        return { status: "incomplete", reason: "view.json 缺失" };
    }

    const referencedIds = collectDeviceLayoutReferenceIds(layout);
    const widgets: DeviceWidgetDocument[] = [];
    const unresolvedLegacyWidgetIds: string[] = [];
    for (const instanceId of referencedIds) {
        const widget = await readDeviceWidget(context, instanceId);
        if (widget) widgets.push(widget);
        else unresolvedLegacyWidgetIds.push(instanceId);
    }

    const existingWidgetFiles = (widgetEntries ?? [])
        .filter((entry) => !entry.isDir && entry.name.endsWith(".json"))
        .map((entry) => entry.name.slice(0, -5))
        .sort();
    const orphanWidgetFiles = existingWidgetFiles.filter((instanceId) => !referencedIds.has(instanceId));
    if (orphanWidgetFiles.length > 0) {
        return {
            status: "incomplete",
            reason: `widgets 目录存在布局外组件：${orphanWidgetFiles.slice(0, 5).join(", ")}`,
        };
    }

    try {
        validateMigratedLayoutSections(
            layout,
            settings ?? undefined,
            widgets,
            new Set(unresolvedLegacyWidgetIds),
        );
    } catch (error) {
        return { status: "incomplete", reason: String(error) };
    }

    const semantic: Record<string, unknown> = {
        layout,
        settings,
        widgets: [...widgets].sort((left, right) => left.instanceId.localeCompare(right.instanceId)),
        unresolvedLegacyWidgetIds: [...unresolvedLegacyWidgetIds].sort(),
        widgetEntries: existingWidgetFiles,
    };
    return {
        status: "complete",
        layout,
        settings,
        widgets,
        unresolvedLegacyWidgetIds,
        semantic,
    };
}

async function analyzeManifestlessDeviceViewTarget(context: DeviceViewContext): Promise<ManifestlessTargetState> {
    const first = await readManifestlessTargetOnce(context);
    if (first.status !== "complete") return first;
    const second = await readManifestlessTargetOnce(context);
    if (second.status !== "complete" || !hasSameJsonSemantic(first.semantic, second.semantic)) {
        return { status: "incomplete", reason: "目标文件连续两次读取不稳定" };
    }
    return second;
}

interface RawMobileSharedTarget {
    layout: Record<string, unknown>;
    settings: Record<string, unknown>;
    widgets: Array<{ path: string; document: Record<string, unknown> }>;
    manifest: Record<string, unknown>;
}

async function readRawMobileSharedTarget(context: DeviceViewContext): Promise<RawMobileSharedTarget | null> {
    const manifestRaw = await getFileOrNullChecked(getSurfaceManifestPath(context));
    if (manifestRaw === null) return null;
    const layoutRaw = await getFileOrNullChecked(getSurfaceLayoutPath(context));
    const settingsRaw = await getFileOrNullChecked(getSurfaceViewPath(context));
    if (layoutRaw === null || settingsRaw === null) {
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: layoutRaw === null ? "layout" : "view",
        });
    }
    const entries = await readDirOrNullChecked(getSurfaceWidgetsRoot(context));
    const decodeDocument = async (raw: unknown, label: string): Promise<Record<string, unknown>> => {
        const document = await decodeLegacyJson(raw, label);
        if (
            !isPlainObject(document)
            || document.schema !== "siyuan-homepage-device-view"
            || document.version !== DEVICE_VIEW_SCHEMA_VERSION
            || document.surface !== context.surface
            || !Number.isInteger(document.revision)
            || typeof document.deviceId !== "string"
        ) {
            throw new Error(`${label} 身份或 schema 无效`);
        }
        return document;
    };
    const widgets: RawMobileSharedTarget["widgets"] = [];
    for (const entry of entries ?? []) {
        if (entry.isDir || !entry.name.endsWith(".json")) continue;
        const instanceId = entry.name.slice(0, -5);
        assertDeviceViewSegment(instanceId, "移动共享组件实例 ID");
        const path = getWidgetPath(context, instanceId);
        const raw = await getFileOrNullChecked(path);
        if (raw === null) {
            throw new DeviceViewTemporarilyIncompleteError({
                deviceId: context.scopeId,
                surface: context.surface,
                missingType: "widget",
            });
        }
        widgets.push({ path, document: await decodeDocument(raw, path) });
    }
    widgets.sort((left, right) => left.path.localeCompare(right.path));
    return {
        layout: await decodeDocument(layoutRaw, getSurfaceLayoutPath(context)),
        settings: await decodeDocument(settingsRaw, getSurfaceViewPath(context)),
        widgets,
        manifest: await decodeDocument(manifestRaw, getSurfaceManifestPath(context)),
    };
}

async function normalizeMobileSharedOwnership(context: DeviceViewContext): Promise<void> {
    if (!context.isMobileShared || context.surface !== "mobile-homepage") return;
    const first = await readRawMobileSharedTarget(context);
    if (!first) return;
    const second = await readRawMobileSharedTarget(context);
    if (!second || !hasSameJsonSemantic(first, second)) {
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: "manifest",
        });
    }
    const documents = [second.layout, second.settings, ...second.widgets.map((item) => item.document), second.manifest];
    const ownerIds = new Set(documents.map((document) => String(document.deviceId)));
    if (ownerIds.size === 1 && ownerIds.has(context.scopeId)) return;
    if (ownerIds.size > 2 || (ownerIds.size === 2 && !ownerIds.has(context.scopeId))) {
        throw new Error("mobile-shared 目标所有权字段不一致，拒绝自动修复");
    }
    const third = await readRawMobileSharedTarget(context);
    if (!third || !hasSameJsonSemantic(second, third)) {
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: "manifest",
        });
    }
    await writeJson(getSurfaceLayoutPath(context), { ...third.layout, deviceId: context.scopeId });
    await writeJson(getSurfaceViewPath(context), { ...third.settings, deviceId: context.scopeId });
    for (const widget of third.widgets) {
        await writeJson(widget.path, { ...widget.document, deviceId: context.scopeId });
    }
    await writeJson(getSurfaceManifestPath(context), { ...third.manifest, deviceId: context.scopeId });
    const verified = await readRawMobileSharedTarget(context);
    if (!verified || [
        verified.layout,
        verified.settings,
        ...verified.widgets.map((item) => item.document),
        verified.manifest,
    ].some((document) => document.deviceId !== context.scopeId)) {
        throw new Error("mobile-shared 所有权字段修复后校验失败");
    }
}

async function writeRecoveredManifest(
    context: DeviceViewContext,
    _layout: DeviceViewLayout,
    _settings: DeviceViewSettings | null,
    _widgets: DeviceWidgetDocument[],
    unresolvedLegacyWidgetIds: string[],
    expectedSemantic: Record<string, unknown>,
): Promise<void> {
    const manifestPath = getSurfaceManifestPath(context);

    // 写前立即第三次复核整个目标，任一状态变化都不得补写 manifest。
    const third = await readManifestlessTargetOnce(context);
    if (third.status !== "complete" || !hasSameJsonSemantic(third.semantic, expectedSemantic)) {
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: "manifest",
        });
    }

    // 检查 manifest 是否已被并发写入
    const existingManifest = await readDeviceViewManifest(context);
    if (existingManifest) return;

    const manifest: DeviceViewManifest = {
        schema: "siyuan-homepage-device-view",
        version: DEVICE_VIEW_SCHEMA_VERSION,
        revision: 1,
        updatedAt: new Date().toISOString(),
        deviceId: context.scopeId,
        surface: context.surface,
        status: "complete",
        migration: {
            state: "complete",
            source: "recovered-target",
            completedAt: new Date().toISOString(),
            ...(unresolvedLegacyWidgetIds.length > 0
                ? { unresolvedLegacyWidgetIds: [...unresolvedLegacyWidgetIds] }
                : {}),
        },
    };

    await writeJson(manifestPath, manifest);

    // 写后重读验证
    const verifiedManifest = await readDeviceViewManifest(context);
    if (!verifiedManifest || !hasSameJsonSemantic(verifiedManifest, manifest)) {
        throw new Error(`设备视图 manifest ${manifestPath} 写入后校验失败`);
    }

    const dvcKey = migrationKey(context);
    verifiedCompletedMigrationKeys.add(dvcKey);
    incompleteMigrationChecks.delete(dvcKey);
    clearIncompleteMigrationWarning(context);
}

function markIncompleteMigrationWarning(context: DeviceViewContext): boolean {
    const key = migrationKey(context);
    if (incompleteMigrationWarningKeys.has(key)) return false;
    incompleteMigrationWarningKeys.add(key);
    return true;
}

function clearIncompleteMigrationWarning(context: DeviceViewContext): void {
    incompleteMigrationWarningKeys.delete(migrationKey(context));
}
interface LegacyReadOnlyFallback {
    layout: DeviceViewLayout;
    settings?: DeviceViewSettings;
    widgets: Map<string, Record<string, unknown>>;
    unresolvedLegacyWidgetIds: Set<string>;
    migrationNote?: string;
}
const legacyReadOnlyFallbacks = new Map<string, LegacyReadOnlyFallback>();

function migrationKey(context: DeviceViewContext): string {
    return `${context.scopeId}:${context.surface}`;
}

async function decodeLegacyJson(raw: unknown, label: string): Promise<unknown> {
    if (isPlainObject(raw)) return cloneJsonSafe(raw, label);
    let text = "";
    if (raw instanceof Blob) text = await raw.text();
    else if (typeof raw === "string") text = raw;
    else if (raw instanceof ArrayBuffer) text = new TextDecoder().decode(raw);
    else if (ArrayBuffer.isView(raw)) {
        const view = raw as ArrayBufferView;
        text = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
    if (!text.trim()) throw new Error(`${label} 存在但内容为空`);
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${label} JSON 损坏: ${String(error)}`);
    }
}

type LegacyPluginValueValidator = (value: unknown) => boolean;

function isNonEmptySerializableObject(value: unknown): value is Record<string, unknown> {
    return isPlainObject(value) && Object.keys(value).length > 0 && isJsonSafe(value);
}

async function readLegacyFile(
    plugin: any,
    fileName: string,
    isValidPluginValue: LegacyPluginValueValidator = isNonEmptySerializableObject,
): Promise<unknown | null> {
    let pluginResult: unknown = null;
    let pluginError: unknown = null;
    try {
        pluginResult = await plugin.loadData(fileName);
        if (isValidPluginValue(pluginResult)) return pluginResult;
    } catch (error) {
        pluginError = error;
    }
    const direct = await getFileOrNullChecked(`${getPluginStorageRoot(plugin)}/${fileName}`);
    if (direct === null) {
        if (pluginError) throw pluginError;
        // SiYuan Plugin.loadData() 对不存在的文件可能返回空字符串；直接文件接口
        // 已严格确认路径不存在时，应按缺失处理，不能误报成“文件存在但内容无效”。
        return null;
    }
    return decodeLegacyJson(direct, fileName);
}

function assertLegacyLayout(value: unknown, fileName: string): Record<string, unknown> | null {
    if (value === null) return null;
    if (!isPlainObject(value)) throw new Error(`${fileName} 不是普通对象`);
    if (!["order", "defaultOrder", "defaultSections", "profiles"].some((key) => Object.prototype.hasOwnProperty.call(value, key))) {
        throw new Error(`${fileName} 缺少已知布局字段`);
    }
    const validateOrder = (raw: unknown, label: string): void => {
        if (!Array.isArray(raw)) throw new Error(`${fileName} 的 ${label} 类型无效`);
        const seen = new Set<string>();
        for (const item of raw) {
            if (
                !isPlainObject(item)
                || typeof item.id !== "string"
                || !item.id.trim()
                || (item.style !== undefined && item.style !== null && typeof item.style !== "string")
            ) throw new Error(`${fileName} 的 ${label} 包含无效组件引用`);
            assertDeviceViewSegment(item.id, `${fileName} 的 ${label} 组件 ID`);
            if (seen.has(item.id)) throw new Error(`${fileName} 的 ${label} 包含重复组件 ${item.id}`);
            seen.add(item.id);
        }
    };
    const validateLayoutFields = (record: Record<string, unknown>, label: string): void => {
        if (Object.prototype.hasOwnProperty.call(record, "order")) validateOrder(record.order, `${label}.order`);
        if (record.widgetLayoutNumber !== undefined && (typeof record.widgetLayoutNumber !== "number" || !Number.isInteger(record.widgetLayoutNumber) || record.widgetLayoutNumber <= 0)) {
            throw new Error(`${fileName} 的 ${label}.widgetLayoutNumber 无效`);
        }
        if (record.widgetGap !== undefined && (typeof record.widgetGap !== "number" || !Number.isFinite(record.widgetGap) || record.widgetGap < 0)) {
            throw new Error(`${fileName} 的 ${label}.widgetGap 无效`);
        }
        if (record.hiddenWidgetIds !== undefined && (
            !Array.isArray(record.hiddenWidgetIds)
            || record.hiddenWidgetIds.some((id) => typeof id !== "string" || !id.trim())
            || new Set(record.hiddenWidgetIds).size !== record.hiddenWidgetIds.length
        )) {
            throw new Error(`${fileName} 的 ${label}.hiddenWidgetIds 类型无效`);
        }
        for (const id of (record.hiddenWidgetIds as string[] | undefined) || []) {
            assertDeviceViewSegment(id, `${fileName} 的 ${label}.hiddenWidgetIds`);
        }
    };
    if (Object.prototype.hasOwnProperty.call(value, "order")) validateOrder(value.order, "order");
    if (Object.prototype.hasOwnProperty.call(value, "defaultOrder")) validateOrder(value.defaultOrder, "defaultOrder");
    validateLayoutFields(value, "layout");
    for (const key of ["defaultSections", "profiles"] as const) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        const collection = value[key];
        if (!isPlainObject(collection)) throw new Error(`${fileName} 的 ${key} 类型无效`);
        for (const [entryId, rawEntry] of Object.entries(collection)) {
            if (!isPlainObject(rawEntry)) throw new Error(`${fileName} 的 ${key}.${entryId} 类型无效`);
            validateLayoutFields(rawEntry, `${key}.${entryId}`);
            if (key === "profiles" && rawEntry.sections !== undefined) {
                if (!isPlainObject(rawEntry.sections)) throw new Error(`${fileName} 的 profiles.${entryId}.sections 类型无效`);
                for (const [sectionId, section] of Object.entries(rawEntry.sections)) {
                    if (!isPlainObject(section)) throw new Error(`${fileName} 的 profiles.${entryId}.sections.${sectionId} 类型无效`);
                    validateLayoutFields(section, `profiles.${entryId}.sections.${sectionId}`);
                }
            }
        }
    }
    return value;
}

function isValidLegacyLayoutCandidate(value: unknown, fileName: string): boolean {
    try {
        return assertLegacyLayout(value, fileName) !== null;
    } catch {
        return false;
    }
}

function assertLegacySettings(value: unknown): Record<string, unknown> | null {
    if (value === null) return null;
    if (!isNonEmptySerializableObject(value)) throw new Error(`${LEGACY_SETTINGS_NAME} 配置为空或结构无效`);
    if (value.componentSections !== undefined) {
        if (!Array.isArray(value.componentSections)) throw new Error(`${LEGACY_SETTINGS_NAME} componentSections 类型无效`);
        const sectionIds = new Set<string>();
        for (let index = 0; index < value.componentSections.length; index++) {
            const section = value.componentSections[index];
            if (!isPlainObject(section) || typeof section.id !== "string" || !section.id.trim()) {
                throw new Error(`${LEGACY_SETTINGS_NAME} componentSections[${index}] 无效`);
            }
            if (sectionIds.has(section.id)) throw new Error(`${LEGACY_SETTINGS_NAME} componentSections 包含重复分栏 ${section.id}`);
            sectionIds.add(section.id);
        }
    }
    return value;
}

function isValidLegacyWidgetConfig(value: unknown): value is Record<string, unknown> {
    return isPlainObject(value)
        && typeof value.type === "string"
        && Boolean(value.type.trim())
        && isJsonSafe(value);
}

type LegacyWidgetReadResult =
    | { status: "found"; config: Record<string, unknown> }
    | { status: "missing-confirmed" }
    | { status: "unreadable"; reason: string }
    | { status: "unstable"; reason: string };

async function readLegacyWidgetStable(plugin: any, instanceId: string): Promise<LegacyWidgetReadResult> {
    const path = `${getPluginStorageRoot(plugin)}/widget-${instanceId}.json`;
    const readOnce = async (): Promise<Record<string, unknown> | null> => {
        const raw = await getFileOrNullChecked(path);
        if (raw === null) return null;
        const decoded = await decodeLegacyJson(raw, `widget-${instanceId}.json`);
        if (!isValidLegacyWidgetConfig(decoded)) {
            throw new Error(`widget-${instanceId}.json 配置无效`);
        }
        return decoded;
    };
    let first: Record<string, unknown> | null;
    let second: Record<string, unknown> | null;
    try {
        first = await readOnce();
        second = await readOnce();
    } catch (error) {
        return { status: "unreadable", reason: String(error) };
    }
    if (first === null && second === null) return { status: "missing-confirmed" };
    if (first === null || second === null) {
        return { status: "unstable", reason: `widget-${instanceId}.json 两次读取存在性不一致` };
    }
    if (!hasSameJsonSemantic(first, second)) {
        return { status: "unstable", reason: `widget-${instanceId}.json 两次读取内容不一致` };
    }
    return { status: "found", config: second };
}

function migrationMetadata(context: DeviceViewContext) {
    return {
        schema: "siyuan-homepage-device-view" as const,
        version: DEVICE_VIEW_SCHEMA_VERSION,
        revision: 1,
        updatedAt: new Date().toISOString(),
        deviceId: context.scopeId,
        surface: context.surface,
    };
}

function collectDeviceLayoutReferenceIds(layout: DeviceViewLayout): Set<string> {
    const ids = new Set(layout.order.map((item) => item.id));
    Object.values(layout.sections || {}).forEach((section) => {
        section.widgetIds.forEach((id) => ids.add(id));
    });
    return ids;
}

function extractConfiguredSectionIds(config: Record<string, unknown> | undefined): string[] {
    const raw = config?.componentSections;
    if (!Array.isArray(raw)) return [];
    const result: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < raw.length; index++) {
        const item = raw[index];
        if (!isPlainObject(item)) throw new Error(`旧 view componentSections[${index}] 无效`);
        const id = typeof item.id === "string" ? item.id.trim() : "";
        if (!id) throw new Error(`旧 view componentSections[${index}].id 无效`);
        if (seen.has(id)) throw new Error(`旧 view componentSections 包含重复分栏 ${id}`);
        seen.add(id);
        result.push(id);
    }
    return result;
}

/**
 * 校验迁移后的 layout 与 settings 分栏数据一致。
 *
 * 校验内容：
 * 1. layout.componentSectionsModeEnabled 与 settings.config.componentSectionsEnabled 一致；
 * 2. 分栏模式开启时：
 *    - 至少存在一个分栏；
 *    - activeSectionId 必须存在并属于现有分栏；
 *    - 全局 order 中每个组件必须且只能属于一个分栏；
 *    - 各分栏片段在全局 order 中连续；
 * 3. 分栏模式关闭时：
 *    - 不要求全局组件属于分栏；
 *    - 迁移生成的无分栏结构不应写 activeSectionId；
 * 4. 无组件文档的布局引用必须明确列入 unresolved 集合；
 * 5. 任一校验失败不写 manifest，不修改旧根数据。
 */
function validateMigratedLayoutSections(
    layout: DeviceViewLayout,
    settings: DeviceViewSettings | undefined,
    widgets: DeviceWidgetDocument[],
    unresolvedLegacyWidgetIds: ReadonlySet<string>,
): void {
    const layoutSections = layout.sections || {};
    const layoutSectionIds = Object.keys(layoutSections);
    const configSectionIds = extractConfiguredSectionIds(settings?.config);

    // 1. 一致性校验：layout.componentSectionsModeEnabled 与 settings.config.componentSectionsEnabled 一致。
    const layoutModeEnabled = layout.componentSectionsModeEnabled === true;
    const configModeEnabled = settings?.config?.componentSectionsEnabled === true;
    if (layoutModeEnabled !== configModeEnabled) {
        throw new Error(`迁移后分栏模式不一致：layout.componentSectionsModeEnabled=${layoutModeEnabled}，config.componentSectionsEnabled=${configModeEnabled}`);
    }

    // 分栏 ID 和顺序一致。
    if (layoutSectionIds.length !== configSectionIds.length) {
        throw new Error(`迁移后分栏数量不一致：layout ${layoutSectionIds.length} 个，config ${configSectionIds.length} 个`);
    }
    for (let i = 0; i < layoutSectionIds.length; i++) {
        if (layoutSectionIds[i] !== configSectionIds[i]) {
            throw new Error(`迁移后分栏顺序不一致：layout[${i}]=${layoutSectionIds[i]}，config[${i}]=${configSectionIds[i]}`);
        }
    }

    // 全局 order 无重复。
    const orderIds = layout.order.map((item) => item.id);
    const orderIdSet = new Set<string>();
    const duplicatedOrderIds = new Set<string>();
    for (const id of orderIds) {
        if (orderIdSet.has(id)) duplicatedOrderIds.add(id);
        orderIdSet.add(id);
    }
    if (duplicatedOrderIds.size > 0) {
        throw new Error(`迁移后全局 order 存在重复组件 ID：${[...duplicatedOrderIds].join(", ")}`);
    }

    // 4. 每个布局引用必须有组件文档，或明确列入 unresolved 集合。
    const widgetInstanceIds = new Set(widgets.map((w) => w.instanceId));
    const referencedIds = collectDeviceLayoutReferenceIds(layout);
    const missingDocs: string[] = [];
    for (const id of referencedIds) {
        if (!widgetInstanceIds.has(id) && !unresolvedLegacyWidgetIds.has(id)) missingDocs.push(id);
    }
    if (missingDocs.length > 0) {
        throw new Error(`迁移后存在未声明缺失的布局引用：${missingDocs.join(", ")}`);
    }
    for (const unresolvedId of unresolvedLegacyWidgetIds) {
        if (!referencedIds.has(unresolvedId)) {
            throw new Error(`迁移 unresolved 集合包含布局外组件：${unresolvedId}`);
        }
        if (widgetInstanceIds.has(unresolvedId)) {
            throw new Error(`迁移组件 ${unresolvedId} 同时存在文档且被标记 unresolved`);
        }
    }

    if (layoutModeEnabled) {
        // 2. 分栏模式开启时：
        // - 至少存在一个分栏；
        if (layoutSectionIds.length === 0) {
            throw new Error("分栏模式开启时至少需要存在一个分栏");
        }
        // - activeSectionId 必须存在并属于现有分栏；
        if (layout.activeSectionId === undefined || !layoutSectionIds.includes(layout.activeSectionId)) {
            throw new Error(`分栏模式开启时 activeSectionId 必须存在并属于现有分栏，当前为 ${layout.activeSectionId}`);
        }
        // - 全局 order 中每个组件必须且只能属于一个分栏；
        const sectionMembership = new Map<string, string>();
        for (const [sectionId, section] of Object.entries(layoutSections)) {
            for (const widgetId of section.widgetIds) {
                if (!orderIdSet.has(widgetId)) {
                    throw new Error(`分栏 ${sectionId} 包含不存在于全局 order 的组件 ${widgetId}`);
                }
                if (sectionMembership.has(widgetId)) {
                    throw new Error(`组件 ${widgetId} 同时属于分栏 ${sectionMembership.get(widgetId)} 和 ${sectionId}`);
                }
                sectionMembership.set(widgetId, sectionId);
            }
        }
        for (const id of orderIds) {
            if (!sectionMembership.has(id)) {
                throw new Error(`分栏模式开启时全局 order 中的组件 ${id} 必须属于一个分栏`);
            }
        }
        // - 各分栏片段在全局 order 中连续。
        // - 非空分栏片段在全局 order 中的出现顺序必须与 sectionIds 顺序一致。
        const encounteredNonEmptySections: string[] = [];
        let currentSection: string | null = null;
        const sectionEncountered = new Set<string>();
        for (const id of orderIds) {
            const sectionId = sectionMembership.get(id) || null;
            if (sectionId !== currentSection) {
                if (sectionId && sectionEncountered.has(sectionId)) {
                    throw new Error(`分栏 ${sectionId} 的组件在全局 order 中不连续`);
                }
                currentSection = sectionId;
                if (sectionId) {
                    sectionEncountered.add(sectionId);
                    if ((layoutSections[sectionId]?.widgetIds || []).length > 0) {
                        encounteredNonEmptySections.push(sectionId);
                    }
                }
            }
        }
        const expectedNonEmptyOrder = layoutSectionIds.filter(
            (id) => (layoutSections[id]?.widgetIds || []).length > 0,
        );
        if (encounteredNonEmptySections.length !== expectedNonEmptyOrder.length) {
            throw new Error(
                `迁移后非空分栏片段数量不一致：期望 ${expectedNonEmptyOrder.length} 个，实际 ${encounteredNonEmptySections.length} 个`,
            );
        }
        for (let i = 0; i < expectedNonEmptyOrder.length; i++) {
            if (encounteredNonEmptySections[i] !== expectedNonEmptyOrder[i]) {
                throw new Error(
                    `迁移后非空分栏片段顺序不一致：期望[${i}]=${expectedNonEmptyOrder[i]}，实际[${i}]=${encounteredNonEmptySections[i]}`,
                );
            }
        }
    } else {
        // 3. 分栏模式关闭时：
        // - 不要求全局组件属于分栏；
        // - 迁移生成的无分栏结构不应写 activeSectionId；
        if (layout.activeSectionId !== undefined) {
            throw new Error("分栏模式关闭时迁移生成的无分栏结构不应写 activeSectionId");
        }
        // - 分栏模式关闭时不应有分栏数据。
        if (layoutSectionIds.length > 0) {
            throw new Error(`分栏模式关闭时不应有分栏数据，但存在 ${layoutSectionIds.length} 个分栏`);
        }
    }
}

async function collectLegacyWidgetDocuments(
    context: DeviceViewContext,
    layout: DeviceViewLayout,
    fallback: LegacyReadOnlyFallback,
): Promise<{ documents: DeviceWidgetDocument[]; unresolvedLegacyWidgetIds: Set<string> }> {
    const referencedIds = collectDeviceLayoutReferenceIds(layout);
    fallback.layout = structuredClone(layout);
    const documents: DeviceWidgetDocument[] = [];
    const unresolvedLegacyWidgetIds = new Set<string>();
    for (const instanceId of referencedIds) {
        const result = await readLegacyWidgetStable(context.plugin, instanceId);
        if (result.status === "missing-confirmed") {
            unresolvedLegacyWidgetIds.add(instanceId);
            continue;
        }
        if (result.status === "unreadable" || result.status === "unstable") {
            throw new Error(`旧组件 ${instanceId} ${result.status}：${result.reason}`);
        }
        const config = { ...result.config };
        if (typeof config.blockId === "string") config.blockId = instanceId;
        if (typeof config.instanceId === "string") config.instanceId = instanceId;
        fallback.widgets.set(instanceId, structuredClone(config));
        documents.push({ ...migrationMetadata(context), instanceId, config });
    }
    fallback.unresolvedLegacyWidgetIds = new Set(unresolvedLegacyWidgetIds);
    return { documents, unresolvedLegacyWidgetIds };
}

async function reconcileCompletedLegacyMigration(context: DeviceViewContext): Promise<void> {
    const key = migrationKey(context);
    if (verifiedCompletedMigrationKeys.has(key)) return;

    const now = Date.now();

    const manifest = await readDeviceViewManifest(context);
    // manifest 尚未生成时由迁移流程负责，不复查。
    if (!manifest) return;

    // 完整性检查服务于所有 complete manifest（fresh、legacy-root 与 recovered-target），
    // schema/version 等结构性错误由读取函数继续抛出并阻断。
    if (manifest.migration.source !== "legacy-root" && manifest.migration.source !== "fresh" && manifest.migration.source !== "recovered-target") {
        return;
    }

    let layout: DeviceViewLayout | null;
    try {
        layout = await readDeviceViewLayout(context);
    } catch (error) {
        // schema/version 等结构性错误继续阻断；普通读取异常、JSON 半写入等降级为暂不完整。
        if (error instanceof DeviceViewMigrationBlockedError) {
            throw error;
        }
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: "layout",
        });
    }
    if (!layout) {
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: "layout",
        });
    }

    const declaredUnresolvedIds = new Set(manifest.migration.unresolvedLegacyWidgetIds ?? []);
    const missingIds = new Set<string>();
    const unreadableIds = new Set<string>();
    for (const instanceId of collectDeviceLayoutReferenceIds(layout)) {
        try {
            if (!await readDeviceWidget(context, instanceId)) {
                missingIds.add(instanceId);
            }
        } catch (error) {
            // schema/version 等结构性错误必须继续阻断，保持现有机制。
            if (error instanceof DeviceViewMigrationBlockedError) {
                throw error;
            }
            // 普通文件读取错误、暂时 JSON 读取异常只记录为暂不可读，
            // 不阻断插件 onload 和其他独立功能初始化。
            unreadableIds.add(instanceId);
        }
    }

    const undeclaredMissingIds = new Set([...missingIds].filter((id) => !declaredUnresolvedIds.has(id)));
    const resolvedButDeclaredIds = [...declaredUnresolvedIds].filter((id) => !missingIds.has(id));
    if (resolvedButDeclaredIds.length > 0) {
        throw new Error(`manifest unresolved 集合与现有组件冲突：${resolvedButDeclaredIds.join(", ")}`);
    }
    if (undeclaredMissingIds.size > 0 || unreadableIds.size > 0) {
        // 有效 manifest 已存在时，发现组件文件缺失或暂不可读只保留原样，
        // 不自动裁剪布局引用，不从其他设备目录或其他 surface 借用组件，
        // 不修改 manifest，不加入 verifiedCompletedMigrationKeys。
        incompleteMigrationChecks.set(key, {
            lastCheck: now,
            nextCheck: now + INCOMPLETE_MIGRATION_CHECK_COOLDOWN_MS,
            missingCount: undeclaredMissingIds.size,
            unreadableCount: unreadableIds.size,
        });

        if (markIncompleteMigrationWarning(context)) {
            const total = undeclaredMissingIds.size + unreadableIds.size;
            try {
                showMessage(
                    `[主页] 当前设备 ${context.surface} 的组件文件暂缺/暂不可读 ${total} 个，已保留布局引用等待同步恢复。`,
                    0,
                    "error",
                );
            } catch {
                // 提示失败不能反向导致迁移失败。
                console.warn(`[主页] ${context.surface} 组件复查 incomplete，提示显示失败`);
            }
        }
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: unreadableIds.size > 0 ? "widget" : "widget",
        });
    }

    verifiedCompletedMigrationKeys.add(key);
    incompleteMigrationChecks.delete(key);
    clearIncompleteMigrationWarning(context);
}

async function buildSettings(
    context: DeviceViewContext,
    legacySettings: Record<string, unknown> | null | undefined,
    profileResolution: ResolvedLegacyProfile | null,
    layout: DeviceViewLayout,
): Promise<DeviceViewSettings | undefined> {
    if (context.surface === "desktop-sidebar") return undefined;
    const raw = legacySettings === undefined
        ? await readLegacyFile(context.plugin, LEGACY_SETTINGS_NAME, isNonEmptySerializableObject)
        : legacySettings;
    const settings = createEmptySettings(context);
    if (raw === null) return settings;
    const config = { ...assertLegacySettings(raw) };
    delete config.deviceProfiles;
    delete config.widgetLayoutNumber;
    delete config.widgetGap;
    // bannerDeviceProfiles 三级回退：profileKey → physicalDeviceId → 旧全局 bannerHeight。
    // 第一个键不存在或不是普通对象时必须继续尝试第二个键，不得用空值提前结束。
    // 只有对应值是普通对象时才读取，避免把原始值（字符串/数字等）误当 profile。
    const bannerProfiles = isPlainObject(config.bannerDeviceProfiles) ? config.bannerDeviceProfiles : null;
    delete config.bannerDeviceProfiles;
    let currentBanner: Record<string, unknown> | null = null;
    if (bannerProfiles) {
        const profileKey = profileResolution?.profileKey;
        if (typeof profileKey === "string" && profileKey.trim() && isPlainObject(bannerProfiles[profileKey])) {
            currentBanner = bannerProfiles[profileKey] as Record<string, unknown>;
        } else if (isPlainObject(bannerProfiles[context.physicalDeviceId])) {
            currentBanner = bannerProfiles[context.physicalDeviceId] as Record<string, unknown>;
        }
    }
    // 三级回退末端：保留原 config.bannerHeight 作为旧全局横幅高度。
    if (currentBanner && typeof currentBanner.bannerHeight === "number") {
        config.bannerHeight = String(currentBanner.bannerHeight);
    }
    // 同步 componentSections 与 layout.sections，保证最终 view.config 与 layout 完全一致。
    const sectionConfig = buildSectionSettingsConfig(layout, legacySettings ?? null);
    config.componentSections = sectionConfig.componentSections;
    config.componentSectionsEnabled = sectionConfig.componentSectionsEnabled;
    return { ...settings, config };
}

async function runMigration(context: DeviceViewContext): Promise<void> {
    await normalizeMobileSharedOwnership(context);
    // 区分四种情况：
    // 1) manifest 已存在且为有效 schema 2 -> 直接 reconcile
    // 2) manifest 文件存在但 schema/version 不可识别 -> 停止并提示
    // 3) manifest 文件不存在 + 目标文件完全为空 -> 从旧根一次性迁移
    // 4) manifest 文件不存在 + 目标文件部分存在 -> 分析后补交 manifest 或暂缓
    let existingManifest: Awaited<ReturnType<typeof readDeviceViewManifest>> = null;
    let manifestReadError: unknown = null;
    try {
        existingManifest = await readDeviceViewManifest(context);
    } catch (error) {
        manifestReadError = error;
    }
    if (manifestReadError) {
        if (manifestReadError instanceof DeviceViewMigrationBlockedError) {
            recordDeviceViewBlockedState(manifestReadError);
            throw manifestReadError;
        }
        // 文件读取失败、JSON 损坏等真实原因保留，不伪装为旧版本，也不自动转换。
        throw manifestReadError;
    }
    if (existingManifest) {
        await reconcileCompletedLegacyMigration(context);
        return;
    }

    // manifest 缺失：先分析目标文件状态
    const dvcKey = migrationKey(context);
    const logPrefix = `[Homepage] 设备 ${context.scopeId}/${context.surface}`;

    // 首次日志输出完整信息，后续仅 debug
    const firstLog = !manifestMissingLoggedKeys.has(dvcKey);
    if (firstLog) {
        manifestMissingLoggedKeys.add(dvcKey);
    }

    const targetAnalysis = await analyzeManifestlessDeviceViewTarget(context);

    switch (targetAnalysis.status) {
        case "complete": {
            if (firstLog) {
                console.info(`${logPrefix} manifest.json 缺失，目标文件完整，将安全补交 manifest`);
            } else {
                console.debug(`${logPrefix} manifest.json 缺失，目标文件完整，将安全补交 manifest`);
            }
            await writeRecoveredManifest(
                context,
                targetAnalysis.layout,
                targetAnalysis.settings,
                targetAnalysis.widgets,
                targetAnalysis.unresolvedLegacyWidgetIds,
                targetAnalysis.semantic,
            );
            return;
        }
        case "empty": {
            if (firstLog) {
                console.info(`${logPrefix} manifest.json 缺失，目标文件完全为空，进入旧根迁移`);
            } else {
                console.debug(`${logPrefix} manifest.json 缺失，目标文件完全为空，进入旧根迁移`);
            }
            // 进入旧根迁移
            break;
        }
        case "incomplete": {
            if (firstLog) {
                console.warn(`${logPrefix} manifest.json 缺失，目标文件不完整：${targetAnalysis.reason}，暂缓处理`);
            } else {
                console.debug(`${logPrefix} manifest.json 缺失，目标文件仍不完整：${targetAnalysis.reason}`);
            }
            throw new DeviceViewTemporarilyIncompleteError({
                deviceId: context.scopeId,
                surface: context.surface,
                missingType: "manifest",
            });
        }
    }

    // 只有 "empty" 才会走到这里：进入旧根迁移
    const fileName = LEGACY_LAYOUT_NAMES[context.surface];
    const legacyLayout = assertLegacyLayout(
        await readLegacyFile(context.plugin, fileName, (value) => isValidLegacyLayoutCandidate(value, fileName)),
        fileName,
    );
    // 所有 surface 都只读加载 legacySettings 用于 profile 匹配；
    // desktop-sidebar 仍不生成 view.json 设置内容（buildSettings 内部判断）。
    const legacySettingsRaw = await readLegacyFile(context.plugin, LEGACY_SETTINGS_NAME, isNonEmptySerializableObject);
    const legacySettings = legacySettingsRaw === null
        ? null
        : assertLegacySettings(legacySettingsRaw);
    // 所有 surface 都解析 profileResolution，desktop-sidebar 和 mobile-homepage
    // 也使用精确 profile 选择规则，不再任意选择第一个 profile。
    const profileResolution = legacyLayout
        ? resolveLegacyProfile(context, legacyLayout, legacySettings)
        : null;
    if (profileResolution?.strategy === "ambiguous") {
        throw createDeviceViewBlockedError(
            context,
            "legacy_profile_ambiguous",
            `旧设备 profile 匹配不唯一：${profileResolution.ambiguousProfileKeys?.join(", ") || "(未知)"}`,
        );
    }
    if (profileResolution) {
        console.info(`[Homepage] 旧 profile 选择策略：${profileResolution.strategy}`);
    }
    const layout = context.surface === "desktop-homepage"
        ? getDesktopLayout(context, legacyLayout, legacySettings, profileResolution)
        : getSimpleLayout(context, legacyLayout, profileResolution);
    const settings = await buildSettings(context, legacySettings, profileResolution, layout);
    const fallback: LegacyReadOnlyFallback = {
        layout: structuredClone(layout),
        settings: settings ? structuredClone(settings) : undefined,
        widgets: new Map(),
        unresolvedLegacyWidgetIds: new Set(),
        migrationNote: profileResolution?.note || undefined,
    };
    legacyReadOnlyFallbacks.set(migrationKey(context), fallback);
    const widgetCollection = await collectLegacyWidgetDocuments(context, layout, fallback);
    validateMigratedLayoutSections(
        layout,
        settings,
        widgetCollection.documents,
        widgetCollection.unresolvedLegacyWidgetIds,
    );

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
        layout,
        settings,
        widgets: widgetCollection.documents,
        unresolvedLegacyWidgetIds: [...widgetCollection.unresolvedLegacyWidgetIds],
        source: legacyLayout || (settings && Object.keys(settings.config).length > 0) ? "legacy-root" : "fresh",
    });
    legacyReadOnlyFallbacks.delete(migrationKey(context));
}

export async function ensureCurrentDeviceViewMigrated(context: DeviceViewContext): Promise<void> {
    const key = migrationKey(context);
    if (readyMigrationKeys.has(key)) return;
    const existing = migrationTasks.get(key);
    if (existing) return existing;
    const task = runMigration(context)
        .then(() => {
            readyMigrationKeys.add(key);
            migrationTasks.delete(key);
            manifestMissingLoggedKeys.delete(key);
        })
        .catch((error) => {
            if (error instanceof DeviceViewTemporarilyIncompleteError) {
                // 冷却期共享同一个已失败任务；绝不能用延迟 resolve 伪装 ready。
                window.setTimeout(() => {
                    if (migrationTasks.get(key) === task) migrationTasks.delete(key);
                }, INCOMPLETE_RETRY_COOLDOWN_MS);
            } else {
                migrationTasks.delete(key);
            }
            throw error;
        });
    migrationTasks.set(key, task);
    return task;
}

export function getLegacyReadOnlyFallback(context: DeviceViewContext): LegacyReadOnlyFallback | null {
    return legacyReadOnlyFallbacks.get(migrationKey(context)) || null;
}

export async function loadLegacyReadOnlyWidgetFallback(
    context: DeviceViewContext,
    instanceId: string,
): Promise<Record<string, unknown> | null> {
    const fallback = getLegacyReadOnlyFallback(context);
    if (!fallback) return null;
    const cached = fallback.widgets.get(instanceId);
    if (cached) return structuredClone(cached);
    if (fallback.unresolvedLegacyWidgetIds.has(instanceId)) return null;
    const result = await readLegacyWidgetStable(context.plugin, instanceId);
    if (result.status === "missing-confirmed") {
        fallback.unresolvedLegacyWidgetIds.add(instanceId);
        return null;
    }
    if (result.status !== "found") {
        throw new Error(`旧组件 ${instanceId} ${result.status}：${result.reason}`);
    }
    const config = { ...result.config };
    if (typeof config.blockId === "string") config.blockId = instanceId;
    if (typeof config.instanceId === "string") config.instanceId = instanceId;
    fallback.widgets.set(instanceId, structuredClone(config));
    return config;
}
