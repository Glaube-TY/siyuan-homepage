import type { Plugin } from 'siyuan';
import { isDesktopDeviceProfileEnabled } from "@/homepage/utils/deviceProfile";
import { getCurrentDeviceViewContext } from "@/homepage/deviceView/deviceViewContext";
import {
    ensureCurrentDeviceViewMigrated,
    getLegacyReadOnlyFallback,
    loadLegacyReadOnlyWidgetFallback,
} from "@/homepage/deviceView/deviceViewMigration";
import {
    readDeviceViewLayout,
    readDeviceViewManifest,
    readDeviceViewSettings,
    replaceDeviceViewLayout,
    updateDeviceViewLayout,
    updateDeviceViewSettings,
} from "@/homepage/deviceView/deviceViewStorage";
import { deleteWidgetInstance, loadWidgetInstanceConfig, readWidgetInstanceDocument } from "@/homepage/deviceView/widgetInstanceRepository";
import {
    isComponentSectionsEffective,
    normalizeComponentSections,
    type ComponentSection,
    type ComponentSectionsNavAlign,
} from "@/homepage/homepageSetting/config";
import type {
    DeviceViewContext,
    DeviceViewLayout,
    DeviceViewMetadata,
    DeviceViewSettings,
    DeviceViewSurface,
} from "@/homepage/deviceView/deviceViewTypes";
import { deviceViewSurfaceHasSettings } from "@/homepage/deviceView/deviceViewTypes";
import {
    cloneJsonSafe,
    cloneJsonSafeOmittingUndefinedObjectProperties,
    hasSameJsonSemantic,
} from "@/homepage/deviceView/jsonSafe";
import {
    assertSectionLayoutInvariants,
    hasNoSectionMembers,
    mergeRemovedSectionRangesIntoAdjacentSections,
    rearrangeGlobalOrderBySections,
} from "./layout-section-ops";
import {
    captureHomepageWidgetDomSnapshot,
    clearPreservedWidgetElementAfterAppend,
    cleanupStalePreservedWidgetEntries,
    enumerateHomepageWidgetElements,
    getDirectWidgetElements,
    matchesHomepageWidgetDomSnapshot,
    restoreHomepageWidgetDomSnapshot,
    storePreservedWidgetElement,
    type HomepageWidgetDomScope,
} from "@/homepage/homepage-widget-dom";


export interface SaveLayoutOptions {
    containerSelector: string;
    layoutFileName: DeviceViewSurface;
    containerEl?: HTMLElement | null;
    sectionsEnabled?: boolean;
    sectionId?: string | null;
    /** 本次刚完成写后验证、允许加入全局 order 的新组件 ID。 */
    committedWidgetIds?: string[];
    deviceViewContext?: DeviceViewContext;
}

export interface RestoreLayoutOptions {
    containerSelector: string;
    layoutFileName: DeviceViewSurface;
    WidgetBlockClass: any;
    containerEl?: HTMLElement | null;
    sectionsEnabled?: boolean;
    sectionId?: string | null;
    preservedWidgetElements?: Map<string, HTMLElement>;
    componentSectionContainers?: ReadonlyMap<string, HTMLElement>;
    deviceViewContext?: DeviceViewContext;
    readOnly?: boolean;
    expectedLayoutRevision?: number;
    expectedWidgetIds?: readonly string[];
}

export type RestoreLayoutStatus = "complete" | "degraded" | "fatal";

export interface RestoreLayoutResult {
    status: RestoreLayoutStatus;
    layoutRevision: number;
    expectedIds: string[];
    failedWidgetIds: string[];
    unresolvedWidgetIds: string[];
    structuralComplete: boolean;
    failureKind?: "structure" | "widget-read";
    reason?: string;
}

export interface LayoutItem {
    id: string;
    style: string | null;
    index: number;
}

/** 兼容层描述分栏成员关系。新模型中分栏只保存 widgetIds，顺序来自全局 layout.order。 */
export interface WidgetLayoutSectionData {
    widgetIds: string[];
}

/** 兼容层描述当前设备分栏。 */
export interface WidgetLayoutProfileSectionData {
    widgetIds: string[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
}

/** 兼容层描述当前设备布局。order 始终为全局顺序。 */
export interface WidgetLayoutProfileData {
    order: LayoutItem[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
    activeSectionId?: string;
    sections?: Record<string, WidgetLayoutProfileSectionData>;
    componentSectionsModeEnabled?: boolean;
}

/** 兼容层布局数据。order 为全局顺序；profiles 保留当前设备视图。 */
export interface WidgetLayoutData {
    order?: LayoutItem[];
    profiles?: Record<string, WidgetLayoutProfileData>;
    widgetLayoutNumber?: number;
    widgetGap?: number;
}

function waitForLayoutRetry(delayMs: number): Promise<void> {
    if (delayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function isStorageApiError(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.code === "number" && record.code !== 0 && typeof record.msg === "string";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isJsonSerializable(value: unknown): boolean {
    try {
        return typeof JSON.stringify(value) === "string";
    } catch {
        return false;
    }
}

function isStrictlyValidWidgetConfig(value: unknown): value is Record<string, unknown> {
    return isPlainObject(value)
        && typeof value.type === "string"
        && Boolean(value.type.trim())
        && isJsonSerializable(value);
}

function deviceLayoutToCompatibilityLayout(_context: DeviceViewContext, layout: DeviceViewLayout): WidgetLayoutData {
    const order = layout.order.map((item) => ({ ...item }));
    const hasSections = layout.sections !== undefined;
    const sections = Object.fromEntries(
        Object.entries(layout.sections ?? {}).map(([id, section]) => [id, {
            widgetIds: [...section.widgetIds],
            ...(section.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: section.widgetLayoutNumber } : {}),
            ...(section.widgetGap !== undefined ? { widgetGap: section.widgetGap } : {}),
        }]),
    );
    return {
        order,
        profiles: {
            [_context.scopeId]: {
                order,
                ...(layout.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: layout.widgetLayoutNumber } : {}),
                ...(layout.widgetGap !== undefined ? { widgetGap: layout.widgetGap } : {}),
                ...(layout.activeSectionId !== undefined ? { activeSectionId: layout.activeSectionId } : {}),
                ...(hasSections ? { sections } : {}),
                ...(layout.componentSectionsModeEnabled !== undefined
                    ? { componentSectionsModeEnabled: layout.componentSectionsModeEnabled }
                    : {}),
            },
        },
        ...(layout.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: layout.widgetLayoutNumber } : {}),
        ...(layout.widgetGap !== undefined ? { widgetGap: layout.widgetGap } : {}),
    };
}

function compatibilityLayoutToDeviceLayout(context: DeviceViewContext, layout: WidgetLayoutData): Omit<DeviceViewLayout, keyof DeviceViewMetadata> {
    const profile = layout.profiles?.[context.scopeId];
    const widgetLayoutNumber = profile?.widgetLayoutNumber ?? layout.widgetLayoutNumber;
    const widgetGap = profile?.widgetGap ?? layout.widgetGap;
    const hasSections = profile?.sections !== undefined;
    const sections = Object.fromEntries(
        Object.entries(profile?.sections ?? {}).map(([id, section]) => [id, {
            widgetIds: [...(section?.widgetIds || [])],
            ...(section?.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: section.widgetLayoutNumber } : {}),
            ...(section?.widgetGap !== undefined ? { widgetGap: section.widgetGap } : {}),
        }]),
    );
    return {
        order: normalizeLayoutItems(profile?.order || layout.order),
        ...(widgetLayoutNumber !== undefined ? { widgetLayoutNumber } : {}),
        ...(widgetGap !== undefined ? { widgetGap } : {}),
        ...(profile?.activeSectionId !== undefined ? { activeSectionId: profile.activeSectionId } : {}),
        ...(hasSections ? { sections } : {}),
        ...(profile?.componentSectionsModeEnabled !== undefined
            ? { componentSectionsModeEnabled: profile.componentSectionsModeEnabled }
            : {}),
    };
}

async function getReadyContext(plugin: Plugin, surface: DeviceViewSurface): Promise<DeviceViewContext> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    await ensureCurrentDeviceViewMigrated(context);
    return context;
}

async function updateCurrentDeviceLayout(
    context: DeviceViewContext,
    mutate: (layout: WidgetLayoutData, deviceId: string, context: DeviceViewContext) => WidgetLayoutData,
    options: { expectedRevision?: number; assumeReady?: boolean } = {},
): Promise<void> {
    if (options.assumeReady !== true) {
        await ensureCurrentDeviceViewMigrated(context);
    }
    const start = await loadLayoutSnapshotForContext(context, { assumeReady: options.assumeReady });
    await updateDeviceViewLayout(
        context,
        (deviceLayout) => {
            const compatibility = mutate(deviceLayoutToCompatibilityLayout(context, deviceLayout), context.scopeId, context);
            return {
                ...deviceLayout,
                ...compatibilityLayoutToDeviceLayout(context, compatibility),
            };
        },
        { expectedRevision: options.expectedRevision ?? start.revision },
    );
}

export interface LayoutSnapshot {
    layout: WidgetLayoutData;
    revision: number;
    deviceId: string;
    surface: DeviceViewSurface;
}

export async function loadLayoutSnapshotForContext(
    context: DeviceViewContext,
    options: { assumeReady?: boolean } = {},
): Promise<LayoutSnapshot> {
    if (options.assumeReady !== true) {
        await ensureCurrentDeviceViewMigrated(context);
    }
    const deviceLayout = await readDeviceViewLayout(context);
    if (!deviceLayout) {
        throw new Error(`当前设备 ${context.surface} 的 layout.json 缺失，无法获取布局快照`);
    }
    let compatibleLayout: WidgetLayoutData;
    try {
        compatibleLayout = cloneJsonSafe(
            deviceLayoutToCompatibilityLayout(context, deviceLayout),
            "设备布局兼容转换结果",
        );
    } catch (error) {
        throw new Error(`设备布局兼容转换结果不是 JSON-safe 数据：${error instanceof Error ? error.message : String(error)}`);
    }
    return {
        layout: compatibleLayout,
        revision: deviceLayout.revision,
        deviceId: context.scopeId,
        surface: context.surface,
    };
}

export async function loadLayoutSnapshotForSurface(
    plugin: Plugin,
    surface: DeviceViewSurface = "desktop-homepage",
): Promise<LayoutSnapshot> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    return loadLayoutSnapshotForContext(context);
}

export async function saveLayoutDataForContext(
    context: DeviceViewContext,
    layout: WidgetLayoutData,
    options: { expectedRevision?: number } = {},
): Promise<void> {
    await ensureCurrentDeviceViewMigrated(context);
    await replaceDeviceViewLayout(context, compatibilityLayoutToDeviceLayout(context, layout), options);
}

export async function saveLayoutDataForSurface(
    plugin: Plugin,
    layout: WidgetLayoutData,
    surface: DeviceViewSurface = "desktop-homepage",
    options: { expectedRevision?: number } = {},
): Promise<void> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    await saveLayoutDataForContext(context, layout, options);
}

export async function loadLayoutDataWithRetry(
    plugin: Plugin,
    surface: DeviceViewSurface = "desktop-homepage",
): Promise<WidgetLayoutData | null> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    await ensureCurrentDeviceViewMigrated(context);
    const layout = await readDeviceViewLayout(context);
    if (!layout) throw new Error(`当前设备 ${surface} 的 layout.json 缺失`);
    return deviceLayoutToCompatibilityLayout(context, layout);
}

export async function loadWidgetConfigWithRetry(
    plugin: Plugin,
    widgetId: string,
    surface: DeviceViewSurface = "desktop-homepage",
    fixedContext?: DeviceViewContext,
): Promise<Record<string, unknown> | null> {
    const delays = [0, 80, 200];
    let lastError: unknown = null;
    let unstableObservation = false;

    for (const delayMs of delays) {
        await waitForLayoutRetry(delayMs);
        try {
            const context = fixedContext ?? getCurrentDeviceViewContext(plugin, surface);
            if (context.surface !== surface) throw new Error("组件读取 context 与 surface 不一致");
            const readOnlyFallback = getLegacyReadOnlyFallback(context);
            if (readOnlyFallback) {
                const fallbackValue = await loadLegacyReadOnlyWidgetFallback(context, widgetId);
                const normalizedFallback = normalizeWidgetConfigData(fallbackValue);
                if (isStrictlyValidWidgetConfig(normalizedFallback)) return normalizedFallback;
                unstableObservation = true;
                lastError = new Error(`旧结构组件 ${widgetId} 配置缺失或无效`);
                continue;
            }
            let value: Record<string, unknown> | null;
            try {
                if (!fixedContext) {
                    await ensureCurrentDeviceViewMigrated(context);
                }
                value = await loadWidgetInstanceConfig(context, widgetId);
            } catch (error) {
                value = getLegacyReadOnlyFallback(context)?.widgets.get(widgetId) || null;
                if (!value) throw error;
            }
            if (value === null) {
                unstableObservation = true;
                lastError = new Error(`组件 ${widgetId} 配置暂时缺失`);
                continue;
            }
            const normalized = normalizeWidgetConfigData(value);
            if (isStrictlyValidWidgetConfig(normalized)) return normalized;
            unstableObservation = true;
            lastError = new Error(`组件 ${widgetId} 的数据格式无效`);
        } catch (error) {
            unstableObservation = true;
            lastError = error;
        }
    }

    if (!unstableObservation) return null;
    throw lastError || new Error(`组件 ${widgetId} 暂时不可读`);
}

interface StoredWidgetInventory {
    items: LayoutItem[];
    layoutFilePresent: boolean;
    complete: boolean;
    signature: string;
}

function collectKnownLayoutItems(layout: WidgetLayoutData | null): Map<string, LayoutItem> {
    const items = new Map<string, LayoutItem>();
    const addItems = (value: unknown) => {
        for (const item of normalizeLayoutItems(value)) {
            if (!items.has(item.id)) items.set(item.id, item);
        }
    };

    addItems(layout?.order);
    for (const profile of Object.values(layout?.profiles || {})) {
        addItems(profile?.order);
        for (const section of Object.values(profile?.sections || {})) {
            if (Array.isArray(section?.widgetIds)) {
                for (const id of section.widgetIds) {
                    if (!items.has(id)) items.set(id, { id, style: null, index: items.size });
                }
            }
        }
    }
    return items;
}

function collectReferencedWidgetIds(layout: WidgetLayoutData | null): Set<string> {
    return new Set(collectKnownLayoutItems(layout).keys());
}

async function scanStoredWidgetInventory(
    plugin: Plugin,
    layout: WidgetLayoutData | null,
    layoutFileName: DeviceViewSurface,
    fixedContext?: DeviceViewContext,
): Promise<StoredWidgetInventory> {
    const knownItems = collectKnownLayoutItems(layout);
    const widgetIds = [...collectReferencedWidgetIds(layout)].sort();
    let widgetFilesComplete = true;
    const widgetSignatures: string[] = [];
    const discovered = await Promise.all(widgetIds.map(async (widgetId, index): Promise<LayoutItem | null> => {
        try {
            const content = await loadWidgetConfigWithRetry(plugin, widgetId, layoutFileName, fixedContext);
            if (!content) {
                widgetFilesComplete = false;
                return null;
            }
            widgetSignatures.push(`${widgetId}:${JSON.stringify(content)}`);
            return {
                ...(knownItems.get(widgetId) || { id: widgetId, style: null, index }),
                id: widgetId,
                index,
            };
        } catch {
            widgetFilesComplete = false;
            return null;
        }
    }));

    return {
        items: discovered.filter((item): item is LayoutItem => item !== null),
        layoutFilePresent: layout !== null,
        complete: widgetFilesComplete,
        signature: widgetSignatures.sort().join("|"),
    };
}

export interface HomepageStorageSnapshot {
    layout: WidgetLayoutData | null;
    layoutFilePresent: boolean;
    desktopWidgetItems: LayoutItem[];
    signature: string;
}

/** 严格、只读的同步稳定快照；任何目录、布局或相关组件读取不完整都会抛错。 */
export async function readHomepageStorageSnapshot(
    plugin: Plugin,
    layoutFileName: DeviceViewSurface = "desktop-homepage",
): Promise<HomepageStorageSnapshot> {
    const context = await getReadyContext(plugin, layoutFileName);
    const layout = (await loadLayoutSnapshotForContext(context)).layout;
    const inventory = await scanStoredWidgetInventory(plugin, layout, layoutFileName, context);
    if (!inventory.complete) {
        throw new Error("桌面主页组件清单暂时不完整");
    }
    if (!layout && inventory.layoutFilePresent) {
        throw new Error(`${layoutFileName} 文件存在但未得到有效布局`);
    }
    const desktopWidgetItems = inventory.items
        .map((item, index) => ({ ...item, index }))
        .sort((left, right) => left.id.localeCompare(right.id));
    return {
        layout,
        layoutFilePresent: inventory.layoutFilePresent,
        desktopWidgetItems,
        signature: JSON.stringify({
            layout,
            desktopWidgetIds: desktopWidgetItems.map((item) => item.id),
            widgetConfigs: inventory.signature,
        }),
    };
}

export interface MoveWidgetToSectionOptions {
    fromSectionId?: string | null;
    toSectionId: string;
    style?: string | null;
    deviceViewContext?: DeviceViewContext;
}

export interface MoveWidgetResult {
    success: boolean;
    widgetId?: string;
    fromSectionId?: string;
    toSectionId?: string;
    layoutRevision?: number;
    error?: string;
}

/**
 * 布局 mutate 回调内部使用的取消异常。
 * 当检测到幽灵分栏、section-only ID 或保存后不变量校验失败时抛出，
 * 由 saveLayoutForContainer / moveWidgetToComponentSectionForCurrentDevice 捕获后标记 incomplete，
 * 不将中间状态写入 layout.json。
 */
class LayoutMutationCancelError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LayoutMutationCancelError";
    }
}

function normalizeLayoutItem(item: unknown): LayoutItem | null {
    if (typeof item !== "object" || item === null) return null;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) return null;
    return {
        id,
        style: typeof raw.style === "string" ? raw.style : null,
        index: typeof raw.index === "number" ? raw.index : 0,
    };
}

function sanitizeLayoutStyle(style: string | null, containerEl: Element | null): string | null {
    if (!style) return style;
    // 主页 custom-content 内去掉 aspect-ratio
    if (containerEl && containerEl.classList.contains("custom-content")) {
        return style.replace(/aspect-ratio\s*:\s*[^;]+;?\s*/gi, "");
    }
    return style;
}

export function normalizeLayoutItems(items: unknown): LayoutItem[] {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeLayoutItem).filter((item): item is LayoutItem => item !== null);
}

function normalizeSectionId(sectionId: string | null | undefined): string | null {
    const trimmed = typeof sectionId === "string" ? sectionId.trim() : "";
    return trimmed || null;
}

async function isRuntimeComponentSectionsEnabled(plugin: Plugin, fixedContext?: DeviceViewContext): Promise<boolean> {
    const context = fixedContext ?? await getReadyContext(plugin, "desktop-homepage");
    const config = (await readDeviceViewSettings(context))?.config || null;
    return isComponentSectionsEffective(config, Boolean((plugin as any)?.ADVANCED));
}

function getDeviceProfile(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
): WidgetLayoutProfileData | null {
    if (!layout || !deviceId) return null;
    return layout.profiles?.[deviceId] || null;
}

function ensureDeviceProfile(
    layout: WidgetLayoutData,
    deviceId: string,
): WidgetLayoutProfileData {
    if (!layout.profiles) {
        layout.profiles = {};
    }
    if (!layout.profiles[deviceId]) {
        layout.profiles[deviceId] = { order: normalizeLayoutItems(layout.order) };
    }
    return layout.profiles[deviceId];
}

export function getActiveSectionIdFromLayout(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
): string | null {
    return normalizeSectionId(getDeviceProfile(layout, deviceId)?.activeSectionId);
}

/**
 * 对当前设备完整 profile 执行分栏布局只读校验。
 * - 使用当前设备全局 order；
 * - profile.sections 与 Object.keys(profile.sections) 稳定顺序；
 * - requireAllAssigned=true；
 * - activeSectionId（若提供）必须属于现有分栏。
 *
 * 不修改数据，失败返回 false，由调用方设置 incomplete 状态。
 */
export function validateFullProfileSectionsReadOnly(
    layout: WidgetLayoutData,
    deviceId: string | null,
    activeSectionId: string | null,
): boolean {
    const profile = getDeviceProfile(layout, deviceId);
    const sections = profile?.sections;
    const sectionIds = Object.keys(sections || {});
    if (sectionIds.length === 0) return true;

    if (activeSectionId && !sectionIds.includes(activeSectionId)) return false;

    const globalOrder = normalizeLayoutItems(profile?.order || layout.order);
    try {
        assertSectionLayoutInvariants(
            globalOrder,
            sections || {},
            sectionIds,
            { requireAllAssigned: true },
        );
        return true;
    } catch {
        return false;
    }
}

export interface CoordinatedSnapshot {
    layout: LayoutSnapshot;
    view: DeviceViewSettings | null;
}

export async function readCoordinatedSnapshotForContext(context: DeviceViewContext): Promise<CoordinatedSnapshot> {
    await ensureCurrentDeviceViewMigrated(context);
    const expectsView = deviceViewSurfaceHasSettings(context.surface);
    const retryDelays = [0, 25, 75] as const;
    let lastInstability = "";

    for (const delayMs of retryDelays) {
        await waitForLayoutRetry(delayMs);
        const layout = await loadLayoutSnapshotForContext(context);
        const view = expectsView ? await readDeviceViewSettings(context) : null;
        if (expectsView && !view) {
            throw new Error(`当前设备 ${context.surface} 的 view.json 缺失，无法建立协调快照`);
        }
        if (layout.deviceId !== context.scopeId || layout.surface !== context.surface) {
            throw new Error("协调快照与固定设备 context 不一致");
        }
        if (view && (view.deviceId !== context.scopeId || view.surface !== context.surface)) {
            throw new Error("协调 view 与固定设备 context 不一致");
        }

        const layoutRecheck = await loadLayoutSnapshotForContext(context);
        if (layoutRecheck.revision !== layout.revision) {
            lastInstability = `layout revision 已变化（${layout.revision} → ${layoutRecheck.revision}）`;
            continue;
        }
        if (!hasSameJsonSemantic(layoutRecheck.layout, layout.layout)) {
            lastInstability = "layout 内容在读取期间发生变化";
            continue;
        }
        const viewRecheck = expectsView ? await readDeviceViewSettings(context) : null;
        if (expectsView) {
            if (!viewRecheck) {
                lastInstability = "view 在读取期间缺失";
                continue;
            }
            if (viewRecheck.revision !== view.revision) {
                lastInstability = `view revision 已变化（${view.revision} → ${viewRecheck.revision}）`;
                continue;
            }
            if (!hasSameJsonSemantic(viewRecheck.config, view.config)) {
                lastInstability = "view 配置内容在读取期间发生变化";
                continue;
            }
        }
        return { layout: layoutRecheck, view: viewRecheck };
    }

    throw new Error(`连续 ${retryDelays.length} 次读取协调快照均不稳定：${lastInstability}`);
}

export interface ComponentSectionsViewSnapshot {
    componentSectionsEnabled: boolean;
    componentSections: ComponentSection[];
    componentSectionsNavAlign: ComponentSectionsNavAlign;
    settingsRevision: number;
}

/**
 * 严格读取当前 deviceId + surface 的 layout 和 view.json 快照。
 * 任一读取失败或 view.json 缺失均直接抛错，不当作空数据。
 */
export async function readCoordinatedSnapshot(
    plugin: Plugin,
    surface: DeviceViewSurface = "desktop-homepage",
): Promise<CoordinatedSnapshot> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    return readCoordinatedSnapshotForContext(context);
}

function componentSectionsFromViewConfig(config: Record<string, unknown>): ComponentSection[] {
    return normalizeComponentSections(config.componentSections);
}

/**
 * 校验 layout.profile 的分栏状态与 view.config 中三个分栏字段保持一致。
 *
 * 规则：
 * - layout.componentSectionsModeEnabled 必须与 view.componentSectionsEnabled（原始开关）一致；
 * - 禁止 componentSectionsEnabled=true 但有效分栏为空；
 * - 只要 layout 或 view 保存了分栏定义，无论开关是否开启，都校验 ID 集合和顺序一致；
 * - 分栏开启时校验 activeSectionId 和完整分栏不变量（requireAllAssigned=true）；
 * - 分栏关闭时不要求组件全量归属，但禁止 section-only ID。
 */
export function validateLayoutViewSectionConsistency(
    layout: WidgetLayoutData,
    deviceId: string | null,
    viewConfig: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
    const profile = getDeviceProfile(layout, deviceId);
    const sectionsEnabled = viewConfig.componentSectionsEnabled === true;
    const rawSections = viewConfig.componentSections;
    if (rawSections !== undefined) {
        if (!Array.isArray(rawSections)) return { ok: false, reason: "view.componentSections 不是数组" };
        const rawIds = new Set<string>();
        for (let index = 0; index < rawSections.length; index++) {
            const section = rawSections[index];
            if (!section || typeof section !== "object" || Array.isArray(section)) {
                return { ok: false, reason: `view.componentSections[${index}] 不是普通对象` };
            }
            const id = typeof (section as Record<string, unknown>).id === "string"
                ? ((section as Record<string, unknown>).id as string).trim()
                : "";
            if (!id) return { ok: false, reason: `view.componentSections[${index}].id 无效` };
            if (rawIds.has(id)) return { ok: false, reason: `view.componentSections 包含重复分栏 ${id}` };
            rawIds.add(id);
        }
    }
    const configuredSections = componentSectionsFromViewConfig(viewConfig);

    // layout 分栏模式必须与 view 原始开关一致，不能只比较“有效开启”。
    if ((profile?.componentSectionsModeEnabled === true) !== sectionsEnabled) {
        return {
            ok: false,
            reason: `layout 分栏模式（${profile?.componentSectionsModeEnabled === true}）与 view 原始开关（${sectionsEnabled}）不一致`,
        };
    }

    // 禁止开关开启但有效分栏为空。
    if (sectionsEnabled && configuredSections.length === 0) {
        return { ok: false, reason: "componentSectionsEnabled=true 但有效分栏为空" };
    }

    const layoutSectionIds = Object.keys(profile?.sections || {});
    const viewSectionIds = configuredSections.map((section) => section.id);

    // 只要任一方保存了分栏定义，就校验 ID 集合和顺序一致。
    if (layoutSectionIds.length > 0 || viewSectionIds.length > 0) {
        if (
            layoutSectionIds.length !== viewSectionIds.length
            || !layoutSectionIds.every((id, index) => id === viewSectionIds[index])
        ) {
            return {
                ok: false,
                reason: "layout.sections 的分栏 ID 集合/顺序与 view.componentSections 不一致",
            };
        }
    }

    if (sectionsEnabled) {
        const activeSectionId = normalizeSectionId(profile?.activeSectionId);
        if (!activeSectionId || !layoutSectionIds.includes(activeSectionId)) {
            return { ok: false, reason: "layout.activeSectionId 无效" };
        }

        try {
            assertSectionLayoutInvariants(
                normalizeLayoutItems(profile?.order || layout.order),
                profile?.sections || {},
                layoutSectionIds,
                { requireAllAssigned: true },
            );
        } catch (error) {
            return {
                ok: false,
                reason: `分栏布局不变量校验失败：${error instanceof Error ? error.message : String(error)}`,
            };
        }
    } else {
        // 分栏关闭时禁止 section-only ID：任何 sections 中的 ID 都必须在全局 order 中。
        try {
            assertSectionLayoutInvariants(
                normalizeLayoutItems(profile?.order || layout.order),
                profile?.sections || {},
                layoutSectionIds,
                { requireAllAssigned: false },
            );
        } catch (error) {
            return {
                ok: false,
                reason: `分栏关闭状态校验失败：${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    return { ok: true };
}

export type RecoverableSectionHalfCommitAnalysis = {
    status: "consistent" | "resume-requested-save" | "remove-confirmed-empty-extras" | "unrecoverable";
    reason: string;
    removableSectionIds: string[];
};

function readStrictViewSectionIds(viewConfig: Record<string, unknown>): { ok: true; ids: string[] } | { ok: false; reason: string } {
    if (
        viewConfig.componentSectionsEnabled !== undefined
        && typeof viewConfig.componentSectionsEnabled !== "boolean"
    ) {
        return { ok: false, reason: "view.componentSectionsEnabled 类型无效" };
    }
    const rawSections = viewConfig.componentSections;
    if (rawSections === undefined) return { ok: false, reason: "view.componentSections 字段缺失" };
    if (!Array.isArray(rawSections)) return { ok: false, reason: "view.componentSections 不是数组" };

    const ids: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < rawSections.length; index++) {
        const section = rawSections[index];
        if (!isPlainObject(section)) {
            return { ok: false, reason: `view.componentSections[${index}] 不是普通对象` };
        }
        const id = typeof section.id === "string" ? section.id : "";
        if (!id || normalizeSectionId(id) !== id) {
            return { ok: false, reason: `view.componentSections[${index}].id 无效` };
        }
        if (seen.has(id)) return { ok: false, reason: `view.componentSections 包含重复分栏 ${id}` };
        if (typeof section.name !== "string" || !section.name.trim()) {
            return { ok: false, reason: `view.componentSections[${index}].name 无效` };
        }
        if (typeof section.createdAt !== "number" || !Number.isFinite(section.createdAt)) {
            return { ok: false, reason: `view.componentSections[${index}].createdAt 无效` };
        }
        if (typeof section.updatedAt !== "number" || !Number.isFinite(section.updatedAt)) {
            return { ok: false, reason: `view.componentSections[${index}].updatedAt 无效` };
        }
        seen.add(id);
        ids.push(id);
    }
    return { ok: true, ids };
}

/**
 * 结合用户本次设置意图，分析 layout-only 空分栏半提交恢复策略。
 *
 * 只有用户本次点击确认所提交的分栏列表能够明确证明保留或删除意图时，
 * 才允许进入恢复分支。
 *
 * @param layout 当前磁盘布局数据
 * @param deviceId 当前设备 ID
 * @param currentViewConfig 磁盘上的当前 view 配置
 * @param requestedSectionIds 用户本次请求的分栏 ID 列表（顺序敏感）
 * @param requestedViewConfig 用户本次请求的完整 view 配置（含 componentSections）
 */
export function analyzeSectionHalfCommitForSave(
    layout: WidgetLayoutData,
    deviceId: string,
    currentViewConfig: Record<string, unknown>,
    requestedSectionIds: string[],
    requestedViewConfig: Record<string, unknown>,
): RecoverableSectionHalfCommitAnalysis {
    // === 1) JSON-safe 校验 ===
    try {
        cloneJsonSafe(layout, "分栏半提交分析布局");
        cloneJsonSafe(currentViewConfig, "分栏半提交分析 current view");
        cloneJsonSafe(requestedViewConfig, "分栏半提交分析 requested view");
    } catch (error) {
        return {
            status: "unrecoverable",
            reason: `数据不是 JSON-safe：${error instanceof Error ? error.message : String(error)}`,
            removableSectionIds: [],
        };
    }

    // === 2) current view componentSections 必须合法 ===
    const currentStrictView = readStrictViewSectionIds(currentViewConfig);
    if (!currentStrictView.ok) {
        return {
            status: "unrecoverable",
            reason: `current view 分栏状态无效：${(currentStrictView as { ok: false; reason: string }).reason}`,
            removableSectionIds: [],
        };
    }

    // === 3) requestedViewConfig.componentSections 必须合法 ===
    const requestedStrictView = readStrictViewSectionIds(requestedViewConfig);
    if (!requestedStrictView.ok) {
        return {
            status: "unrecoverable",
            reason: `本次请求分栏配置无效：${(requestedStrictView as { ok: false; reason: string }).reason}`,
            removableSectionIds: [],
        };
    }

    // === 4) requestedSectionIds 与 requestedViewConfig.componentSections ID及顺序完全一致 ===
    const requestedConfigIds = requestedStrictView.ids;
    if (requestedSectionIds.length !== requestedConfigIds.length
        || !requestedSectionIds.every((id, idx) => id === requestedConfigIds[idx])) {
        return {
            status: "unrecoverable",
            reason: "本次请求 sectionIds 与 requestedViewConfig.componentSections ID/顺序不一致",
            removableSectionIds: [],
        };
    }

    // === 5) layout 满足完整 Schema 2 不变量 ===
    const profile = getDeviceProfile(layout, deviceId);
    const layoutSections = profile?.sections || {};
    const layoutSectionIds = Object.keys(layoutSections);
    const sectionsEnabled = currentViewConfig.componentSectionsEnabled === true;

    try {
        assertSectionLayoutInvariants(
            normalizeLayoutItems(profile?.order || layout.order),
            layoutSections,
            layoutSectionIds,
            { requireAllAssigned: sectionsEnabled },
        );
    } catch (error) {
        return {
            status: "unrecoverable",
            reason: `layout 不变量校验失败：${error instanceof Error ? error.message : String(error)}`,
            removableSectionIds: [],
        };
    }

    // === 6) 分栏开关一致性 ===
    if ((profile?.componentSectionsModeEnabled === true) !== sectionsEnabled) {
        return { status: "unrecoverable", reason: "layout/view 分栏开关不一致", removableSectionIds: [] };
    }

    // === 7) 校验 layout 分栏结构有效性 ===
    const globalOrder = normalizeLayoutItems(profile?.order || layout.order);
    const globalIdSet = new Set(globalOrder.map((item) => item.id));
    for (const sectionId of layoutSectionIds) {
        const section = layoutSections[sectionId];
        if (!section || !Array.isArray(section.widgetIds)) {
            return { status: "unrecoverable", reason: `layout 分栏 ${sectionId} 结构无效`, removableSectionIds: [] };
        }
        for (const widgetId of section.widgetIds) {
            if (typeof widgetId !== "string" || !widgetId || !globalIdSet.has(widgetId)) {
                return { status: "unrecoverable", reason: `layout 分栏 ${sectionId} 包含无效组件引用`, removableSectionIds: [] };
            }
        }
    }

    // === 8) 检查是否已经一致 ===
    const consistency = validateLayoutViewSectionConsistency(layout, deviceId, currentViewConfig);
    if (consistency.ok) {
        return { status: "consistent", reason: "layout/view 分栏状态一致", removableSectionIds: [] };
    }

    // === 9) current view IDs 必须是 layout IDs 的子序列 ===
    const currentViewIds = currentStrictView.ids;
    const layoutIdSet = new Set(layoutSectionIds);
    if (currentViewIds.some((id) => !layoutIdSet.has(id))) {
        return { status: "unrecoverable", reason: "view 包含 layout 中不存在的分栏", removableSectionIds: [] };
    }
    const currentViewIdSet = new Set(currentViewIds);
    const retainedLayoutIds = layoutSectionIds.filter((id) => currentViewIdSet.has(id));
    if (
        retainedLayoutIds.length !== currentViewIds.length
        || !retainedLayoutIds.every((id, index) => id === currentViewIds[index])
    ) {
        return { status: "unrecoverable", reason: "layout/view 分栏顺序不能仅通过删除空壳恢复", removableSectionIds: [] };
    }

    // === 10) layout-only 空分栏安全性校验 ===
    const layoutOnlySectionIds = layoutSectionIds.filter((id) => !currentViewIdSet.has(id));
    if (layoutOnlySectionIds.length === 0) {
        return { status: "unrecoverable", reason: "未找到可证明安全的 layout-only 空分栏", removableSectionIds: [] };
    }
    const activeSectionId = normalizeSectionId(profile?.activeSectionId);
    for (const sectionId of layoutOnlySectionIds) {
        const section = layoutSections[sectionId];
        if (!section || !Array.isArray(section.widgetIds) || section.widgetIds.length !== 0) {
            return { status: "unrecoverable", reason: `layout-only 分栏 ${sectionId} 不是空分栏`, removableSectionIds: [] };
        }
        if (new Set(section.widgetIds).size !== section.widgetIds.length) {
            return { status: "unrecoverable", reason: `layout-only 分栏 ${sectionId} 包含重复组件`, removableSectionIds: [] };
        }
        if (activeSectionId === sectionId) {
            return { status: "unrecoverable", reason: `layout-only 分栏 ${sectionId} 是活动分栏`, removableSectionIds: [] };
        }
    }

    // === 11) 删除空壳后必须满足一致性 ===
    const repairedLayout = cloneJsonSafe(layout, "空分栏外壳修复预检布局");
    const repairedProfile = repairedLayout.profiles?.[deviceId];
    if (!repairedProfile?.sections) {
        return { status: "unrecoverable", reason: "当前设备分栏结构缺失", removableSectionIds: [] };
    }
    for (const sectionId of layoutOnlySectionIds) delete repairedProfile.sections[sectionId];

    const repairedConsistency = validateLayoutViewSectionConsistency(repairedLayout, deviceId, currentViewConfig);
    if (!repairedConsistency.ok) {
        return {
            status: "unrecoverable",
            reason: `删除空壳后仍不一致：${(repairedConsistency as { ok: false; reason: string }).reason}`,
            removableSectionIds: [],
        };
    }

    // === 12) 分支判定（结合用户意图）===

    // 分支一：resume-requested-save
    // requestedSectionIds 与完整 layoutSectionIds 完全一致
    // 且 requestedConfig.componentSections 的 ID和顺序也与 layout 完全一致
    if (
        requestedSectionIds.length === layoutSectionIds.length
        && requestedSectionIds.every((id, idx) => id === layoutSectionIds[idx])
        && requestedConfigIds.length === layoutSectionIds.length
        && requestedConfigIds.every((id, idx) => id === layoutSectionIds[idx])
    ) {
        return {
            status: "resume-requested-save",
            reason: `用户本次配置明确包含所有 layout-only 空分栏（${layoutOnlySectionIds.join(", ")}），继续保存`,
            removableSectionIds: [],
        };
    }

    // 分支二：remove-confirmed-empty-extras
    // requestedSectionIds 与 current view IDs 完全一致
    // 且 requestedConfig.componentSections 也与 current view ID和顺序完全一致
    // 用户本次确认提交的可见分栏列表不包含 layout-only 空分栏
    if (
        requestedSectionIds.length === currentViewIds.length
        && requestedSectionIds.every((id, idx) => id === currentViewIds[idx])
        && requestedConfigIds.length === currentViewIds.length
        && requestedConfigIds.every((id, idx) => id === currentViewIds[idx])
    ) {
        return {
            status: "remove-confirmed-empty-extras",
            reason: `用户本次确认不包含 layout-only 空分栏（${layoutOnlySectionIds.join(", ")}），可安全删除`,
            removableSectionIds: [...layoutOnlySectionIds],
        };
    }

    // 不可恢复：请求列表既不等于layout完整列表，也不等于current view列表
    return {
        status: "unrecoverable",
        reason: `layout=[${layoutSectionIds.join(",")}] view=[${currentViewIds.join(",")}] `
            + `requested=[${requestedSectionIds.join(",")}] `
            + `layout-only=[${layoutOnlySectionIds.join(",")}]`,
        removableSectionIds: [],
    };
}

const surfaceWriteQueues = new Map<string, Promise<unknown>>();

/**
 * 在同一 surface（deviceId + surface）上串行执行写事务。
 *
 * 约束：
 * - 同一 key 的事务按 FIFO 顺序串行；
 * - 嵌套调用同一 key 会死锁，调用方必须使用 syncLayoutAndViewInTransaction 在已持有事务时复用。
 * - 任务异常也会释放队列，不会阻塞后续操作。
 */
export function runInSurfaceTransaction<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = surfaceWriteQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => gate);
    surfaceWriteQueues.set(key, queued);
    return previous.catch(() => undefined).then(async () => {
        try {
            return await task();
        } finally {
            release();
            if (surfaceWriteQueues.get(key) === queued) {
                surfaceWriteQueues.delete(key);
            }
        }
    });
}

function inSurfaceTransaction<T>(key: string, task: () => Promise<T>): Promise<T> {
    return runInSurfaceTransaction(key, task);
}

export interface SyncLayoutAndViewResult {
    layout: LayoutSnapshot;
    view: DeviceViewSettings;
    /** true 表示 layout 和 view 两份文档均已成功提交到存储；false 表示已回滚或从未保留本次变更。 */
    committed: boolean;
    /** true 表示无法确认补偿结果（layout 状态不确定），调用方不得自动清理组件或回滚，必须提示人工检查。 */
    manualCheckRequired?: boolean;
    /** 提交成功后，重新读取/刷新验证阶段出现的非致命警告（不触发回滚）。 */
    warning?: string;
}

/**
 * syncLayoutAndView 抛出的结构化错误。
 *
 * 调用方应通过 instanceof 判断并读取 committed / manualCheckRequired 字段，
 * 禁止依赖正则匹配错误文本判断 revision 冲突或补偿结果。
 */
export class SyncLayoutAndViewError extends Error {
    public readonly committed: boolean;
    public readonly manualCheckRequired: boolean;

    constructor(
        message: string,
        options: { committed?: boolean; manualCheckRequired?: boolean } = {},
    ) {
        super(message);
        this.name = "SyncLayoutAndViewError";
        this.committed = options.committed ?? false;
        this.manualCheckRequired = options.manualCheckRequired ?? false;
    }
}

/**
 * 在已持有 surface 事务的前提下协调提交 layout 和 view 的变更。
 *
 * 调用方必须已通过 runInSurfaceTransaction 持有同一 queueKey 的事务，否则会破坏串行约束。
 * 内部行为与 syncLayoutAndView 一致，但不再次获取队列锁，避免嵌套死锁。
 *
 * 约束：
 * - 基于同一快照计算 nextLayout / nextViewConfig；
 * - 调用方传入 expectedSnapshot 时，事务开始前必须验证当前 layout/view revision 与之一致；
 * - 写入 layout 和 view 均使用原始 revision；
 * - view 写入失败时，仅在确认 layout 仍停留在本次写入的 revision 时才补偿恢复；
 * - 两份文档提交成功后，提交后校验/刷新失败只作为 warning 返回，不触发组件回滚；
 * - 补偿结果无法确认时抛出 SyncLayoutAndViewError(manualCheckRequired=true)；
 * - view 失败但 layout 已安全补偿时抛出 SyncLayoutAndViewError(committed=false, manualCheckRequired=false)。
 */
/**
 * 将对象递归转换为键名稳定的可比较形式。
 */
/**
 * 比较两份布局的语义内容是否一致（忽略 revision、updatedAt 等元数据）。
 */
function isSameLayoutContent(left: WidgetLayoutData, right: WidgetLayoutData): boolean {
    return hasSameJsonSemantic(left, right);
}

/**
 * 比较两个 view config 的语义内容是否一致。
 */
function isSameViewConfig(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
    return hasSameJsonSemantic(left, right);
}

/**
 * 纯函数：根据已读取的当前 layout 判断处于原状态、目标状态还是未知状态。
 * currentLayout 为 null/undefined 时返回 "unknown"。
 */
function classifyLayoutContentState(
    originalLayout: WidgetLayoutData,
    targetLayout: WidgetLayoutData,
    currentLayout: WidgetLayoutData | null | undefined,
): "original" | "target" | "unknown" {
    if (!currentLayout) return "unknown";
    if (isSameLayoutContent(currentLayout, targetLayout)) return "target";
    if (isSameLayoutContent(currentLayout, originalLayout)) return "original";
    return "unknown";
}

/**
 * 纯函数：根据已读取的当前 view config 判断处于原状态、目标状态还是未知状态。
 * currentConfig 为 null/undefined 时返回 "unknown"。
 */
function classifyViewConfigState(
    originalConfig: Record<string, unknown>,
    targetConfig: Record<string, unknown>,
    currentConfig: Record<string, unknown> | null | undefined,
): "original" | "target" | "unknown" {
    if (!currentConfig) return "unknown";
    if (isSameViewConfig(currentConfig, targetConfig)) return "target";
    if (isSameViewConfig(currentConfig, originalConfig)) return "original";
    return "unknown";
}

interface SyncLayoutAndViewRepository {
    deviceId: string;
    loadLayoutSnapshot(): Promise<LayoutSnapshot>;
    readViewSettings(): Promise<DeviceViewSettings | null>;
    saveLayout(layout: WidgetLayoutData, expectedRevision: number): Promise<void>;
    updateView(mutate: (config: Record<string, unknown>) => Record<string, unknown>, expectedRevision: number): Promise<DeviceViewSettings>;
    readCoordinatedSnapshot(): Promise<CoordinatedSnapshot>;
}

function createSyncLayoutAndViewRepository(context: DeviceViewContext): SyncLayoutAndViewRepository {
    return {
        deviceId: context.scopeId,
        loadLayoutSnapshot: () => loadLayoutSnapshotForContext(context),
        readViewSettings: () => readDeviceViewSettings(context),
        saveLayout: (layout, expectedRevision) => saveLayoutDataForContext(context, layout, { expectedRevision }),
        updateView: (mutate, expectedRevision) => updateDeviceViewSettings(context, mutate, { expectedRevision }),
        readCoordinatedSnapshot: () => readCoordinatedSnapshotForContext(context),
    };
}

async function syncLayoutAndViewTransactionCore(
    deviceId: string,
    layoutMutator: (layout: WidgetLayoutData) => WidgetLayoutData,
    viewMutator: (config: Record<string, unknown>) => Record<string, unknown>,
    repository: SyncLayoutAndViewRepository,
    expectedSnapshot?: CoordinatedSnapshot,
): Promise<SyncLayoutAndViewResult> {
    let start: CoordinatedSnapshot;
    if (expectedSnapshot) {
        if (!expectedSnapshot.view) {
            throw new SyncLayoutAndViewError("当前 surface 不包含 view.json，不能执行 layout/view 联合事务", { committed: false });
        }
        const currentLayout = await repository.loadLayoutSnapshot();
        const currentView = await repository.readViewSettings();
        if (currentLayout.revision !== expectedSnapshot.layout.revision) {
            throw new SyncLayoutAndViewError("当前 layout revision 与调用方原始快照不一致，拒绝覆盖", { committed: false });
        }
        if (!hasSameJsonSemantic(currentLayout.layout, expectedSnapshot.layout.layout)) {
            throw new SyncLayoutAndViewError("当前 layout 内容与调用方原始快照不一致，拒绝覆盖", { committed: false });
        }
        if (!currentView || currentView.revision !== expectedSnapshot.view.revision) {
            throw new SyncLayoutAndViewError("当前 view revision 与调用方原始快照不一致，拒绝覆盖", { committed: false });
        }
        if (!hasSameJsonSemantic(currentView.config, expectedSnapshot.view.config)) {
            throw new SyncLayoutAndViewError("当前 view 内容与调用方原始快照不一致，拒绝覆盖", { committed: false });
        }
        start = expectedSnapshot;
    } else {
        start = await repository.readCoordinatedSnapshot();
    }
    if (!start.view) {
        throw new SyncLayoutAndViewError("当前 surface 不包含 view.json，不能执行 layout/view 联合事务", { committed: false });
    }

    const originalLayout = structuredClone(start.layout.layout);
    const originalConfig = structuredClone(start.view.config);
    const originalLayoutRevision = start.layout.revision;
    const originalViewRevision = start.view.revision;

    const nextLayout = cloneJsonSafe(
        layoutMutator(structuredClone(originalLayout)),
        "layout/view 事务目标布局",
    );
    const nextConfig = cloneJsonSafe(
        viewMutator(structuredClone(originalConfig)),
        "layout/view 事务目标配置",
    );

    const preCheck = validateLayoutViewSectionConsistency(nextLayout, deviceId, nextConfig);
    if (!preCheck.ok) {
        throw new SyncLayoutAndViewError(`layout/view 提交前校验失败：${(preCheck as { ok: false; reason: string }).reason}`, { committed: false });
    }

    let layoutWriteError: unknown | undefined;
    try {
        await repository.saveLayout(nextLayout, originalLayoutRevision);
    } catch (error) {
        layoutWriteError = error;
    }

    // layout 写入阶段异常：严格重读并判定当前状态。
    if (layoutWriteError) {
        const currentLayoutSnapshot = await repository.loadLayoutSnapshot().catch(() => undefined);
        const layoutState = classifyLayoutContentState(originalLayout, nextLayout, currentLayoutSnapshot?.layout);
        const originalErrorMessage = layoutWriteError instanceof Error ? layoutWriteError.message : String(layoutWriteError);
        if (layoutState === "target") {
            // layout 实际上已经是目标状态，继续尝试 view 写入，不要在这里回滚。
        } else if (layoutState === "original") {
            // layout 未保留目标状态，可视为未提交；但 view 尚未写入，直接返回未提交。
            throw new SyncLayoutAndViewError(
                `layout 写入失败且当前仍为原始状态；原始错误：${originalErrorMessage}`,
                { committed: false, manualCheckRequired: false },
            );
        } else {
            // 无法确认 layout 状态：禁止调用方清理组件或自动回滚。
            throw new SyncLayoutAndViewError(
                `layout 写入失败且无法确认当前状态（${originalErrorMessage}），请手动检查主页分栏状态`,
                { committed: false, manualCheckRequired: true },
            );
        }
    }

    let afterLayout: LayoutSnapshot;
    try {
        afterLayout = await repository.loadLayoutSnapshot();
    } catch {
        const originalErrorMessage = layoutWriteError !== undefined
            ? (layoutWriteError instanceof Error ? layoutWriteError.message : String(layoutWriteError))
            : "";
        throw new SyncLayoutAndViewError(
            originalErrorMessage
                ? `layout 写入成功但写后重读失败；原始错误：${originalErrorMessage}，请手动检查主页分栏状态`
                : "layout 写入成功但写后重读失败，请手动检查主页分栏状态",
            { committed: false, manualCheckRequired: true },
        );
    }
    const committedLayoutRevision = afterLayout.revision;

    // P0: layout 写入成功后，校验 afterLayout 的语义状态再决定是否继续写 view。
    const afterLayoutState = classifyLayoutContentState(originalLayout, nextLayout, afterLayout.layout);
    if (afterLayoutState === "original") {
        // layout 仍是原始状态：未提交，不写 view。
        throw new SyncLayoutAndViewError(
            "layout 写入后重读仍为原始状态，view 未写入",
            { committed: false, manualCheckRequired: false },
        );
    }
    if (afterLayoutState !== "target") {
        // 第三种状态或读取失败：禁止写 view，要求人工检查。
        throw new SyncLayoutAndViewError(
            "layout 写入后重读状态无法确认为目标，禁止写入 view，请手动检查主页分栏状态",
            { committed: false, manualCheckRequired: true },
        );
    }

    // P1: 保存 updateView 成功返回的 DeviceViewSettings，用于 fallback。
    let writtenView: DeviceViewSettings | null = null;
    let viewWriteError: unknown | undefined;
    try {
        writtenView = await repository.updateView(() => nextConfig, originalViewRevision);
    } catch (error) {
        viewWriteError = error;
    }

    if (viewWriteError) {
        const currentView = await repository.readViewSettings().catch(() => null);
        const viewState = classifyViewConfigState(originalConfig, nextConfig, currentView?.config);
        const originalViewMessage = viewWriteError instanceof Error ? viewWriteError.message : String(viewWriteError);

        if (viewState === "target") {
            // view 已经写入目标状态：视为 committedWithWarning，不补偿 layout。
            // P1: 优先使用 currentView（真实重读结果），其次使用 writtenView（updateView 成功返回值），禁止手工构造。
            const fallbackView: DeviceViewSettings = currentView ?? writtenView ?? {
                schema: start.view.schema,
                version: start.view.version,
                revision: originalViewRevision + 1,
                updatedAt: start.view.updatedAt,
                deviceId: start.view.deviceId,
                surface: start.view.surface,
                config: nextConfig,
            };
            return {
                layout: afterLayout,
                view: fallbackView,
                committed: true,
                warning: `view 写入抛错，但重读确认目标已写入；原始错误：${originalViewMessage}`,
            };
        }

        if (viewState === "unknown") {
            // 无法确认 view 是否已提交：不能补偿 layout，必须人工检查。
            throw new SyncLayoutAndViewError(
                `view 写入失败且无法确认当前状态（${originalViewMessage}），请手动检查主页分栏状态`,
                { committed: false, manualCheckRequired: true },
            );
        }

        // view 仍为原始状态：尝试将 layout 恢复为提交前状态。
        let compensationReason = "";
        try {
            const currentLayoutSnapshot = await repository.loadLayoutSnapshot().catch(() => undefined);
            const currentLayoutState = classifyLayoutContentState(originalLayout, nextLayout, currentLayoutSnapshot?.layout);
            if (currentLayoutState !== "target") {
                compensationReason = "layout 在 view 写入失败后已被并发修改或无法确认";
            } else {
                await repository.saveLayout(originalLayout, committedLayoutRevision);
                const compensatedSnapshot = await repository.loadLayoutSnapshot().catch(() => undefined);
                const compensatedState = classifyLayoutContentState(originalLayout, nextLayout, compensatedSnapshot?.layout);
                if (compensatedState !== "original") {
                    compensationReason = "layout 补偿写入后验证未回到原始状态";
                }
            }
        } catch (compensationError) {
            compensationReason = compensationError instanceof Error
                ? compensationError.message
                : String(compensationError);
        }

        if (compensationReason) {
            throw new SyncLayoutAndViewError(
                `view 写入失败且无法安全恢复原始布局（${compensationReason}）；原始 view 错误：${originalViewMessage}。主页分栏状态可能处于不一致，请手动检查。`,
                { committed: false, manualCheckRequired: true },
            );
        }

        // view 失败但 layout 已安全补偿为提交前状态：调用方可以安全清理本次新组件。
        throw new SyncLayoutAndViewError(
            `view 写入失败，但 layout 已恢复为提交前状态；原始 view 错误：${originalViewMessage}`,
            { committed: false, manualCheckRequired: false },
        );
    }

    // layout 与 view 均成功写入；后续校验失败只作为 warning 返回。
    let warning: string | undefined;
    let final: CoordinatedSnapshot;
    try {
        final = await repository.readCoordinatedSnapshot();
    } catch (refreshError) {
        // P1: 使用 writtenView（updateView 真实返回值）作为 fallback，禁止手工构造 revision/updatedAt。
        final = {
            layout: afterLayout,
            view: writtenView ?? {
                schema: start.view.schema,
                version: start.view.version,
                revision: originalViewRevision + 1,
                updatedAt: start.view.updatedAt,
                deviceId: start.view.deviceId,
                surface: start.view.surface,
                config: nextConfig,
            },
        };
        warning = refreshError instanceof Error
            ? `提交后重新读取失败：${refreshError.message}`
            : "提交后重新读取失败";
    }

    const postCheck = validateLayoutViewSectionConsistency(
        final.layout.layout,
        deviceId,
        final.view.config,
    );
    if (!postCheck.ok) {
        warning = warning
            ? `${warning}；layout/view 提交后校验失败：${(postCheck as { ok: false; reason: string }).reason}`
            : `layout/view 提交后校验失败：${(postCheck as { ok: false; reason: string }).reason}`;
    }

    return { ...final, committed: true, warning };
}

export async function syncLayoutAndViewInTransaction(
    context: DeviceViewContext,
    layoutMutator: (layout: WidgetLayoutData) => WidgetLayoutData,
    viewMutator: (config: Record<string, unknown>) => Record<string, unknown>,
    expectedSnapshot?: CoordinatedSnapshot,
): Promise<SyncLayoutAndViewResult> {
    const repository = createSyncLayoutAndViewRepository(context);
    return syncLayoutAndViewTransactionCore(repository.deviceId, layoutMutator, viewMutator, repository, expectedSnapshot);
}

/**
 * 在当前 deviceId + surface 上协调提交 layout 和 view 的变更。
 *
 * 约束：
 * - 同一 surface 的模板应用/恢复操作串行执行；
 * - 基于同一快照计算 nextLayout / nextViewConfig；
 * - 调用方传入 expectedSnapshot 时，事务开始前必须验证当前 layout/view revision 与之一致；
 * - 写入 layout 和 view 均使用原始 revision；
 * - view 写入失败时，仅在确认 layout 仍停留在本次写入的 revision 时才补偿恢复；
 * - 两份文档提交成功后，提交后校验/刷新失败只作为 warning 返回，不触发组件回滚；
 * - 补偿结果无法确认时通过 SyncLayoutAndViewError(manualCheckRequired=true) 通知调用方。
 */
export async function syncLayoutAndView(
    plugin: Plugin,
    surface: DeviceViewSurface = "desktop-homepage",
    layoutMutator: (layout: WidgetLayoutData) => WidgetLayoutData,
    viewMutator: (config: Record<string, unknown>) => Record<string, unknown>,
    expectedSnapshot?: CoordinatedSnapshot,
): Promise<SyncLayoutAndViewResult> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    const queueKey = `${context.scopeId}:${surface}`;
    return inSurfaceTransaction(queueKey, () => syncLayoutAndViewInTransaction(
        context,
        layoutMutator,
        viewMutator,
        expectedSnapshot,
    ));
}

function haveSameWidgetIds(left: unknown, right: unknown): boolean {
    const leftIds = normalizeLayoutItems(left).map((item) => item.id);
    const rightIds = normalizeLayoutItems(right).map((item) => item.id);
    return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function getProfileSection(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionId: string | null,
): WidgetLayoutProfileSectionData | null {
    const normalizedSectionId = normalizeSectionId(sectionId);
    if (!normalizedSectionId) return null;
    return getDeviceProfile(layout, deviceId)?.sections?.[normalizedSectionId] || null;
}

function getSectionWidgetIds(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionId: string | null,
): string[] {
    return [...(getProfileSection(layout, deviceId, sectionId)?.widgetIds || [])];
}

/** 从全局 order 中过滤出指定分栏的成员，保持全局顺序。 */
function getSectionOrderForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionId: string | null,
): LayoutItem[] {
    const normalizedSectionId = normalizeSectionId(sectionId);
    if (!normalizedSectionId) return [];
    const memberIds = new Set(getSectionWidgetIds(layout, deviceId, normalizedSectionId));
    return normalizeLayoutItems(getDeviceProfile(layout, deviceId)?.order || layout?.order)
        .filter((item) => memberIds.has(item.id))
        .map((item, index) => ({ ...item, index }));
}

function getLayoutOrderForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null
): LayoutItem[] {
    if (!layout) return [];
    if (deviceId && layout.profiles?.[deviceId]?.order) {
        return normalizeLayoutItems(layout.profiles[deviceId].order);
    }
    return normalizeLayoutItems(layout.order);
}

function getEffectiveHomepageOrderForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): LayoutItem[] {
    const activeSectionId = normalizeSectionId(sectionId) ?? getActiveSectionIdFromLayout(layout, deviceId);
    if (sectionsEnabled && activeSectionId) {
        return getSectionOrderForDevice(layout, deviceId, activeSectionId);
    }
    return getLayoutOrderForDevice(layout, deviceId);
}

// ---------------------------------------------------------------------------
// 统一有效 columns/gap 解析
// ---------------------------------------------------------------------------

export const DEFAULT_WIDGET_LAYOUT_NUMBER = 4;
export const DEFAULT_WIDGET_GAP = 0.2;

export interface EffectiveWidgetLayoutSettings {
    widgetLayoutNumber: number;
    widgetGap: number;
    /** 来源说明，仅用于日志，不写入存储。 */
    source: string;
}

/**
 * 纯函数：解析当前设备在指定模式下的有效 columns/gap。
 *
 * 回退链（每个字段独立）：
 * - 分栏模式：section → profile → layout 顶层 → 运行时默认值
 * - 非分栏模式：profile → layout 顶层 → 运行时默认值
 *
 * undefined 表示继承下一层；显式存在但非法则报错。
 */
export function resolveEffectiveWidgetLayoutSettings(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
): EffectiveWidgetLayoutSettings {
    const sectionsEnabled = options.sectionsEnabled === true;
    const profile = getDeviceProfile(layout, deviceId);

    let sectionColumns: number | undefined;
    let sectionGap: number | undefined;
    let resolvedSectionId: string | null = null;

    if (sectionsEnabled) {
        resolvedSectionId = normalizeSectionId(options.sectionId) ?? getActiveSectionIdFromLayout(layout, deviceId);
        if (resolvedSectionId) {
            const section = getProfileSection(layout, deviceId, resolvedSectionId);
            sectionColumns = section?.widgetLayoutNumber;
            sectionGap = section?.widgetGap;
        }
    }

    const widgetLayoutNumber = resolveLayoutField(
        sectionColumns,
        profile?.widgetLayoutNumber,
        layout?.widgetLayoutNumber,
        DEFAULT_WIDGET_LAYOUT_NUMBER,
        validateColumnsValue,
        sectionsEnabled && resolvedSectionId ? `分栏 ${resolvedSectionId} 列数` : "主页列数",
    );
    const widgetGap = resolveLayoutField(
        sectionGap,
        profile?.widgetGap,
        layout?.widgetGap,
        DEFAULT_WIDGET_GAP,
        validateGapValue,
        sectionsEnabled && resolvedSectionId ? `分栏 ${resolvedSectionId} 间距` : "主页间距",
    );

    let source = "default";
    if (sectionsEnabled && resolvedSectionId && (sectionColumns !== undefined || sectionGap !== undefined)) {
        source = `device section (${deviceId}/${resolvedSectionId})`;
    } else if (profile?.widgetLayoutNumber !== undefined || profile?.widgetGap !== undefined) {
        source = `device profile (${deviceId})`;
    } else if (layout?.widgetLayoutNumber !== undefined || layout?.widgetGap !== undefined) {
        source = "global";
    }

    return { widgetLayoutNumber, widgetGap, source };
}

function validateColumnsValue(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new Error(`${label}显式存在但无效（需为正整数），无法解析布局目标`);
    }
    return value;
}

function validateGapValue(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`${label}显式存在但无效（需为有限非负数），无法解析布局目标`);
    }
    return value;
}

function resolveLayoutField(
    sectionValue: number | undefined,
    profileValue: number | undefined,
    topLevelValue: number | undefined,
    defaultValue: number,
    validate: (value: unknown, label: string) => number,
    label: string,
): number {
    if (sectionValue !== undefined) return validate(sectionValue, label);
    if (profileValue !== undefined) return validate(profileValue, label);
    if (topLevelValue !== undefined) return validate(topLevelValue, label);
    return defaultValue;
}

function getWidgetLayoutNumberForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): number {
    return resolveEffectiveWidgetLayoutSettings(layout, deviceId, { sectionsEnabled, sectionId }).widgetLayoutNumber;
}

function getWidgetGapForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): number {
    return resolveEffectiveWidgetLayoutSettings(layout, deviceId, { sectionsEnabled, sectionId }).widgetGap;
}

/**
 * Normalize widget config data from storage.
 * - If raw is a string, try JSON.parse; return object on success.
 * - If raw is already an object, return it directly.
 * - Otherwise return null.
 */
export function normalizeWidgetConfigData(raw: unknown): Record<string, unknown> | null {
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            // not valid JSON string
        }
        return null;
    }
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        if (isStorageApiError(raw)) return null;
        return raw as Record<string, unknown>;
    }
    return null;
}

// 音乐播放器运行态字段：这些字段只影响本地播放体验，不应影响主页同步刷新签名
const MUSIC_PLAYER_RUNTIME_FIELDS = new Set([
    "currentTrackIndex",
    "currentTime",
    "duration",
    "isPlaying",
    "isMuted",
    "volume",
    "playMode",
    "metadataCache",
    "lyricsCache",
    "coverCache",
    "sortMode",
    "sortDirection",
    "viewMode",
    "selectedPlaylistId",
    "favoriteTrackKeys",
    "playlists",
]);

function isMusicPlayerWidgetType(normalized: Record<string, unknown>): boolean {
    if (normalized.type === "musicPlayer") return true;
    if (normalized.contentType === "musicPlayer") return true;
    const data = normalized.data;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        const dataRecord = data as Record<string, unknown>;
        if (dataRecord.type === "musicPlayer") return true;
        if (dataRecord.contentType === "musicPlayer") return true;
    }
    return false;
}

function filterMusicPlayerRuntimeFields(obj: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        if (!MUSIC_PLAYER_RUNTIME_FIELDS.has(key)) {
            filtered[key] = obj[key];
        }
    }
    return filtered;
}

const SHARED_BUSINESS_SIGNATURE_FIELDS = new Set([
    "records", "items", "events", "tasks", "bills", "transactions", "sessions",
    "entries", "documents", "cachedData", "html", "updatedAt", "lastSeenAt",
]);

function stripSharedBusinessSignatureFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripSharedBusinessSignatureFields);
    if (!value || typeof value !== "object") return value;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (SHARED_BUSINESS_SIGNATURE_FIELDS.has(key)) continue;
        result[key] = stripSharedBusinessSignatureFields(child);
    }
    return result;
}

/**
 * 归一化 widget 配置用于主页同步签名。
 * 对 musicPlayer 类型过滤运行态字段，避免切歌、调音量等本地操作触发主页热刷新。
 * 其它 widget 保持原样。
 */
export function normalizeWidgetConfigForHomepageSignature(raw: unknown): unknown {
    const normalized = normalizeWidgetConfigData(raw);
    if (!normalized) return null;

    if (isMusicPlayerWidgetType(normalized)) {
        // 历史配置可能把运行态字段放在顶层，兜底过滤；只影响签名，不修改保存数据
        const topFiltered = filterMusicPlayerRuntimeFields(normalized);

        const rawData = normalized.data;
        if (typeof rawData === "object" && rawData !== null && !Array.isArray(rawData)) {
            const data = filterMusicPlayerRuntimeFields(rawData as Record<string, unknown>);
            return stripSharedBusinessSignatureFields({ ...topFiltered, data });
        }

        return stripSharedBusinessSignatureFields(topFiltered);
    }

    return stripSharedBusinessSignatureFields(normalized);
}

/**
 * 计算音乐播放器相关的布局/静态配置签名。
 * 用于主页热刷新失败自愈时判断：若该签名未变，说明变化与音乐播放器布局/静态配置无关，
 * 可优先不整页重建，避免打断播放。
 */
export async function computeMusicPlayerAffectingSignature(
    plugin: Plugin,
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): Promise<string> {
    const activeSectionId = sectionsEnabled
        ? (normalizeSectionId(sectionId) ?? getActiveSectionIdFromLayout(layout, deviceId))
        : null;
    const effectiveOrder = getEffectiveHomepageOrderForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const widgetLayoutNumber = getWidgetLayoutNumberForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const widgetGap = getWidgetGapForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const layoutPart = {
        activeSectionId,
        order: effectiveOrder.map((item) => ({ id: item.id, style: item.style })),
        widgetLayoutNumber,
        widgetGap,
    };

    const musicWidgetSigs: string[] = [];
    for (const item of effectiveOrder) {
        try {
            const content = await loadWidgetConfigWithRetry(plugin, item.id, "desktop-homepage");
            const normalized = normalizeWidgetConfigForHomepageSignature(content);
            if (normalized && isMusicPlayerWidgetType(normalized as Record<string, unknown>)) {
                musicWidgetSigs.push(`${item.id}:${JSON.stringify(normalized)}`);
            }
        } catch {
            // 单个 widget 读取失败不影响整体判断
        }
    }

    return `layout:${JSON.stringify(layoutPart)}|musicWidgets:${musicWidgetSigs.join(",")}`;
}

/**
 * Convert widget config data to a JSON string suitable for mountWidgetContent.
 * Handles both string-stored and object-stored data without double-stringifying.
 * Returns null if the data cannot be normalized.
 */
export function stringifyWidgetConfigForMount(raw: unknown): string | null {
    const normalized = normalizeWidgetConfigData(raw);
    if (!normalized) return null;
    try {
        return JSON.stringify(normalized);
    } catch {
        return null;
    }
}

function reindexLayoutItems(items: LayoutItem[]): LayoutItem[] {
    return items.map((item, index) => ({ ...item, index }));
}

function removeWidgetFromOrder(order: LayoutItem[], widgetId: string): LayoutItem[] {
    // 从全局 order 删除组件后必须重新编号，否则设备布局严格验证会拒绝提交。
    return reindexLayoutItems(order.filter(item => item.id !== widgetId));
}

/**
 * 将组件片段插入全局 order 的指定位置。
 * 保留其他组件的相对顺序，并重新编号。
 */
function spliceItemsIntoGlobalOrder(
    globalOrder: LayoutItem[],
    insertIndex: number,
    items: LayoutItem[],
): LayoutItem[] {
    const before = globalOrder.slice(0, insertIndex);
    const after = globalOrder.slice(insertIndex);
    const insertedIds = new Set(items.map((item) => item.id));
    const filteredAfter = after.filter((item) => !insertedIds.has(item.id));
    return reindexLayoutItems([...before, ...items, ...filteredAfter]);
}

/**
 * 获取分栏在全局 order 中的连续片段边界（含）。
 * 返回 null 表示该分栏在全局 order 中没有成员。
 */
function findSectionSliceBounds(
    globalOrder: LayoutItem[],
    widgetIds: string[],
): { start: number; end: number } | null {
    if (widgetIds.length === 0) return null;
    const memberSet = new Set(widgetIds);
    const positions = globalOrder
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => memberSet.has(item.id))
        .map(({ index }) => index);
    if (positions.length === 0) return null;
    return { start: positions[0], end: positions[positions.length - 1] };
}

/**
 * 更新分栏片段在全局 order 中的顺序。
 * 保持分栏片段连续，并用新的顺序替换该片段内容。
 */
function updateSectionSliceOrder(
    globalOrder: LayoutItem[],
    sectionWidgetIds: string[],
    newSectionOrder: LayoutItem[],
): LayoutItem[] {
    const bounds = findSectionSliceBounds(globalOrder, sectionWidgetIds);
    if (!bounds) {
        // 分栏尚未在全局 order 中：追加到末尾（初始化场景）
        return reindexLayoutItems([...globalOrder, ...newSectionOrder]);
    }
    return spliceItemsIntoGlobalOrder(globalOrder, bounds.start, newSectionOrder);
}


export async function saveLayoutForContainer(
    plugin: Plugin,
    options: SaveLayoutOptions,
): Promise<boolean> {
    const container = options.containerEl || document.querySelector(options.containerSelector);
    if (!container) return false;

    if (
        options.layoutFileName === "desktop-homepage" &&
        container instanceof HTMLElement &&
        container.dataset.layoutRestoreState &&
        container.dataset.layoutRestoreState !== "ready"
    ) {
        return false;
    }

    const committedWidgetIdSet = new Set<string>(
        (options.committedWidgetIds || []).filter((id) => typeof id === "string" && id.trim()),
    );

    const currentOrder: LayoutItem[] = Array.from(container.children)
        .filter((el): el is HTMLElement => (
            el instanceof HTMLElement
            && el.classList.contains("widget-block")
            && Boolean(el.id)
            && (el.dataset.widgetDraft !== "true" || committedWidgetIdSet.has(el.id))
        ))
        .map((widgetBlockElement, index) => ({
            id: widgetBlockElement.id,
            style: sanitizeLayoutStyle(widgetBlockElement.getAttribute("style"), container),
            index,
        }));

    const sectionId = normalizeSectionId(options.sectionId);
    const sectionsEnabled = options.sectionsEnabled === true;

    try {
        const fixedContext = options.deviceViewContext ?? await getReadyContext(plugin, options.layoutFileName);
        await updateCurrentDeviceLayout(fixedContext, (layout, fixedDeviceId) => {
            if (!isDesktopDeviceProfileEnabled()) {
                return {
                    ...layout,
                    order: reindexLayoutItems(currentOrder),
                };
            }

            const deviceId = fixedDeviceId;

            const profile = ensureDeviceProfile(layout, deviceId);
            let nextGlobalOrder = normalizeLayoutItems(profile.order || layout.order);

            if (sectionsEnabled) {
                if (!sectionId) {
                    // 分栏模式开启但 sectionId 无效：拒绝降级为全局保存，保持原布局。
                    throw new LayoutMutationCancelError("分栏模式开启但 sectionId 无效，拒绝保存");
                }

                const sections: Record<string, WidgetLayoutProfileSectionData> = { ...(profile.sections || {}) };
                const section = sections[sectionId];
                if (!section) {
                    // 幽灵分栏：分栏已被删除或从未存在，禁止隐式创建，取消本次保存。
                    throw new LayoutMutationCancelError(`分栏 ${sectionId} 不存在`);
                }
                const currentIds = currentOrder.map((item) => item.id);

                // 校验 committedWidgetIds：必须真实存在于当前容器 DOM 中。
                for (const id of committedWidgetIdSet) {
                    if (!currentIds.includes(id)) {
                        throw new LayoutMutationCancelError(`新组件 ${id} 不在当前容器 DOM 中`);
                    }
                }

                // 更新分栏成员：保留仍在容器中的成员，移除已不在的，按容器顺序去重。
                const existingMemberSet = new Set(section.widgetIds);
                const nextWidgetIds: string[] = [];
                for (const id of currentIds) {
                    if (!nextWidgetIds.includes(id)) nextWidgetIds.push(id);
                }
                for (const id of section.widgetIds) {
                    if (!nextWidgetIds.includes(id) && existingMemberSet.has(id)) nextWidgetIds.push(id);
                }

                const orderIds = new Set(nextGlobalOrder.map((item) => item.id));

                // section-only ID 检测：非 committed 的成员存在于 sections 但不在 global order 时，
                // 视为同步不完整或布局异常，禁止补造 { id, style: null }。
                const missingMemberIds = nextWidgetIds.filter((id) => !orderIds.has(id) && !committedWidgetIdSet.has(id));
                if (missingMemberIds.length > 0) {
                    throw new LayoutMutationCancelError(
                        `分栏 ${sectionId} 包含未在全局 order 中的成员：${missingMemberIds.join(", ")}`,
                    );
                }

                // committed widgets 如果已在 global order，必须归属当前分栏。
                const otherSectionMemberIds = new Set<string>();
                for (const [sid, sec] of Object.entries(sections)) {
                    if (sid === sectionId) continue;
                    for (const id of sec.widgetIds) otherSectionMemberIds.add(id);
                }
                for (const id of committedWidgetIdSet) {
                    if (orderIds.has(id) && otherSectionMemberIds.has(id)) {
                        throw new LayoutMutationCancelError(`新组件 ${id} 已归属其他分栏`);
                    }
                }

                sections[sectionId] = {
                    ...section,
                    widgetIds: nextWidgetIds,
                };

                // 保持分栏片段连续，并用当前 DOM 顺序替换片段。
                nextGlobalOrder = updateSectionSliceOrder(nextGlobalOrder, nextWidgetIds, reindexLayoutItems(currentOrder));

                // 统一调用分栏规范化 helper，确保片段连续并执行不变量校验。
                const normalized = rearrangeGlobalOrderBySections(
                    nextGlobalOrder,
                    sections,
                    Object.keys(sections),
                    { assignOrphansToFirstSection: true },
                );

                // 保存完成后再次执行完整分栏不变量校验。
                try {
                    assertSectionLayoutInvariants(
                        normalized.nextGlobalOrder,
                        normalized.nextSections,
                        Object.keys(sections),
                        { requireAllAssigned: true },
                    );
                } catch (error) {
                    throw new LayoutMutationCancelError(
                        `保存后分栏不变量校验失败：${error instanceof Error ? error.message : String(error)}`,
                    );
                }

                return {
                    ...layout,
                    order: normalized.nextGlobalOrder,
                    profiles: {
                        ...(layout.profiles || {}),
                        [deviceId]: {
                            ...profile,
                            activeSectionId: sectionId,
                            order: normalized.nextGlobalOrder,
                            sections: normalized.nextSections,
                        },
                    },
                };
            }

            // 非分栏模式：直接保存为全局顺序。
            nextGlobalOrder = reindexLayoutItems(currentOrder);
            return {
                ...layout,
                order: nextGlobalOrder,
                profiles: {
                    ...(layout.profiles || {}),
                    [deviceId]: {
                        ...profile,
                        order: nextGlobalOrder,
                    },
                },
            };
        });
    } catch (error) {
        if (error instanceof LayoutMutationCancelError) {
            if (container instanceof HTMLElement) {
                container.dataset.layoutRestoreState = "incomplete";
            }
            return false;
        }
        throw error;
    }

    return true;
}

async function findMissingComponents(
    context: DeviceViewContext,
    deviceOrder: LayoutItem[],
    defaultOrder: LayoutItem[]
): Promise<LayoutItem[]> {
    if (defaultOrder.length === 0) {
        return [];
    }

    const deviceOrderIds = new Set(deviceOrder.map(item => item.id));
    const missingItems: LayoutItem[] = [];

    for (const item of defaultOrder) {
        if (!deviceOrderIds.has(item.id)) {
            const widgetDocument = await readWidgetInstanceDocument(context, item.id);
            if (widgetDocument) {
                missingItems.push(item);
            }
        }
    }

    return missingItems;
}

async function reconcileDeviceOrder(
    context: DeviceViewContext,
    deviceOrder: LayoutItem[],
    defaultOrder: LayoutItem[],
    layoutFileName: string,
): Promise<{ order: LayoutItem[]; hasChanges: boolean }> {
    // 只对当前设备桌面主页启用补齐逻辑。
    if (layoutFileName !== "desktop-homepage") {
        return { order: deviceOrder, hasChanges: false };
    }

    const missingItems = await findMissingComponents(context, deviceOrder, defaultOrder);

    if (missingItems.length === 0) {
        return { order: deviceOrder, hasChanges: false };
    }

    const reconciledOrder = [...deviceOrder, ...missingItems];
    return { order: reconciledOrder, hasChanges: true };
}

function recoverGridSpanFromWidgetConfig(
    style: string | null,
    contentData: unknown,
    fallbackStyle: string | null = null,
): string | null {
    const sanitizedStyle = style?.trim() || "";
    const hasColumnSpan = /grid-column(?:-end)?\s*:\s*span\s+\d+/i.test(sanitizedStyle);
    const hasRowSpan = /grid-row(?:-end)?\s*:\s*span\s+\d+/i.test(sanitizedStyle);
    if (hasColumnSpan && hasRowSpan) return style;

    const config = normalizeWidgetConfigData(contentData);
    let rowSize = Number(config?.rowSize);
    let colSize = Number(config?.colSize);
    if (!Number.isInteger(rowSize) || rowSize < 1) {
        rowSize = Number(fallbackStyle?.match(/grid-row(?:-end)?\s*:\s*span\s+(\d+)/i)?.[1]);
    }
    if (!Number.isInteger(colSize) || colSize < 1) {
        colSize = Number(fallbackStyle?.match(/grid-column(?:-end)?\s*:\s*span\s+(\d+)/i)?.[1]);
    }
    if (!Number.isInteger(rowSize) || rowSize < 1 || !Number.isInteger(colSize) || colSize < 1) {
        return style;
    }

    const declarations = [sanitizedStyle.replace(/;?\s*$/, "")];
    if (!hasColumnSpan) declarations.push(`grid-column: span ${colSize}`);
    if (!hasRowSpan) declarations.push(`grid-row: span ${rowSize}`);
    return declarations.filter(Boolean).join(";") + ";";
}

function destroyWidgetElement(element: HTMLElement): void {
    try {
        (element as any).__widgetBlockInstance?.destroy?.();
    } catch {
        // 单个实例销毁失败不阻止其余组件恢复。
    }
    element.remove();
}

function isWidgetVisibleForDeviceAnywhere(
    layout: WidgetLayoutData,
    deviceId: string | null,
    widgetId: string,
    sectionsEnabled: boolean,
): boolean {
    if (!sectionsEnabled) {
        return getLayoutOrderForDevice(layout, deviceId).some((item) => item.id === widgetId);
    }
    const profile = getDeviceProfile(layout, deviceId);
    if (!profile) return false;
    return Object.values(profile.sections || {}).some((section) => section.widgetIds.includes(widgetId));
}

function cleanupInvisiblePreservedWidgets(
    layout: WidgetLayoutData,
    deviceId: string | null,
    sectionsEnabled: boolean,
    preservedElements: Map<string, HTMLElement> | undefined,
): void {
    if (!preservedElements) return;
    for (const [widgetId, element] of preservedElements) {
        if (isWidgetVisibleForDeviceAnywhere(layout, deviceId, widgetId, sectionsEnabled)) continue;
        preservedElements.delete(widgetId);
        destroyWidgetElement(element);
    }
}

function mergeRecoveryCandidates(candidates: LayoutItem[][]): LayoutItem[] {
    const merged: LayoutItem[] = [];
    const knownIds = new Set<string>();
    for (const candidate of candidates) {
        for (const item of candidate) {
            if (knownIds.has(item.id)) continue;
            knownIds.add(item.id);
            merged.push({ ...item, index: merged.length });
        }
    }
    return merged;
}

async function getSameHardwareHistoricalOrder(
    _plugin: Plugin,
    _layout: WidgetLayoutData,
    _deviceId: string | null,
    _sectionsEnabled: boolean,
    _sectionId: string,
): Promise<LayoutItem[]> {
    // 新结构只允许读取当前设备目录；旧硬件 profile 只在迁移器里用于一次性导入。
    return [];
}

async function repairCurrentProfileAfterCompleteRestore(
    plugin: Plugin,
    layoutFileName: DeviceViewSurface,
    deviceId: string,
    sectionsEnabled: boolean,
    _sectionId: string,
    finalOrder: LayoutItem[],
): Promise<boolean> {
    // 分栏模式下不得根据恢复结果自动写入分栏成员归属。
    // 分栏成员只能由显式用户操作或正式迁移修改。
    if (
        layoutFileName !== "desktop-homepage"
        || finalOrder.length === 0
        || sectionsEnabled
    ) {
        return false;
    }

    try {
        await updateCurrentDeviceLayout(await getReadyContext(plugin, layoutFileName), (layout) => {
            const profile = ensureDeviceProfile(layout, deviceId);
            const latestCurrentOrder = normalizeLayoutItems(profile.order);
            if (latestCurrentOrder.length > 0) return layout;

            const nextGlobalOrder = normalizeLayoutItems(profile.order || layout.order);
            return {
                ...layout,
                order: nextGlobalOrder,
                profiles: {
                    ...(layout.profiles || {}),
                    [deviceId]: {
                        ...profile,
                        order: reindexLayoutItems(finalOrder),
                    },
                },
            };
        });
        return true;
    } catch {
        return false;
    }
}

export async function restoreLayoutForContainer(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    options: RestoreLayoutOptions
): Promise<RestoreLayoutResult> {
    const container = options.containerEl;
    const finish = (
        status: RestoreLayoutStatus,
        layoutRevision: number,
        expectedIds: readonly string[],
        reason?: string,
        failedWidgetIds: readonly string[] = [],
        unresolvedWidgetIds: readonly string[] = [],
        structuralComplete = status !== "fatal",
        failureKind?: "structure" | "widget-read",
    ): RestoreLayoutResult => {
        if (status !== "fatal" && container instanceof HTMLElement) {
            container.dataset.layoutRestoreState = status === "complete" ? "ready" : status;
            container.dataset.layoutExpectedWidgetIds = JSON.stringify(expectedIds);
        }
        return {
            status,
            layoutRevision,
            expectedIds: [...expectedIds],
            failedWidgetIds: [...failedWidgetIds],
            unresolvedWidgetIds: [...unresolvedWidgetIds],
            structuralComplete,
            ...(failureKind ? { failureKind } : {}),
            ...(reason ? { reason } : {}),
        };
    };
    if (!container) return finish("fatal", 0, [], "目标组件容器不存在");

    const deviceViewContext = options.deviceViewContext ?? await getReadyContext(plugin, options.layoutFileName);
    if (deviceViewContext.surface !== options.layoutFileName) {
        return finish("fatal", 0, [], "恢复 context 与 surface 不一致");
    }
    let layoutSnapshot: LayoutSnapshot;
    try {
        layoutSnapshot = await loadLayoutSnapshotForContext(deviceViewContext, {
            assumeReady: Boolean(options.deviceViewContext),
        });
    } catch (error) {
        return finish(
            "fatal",
            0,
            [],
            `布局快照读取失败：${error instanceof Error ? error.message : String(error)}`,
        );
    }
    const layoutRevision = layoutSnapshot.revision;
    let layout: WidgetLayoutData | null = layoutSnapshot.layout;
    if (
        options.expectedLayoutRevision !== undefined
        && options.expectedLayoutRevision !== layoutRevision
    ) {
        return finish("fatal", layoutRevision, [], "布局 revision 在恢复前发生变化");
    }
    if (options.expectedWidgetIds) {
        const profile = layout.profiles?.[deviceViewContext.scopeId];
        const sectionId = normalizeSectionId(options.sectionId);
        const currentExpectedIds = options.sectionsEnabled && sectionId
            ? [...(profile?.sections?.[sectionId]?.widgetIds || [])]
            : normalizeLayoutItems(profile?.order || layout.order).map((item) => item.id);
        if (!haveSameWidgetIds(currentExpectedIds, [...options.expectedWidgetIds])) {
            return finish("fatal", layoutRevision, currentExpectedIds, "分栏成员在恢复前发生变化");
        }
    }

    // 获取当前设备 ID
    const deviceId = deviceViewContext.scopeId;
    const sectionsEnabled = options.sectionsEnabled === true;
    const sectionId = normalizeSectionId(options.sectionId || getActiveSectionIdFromLayout(layout, deviceId));

    const currentProfile = getDeviceProfile(layout, deviceId);
    const sectionModeActive = sectionsEnabled && Boolean(sectionId);
    const activeSectionExists = sectionModeActive && Boolean(getProfileSection(layout, deviceId, sectionId));

    // 分栏模式下必须先取得最新 profile.sections、有效 activeSectionId、当前分栏原始 widgetIds 和当前设备全局 order。
    // 严格区分合法空分栏与声明成员不完整：sections 只保存成员关系，不能凭空创造组件。
    if (sectionsEnabled && !sectionId) {
        // 规则 1：分栏模式开启但 sectionId 为空，属于同步不完整。
        return finish("fatal", layoutRevision, [], "分栏模式缺少目标 sectionId");
    }

    if (sectionsEnabled && sectionId && !activeSectionExists) {
        // 规则 2：sectionId 不存在于最新 sections，保持 incomplete 处理。
        return finish("fatal", layoutRevision, [], "目标分栏不存在于最新布局");
    }

    // 在确定分栏模式后再决定是否扫描全量组件文件 inventory。
    // 分栏模式：只读取 layout，不扫描其他分栏组件；无分栏模式保留现有 inventory、历史回退和完整全局恢复逻辑。
    let inventory: StoredWidgetInventory;
    if (!sectionModeActive || !activeSectionExists) {
        try {
            inventory = await scanStoredWidgetInventory(plugin, layout, options.layoutFileName, deviceViewContext);
        } catch (error) {
            return finish(
                "fatal",
                layoutRevision,
                [],
                `组件清单读取失败：${error instanceof Error ? error.message : String(error)}`,
            );
        }
    } else {
        inventory = {
            items: [],
            layoutFilePresent: layout !== null,
            complete: true,
            signature: "",
        };
    }

    const layoutFileWasPresent = inventory.layoutFilePresent;
    if (!layout && inventory.items.length === 0) {
        container.dataset.layoutUnresolvedWidgetIds = "[]";
        return finish("complete", layoutRevision, []);
    }

    if (!layout) {
        layout = { order: inventory.items, profiles: {} };
    }

    const currentProfileOrder = sectionsEnabled
        ? getSectionOrderForDevice(layout, deviceId, sectionId)
        : normalizeLayoutItems(currentProfile?.order || layout.order);

    // 规则 3/4：分栏模式下，在读取组件文件前对完整 profile 执行只读校验。
    // 使用当前设备全局 order、profile.sections 稳定顺序和 assertSectionLayoutInvariants(requireAllAssigned=true)。
    // 失败时标记 incomplete，不读取组件文件，不自动修复布局。
    if (sectionModeActive && activeSectionExists) {
        if (!validateFullProfileSectionsReadOnly(layout, deviceId, sectionId)) {
            return finish("fatal", layoutRevision, [], "分栏布局不变量校验失败");
        }
    }

    // 获取 defaultOrder 用于跨设备同步
    const defaultOrder = sectionsEnabled
        ? getSectionOrderForDevice(layout, deviceId, sectionId)
        : getLayoutOrderForDevice(layout, deviceId);
    const globalDefaultOrder = getLayoutOrderForDevice(layout, deviceId);

    let finalOrder: LayoutItem[];
    if (sectionModeActive && activeSectionExists) {
        // 分栏模式开启且 activeSectionId 有效时：finalOrder 只能来自当前活动分栏。
        // 合法空分栏就是空布局，不回退 globalDefaultOrder、inventory 或其他分栏。
        finalOrder = currentProfileOrder;
    } else {
        // 无分栏模式保持原有恢复回退链。
        const historicalOrder = currentProfileOrder.length === 0
            ? await getSameHardwareHistoricalOrder(plugin, layout, deviceId, sectionsEnabled, sectionId || "")
            : [];
        const primaryDefaultOrder = defaultOrder.length > 0 ? defaultOrder : globalDefaultOrder;
        finalOrder = mergeRecoveryCandidates([
            currentProfileOrder,
            ...(currentProfileOrder.length === 0 ? [historicalOrder] : []),
            ...(currentProfileOrder.length === 0 && historicalOrder.length === 0 ? [primaryDefaultOrder] : []),
            ...(currentProfileOrder.length === 0 && historicalOrder.length === 0 && primaryDefaultOrder.length === 0
                ? [inventory.items]
                : []),
        ]);
    }

    // 当前设备已有顺序时，仍补齐同步新增到当前 default 绑定、且未被本机隐藏的组件。
    // 分栏模式下 finalOrder 已限定当前分栏，不执行跨分栏补齐。
    if (deviceId && currentProfileOrder.length > 0 && !sectionModeActive) {
        try {
            const reconcileResult = await reconcileDeviceOrder(
                deviceViewContext,
                finalOrder,
                defaultOrder,
                options.layoutFileName,
            );
            finalOrder = reconcileResult.order;
        } catch (error) {
            return finish(
                "fatal",
                layoutRevision,
                finalOrder.map((item) => item.id),
                `组件顺序对账失败：${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    const expectedEvidenceIds = new Set<string>();
    if (sectionModeActive) {
        // 分栏模式下只以当前活动分栏的明确引用作为存在性证据。
        currentProfileOrder.forEach((item) => expectedEvidenceIds.add(item.id));
    } else {
        currentProfileOrder.forEach((item) => expectedEvidenceIds.add(item.id));
        globalDefaultOrder.forEach((item) => expectedEvidenceIds.add(item.id));
        inventory.items.forEach((item) => expectedEvidenceIds.add(item.id));
        collectReferencedWidgetIds(layout).forEach((id) => expectedEvidenceIds.add(id));
    }
    const manifest = await readDeviceViewManifest(deviceViewContext);
    if (!manifest) {
        return finish("fatal", layoutRevision, [], "设备视图 manifest 缺失");
    }
    const unresolvedLegacyWidgetIds = new Set(manifest.migration.unresolvedLegacyWidgetIds ?? []);
    const runtimeOrder = finalOrder.filter((item) => !unresolvedLegacyWidgetIds.has(item.id));
    const currentSectionUnresolvedWidgetIds = new Set(
        finalOrder
            .map((item) => item.id)
            .filter((id) => unresolvedLegacyWidgetIds.has(id)),
    );
    const unresolvedWidgetIdsJson = JSON.stringify([...currentSectionUnresolvedWidgetIds]);
    const transactionDeclaredWidgetIds = sectionModeActive && sectionId
        ? [...(currentProfile?.sections?.[sectionId]?.widgetIds ?? [])]
        : normalizeLayoutItems(currentProfile?.order || layout.order).map((item) => item.id);
    const transactionRenderableWidgetIds = runtimeOrder.map((item) => item.id);
    const transactionTargetWidgetIds = finalOrder.map((item) => item.id);
    const transactionUnresolvedWidgetIds = transactionTargetWidgetIds
        .filter((id) => unresolvedLegacyWidgetIds.has(id));
    const rebuildWidgetDocuments = new Map<string, {
        revision: number;
        config: Record<string, unknown>;
    }>();
    const haveSameOrderedStrings = (left: readonly string[], right: readonly string[]): boolean => (
        left.length === right.length && left.every((value, index) => value === right[index])
    );
    const verifyRestoreDataSnapshot = async (): Promise<string | null> => {
        try {
            const latestSnapshot = await loadLayoutSnapshotForContext(deviceViewContext, { assumeReady: true });
            if (latestSnapshot.revision !== layoutRevision) {
                return "布局 revision 在恢复事务中发生变化";
            }
            const latestProfile = latestSnapshot.layout.profiles?.[deviceId];
            const latestDeclaredWidgetIds = sectionModeActive && sectionId
                ? [...(latestProfile?.sections?.[sectionId]?.widgetIds ?? [])]
                : normalizeLayoutItems(latestProfile?.order || latestSnapshot.layout.order).map((item) => item.id);
            if (!haveSameOrderedStrings(latestDeclaredWidgetIds, transactionDeclaredWidgetIds)) {
                return "目标组件 declared 成员或顺序在恢复事务中发生变化";
            }
            const latestManifest = await readDeviceViewManifest(deviceViewContext);
            if (!latestManifest) return "设备视图 manifest 在恢复事务中缺失";
            const latestUnresolved = new Set(latestManifest.migration.unresolvedLegacyWidgetIds ?? []);
            const latestTargetUnresolved = transactionTargetWidgetIds.filter((id) => latestUnresolved.has(id));
            if (!haveSameOrderedStrings(latestTargetUnresolved, transactionUnresolvedWidgetIds)) {
                return "目标组件 unresolved 集合在恢复事务中发生变化";
            }
            const latestRenderable = transactionTargetWidgetIds.filter((id) => !latestUnresolved.has(id));
            if (!haveSameOrderedStrings(latestRenderable, transactionRenderableWidgetIds)) {
                return "目标组件 renderable 集合在恢复事务中发生变化";
            }
            for (const [widgetId, expectedDocument] of rebuildWidgetDocuments) {
                const latestDocument = await readWidgetInstanceDocument(deviceViewContext, widgetId);
                if (
                    !latestDocument
                    || latestDocument.revision !== expectedDocument.revision
                    || !hasSameJsonSemantic(latestDocument.config, expectedDocument.config)
                ) {
                    return `组件 ${widgetId} 文档在恢复事务中发生变化`;
                }
            }
            return null;
        } catch (error) {
            return `恢复数据复核失败：${error instanceof Error ? error.message : String(error)}`;
        }
    };
    interface RuntimeOptionTransactionEntry {
        instance: {
            getRuntimeOptionsSnapshot: () => Record<string, unknown>;
            updateRuntimeOptions: (runtimeOptions: Record<string, unknown>) => Promise<void>;
        };
        previousOptions: Record<string, unknown>;
        nextOptions: Record<string, unknown>;
    }
    const prepareRuntimeOptionTransaction = (
        instance: any,
        nextOptions: Record<string, unknown>,
    ): RuntimeOptionTransactionEntry | null => {
        if (!instance) return null;
        if (typeof instance.updateRuntimeOptions !== "function") {
            throw new Error("组件实例缺少严格 runtime options 更新能力");
        }
        if (typeof instance.getRuntimeOptionsSnapshot !== "function") {
            throw new Error("健康组件缺少可回滚的 runtime options 快照能力");
        }
        const previousOptions = instance.getRuntimeOptionsSnapshot();
        if (!previousOptions || typeof previousOptions !== "object" || Array.isArray(previousOptions)) {
            throw new Error("健康组件返回了无效的 runtime options 快照");
        }
        return { instance, previousOptions, nextOptions };
    };
    const rollbackRuntimeOptionTransactions = async (
        entries: readonly RuntimeOptionTransactionEntry[],
    ): Promise<string[]> => {
        const rollbackErrors: string[] = [];
        for (const entry of [...entries].reverse()) {
            try {
                await entry.instance.updateRuntimeOptions(entry.previousOptions);
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
            }
        }
        return rollbackErrors;
    };
    const commitRuntimeOptionTransactions = async (
        entries: readonly RuntimeOptionTransactionEntry[],
    ): Promise<{ success: true } | { success: false; reason: string }> => {
        const committed: RuntimeOptionTransactionEntry[] = [];
        try {
            for (const entry of entries) {
                await entry.instance.updateRuntimeOptions(entry.nextOptions);
                committed.push(entry);
            }
            return { success: true };
        } catch (error) {
            const rollbackErrors = await rollbackRuntimeOptionTransactions(committed);
            const reason = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                reason: rollbackErrors.length > 0
                    ? `runtime options 提交失败：${reason}；反向恢复失败：${rollbackErrors.join("；")}`
                    : `runtime options 提交失败：${reason}`,
            };
        }
    };
    const domScope: HomepageWidgetDomScope = {
        componentSectionContainers: options.componentSectionContainers,
        preservedWidgetElements: options.preservedWidgetElements,
        currentContainer: container,
    };
    const scopedDom = enumerateHomepageWidgetElements(domScope);
    if (scopedDom.ownershipErrors.length > 0) {
        return finish(
            "fatal",
            layoutRevision,
            runtimeOrder.map((entry) => entry.id),
            scopedDom.ownershipErrors[0],
        );
    }
    const duplicateEntry = Array.from(scopedDom.elementsById.entries())
        .find(([, elements]) => elements.length > 1);
    if (duplicateEntry) {
        return finish(
            "fatal",
            layoutRevision,
            runtimeOrder.map((entry) => entry.id),
            `页面中存在重复组件 ${duplicateEntry[0]}`,
        );
    }
    const staleCleanup = cleanupStalePreservedWidgetEntries(scopedDom, options.preservedWidgetElements);
    if ("reason" in staleCleanup) {
        return finish("fatal", layoutRevision, runtimeOrder.map((entry) => entry.id), staleCleanup.reason);
    }
    const planBaselineDomSnapshot = captureHomepageWidgetDomSnapshot(domScope);
    const needsProfileRepair = Boolean(
        deviceId
        && finalOrder.length > 0
        && !haveSameWidgetIds(currentProfileOrder, finalOrder)
        && !sectionModeActive,
    );

    // 补齐后若仍为空：只有容器本来就是空的，才视为“尚未添加组件”。
    // 同步写盘期间可能短暂读到空 order，此时保留正在运行的组件并等待下一次有限重试。
    if (finalOrder.length === 0) {
        if (sectionModeActive) {
            type EmptySectionAction =
                | { kind: "move-owner"; element: HTMLElement; ownerContainer: HTMLElement; ownerSectionId: string }
                | { kind: "preserve"; element: HTMLElement }
                | { kind: "destroy-after-commit"; element: HTMLElement };
            const emptyPlan: EmptySectionAction[] = [];
            const emptyRuntimeTransactions: RuntimeOptionTransactionEntry[] = [];

            // 阶段 A：只读预检完整计划，不移动、不销毁、不写 Map。
            for (const child of getDirectWidgetElements(container)) {
                const ownerSectionId = Object.entries(currentProfile?.sections || {})
                    .find(([, section]) => section.widgetIds.includes(child.id))?.[0];
                if (ownerSectionId) {
                    const ownerContainer = options.componentSectionContainers?.get(ownerSectionId);
                    if (!ownerContainer || ownerContainer === container) {
                        return finish("fatal", layoutRevision, [], `组件 ${child.id} 的 owner container 不可用`);
                    }
                    emptyPlan.push({ kind: "move-owner", element: child, ownerContainer, ownerSectionId });
                    try {
                        const transaction = prepareRuntimeOptionTransaction(
                            (child as any).__widgetBlockInstance,
                            {
                                sectionsEnabled: true,
                                sectionId: ownerSectionId,
                                deviceViewContext,
                                componentSectionContainers: options.componentSectionContainers,
                                preservedWidgetElements: options.preservedWidgetElements,
                            },
                        );
                        if (transaction) emptyRuntimeTransactions.push(transaction);
                    } catch (error) {
                        return finish(
                            "fatal",
                            layoutRevision,
                            [],
                            error instanceof Error ? error.message : String(error),
                        );
                    }
                    continue;
                }
                if (isWidgetVisibleForDeviceAnywhere(layout, deviceId, child.id, sectionsEnabled)) {
                    const existing = options.preservedWidgetElements?.get(child.id);
                    if (!options.preservedWidgetElements) {
                        return finish("fatal", layoutRevision, [], "空分栏缺少 preserved Map");
                    }
                    if (existing && existing !== child) {
                        return finish("fatal", layoutRevision, [], `preserved Map 中已存在另一个组件实例 ${child.id}`);
                    }
                    emptyPlan.push({ kind: "preserve", element: child });
                    continue;
                }
                emptyPlan.push({ kind: "destroy-after-commit", element: child });
            }
            const firstDataRecheckError = await verifyRestoreDataSnapshot();
            if (firstDataRecheckError) {
                return finish("fatal", layoutRevision, [], firstDataRecheckError);
            }
            if (!matchesHomepageWidgetDomSnapshot(planBaselineDomSnapshot, domScope)) {
                return finish("fatal", layoutRevision, [], "空分栏提交前 DOM 已变化");
            }
            const plannedDomSnapshot = captureHomepageWidgetDomSnapshot(domScope);

            // 阶段 B：只执行可逆移动，旧实例暂不 destroy。
            const destroyAfterCommit: HTMLElement[] = [];
            for (const action of emptyPlan) {
                if (action.kind === "move-owner") {
                    action.ownerContainer.appendChild(action.element);
                    const cleared = clearPreservedWidgetElementAfterAppend(
                        action.element,
                        options.preservedWidgetElements,
                    );
                    if ("reason" in cleared) {
                        const rollback = restoreHomepageWidgetDomSnapshot(plannedDomSnapshot, domScope);
                        return finish(
                            "fatal",
                            layoutRevision,
                            [],
                            "reason" in rollback ? `${cleared.reason}；回滚失败：${rollback.reason}` : cleared.reason,
                        );
                    }
                } else if (action.kind === "preserve") {
                    const stored = storePreservedWidgetElement(action.element.id, action.element, domScope);
                    if ("reason" in stored) {
                        const rollback = restoreHomepageWidgetDomSnapshot(plannedDomSnapshot, domScope);
                        return finish(
                            "fatal",
                            layoutRevision,
                            [],
                            "reason" in rollback ? `${stored.reason}；回滚失败：${rollback.reason}` : stored.reason,
                        );
                    }
                } else {
                    action.element.remove();
                    destroyAfterCommit.push(action.element);
                }
            }
            const secondDataRecheckError = await verifyRestoreDataSnapshot();
            if (secondDataRecheckError) {
                const rollback = restoreHomepageWidgetDomSnapshot(plannedDomSnapshot, domScope);
                return finish(
                    "fatal",
                    layoutRevision,
                    [],
                    "reason" in rollback
                        ? `${secondDataRecheckError}；DOM 回滚失败：${rollback.reason}`
                        : secondDataRecheckError,
                );
            }
            const committedScope = enumerateHomepageWidgetElements(domScope);
            const committedDuplicate = Array.from(committedScope.elementsById.entries())
                .find(([, elements]) => elements.length > 1);
            const healthySnapshotsIntact = plannedDomSnapshot.runtimeStates.every((runtime) => (
                !runtime.healthy
                || (
                    (runtime.element as any).__widgetBlockInstance === runtime.instance
                    && (runtime.instance as any)?.hasMountedContent?.() === true
                )
            ));
            if (
                getDirectWidgetElements(container).length !== 0
                || committedScope.ownershipErrors.length > 0
                || committedDuplicate
                || !healthySnapshotsIntact
            ) {
                const rollback = restoreHomepageWidgetDomSnapshot(plannedDomSnapshot, domScope);
                return finish(
                    "fatal",
                    layoutRevision,
                    [],
                    "reason" in rollback ? `空分栏提交验证失败；回滚失败：${rollback.reason}` : "空分栏提交验证失败",
                );
            }

            const runtimeCommit = await commitRuntimeOptionTransactions(emptyRuntimeTransactions);
            if ("reason" in runtimeCommit) {
                const rollback = restoreHomepageWidgetDomSnapshot(plannedDomSnapshot, domScope);
                return finish(
                    "fatal",
                    layoutRevision,
                    [],
                    "reason" in rollback
                        ? `${runtimeCommit.reason}；DOM 回滚失败：${rollback.reason}`
                        : runtimeCommit.reason,
                );
            }
            const finalDataRecheckError = await verifyRestoreDataSnapshot();
            if (finalDataRecheckError) {
                const runtimeRollbackErrors = await rollbackRuntimeOptionTransactions(emptyRuntimeTransactions);
                const rollback = restoreHomepageWidgetDomSnapshot(plannedDomSnapshot, domScope);
                const rollbackReasons = [
                    ...runtimeRollbackErrors.map((reason) => `runtime options 回滚失败：${reason}`),
                    ...("reason" in rollback ? [`DOM 回滚失败：${rollback.reason}`] : []),
                ];
                return finish(
                    "fatal",
                    layoutRevision,
                    [],
                    rollbackReasons.length > 0
                        ? `${finalDataRecheckError}；${rollbackReasons.join("；")}`
                        : finalDataRecheckError,
                );
            }

            // 阶段 C：数据、DOM 和 runtime options 全部验证成功后才销毁旧实例。
            for (const element of new Set(destroyAfterCommit)) destroyWidgetElement(element);
            cleanupInvisiblePreservedWidgets(layout, deviceId, sectionsEnabled, options.preservedWidgetElements);
            container.dataset.layoutUnresolvedWidgetIds = unresolvedWidgetIdsJson;
            return finish("complete", layoutRevision, []);
        }

        const hasExistingWidgets = getDirectWidgetElements(container).length > 0;
        if (expectedEvidenceIds.size > 0 || hasExistingWidgets) {
            return finish("fatal", layoutRevision, [], "空布局与现有组件证据冲突");
        }
        const firstDataRecheckError = await verifyRestoreDataSnapshot();
        if (firstDataRecheckError) return finish("fatal", layoutRevision, [], firstDataRecheckError);
        const secondDataRecheckError = await verifyRestoreDataSnapshot();
        if (secondDataRecheckError) return finish("fatal", layoutRevision, [], secondDataRecheckError);
        container.dataset.layoutUnresolvedWidgetIds = unresolvedWidgetIdsJson;
        cleanupInvisiblePreservedWidgets(
            layout,
            deviceId,
            sectionsEnabled,
            options.preservedWidgetElements,
        );
        return finish("complete", layoutRevision, []);
    }

    interface ReconcilePlanEntry {
        item: LayoutItem;
        existingElement: HTMLElement | null;
        existingHealthy: boolean;
        contentJson: string | null;
        restoredStyle: string | null;
    }

    const getWidgetElements = (widgetId: string): HTMLElement[] => (
        scopedDom.elementsById.get(widgetId) ?? []
    );

    // 第一阶段：只读布局、配置与现有元素位置，禁止移动、销毁或创建 DOM。
    const defaultStyleByWidgetId = new Map(defaultOrder.map((item) => [item.id, item.style]));
    const reconcilePlan: ReconcilePlanEntry[] = [];
    for (const item of runtimeOrder) {
        const existingElements = getWidgetElements(item.id);
        if (existingElements.length > 1) {
            return finish("fatal", layoutRevision, runtimeOrder.map((entry) => entry.id), `页面中存在重复组件 ${item.id}`);
        }
        const existingElement = existingElements[0] || null;
        const existingInstance = existingElement ? (existingElement as any).__widgetBlockInstance : null;
        const existingHealthy = Boolean(existingInstance?.hasMountedContent?.());
        if (existingHealthy) {
            reconcilePlan.push({
                item,
                existingElement,
                existingHealthy: true,
                contentJson: null,
                restoredStyle: item.style,
            });
            continue;
        }
        try {
            const widgetDocument = await readWidgetInstanceDocument(deviceViewContext, item.id);
            const contentData = widgetDocument?.config ?? null;
            const contentJson = contentData ? stringifyWidgetConfigForMount(contentData) : null;
            if (!widgetDocument || !contentJson) {
                return finish(
                    "fatal",
                    layoutRevision,
                    runtimeOrder.map((entry) => entry.id),
                    `组件 ${item.id} 配置无法确认`,
                    [],
                    [],
                    false,
                    "widget-read",
                );
            }
            rebuildWidgetDocuments.set(item.id, {
                revision: widgetDocument.revision,
                config: cloneJsonSafe(widgetDocument.config, `组件 ${item.id} 恢复事务配置快照`),
            });
            reconcilePlan.push({
                item,
                existingElement,
                existingHealthy: false,
                contentJson,
                restoredStyle: recoverGridSpanFromWidgetConfig(
                    item.style,
                    contentData,
                    defaultStyleByWidgetId.get(item.id) || null,
                ),
            });
        } catch (error) {
            return finish(
                "fatal",
                layoutRevision,
                runtimeOrder.map((entry) => entry.id),
                `组件 ${item.id} 配置读取状态不确定：${error instanceof Error ? error.message : String(error)}`,
                [],
                [],
                false,
                "widget-read",
            );
        }
    }
    type DisplacedElementAction =
        | { kind: "move-owner"; element: HTMLElement; ownerSectionId: string; ownerContainer: HTMLElement }
        | { kind: "preserve"; element: HTMLElement }
        | { kind: "destroy-after-commit"; element: HTMLElement };
    const displacedPlan: DisplacedElementAction[] = [];
    const runtimeOptionTransactions: RuntimeOptionTransactionEntry[] = [];
    const finalWidgetIds = new Set(runtimeOrder.map((item) => item.id));
    for (const child of getDirectWidgetElements(container)) {
        if (finalWidgetIds.has(child.id)) continue;
        const ownerSectionId = Object.entries(currentProfile?.sections || {})
            .find(([, section]) => section.widgetIds.includes(child.id))?.[0];
        if (ownerSectionId) {
            const ownerContainer = options.componentSectionContainers?.get(ownerSectionId);
            if (!ownerContainer || ownerContainer === container) {
                return finish(
                    "fatal",
                    layoutRevision,
                    runtimeOrder.map((entry) => entry.id),
                    `组件 ${child.id} 的 owner container 不可用`,
                );
            }
            displacedPlan.push({ kind: "move-owner", element: child, ownerSectionId, ownerContainer });
        } else if (isWidgetVisibleForDeviceAnywhere(layout, deviceId, child.id, sectionsEnabled)) {
            const existing = options.preservedWidgetElements?.get(child.id);
            if (!options.preservedWidgetElements) {
                return finish("fatal", layoutRevision, runtimeOrder.map((entry) => entry.id), "恢复缺少 preserved Map");
            }
            if (existing && existing !== child) {
                return finish(
                    "fatal",
                    layoutRevision,
                    runtimeOrder.map((entry) => entry.id),
                    `preserved Map 中已存在另一个组件实例 ${child.id}`,
                );
            }
            displacedPlan.push({ kind: "preserve", element: child });
        } else {
            displacedPlan.push({ kind: "destroy-after-commit", element: child });
        }
    }
    try {
        for (const action of displacedPlan) {
            if (action.kind !== "move-owner") continue;
            const transaction = prepareRuntimeOptionTransaction(
                (action.element as any).__widgetBlockInstance,
                {
                    sectionsEnabled: true,
                    sectionId: action.ownerSectionId,
                    deviceViewContext,
                    componentSectionContainers: options.componentSectionContainers,
                    preservedWidgetElements: options.preservedWidgetElements,
                },
            );
            if (transaction) runtimeOptionTransactions.push(transaction);
        }
        for (const planEntry of reconcilePlan) {
            if (!planEntry.existingHealthy || !planEntry.existingElement) continue;
            const transaction = prepareRuntimeOptionTransaction(
                (planEntry.existingElement as any).__widgetBlockInstance,
                {
                    sectionsEnabled,
                    sectionId,
                    deviceViewContext,
                    componentSectionContainers: options.componentSectionContainers,
                    preservedWidgetElements: options.preservedWidgetElements,
                },
            );
            if (transaction) runtimeOptionTransactions.push(transaction);
        }
    } catch (error) {
        return finish(
            "fatal",
            layoutRevision,
            runtimeOrder.map((entry) => entry.id),
            error instanceof Error ? error.message : String(error),
        );
    }
    const firstDataRecheckError = await verifyRestoreDataSnapshot();
    if (firstDataRecheckError) {
        return finish(
            "fatal",
            layoutRevision,
            runtimeOrder.map((entry) => entry.id),
            firstDataRecheckError,
        );
    }
    if (!matchesHomepageWidgetDomSnapshot(planBaselineDomSnapshot, domScope)) {
        return finish("fatal", layoutRevision, runtimeOrder.map((entry) => entry.id), "恢复计划生成期间 DOM 已变化");
    }
    const plannedDomSnapshot = captureHomepageWidgetDomSnapshot(domScope);

    // 第二阶段：计划完整后才创建外壳；构造失败时 DOM 仍保持原样。
    const createdWidgets = new Map<string, any>();
    const destroyCreatedWidgets = (): void => {
        for (const widgetBlock of new Set(createdWidgets.values())) {
            try {
                widgetBlock.destroy?.();
            } catch {
                // 单个临时外壳销毁失败不能阻断其余临时实例收尾。
            }
        }
    };
    try {
        for (const planEntry of reconcilePlan) {
            if (planEntry.existingHealthy) continue;
            createdWidgets.set(planEntry.item.id, new options.WidgetBlockClass(
                plugin,
                currentBlockForSettingsRef,
                planEntry.item.id,
                planEntry.restoredStyle,
                "",
                {
                    sectionsEnabled,
                    sectionId,
                    deviceViewContext,
                    componentSectionContainers: options.componentSectionContainers,
                    preservedWidgetElements: options.preservedWidgetElements,
                },
            ));
        }
    } catch (error) {
        destroyCreatedWidgets();
        return finish(
            "fatal",
            layoutRevision,
            runtimeOrder.map((entry) => entry.id),
            `组件外壳创建失败：${error instanceof Error ? error.message : String(error)}`,
            [],
            [],
            false,
            "widget-read",
        );
    }
    if (!matchesHomepageWidgetDomSnapshot(plannedDomSnapshot, domScope)) {
        destroyCreatedWidgets();
        return finish("fatal", layoutRevision, runtimeOrder.map((entry) => entry.id), "提交前 DOM 已变化");
    }

    const elementByWidgetId = new Map<string, HTMLElement>();
    const failedWidgetIds = new Set<string>();
    const destroyAfterCommit = new Set<HTMLElement>();
    const createdElements = new Set<HTMLElement>(
        Array.from(createdWidgets.values(), (widgetBlock) => widgetBlock.element),
    );
    const rollbackFatal = (reason: string): RestoreLayoutResult => {
        const rolledBack = restoreHomepageWidgetDomSnapshot(
            plannedDomSnapshot,
            domScope,
            createdElements,
        );
        destroyCreatedWidgets();
        return finish(
            "fatal",
            layoutRevision,
            runtimeOrder.map((entry) => entry.id),
            "reason" in rolledBack ? `${reason}；DOM 回滚失败：${rolledBack.reason}` : reason,
        );
    };

    // 阶段 B：只执行预检通过的可逆 DOM/Map 操作，禁止销毁旧实例。
    for (const action of displacedPlan) {
        if (action.kind === "move-owner") {
            action.ownerContainer.appendChild(action.element);
            const cleared = clearPreservedWidgetElementAfterAppend(
                action.element,
                options.preservedWidgetElements,
            );
            if ("reason" in cleared) return rollbackFatal(cleared.reason);
        } else if (action.kind === "preserve") {
            const stored = storePreservedWidgetElement(action.element.id, action.element, domScope);
            if ("reason" in stored) {
                return rollbackFatal(stored.reason);
            }
        } else {
            action.element.remove();
            destroyAfterCommit.add(action.element);
        }
    }

    // 原子提交第 2 步：按 expectedIds 顺序提交健康实例和新外壳。
    for (const planEntry of reconcilePlan) {
        if (planEntry.existingHealthy && planEntry.existingElement) {
            container.appendChild(planEntry.existingElement);
            const cleared = clearPreservedWidgetElementAfterAppend(
                planEntry.existingElement,
                options.preservedWidgetElements,
            );
            if ("reason" in cleared) return rollbackFatal(cleared.reason);
            elementByWidgetId.set(planEntry.item.id, planEntry.existingElement);
            continue;
        }

        const widgetBlock = createdWidgets.get(planEntry.item.id);
        if (planEntry.existingElement) {
            const cleared = clearPreservedWidgetElementAfterAppend(
                planEntry.existingElement,
                options.preservedWidgetElements,
            );
            if ("reason" in cleared) return rollbackFatal(cleared.reason);
            planEntry.existingElement.remove();
            destroyAfterCommit.add(planEntry.existingElement);
        }
        container.appendChild(widgetBlock.element);
        const cleared = clearPreservedWidgetElementAfterAppend(
            widgetBlock.element,
            options.preservedWidgetElements,
        );
        if ("reason" in cleared) return rollbackFatal(cleared.reason);
        elementByWidgetId.set(planEntry.item.id, widgetBlock.element);
    }

    // 原子提交第 3 步：按最新 expectedIds 固定目标 DOM 顺序。
    for (const item of runtimeOrder) {
        const element = elementByWidgetId.get(item.id);
        if (element) {
            container.appendChild(element);
            const cleared = clearPreservedWidgetElementAfterAppend(element, options.preservedWidgetElements);
            if ("reason" in cleared) return rollbackFatal(cleared.reason);
        }
    }
    // 仅挂载计划中缺失或失败的组件；失败显示非持久化局部占位。
    for (const planEntry of reconcilePlan) {
        if (planEntry.existingHealthy) continue;
        const widgetBlock = createdWidgets.get(planEntry.item.id);
        try {
            widgetBlock.loadcontent = planEntry.contentJson;
            const mounted = await widgetBlock.ensureContentMounted?.(planEntry.contentJson);
            if (!mounted) {
                failedWidgetIds.add(planEntry.item.id);
                widgetBlock.showMountError?.();
            }
        } catch {
            failedWidgetIds.add(planEntry.item.id);
            widgetBlock.showMountError?.();
        }
    }
    const secondDataRecheckError = await verifyRestoreDataSnapshot();
    if (secondDataRecheckError) return rollbackFatal(secondDataRecheckError);

    const actualElements = Array.from(container.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("widget-block"));
    const actualIds = actualElements.map((element) => element.id);
    const expectedIds = runtimeOrder.map((item) => item.id);
    const structuralComplete = (
        actualIds.length === expectedIds.length
        && expectedIds.every((id, index) => actualIds[index] === id)
        && new Set(actualIds).size === actualIds.length
    );
    for (const element of actualElements) {
        const instance = (element as any).__widgetBlockInstance;
        if (!instance?.hasMountedContent?.()) failedWidgetIds.add(element.id);
    }
    const allWidgetsComplete = (
        structuralComplete
        && failedWidgetIds.size === 0
        && currentSectionUnresolvedWidgetIds.size === 0
    );
    const committedDom = enumerateHomepageWidgetElements(domScope);
    const committedDuplicate = Array.from(committedDom.elementsById.entries())
        .find(([, elements]) => elements.length > 1);
    const originalHealthyInstancesIntact = plannedDomSnapshot.runtimeStates.every((runtime) => (
        !runtime.healthy
        || (
            (runtime.element as any).__widgetBlockInstance === runtime.instance
            && (runtime.instance as any)?.hasMountedContent?.() === true
        )
    ));
    const targetOwnershipValid = actualElements.every((element) => (
        element.parentElement === container
        && committedDom.elementsById.get(element.id)?.includes(element)
    ));
    if (
        !structuralComplete
        || committedDom.ownershipErrors.length > 0
        || committedDom.stalePreservedEntries.length > 0
        || committedDuplicate
        || !targetOwnershipValid
        || !originalHealthyInstancesIntact
    ) {
        return rollbackFatal("可逆 DOM 提交验证失败");
    }

    const runtimeCommit = await commitRuntimeOptionTransactions(runtimeOptionTransactions);
    if ("reason" in runtimeCommit) return rollbackFatal(runtimeCommit.reason);
    const finalDataRecheckError = await verifyRestoreDataSnapshot();
    if (finalDataRecheckError) {
        const runtimeRollbackErrors = await rollbackRuntimeOptionTransactions(runtimeOptionTransactions);
        return rollbackFatal(
            runtimeRollbackErrors.length > 0
                ? `${finalDataRecheckError}；runtime options 回滚失败：${runtimeRollbackErrors.join("；")}`
                : finalDataRecheckError,
        );
    }

    // 阶段 C：数据、DOM 和 runtime options 全部验证成功后才销毁旧实例。
    container.dataset.layoutUnresolvedWidgetIds = unresolvedWidgetIdsJson;
    for (const element of destroyAfterCommit) destroyWidgetElement(element);

    if (
        allWidgetsComplete
        && options.readOnly !== true
        && needsProfileRepair
        && layoutFileWasPresent
        && deviceId
    ) {
        await repairCurrentProfileAfterCompleteRestore(
            plugin,
            options.layoutFileName,
            deviceId,
            sectionsEnabled,
            sectionId || "",
            finalOrder,
        );
    }
    cleanupInvisiblePreservedWidgets(
        layout,
        deviceId,
        sectionsEnabled,
        options.preservedWidgetElements,
    );
    return finish(
        allWidgetsComplete ? "complete" : "degraded",
        layoutRevision,
        expectedIds,
        allWidgetsComplete
            ? undefined
            : structuralComplete
                ? "部分组件内容未能健康挂载"
                : "组件结构提交后未达到预期顺序",
        [...failedWidgetIds],
        [...currentSectionUnresolvedWidgetIds],
        structuralComplete,
    );
}

function normalizeSectionIdList(sectionIds: string[] | undefined): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const raw of sectionIds || []) {
        const normalized = normalizeSectionId(raw);
        if (!normalized) continue; // 过滤 null、空字符串
        if (seen.has(normalized)) continue; // 去重
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

function applyComponentSectionsToLayout(
    layout: WidgetLayoutData,
    deviceId: string,
    configuredSectionIds: string[],
    effectiveEnabled: boolean,
): WidgetLayoutData {
    const profile = ensureDeviceProfile(layout, deviceId);
    const currentGlobalOrder = normalizeLayoutItems(profile.order || layout.order);

    if (effectiveEnabled) {
        // 构造初始分栏：保留已有成员、style 来源；新分栏为空，继承 profile 的列数和间距。
        const initialSections: Record<string, WidgetLayoutProfileSectionData> = {};
        for (const sectionId of configuredSectionIds) {
            const existing = profile.sections?.[sectionId];
            const sectionWidgetLayoutNumber = existing?.widgetLayoutNumber;
            const sectionWidgetGap = existing?.widgetGap;
            initialSections[sectionId] = {
                widgetIds: [...(existing?.widgetIds || [])],
                ...(sectionWidgetLayoutNumber !== undefined ? { widgetLayoutNumber: sectionWidgetLayoutNumber } : {}),
                ...(sectionWidgetGap !== undefined ? { widgetGap: sectionWidgetGap } : {}),
            };
        }

        // 首次开启分栏检测：
        // - 之前无任何有效分栏成员；
        // - 已有全局 order；
        // - 新配置至少有一个分栏。
        // 满足时将全部全局组件按原顺序归入第一个分栏。
        // 不根据 overview ID 执行特殊处理。
        const isFirstTimeOpening = hasNoSectionMembers(profile)
            && currentGlobalOrder.length > 0
            && configuredSectionIds.length > 0;

        if (isFirstTimeOpening) {
            const firstSectionId = configuredSectionIds[0];
            const firstSection = initialSections[firstSectionId];
            initialSections[firstSectionId] = {
                ...firstSection,
                widgetIds: currentGlobalOrder.map((item) => item.id),
            };
        }

        // 按配置分栏顺序重排全局 order：
        // - 每个分栏作为一个连续片段；
        // - 保留分栏内部 widgetIds 顺序和组件 style；
        // - 无归属组件追加到第一个分栏（非首次开启时也可能存在历史孤儿）。
        const { nextGlobalOrder, nextSections } = rearrangeGlobalOrderBySections(
            currentGlobalOrder,
            initialSections,
            configuredSectionIds,
            { assignOrphansToFirstSection: true },
        );

        const currentActiveId = normalizeSectionId(profile.activeSectionId);
        const nextActiveSectionId = currentActiveId && configuredSectionIds.includes(currentActiveId)
            ? currentActiveId
            : configuredSectionIds[0];

        layout.profiles![deviceId] = {
            ...profile,
            order: nextGlobalOrder,
            sections: nextSections,
            activeSectionId: nextActiveSectionId,
            componentSectionsModeEnabled: true,
        };
    } else {
        // 关闭分栏模式：只关闭显示模式，不破坏全局 order。
        const nextProfile: WidgetLayoutProfileData = {
            ...profile,
            componentSectionsModeEnabled: false,
        };
        delete (nextProfile as { activeSectionId?: string }).activeSectionId;
        layout.profiles![deviceId] = nextProfile;
    }

    return layout;
}

export async function ensureComponentSectionsForCurrentDevice(
    plugin: Plugin,
    options: { sectionsEnabled?: boolean; sectionIds?: string[]; readOnly?: boolean } = {},
    layoutFileName: DeviceViewSurface = "desktop-homepage",
): Promise<boolean> {
    if (!isDesktopDeviceProfileEnabled()) return false;

    const context = await getReadyContext(plugin, layoutFileName);
    const deviceId = context.scopeId;

    const sectionsEnabled = options.sectionsEnabled === true;
    const configuredSectionIds = normalizeSectionIdList(options.sectionIds);
    const effectiveEnabled = sectionsEnabled && configuredSectionIds.length > 0;

    if (options.readOnly) {
        const rawLayout = (await loadLayoutSnapshotForContext(context)).layout;
        const inventory = await scanStoredWidgetInventory(plugin, rawLayout, layoutFileName, context);
        if (!inventory.complete) return false;
        if (!rawLayout && inventory.layoutFilePresent) return false;
        if (!rawLayout && inventory.items.length === 0) return false;

        const layout = rawLayout || { order: [], profiles: {} } as WidgetLayoutData;
        const beforeProfile = JSON.stringify(layout.profiles?.[deviceId] || {});
        const nextLayout = applyComponentSectionsToLayout(structuredClone(layout), deviceId, configuredSectionIds, effectiveEnabled);
        return JSON.stringify(nextLayout.profiles?.[deviceId] || {}) !== beforeProfile;
    }

    await updateCurrentDeviceLayout(context, (layout) => {
        return applyComponentSectionsToLayout(layout, deviceId, configuredSectionIds, effectiveEnabled);
    });
    return true;
}

export async function setActiveComponentSectionForCurrentDevice(
    plugin: Plugin,
    sectionId: string,
    layoutFileName: DeviceViewSurface = "desktop-homepage",
    fixedContext?: DeviceViewContext,
    expectedRevision?: number,
): Promise<void> {
    const normalized = normalizeSectionId(sectionId);
    if (!normalized) return;
    const context = fixedContext ?? await getReadyContext(plugin, layoutFileName);
    if (context.surface !== layoutFileName) {
        throw new Error("活动分栏写入 context 与 surface 不一致");
    }

    await updateCurrentDeviceLayout(context, (layout, deviceId) => {
        const profile = ensureDeviceProfile(layout, deviceId);
        if (!profile.sections?.[normalized]) return layout;
        return {
            ...layout,
            profiles: {
                ...(layout.profiles || {}),
                [deviceId]: {
                    ...profile,
                    activeSectionId: normalized,
                },
            },
        };
    }, {
        assumeReady: Boolean(fixedContext),
        expectedRevision,
    });
}

export async function getActiveComponentSectionForCurrentDevice(
    plugin: Plugin,
    layoutFileName: DeviceViewSurface = "desktop-homepage",
): Promise<string> {
    const context = await getReadyContext(plugin, layoutFileName);
    const layout = (await loadLayoutSnapshotForContext(context)).layout;
    const deviceId = context.scopeId;
    return getActiveSectionIdFromLayout(layout, deviceId) || "";
}

function applyRemovedComponentSectionsToLayout(
    layout: WidgetLayoutData,
    deviceId: string,
    normalizedIds: string[],
): WidgetLayoutData {
    if (normalizedIds.length === 0) return layout;
    const profile = ensureDeviceProfile(layout, deviceId);
    const currentGlobalOrder = normalizeLayoutItems(profile.order || layout.order);
    const currentSections = profile.sections || {};

    // 以删除前的分栏顺序为基准执行既有相邻归并规则。
    const orderedSectionIds = Object.keys(currentSections);
    const { nextGlobalOrder, nextSections, receivingSectionByRemoved } = mergeRemovedSectionRangesIntoAdjacentSections(
        currentGlobalOrder,
        currentSections,
        orderedSectionIds,
        normalizedIds,
    );

    let nextActiveSectionId = profile.activeSectionId;
    if (nextActiveSectionId && normalizedIds.includes(nextActiveSectionId)) {
        nextActiveSectionId = receivingSectionByRemoved.get(nextActiveSectionId) || null;
    }
    if (nextActiveSectionId && !nextSections[nextActiveSectionId]) {
        nextActiveSectionId = Object.keys(nextSections)[0] || null;
    }

    const nextProfile: WidgetLayoutProfileData = {
        ...profile,
        order: nextGlobalOrder,
        sections: nextSections,
        componentSectionsModeEnabled: Object.keys(nextSections).length > 0,
    };
    if (nextActiveSectionId && Object.keys(nextSections).length > 0) {
        nextProfile.activeSectionId = nextActiveSectionId;
    } else {
        delete (nextProfile as { activeSectionId?: string }).activeSectionId;
    }

    return {
        ...layout,
        order: nextGlobalOrder,
        profiles: {
            ...(layout.profiles || {}),
            [deviceId]: nextProfile,
        },
    };
}

export async function removeComponentSectionLayouts(
    plugin: Plugin,
    sectionIds: string[],
    layoutFileName: DeviceViewSurface = "desktop-homepage",
): Promise<void> {
    const normalizedIds = [...new Set(sectionIds.map(normalizeSectionId).filter((id): id is string => Boolean(id)))];
    if (normalizedIds.length === 0) return;

    await updateCurrentDeviceLayout(await getReadyContext(plugin, layoutFileName), (layout, deviceId) => {
        return applyRemovedComponentSectionsToLayout(layout, deviceId, normalizedIds);
    });
}

export async function moveWidgetToComponentSectionForCurrentDevice(
    plugin: Plugin,
    widgetId: string,
    options: MoveWidgetToSectionOptions,
    layoutFileName: DeviceViewSurface = "desktop-homepage",
): Promise<MoveWidgetResult> {
    if (!isDesktopDeviceProfileEnabled()) {
        return { success: false, error: "桌面设备配置未启用" };
    }
    const context = options.deviceViewContext ?? await getReadyContext(plugin, layoutFileName);
    if (context.surface !== layoutFileName) {
        return { success: false, error: "组件迁移 context 与 surface 不一致" };
    }
    if (!(await isRuntimeComponentSectionsEnabled(plugin, context))) {
        return { success: false, error: "组件分区导航未开启" };
    }
    const deviceId = context.scopeId;

    const fromSectionId = normalizeSectionId(options.fromSectionId);
    const toSectionId = normalizeSectionId(options.toSectionId);
    if (!toSectionId || fromSectionId === toSectionId) {
        return { success: false, error: "目标分栏无效或与来源相同" };
    }

    return runInSurfaceTransaction(`${context.scopeId}:${context.surface}`, async (): Promise<MoveWidgetResult> => {
        let latestLayout: WidgetLayoutData;
        try {
            latestLayout = (await loadLayoutSnapshotForContext(context, {
                assumeReady: Boolean(options.deviceViewContext),
            })).layout;
        } catch (error) {
            return { success: false, error: `读取布局失败：${error instanceof Error ? error.message : String(error)}` };
        }
        const latestProfile = latestLayout?.profiles?.[deviceId];
        if (!latestProfile?.sections?.[toSectionId]) {
            return { success: false, error: "目标分栏不存在" };
        }

        let modified = false;
        let layoutRevision = 0;
        await updateCurrentDeviceLayout(context, (layout) => {
            const profile = getDeviceProfile(layout, deviceId);
            if (!profile?.sections?.[toSectionId]) return layout;

            const sectionIds = Object.keys(profile.sections);
            const globalOrder = normalizeLayoutItems(profile.order || layout.order);
            if (!globalOrder.some((item) => item.id === widgetId)) return layout;

            const sections: Record<string, WidgetLayoutProfileSectionData> = { ...profile.sections };

            if (fromSectionId) {
                const sourceSection = sections[fromSectionId];
                if (!sourceSection || !sourceSection.widgetIds.includes(widgetId)) return layout;
                sourceSection.widgetIds = sourceSection.widgetIds.filter((id) => id !== widgetId);
            }
            const targetSection = sections[toSectionId];
            if (!targetSection) return layout;
            if (targetSection.widgetIds.includes(widgetId)) return layout;
            targetSection.widgetIds = [...targetSection.widgetIds, widgetId];

            const { nextGlobalOrder, nextSections } = rearrangeGlobalOrderBySections(
                globalOrder.map((item) => item.id === widgetId && options.style ? { ...item, style: options.style } : item),
                sections,
                sectionIds,
                { assignOrphansToFirstSection: false },
            );

            try {
                assertSectionLayoutInvariants(nextGlobalOrder, nextSections, sectionIds, { requireAllAssigned: true });
            } catch (error) {
                throw new LayoutMutationCancelError(
                    `迁移后分栏不变量校验失败：${error instanceof Error ? error.message : String(error)}`,
                );
            }

            layout.profiles![deviceId] = { ...profile, order: nextGlobalOrder, sections: nextSections };
            modified = true;
            return layout;
        }, { assumeReady: Boolean(options.deviceViewContext) });

        if (!modified) {
            return { success: false, error: "迁移未修改布局（widgetId 不存在或来源/目标已变化）" };
        }

        let finalLayout: WidgetLayoutData;
        try {
            const snap = await loadLayoutSnapshotForContext(context, {
                assumeReady: Boolean(options.deviceViewContext),
            });
            finalLayout = snap.layout;
            layoutRevision = snap.revision;
        } catch (error) {
            return { success: false, error: `写后重读失败：${error instanceof Error ? error.message : String(error)}` };
        }
        const finalProfile = finalLayout?.profiles?.[deviceId];
        if (!finalProfile?.sections?.[toSectionId]) {
            return { success: false, error: "写后目标分栏不存在" };
        }
        if (!finalProfile.sections[toSectionId].widgetIds.includes(widgetId)) {
            return { success: false, error: "写后目标分栏不包含该组件" };
        }
        if (fromSectionId && finalProfile.sections[fromSectionId]?.widgetIds.includes(widgetId)) {
            return { success: false, error: "写后来源分栏仍包含该组件" };
        }

        return { success: true, widgetId, fromSectionId: fromSectionId ?? undefined, toSectionId, layoutRevision };
    });
}

export type DeleteWidgetResult =
    | { status: "success" }
    | { status: "layoutCommittedConfigRetained"; warning?: string }
    | { status: "notCommitted"; reason: string }
    | { status: "uncertainManualCheck"; reason: string };

/**
 * 统一组件删除服务，由 PC、移动端和侧边栏复用。
 *
 * 事务顺序：
 * 1. 读取最新 layout 和组件文档
 * 2. 确认 widgetId 存在于当前 layout order 或 sections
 * 3. 基于 expectedRevision 从 order 及所有 sections 移除 widgetId
 * 4. 写后重读确认当前 layout 不再引用 widgetId
 * 5. 只有确认无引用后，才按组件文档 revision 删除配置文件
 * 6. 配置删除失败时返回 layoutCommittedConfigRetained
 *
 * 不调用任何思源块删除 API。
 */
async function deleteWidgetFromSurfaceCore(
    context: DeviceViewContext,
    widgetId: string,
): Promise<DeleteWidgetResult> {

    const isReferenced = (layout: DeviceViewLayout): boolean => (
        layout.order.some((item) => item.id === widgetId)
        || Object.values(layout.sections || {}).some((section) => section.widgetIds.includes(widgetId))
    );

    // 1) 在事务内读取当前布局和组件文档。组件读取失败不能解释为不存在。
    let currentLayout: DeviceViewLayout | null;
    let initialWidgetDocument: { revision: number } | null;
    try {
        [currentLayout, initialWidgetDocument] = await Promise.all([
            readDeviceViewLayout(context),
            readWidgetInstanceDocument(context, widgetId),
        ]);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return { status: "uncertainManualCheck", reason: `无法读取布局或组件配置：${detail}` };
    }
    if (!currentLayout) {
        return { status: "uncertainManualCheck", reason: "当前布局文件明确缺失，无法确认组件删除状态" };
    }

    // 2) 确认 widgetId 存在于 order 或 sections 中
    const wasReferenced = isReferenced(currentLayout);
    let confirmedLayout = currentLayout;

    if (wasReferenced) {
        // 3) 从 order 及所有 sections 移除 widgetId
        try {
            confirmedLayout = await updateDeviceViewLayout(
                context,
                (latest) => {
                    const next: DeviceViewLayout = structuredClone(latest);
                    next.order = removeWidgetFromOrder(next.order, widgetId);
                    if (next.sections) {
                        for (const section of Object.values(next.sections)) {
                            section.widgetIds = section.widgetIds.filter((id) => id !== widgetId);
                        }
                    }
                    return next;
                },
                { expectedRevision: currentLayout.revision },
            );
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            try {
                const observed = await readDeviceViewLayout(context);
                if (!observed) {
                    return { status: "uncertainManualCheck", reason: `布局写入失败且重读时文件缺失：${detail}` };
                }
                if (isReferenced(observed)) {
                    return { status: "notCommitted", reason: `布局写入失败且仍引用组件：${detail}` };
                }
                confirmedLayout = observed;
            } catch (readError) {
                const readDetail = readError instanceof Error ? readError.message : String(readError);
                return { status: "uncertainManualCheck", reason: `布局写入失败且无法确认状态：${detail}；${readDetail}` };
            }
        }

        // 4) 写后重读确认不再引用 widgetId
        try {
            const afterLayout = await readDeviceViewLayout(context);
            if (!afterLayout) {
                return { status: "uncertainManualCheck", reason: "布局写后文件缺失" };
            }
            if (isReferenced(afterLayout)) {
                return { status: "uncertainManualCheck", reason: "布局写后仍引用该组件，状态无法确认" };
            }
            confirmedLayout = afterLayout;
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return { status: "uncertainManualCheck", reason: `布局写后重读失败：${detail}` };
        }
    }

    // 5) 删除配置前再次读取最新布局。引用重新出现或 revision 无法解释时必须保留配置。
    let layoutBeforeConfigDelete: DeviceViewLayout | null;
    try {
        layoutBeforeConfigDelete = await readDeviceViewLayout(context);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            status: "layoutCommittedConfigRetained",
            warning: `布局已移除组件，但删除配置前无法复核最新布局，配置已保留：${detail}`,
        };
    }
    if (!layoutBeforeConfigDelete) {
        return {
            status: "layoutCommittedConfigRetained",
            warning: "布局已移除组件，但删除配置前布局文件明确缺失，配置已保留",
        };
    }
    if (isReferenced(layoutBeforeConfigDelete)) {
        return { status: "notCommitted", reason: "删除配置前布局重新出现组件引用，配置已保留" };
    }
    if (layoutBeforeConfigDelete.revision !== confirmedLayout.revision) {
        return {
            status: "uncertainManualCheck",
            reason: "删除配置前布局 revision 发生无法解释的变化，配置已保留，请人工检查",
        };
    }

    // 6) 按事务内最新组件文档 revision 删除配置文件。
    let widgetDocument: { revision: number } | null;
    try {
        widgetDocument = await readWidgetInstanceDocument(context, widgetId);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            status: "layoutCommittedConfigRetained",
            warning: `布局已确认移除，但组件配置暂时不可读并已保留：${detail}`,
        };
    }
    if (!widgetDocument) {
        // 配置不存在但布局已移除 → 视为成功
        return { status: "success" };
    }
    if (initialWidgetDocument && widgetDocument.revision !== initialWidgetDocument.revision) {
        return {
            status: "layoutCommittedConfigRetained",
            warning: "布局已移除组件，但组件配置在删除期间发生变化，配置已保留",
        };
    }

    try {
        await deleteWidgetInstance(context, widgetId, widgetDocument.revision);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return { status: "layoutCommittedConfigRetained", warning: `配置文件删除失败：${detail}` };
    }

    // 7) 删除配置后再次确认布局仍无引用；异常状态不继续自动操作。
    try {
        const finalLayout = await readDeviceViewLayout(context);
        if (!finalLayout || isReferenced(finalLayout)) {
            return {
                status: "uncertainManualCheck",
                reason: "组件配置删除后布局状态发生变化，请人工检查",
            };
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            status: "uncertainManualCheck",
            reason: `组件配置删除后无法复核布局：${detail}`,
        };
    }

    return { status: "success" };
}

export async function deleteWidgetFromSurface(
    context: DeviceViewContext,
    widgetId: string,
): Promise<DeleteWidgetResult> {
    const queueKey = `${context.scopeId}:${context.surface}`;
    return runInSurfaceTransaction(queueKey, () => deleteWidgetFromSurfaceCore(context, widgetId));
}

/**
 * 从当前设备桌面主页布局读取列数和间距。
 * 兼容层只包含当前设备数据；优先读取当前分栏，其次读取当前 surface 布局值。
 */
export async function loadWidgetLayoutSettings(
    plugin: Plugin,
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
    fixedContext?: DeviceViewContext,
): Promise<{ widgetLayoutNumber: number; widgetGap: number; source: string }> {
    const context = fixedContext ?? await getReadyContext(plugin, "desktop-homepage");
    if (context.surface !== "desktop-homepage") {
        throw new Error("主页布局设置 context 与 surface 不一致");
    }
    const layout = (await loadLayoutSnapshotForContext(context, {
        assumeReady: Boolean(fixedContext),
    })).layout;
    const sectionsEnabled = options.sectionsEnabled ?? await isRuntimeComponentSectionsEnabled(plugin, context);
    const sectionId = normalizeSectionId(
        options.sectionId ?? getActiveSectionIdFromLayout(layout, context.scopeId),
    );
    return resolveEffectiveWidgetLayoutSettings(layout, context.scopeId, { sectionsEnabled, sectionId });
}

function applyWidgetLayoutSettingsToLayout(
    layout: WidgetLayoutData,
    deviceId: string,
    settings: { widgetLayoutNumber: number; widgetGap: number },
    sectionsEnabled: boolean,
): WidgetLayoutData {
    if (!Number.isInteger(settings.widgetLayoutNumber) || settings.widgetLayoutNumber <= 0) {
        throw new Error("主页列数必须为正整数");
    }
    if (!Number.isFinite(settings.widgetGap) || settings.widgetGap < 0) {
        throw new Error("主页组件间距必须为非负有限数字");
    }

    const profile = ensureDeviceProfile(layout, deviceId);
    if (sectionsEnabled) {
        const sectionId = normalizeSectionId(profile.activeSectionId);
        if (!sectionId || !profile.sections?.[sectionId]) {
            throw new Error("当前活动分栏无效，拒绝保存列数和间距");
        }
        return {
            ...layout,
            profiles: {
                ...(layout.profiles || {}),
                [deviceId]: {
                    ...profile,
                    order: normalizeLayoutItems(profile.order || layout.order),
                    sections: {
                        ...profile.sections,
                        [sectionId]: {
                            ...profile.sections[sectionId],
                            widgetLayoutNumber: settings.widgetLayoutNumber,
                            widgetGap: settings.widgetGap,
                        },
                    },
                },
            },
        };
    }

    return {
        ...layout,
        profiles: {
            ...(layout.profiles || {}),
            [deviceId]: {
                ...profile,
                widgetLayoutNumber: settings.widgetLayoutNumber,
                widgetGap: settings.widgetGap,
            },
        },
    };
}

export interface SaveHomepageSettingsTransactionInput {
    config: Record<string, unknown>;
    sectionsEnabled: boolean;
    sectionIds: string[];
    deletedSectionIds: string[];
    widgetLayoutNumber: number;
    widgetGap: number;
}

export class UnrecoverableSectionHalfCommitError extends Error {
    constructor(public readonly reason: string) {
        super(reason);
        this.name = "UnrecoverableSectionHalfCommitError";
    }
}

function removeEmptySectionShells(
    layout: WidgetLayoutData,
    deviceId: string,
    removableSectionIds: string[],
): WidgetLayoutData {
    const repairedLayout = cloneJsonSafe(layout, "空分栏外壳删除");
    const profile = repairedLayout.profiles?.[deviceId];
    if (!profile?.sections) throw new Error("当前设备分栏结构缺失，拒绝删除空壳");
    const activeSectionId = normalizeSectionId(profile.activeSectionId);
    for (const sectionId of removableSectionIds) {
        const section = profile.sections[sectionId];
        if (!section || section.widgetIds.length !== 0 || activeSectionId === sectionId) {
            throw new Error(`分栏 ${sectionId} 已不再满足安全空壳条件，拒绝删除`);
        }
        delete profile.sections[sectionId];
    }
    return cloneJsonSafe(repairedLayout, "空分栏外壳删除目标布局");
}

/**
 * 在固定 desktop-homepage context 的同一事务中提交主页 layout 与 view 设置。
 */
export async function saveHomepageSettingsInTransaction(
    plugin: Plugin,
    input: SaveHomepageSettingsTransactionInput,
): Promise<SyncLayoutAndViewResult> {
    const context = await getReadyContext(plugin, "desktop-homepage");
    const queueKey = `${context.scopeId}:${context.surface}`;
    return runInSurfaceTransaction(queueKey, async () => {
        const start = await readCoordinatedSnapshotForContext(context);
        if (!start.view) {
            throw new SyncLayoutAndViewError("当前桌面主页 view.json 缺失，拒绝保存设置", { committed: false });
        }
        const startConsistency = validateLayoutViewSectionConsistency(
            start.layout.layout,
            context.scopeId,
            start.view.config,
        );
        if (!startConsistency.ok) {
            const recovery = analyzeSectionHalfCommitForSave(
                start.layout.layout,
                context.scopeId,
                start.view.config,
                normalizeSectionIdList(input.sectionIds),
                input.config,
            );
            if (recovery.status === "resume-requested-save") {
                // 用户明确想保留 layout-only 空分栏：以 start.layout 为基础，
                // 跳过 applyRemovedComponentSectionsToLayout 对空分栏的删除，
                // 但仍应用用户本次的完整设置。
                const configuredSectionIds = normalizeSectionIdList(input.sectionIds);
                const deletedSectionIds = normalizeSectionIdList(input.deletedSectionIds);
                const effectiveEnabled = input.sectionsEnabled && configuredSectionIds.length > 0;
                const nextConfig = cloneJsonSafeOmittingUndefinedObjectProperties(
                    input.config,
                    "主页设置完整配置(resume-requested-save)",
                );
                if (nextConfig.componentSectionsEnabled !== effectiveEnabled) {
                    throw new SyncLayoutAndViewError("主页设置中的分栏开关与目标布局不一致", { committed: false });
                }

                // 以 start layout 为基准（保留所有 layout-only 空分栏）
                let nextLayout = cloneJsonSafe(start.layout.layout, "主页设置原始布局(resume-requested-save)");

                // 仍应用删除请求（用户可能删除非 layout-only 分栏）
                nextLayout = applyRemovedComponentSectionsToLayout(
                    nextLayout,
                    context.scopeId,
                    deletedSectionIds,
                );
                // applyComponentSectionsToLayout 保留现有分栏并应用用户配置
                nextLayout = applyComponentSectionsToLayout(
                    nextLayout,
                    context.scopeId,
                    configuredSectionIds,
                    effectiveEnabled,
                );
                nextLayout = applyWidgetLayoutSettingsToLayout(
                    nextLayout,
                    context.scopeId,
                    { widgetLayoutNumber: input.widgetLayoutNumber, widgetGap: input.widgetGap },
                    effectiveEnabled,
                );
                nextLayout = cloneJsonSafe(nextLayout, "主页设置目标布局(resume-requested-save)");

                const preCheck = validateLayoutViewSectionConsistency(nextLayout, context.scopeId, nextConfig);
                if (!preCheck.ok) {
                    throw new SyncLayoutAndViewError(
                        `主页设置提交前分栏校验失败(resume-requested-save)：${(preCheck as { ok: false; reason: string }).reason}`,
                        { committed: false },
                    );
                }

                // layout + view 一次提交，不单独写 layout
                return syncLayoutAndViewInTransaction(
                    context,
                    () => nextLayout,
                    () => nextConfig,
                    start,
                );
            }
            if (recovery.status === "remove-confirmed-empty-extras") {
                // 用户确认不包含空分栏：在 nextLayout 中只删除确认的空壳，
                // 然后继续走正常保存流程+一次提交。
                const configuredSectionIds = normalizeSectionIdList(input.sectionIds);
                const deletedSectionIds = normalizeSectionIdList(input.deletedSectionIds);
                const effectiveEnabled = input.sectionsEnabled && configuredSectionIds.length > 0;
                const nextConfig = cloneJsonSafeOmittingUndefinedObjectProperties(
                    input.config,
                    "主页设置完整配置(remove-confirmed-empty-extras)",
                );
                if (nextConfig.componentSectionsEnabled !== effectiveEnabled) {
                    throw new SyncLayoutAndViewError("主页设置中的分栏开关与目标布局不一致", { committed: false });
                }

                let nextLayout = removeEmptySectionShells(
                    cloneJsonSafe(start.layout.layout, "主页设置原始布局(remove-confirmed-empty-extras)"),
                    context.scopeId,
                    recovery.removableSectionIds,
                );
                nextLayout = applyRemovedComponentSectionsToLayout(
                    nextLayout,
                    context.scopeId,
                    deletedSectionIds,
                );
                nextLayout = applyComponentSectionsToLayout(
                    nextLayout,
                    context.scopeId,
                    configuredSectionIds,
                    effectiveEnabled,
                );
                nextLayout = applyWidgetLayoutSettingsToLayout(
                    nextLayout,
                    context.scopeId,
                    { widgetLayoutNumber: input.widgetLayoutNumber, widgetGap: input.widgetGap },
                    effectiveEnabled,
                );
                nextLayout = cloneJsonSafe(nextLayout, "主页设置目标布局(remove-confirmed-empty-extras)");

                const preCheck = validateLayoutViewSectionConsistency(nextLayout, context.scopeId, nextConfig);
                if (!preCheck.ok) {
                    throw new SyncLayoutAndViewError(
                        `主页设置提交前分栏校验失败(remove-confirmed-empty-extras)：${(preCheck as { ok: false; reason: string }).reason}`,
                        { committed: false },
                    );
                }

                return syncLayoutAndViewInTransaction(
                    context,
                    () => nextLayout,
                    () => nextConfig,
                    start,
                );
            }
            throw new UnrecoverableSectionHalfCommitError(recovery.reason);
        }

        const configuredSectionIds = normalizeSectionIdList(input.sectionIds);
        const deletedSectionIds = normalizeSectionIdList(input.deletedSectionIds);
        const effectiveEnabled = input.sectionsEnabled && configuredSectionIds.length > 0;
        const nextConfig = cloneJsonSafeOmittingUndefinedObjectProperties(
            input.config,
            "主页设置完整配置",
        );
        if (nextConfig.componentSectionsEnabled !== effectiveEnabled) {
            throw new SyncLayoutAndViewError("主页设置中的分栏开关与目标布局不一致", { committed: false });
        }

        let nextLayout = applyRemovedComponentSectionsToLayout(
            cloneJsonSafe(start.layout.layout, "主页设置原始布局"),
            context.scopeId,
            deletedSectionIds,
        );
        nextLayout = applyComponentSectionsToLayout(
            nextLayout,
            context.scopeId,
            configuredSectionIds,
            effectiveEnabled,
        );
        nextLayout = applyWidgetLayoutSettingsToLayout(
            nextLayout,
            context.scopeId,
            { widgetLayoutNumber: input.widgetLayoutNumber, widgetGap: input.widgetGap },
            effectiveEnabled,
        );
        nextLayout = cloneJsonSafe(nextLayout, "主页设置目标布局");

        const preCheck = validateLayoutViewSectionConsistency(nextLayout, context.scopeId, nextConfig);
        if (!preCheck.ok) {
            throw new SyncLayoutAndViewError(
                `主页设置提交前分栏校验失败：${(preCheck as { ok: false; reason: string }).reason}`,
                { committed: false },
            );
        }

        return syncLayoutAndViewInTransaction(
            context,
            () => nextLayout,
            () => nextConfig,
            start,
        );
    });
}

/**
 * 保存列数和间距到当前设备桌面主页布局。
 * 桌面端保存到设备 profile，移动端保存到全局
 */
export async function saveWidgetLayoutSettings(
    plugin: Plugin,
    settings: { widgetLayoutNumber: number; widgetGap: number },
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
): Promise<void> {
    const sectionsEnabled = options.sectionsEnabled ?? await isRuntimeComponentSectionsEnabled(plugin);

    await updateCurrentDeviceLayout(await getReadyContext(plugin, "desktop-homepage"), (layout, fixedDeviceId) => {
        if (isDesktopDeviceProfileEnabled()) {
            const deviceId = fixedDeviceId;
            if (deviceId) {
                const profile = ensureDeviceProfile(layout, deviceId);
                const sectionId = normalizeSectionId(options.sectionId ?? profile.activeSectionId);
                if (sectionsEnabled) {
                    // 分栏模式开启时必须存在有效 sectionId，否则拒绝降级为全局保存。
                    if (!sectionId) {
                        return layout;
                    }
                    const sections = { ...(profile.sections || {}) };
                    const section = sections[sectionId];
                    if (!section) {
                        // 幽灵分栏：分栏已被删除或从未存在，禁止隐式创建，返回原布局。
                        return layout;
                    }
                    sections[sectionId] = {
                        ...section,
                        widgetLayoutNumber: settings.widgetLayoutNumber,
                        widgetGap: settings.widgetGap,
                    };
                    return {
                        ...layout,
                        profiles: {
                            ...(layout.profiles || {}),
                            [deviceId]: {
                                ...profile,
                                order: normalizeLayoutItems(profile.order || layout.order),
                                sections,
                            },
                        },
                    };
                }

                // 非分栏模式：保存到 profile 根级列数和间距。
                return {
                    ...layout,
                    profiles: {
                        ...(layout.profiles || {}),
                        [deviceId]: {
                            ...profile,
                            widgetLayoutNumber: settings.widgetLayoutNumber,
                            widgetGap: settings.widgetGap,
                        },
                    },
                };
            }
        }

        return {
            ...layout,
            widgetLayoutNumber: settings.widgetLayoutNumber,
            widgetGap: settings.widgetGap,
        };
    });
}
