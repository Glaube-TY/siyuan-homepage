import type { Plugin } from 'siyuan';
import { getLocalDeviceId, isDesktopDeviceProfileEnabled } from "@/homepage/utils/deviceProfile";

export const DEFAULT_COMPONENT_SECTION_ID = "overview";

export interface SaveLayoutOptions {
    containerSelector: string;
    layoutFileName: string;
    containerEl?: HTMLElement | null;
    sectionsEnabled?: boolean;
    sectionId?: string | null;
}

export interface RestoreLayoutOptions {
    containerSelector: string;
    layoutFileName: string;
    WidgetBlockClass: any;
    containerEl?: HTMLElement | null;
    sectionsEnabled?: boolean;
    sectionId?: string | null;
}

export interface LayoutItem {
    id: string;
    style: string | null;
    index: number;
}

export interface WidgetLayoutSectionData {
    order: LayoutItem[];
}

export interface WidgetLayoutProfileSectionData {
    order: LayoutItem[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
    hiddenWidgetIds?: string[];
}

export interface WidgetLayoutProfileData {
    order: LayoutItem[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
    hiddenWidgetIds?: string[];
    activeSectionId?: string;
    sections?: Record<string, WidgetLayoutProfileSectionData>;
}

export interface WidgetLayoutData {
    order?: LayoutItem[];
    defaultOrder?: LayoutItem[];
    defaultSections?: Record<string, WidgetLayoutSectionData>;
    profiles?: Record<string, WidgetLayoutProfileData>;
    widgetLayoutNumber?: number;
    widgetGap?: number;
}

const LAYOUT_LOAD_RETRY_DELAYS_MS = [0, 120, 360];

function waitForLayoutRetry(delayMs: number): Promise<void> {
    if (delayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

async function loadLayoutDataWithRetry(
    plugin: Plugin,
    layoutFileName: string,
): Promise<WidgetLayoutData | null> {
    let lastError: unknown = null;

    for (const delayMs of LAYOUT_LOAD_RETRY_DELAYS_MS) {
        await waitForLayoutRetry(delayMs);
        try {
            const value = await plugin.loadData(layoutFileName);
            if (value === null || value === undefined) {
                lastError = null;
                continue;
            }
            if (typeof value === "object" && !Array.isArray(value)) {
                return value as WidgetLayoutData;
            }
            lastError = new Error(`布局文件 ${layoutFileName} 的数据格式无效`);
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    return null;
}

async function loadWidgetConfigWithRetry(plugin: Plugin, widgetId: string): Promise<unknown> {
    const delays = [0, 80, 200];
    let lastError: unknown = null;

    for (const delayMs of delays) {
        await waitForLayoutRetry(delayMs);
        try {
            const value = await plugin.loadData(`widget-${widgetId}.json`);
            if (value !== null && value !== undefined) return value;
            lastError = null;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    return null;
}

export interface MoveWidgetToSectionOptions {
    fromSectionId?: string | null;
    toSectionId: string;
    style?: string | null;
    currentContainerEl?: HTMLElement | null;
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

function normalizeLayoutItems(items: unknown): LayoutItem[] {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeLayoutItem).filter((item): item is LayoutItem => item !== null);
}

function normalizeSectionId(sectionId: string | null | undefined): string {
    const trimmed = typeof sectionId === "string" ? sectionId.trim() : "";
    return trimmed || DEFAULT_COMPONENT_SECTION_ID;
}

async function isRuntimeComponentSectionsEnabled(plugin: Plugin): Promise<boolean> {
    const config = await plugin.loadData("homepageSettingConfig.json") as Record<string, unknown> | null;
    return Boolean((plugin as any)?.ADVANCED) && config?.componentSectionsEnabled === true;
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
        const existingOrder = getLayoutOrderForDevice(layout, deviceId);
        layout.profiles[deviceId] = { order: existingOrder };
    }
    return layout.profiles[deviceId];
}

function getActiveSectionIdFromLayout(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
): string {
    return normalizeSectionId(getDeviceProfile(layout, deviceId)?.activeSectionId);
}

function getDefaultSectionOrder(layout: WidgetLayoutData | null, sectionId: string): LayoutItem[] {
    const normalizedSectionId = normalizeSectionId(sectionId);
    const sectionOrder = layout?.defaultSections?.[normalizedSectionId]?.order;
    if (sectionOrder) {
        return normalizeLayoutItems(sectionOrder);
    }
    if (normalizedSectionId === DEFAULT_COMPONENT_SECTION_ID) {
        return getDefaultOrder(layout);
    }
    return [];
}

function getProfileSection(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionId: string,
): WidgetLayoutProfileSectionData | null {
    return getDeviceProfile(layout, deviceId)?.sections?.[normalizeSectionId(sectionId)] || null;
}

function getSectionOrderForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionId: string,
): LayoutItem[] {
    const normalizedSectionId = normalizeSectionId(sectionId);
    const profileSection = getProfileSection(layout, deviceId, normalizedSectionId);
    if (profileSection) {
        return normalizeLayoutItems(profileSection.order);
    }
    if (normalizedSectionId === DEFAULT_COMPONENT_SECTION_ID) {
        return getLayoutOrderForDevice(layout, deviceId);
    }
    return [];
}

function getHiddenWidgetIdsForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): string[] {
    if (!deviceId) return [];
    if (sectionsEnabled) {
        const activeSectionId = normalizeSectionId(sectionId || getActiveSectionIdFromLayout(layout, deviceId));
        return getProfileSection(layout, deviceId, activeSectionId)?.hiddenWidgetIds || [];
    }
    return layout?.profiles?.[deviceId]?.hiddenWidgetIds || [];
}

function getWidgetLayoutNumberForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): number {
    const profile = getDeviceProfile(layout, deviceId);
    if (sectionsEnabled) {
        const activeSectionId = normalizeSectionId(sectionId || getActiveSectionIdFromLayout(layout, deviceId));
        const section = getProfileSection(layout, deviceId, activeSectionId);
        return section?.widgetLayoutNumber ?? profile?.widgetLayoutNumber ?? layout?.widgetLayoutNumber ?? 4;
    }
    return profile?.widgetLayoutNumber ?? layout?.widgetLayoutNumber ?? 4;
}

function getWidgetGapForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): number {
    const profile = getDeviceProfile(layout, deviceId);
    if (sectionsEnabled) {
        const activeSectionId = normalizeSectionId(sectionId || getActiveSectionIdFromLayout(layout, deviceId));
        const section = getProfileSection(layout, deviceId, activeSectionId);
        return section?.widgetGap ?? profile?.widgetGap ?? layout?.widgetGap ?? 0.2;
    }
    return profile?.widgetGap ?? layout?.widgetGap ?? 0.2;
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
            return { ...topFiltered, data };
        }

        return topFiltered;
    }

    return normalized;
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
        ? normalizeSectionId(sectionId || getActiveSectionIdFromLayout(layout, deviceId))
        : null;
    const effectiveOrder = getEffectiveHomepageOrderForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const hiddenWidgetIds = getHiddenWidgetIdsForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const widgetLayoutNumber = getWidgetLayoutNumberForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const widgetGap = getWidgetGapForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const layoutPart = {
        activeSectionId,
        order: effectiveOrder.map((item) => ({ id: item.id, style: item.style })),
        hiddenWidgetIds: [...hiddenWidgetIds].sort(),
        widgetLayoutNumber,
        widgetGap,
    };

    const musicWidgetSigs: string[] = [];
    for (const item of effectiveOrder) {
        try {
            const content = await plugin.loadData(`widget-${item.id}.json`);
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

function getLayoutOrderForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null
): LayoutItem[] {
    if (!layout) return [];

    // 新结构：优先读取设备 profile
    if (deviceId && layout.profiles?.[deviceId]?.order) {
        return normalizeLayoutItems(layout.profiles[deviceId].order);
    }

    // 新结构：回退 defaultOrder
    if (layout.defaultOrder) {
        return normalizeLayoutItems(layout.defaultOrder);
    }

    // 旧结构兼容：读取 order
    if (layout.order) {
        return normalizeLayoutItems(layout.order);
    }

    return [];
}

function getEffectiveHomepageOrderForDevice(
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
    sectionId?: string | null,
): LayoutItem[] {
    const activeSectionId = normalizeSectionId(sectionId || getActiveSectionIdFromLayout(layout, deviceId));
    const deviceOrder = sectionsEnabled
        ? getSectionOrderForDevice(layout, deviceId, activeSectionId)
        : getLayoutOrderForDevice(layout, deviceId);
    const defaultOrder = sectionsEnabled
        ? getDefaultSectionOrder(layout, activeSectionId)
        : getDefaultOrder(layout);
    if (!deviceId || defaultOrder.length === 0) {
        return deviceOrder;
    }

    const hiddenWidgetIds = getHiddenWidgetIdsForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
    const hiddenIdsSet = new Set(hiddenWidgetIds);
    const deviceOrderIds = new Set(deviceOrder.map((item) => item.id));
    const missingVisibleDefaultItems = defaultOrder.filter((item) => {
        return !hiddenIdsSet.has(item.id) && !deviceOrderIds.has(item.id);
    });

    if (missingVisibleDefaultItems.length === 0) {
        return deviceOrder;
    }
    return [...deviceOrder, ...missingVisibleDefaultItems];
}

async function migrateLegacyLayout(
    plugin: Plugin,
    layout: WidgetLayoutData | null,
    layoutFileName: string
): Promise<WidgetLayoutData> {
    // 若已有新结构，无需迁移
    if (layout?.defaultOrder || layout?.profiles) {
        return layout;
    }

    // 旧结构迁移：将 order 作为 defaultOrder
    if (layout?.order) {
        const migrated: WidgetLayoutData = {
            defaultOrder: normalizeLayoutItems(layout.order),
            profiles: {},
        };
        await plugin.saveData(layoutFileName, migrated);
        return migrated;
    }

    return { defaultOrder: [], profiles: {} };
}

function mergeIntoDefaultOrder(
    defaultOrder: LayoutItem[],
    currentOrder: LayoutItem[]
): LayoutItem[] {
    const defaultOrderIds = new Set(defaultOrder.map(item => item.id));
    const newItems: LayoutItem[] = [];

    for (const item of currentOrder) {
        if (!defaultOrderIds.has(item.id)) {
            newItems.push(item);
        }
    }

    if (newItems.length === 0) {
        return defaultOrder;
    }
    return [...defaultOrder, ...newItems];
}

export async function saveLayoutForContainer(
    plugin: Plugin,
    options: SaveLayoutOptions
): Promise<void> {
    const container = options.containerEl || document.querySelector(options.containerSelector);
    if (!container) return;

    if (
        options.layoutFileName === "widgetLayout.json" &&
        container instanceof HTMLElement &&
        container.dataset.layoutRestoreState &&
        container.dataset.layoutRestoreState !== "ready"
    ) {
        console.warn(`[Layout] 容器尚未完成恢复，拒绝保存不完整布局: ${container.dataset.layoutRestoreState}`);
        return;
    }

    const currentOrder: LayoutItem[] = Array.from(container.children)
        .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains("widget-block") && Boolean(el.id))
        .map((widgetBlockElement, index) => ({
            id: widgetBlockElement.id,
            style: sanitizeLayoutStyle(widgetBlockElement.getAttribute("style"), container),
            index,
        }));

    // 读取现有布局数据
    const existingLayout = await plugin.loadData(options.layoutFileName) as WidgetLayoutData | null;
    const layout = await migrateLegacyLayout(plugin, existingLayout, options.layoutFileName);
    const profiles = layout.profiles || {};
    const existingDefaultOrder = layout.defaultOrder || layout.order || [];
    const sectionId = normalizeSectionId(options.sectionId);
    const sectionsEnabled = options.sectionsEnabled === true;

    // 把当前设备新增的组件合并到 defaultOrder（全局已知组件并集）
    const mergedDefaultOrder = mergeIntoDefaultOrder(
        normalizeLayoutItems(existingDefaultOrder),
        currentOrder
    );
    const defaultSections = layout.defaultSections || {};

    // 桌面端：仅更新当前设备 profile（保留其他字段）
    if (isDesktopDeviceProfileEnabled()) {
        const deviceId = getLocalDeviceId();
        if (deviceId) {
            const profile = profiles[deviceId] || { order: getLayoutOrderForDevice(layout, deviceId) };
            const currentOrderIds = new Set(currentOrder.map(item => item.id));

            if (sectionsEnabled) {
                const sections = profile.sections || {};
                const existingSection = sections[sectionId];
                const existingHiddenIds = existingSection?.hiddenWidgetIds || [];
                const nextHiddenIds = existingHiddenIds.filter(id => !currentOrderIds.has(id));

                sections[sectionId] = {
                    ...existingSection,
                    order: currentOrder,
                    hiddenWidgetIds: nextHiddenIds,
                };
                profiles[deviceId] = {
                    ...profile,
                    activeSectionId: sectionId,
                    sections,
                };

                const existingDefaultSectionOrder = defaultSections[sectionId]?.order || [];
                defaultSections[sectionId] = {
                    order: mergeIntoDefaultOrder(
                        normalizeLayoutItems(existingDefaultSectionOrder),
                        currentOrder
                    ),
                };
            } else {
                // 自动解除已恢复组件的隐藏标记
                const existingHiddenIds = profile.hiddenWidgetIds || [];
                const nextHiddenIds = existingHiddenIds.filter(id => !currentOrderIds.has(id));

                profiles[deviceId] = {
                    ...profile,
                    order: currentOrder,
                    hiddenWidgetIds: nextHiddenIds,
                };
            }
        }
    }

    const layoutData: WidgetLayoutData = {
        ...layout,
        defaultOrder: mergedDefaultOrder,
        defaultSections,
        profiles,
    };

    await plugin.saveData(options.layoutFileName, layoutData);
}

function getDefaultOrder(layout: WidgetLayoutData | null): LayoutItem[] {
    if (!layout) return [];
    if (layout.defaultOrder) {
        return normalizeLayoutItems(layout.defaultOrder);
    }
    if (layout.order) {
        return normalizeLayoutItems(layout.order);
    }
    return [];
}

async function findMissingComponents(
    plugin: Plugin,
    deviceOrder: LayoutItem[],
    defaultOrder: LayoutItem[],
    hiddenWidgetIds: string[] = []
): Promise<LayoutItem[]> {
    if (defaultOrder.length === 0) {
        return [];
    }

    const deviceOrderIds = new Set(deviceOrder.map(item => item.id));
    const hiddenIdsSet = new Set(hiddenWidgetIds);
    const missingItems: LayoutItem[] = [];

    for (const item of defaultOrder) {
        // 跳过已隐藏的组件
        if (hiddenIdsSet.has(item.id)) {
            continue;
        }
        if (!deviceOrderIds.has(item.id)) {
            const contentData = await plugin.loadData(`widget-${item.id}.json`);
            if (contentData) {
                missingItems.push(item);
            }
        }
    }

    return missingItems;
}

async function reconcileDeviceOrder(
    plugin: Plugin,
    deviceOrder: LayoutItem[],
    defaultOrder: LayoutItem[],
    layoutFileName: string,
    hiddenWidgetIds: string[] = []
): Promise<{ order: LayoutItem[]; hasChanges: boolean }> {
    // 只对主组件区 widgetLayout.json 启用补齐逻辑
    if (layoutFileName !== "widgetLayout.json") {
        return { order: deviceOrder, hasChanges: false };
    }

    const missingItems = await findMissingComponents(plugin, deviceOrder, defaultOrder, hiddenWidgetIds);

    if (missingItems.length === 0) {
        return { order: deviceOrder, hasChanges: false };
    }

    const reconciledOrder = [...deviceOrder, ...missingItems];
    return { order: reconciledOrder, hasChanges: true };
}

function destroyAndClearContainer(container: Element): void {
    const existingBlocks = container.querySelectorAll('.widget-block');
    existingBlocks.forEach((block) => {
        const instance = (block as any).__widgetBlockInstance;
        if (instance && typeof instance.destroy === 'function') {
            try {
                instance.destroy();
            } catch {
                // 忽略销毁错误
            }
        }
    });

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
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

function destroyPreparedWidgets(widgets: { widgetBlock: any }[]): void {
    widgets.forEach(({ widgetBlock }) => {
        try {
            widgetBlock?.destroy?.();
        } catch {
            // 临时实例尚未挂载，销毁失败不影响保留旧布局
        }
    });
}

export async function restoreLayoutForContainer(
    plugin: Plugin,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    options: RestoreLayoutOptions
): Promise<boolean> {
    const container = options.containerEl || document.querySelector(options.containerSelector);
    if (!container) return false;

    if (container instanceof HTMLElement) {
        container.dataset.layoutRestoreState = "restoring";
    }

    let layout: WidgetLayoutData | null;
    try {
        layout = await loadLayoutDataWithRetry(plugin, options.layoutFileName);
    } catch (error) {
        if (container instanceof HTMLElement) {
            container.dataset.layoutRestoreState = "failed";
        }
        console.warn(`[Layout] 读取 ${options.layoutFileName} 失败，保留当前组件布局:`, error);
        return false;
    }

    if (!layout) {
        if (container instanceof HTMLElement) {
            container.dataset.layoutRestoreState = "ready";
        }
        return true;
    }

    // 迁移旧结构
    layout = await migrateLegacyLayout(plugin, layout, options.layoutFileName);

    // 获取当前设备 ID
    const deviceId = isDesktopDeviceProfileEnabled() ? getLocalDeviceId() : null;
    const sectionsEnabled = options.sectionsEnabled === true;
    const sectionId = normalizeSectionId(options.sectionId || getActiveSectionIdFromLayout(layout, deviceId));
    const order = sectionsEnabled
        ? getSectionOrderForDevice(layout, deviceId, sectionId)
        : getLayoutOrderForDevice(layout, deviceId);

    // 获取 defaultOrder 用于跨设备同步
    const defaultOrder = sectionsEnabled
        ? getDefaultSectionOrder(layout, sectionId)
        : getDefaultOrder(layout);

    // 读取当前设备的 hiddenWidgetIds（用于区分隐藏 vs 缺失）
    const hiddenWidgetIds = getHiddenWidgetIdsForDevice(layout, deviceId, sectionsEnabled, sectionId);

    // 跨设备同步：检查当前设备是否缺失 defaultOrder 中的组件（仅主组件区）
    // 只要桌面端且 deviceId 可用就执行补齐，不要求 profile 必须预先存在
    let finalOrder = order;
    let needsSave = false;

    if (deviceId) {
        const reconcileResult = await reconcileDeviceOrder(plugin, order, defaultOrder, options.layoutFileName, hiddenWidgetIds);
        if (reconcileResult.hasChanges) {
            finalOrder = reconcileResult.order;
            needsSave = true;
        }
    }

    // 补齐后若仍为空（所有组件均被隐藏），才返回
    if (finalOrder.length === 0) {
        if (sectionsEnabled) {
            destroyAndClearContainer(container);
        }
        if (container instanceof HTMLElement) {
            container.dataset.layoutRestoreState = "ready";
        }
        return true;
    }

    // 新设备首次建档：若当前设备无 profile，自动创建
    if (deviceId && layout && !layout.profiles?.[deviceId] && finalOrder.length > 0) {
        if (!layout.profiles) {
            layout.profiles = {};
        }
        if (sectionsEnabled) {
            layout.profiles[deviceId] = {
                order: getLayoutOrderForDevice(layout, deviceId),
                activeSectionId: sectionId,
                sections: {
                    [sectionId]: { order: finalOrder },
                },
            };
        } else {
            layout.profiles[deviceId] = {
                ...layout.profiles[deviceId],
                order: finalOrder,
            };
        }
        await plugin.saveData(options.layoutFileName, layout);
    } else if (needsSave && layout) {
        // 跨设备同步后保存更新
        if (!layout.profiles) {
            layout.profiles = {};
        }
        if (sectionsEnabled) {
            const profile = ensureDeviceProfile(layout, deviceId);
            const sections = profile.sections || {};
            sections[sectionId] = {
                ...sections[sectionId],
                order: finalOrder,
            };
            layout.profiles[deviceId] = {
                ...profile,
                activeSectionId: sectionId,
                sections,
            };
        } else {
            layout.profiles[deviceId] = {
                ...layout.profiles[deviceId],
                order: finalOrder,
            };
        }
        await plugin.saveData(options.layoutFileName, layout);
    }

    // 第一阶段：构建待恢复的 widget 列表
    // 注意：此阶段只创建 widgetBlock 和读取配置，不调用 updateContent
    // 避免组件 onMount 时宿主 DOM 尚未插入页面
    const widgetsToRestore: { widgetBlock: any; contentJson: string | null }[] = [];
    const defaultStyleByWidgetId = new Map(defaultOrder.map((item) => [item.id, item.style]));
    for (const item of finalOrder) {
        try {
            const contentData = await loadWidgetConfigWithRetry(plugin, item.id);
            const restoredStyle = recoverGridSpanFromWidgetConfig(
                item.style,
                contentData,
                defaultStyleByWidgetId.get(item.id) || null,
            );
            const widgetBlock = new options.WidgetBlockClass(
                plugin,
                currentBlockForSettingsRef,
                item.id,
                restoredStyle,
                "",
                { sectionsEnabled, sectionId }
            );

            const contentJson = contentData ? stringifyWidgetConfigForMount(contentData) : null;

            // 先保存 widgetBlock 和内容，稍后统一挂载
            widgetsToRestore.push({ widgetBlock, contentJson });
        } catch (e) {
            destroyPreparedWidgets(widgetsToRestore);
            if (container instanceof HTMLElement) {
                container.dataset.layoutRestoreState = "failed";
            }
            console.warn(`[Layout] 构建 widget ${item.id} 失败，本次恢复已取消并保留旧布局:`, e);
            return false;
        }
    }

    // 第二阶段：只有当成功构建出至少一个 widget 时，才清空并替换
    if (widgetsToRestore.length === 0) {
        if (container instanceof HTMLElement) {
            container.dataset.layoutRestoreState = "ready";
        }
        return true;
    }

    // 清空容器前，先显式销毁已有 widget 实例，触发各自的 onDestroy
    destroyAndClearContainer(container);

    // 统一挂载 DOM：确保所有 widget 元素先进入文档流
    for (const { widgetBlock } of widgetsToRestore) {
        container.appendChild(widgetBlock.element);
    }

    // 第三阶段：挂载组件内容
    // 此时所有 widget 的宿主元素已在 DOM 中，组件 onMount 可以正确获取节点
    for (const { widgetBlock, contentJson } of widgetsToRestore) {
        if (contentJson) {
            try {
                widgetBlock.loadcontent = contentJson;
                widgetBlock.updateContent(contentJson);
            } catch (e) {
                console.warn(`[Layout] 更新 widget ${widgetBlock.id} 内容失败:`, e);
            }
        }
    }

    if (container instanceof HTMLElement) {
        container.dataset.layoutRestoreState = "ready";
    }
    return true;
}

export async function ensureComponentSectionsForCurrentDevice(
    plugin: Plugin,
    layoutFileName = "widgetLayout.json",
): Promise<void> {
    const rawLayout = await loadLayoutDataWithRetry(plugin, layoutFileName);
    if (!rawLayout) {
        console.warn(`[Layout] ${layoutFileName} 暂不可用，跳过启动期分区初始化以避免覆盖已有布局`);
        return;
    }
    const layout = await migrateLegacyLayout(plugin, rawLayout, layoutFileName);
    const sectionId = DEFAULT_COMPONENT_SECTION_ID;

    if (!layout.defaultSections) {
        layout.defaultSections = {};
    }
    if (!layout.defaultSections[sectionId]) {
        layout.defaultSections[sectionId] = {
            order: getDefaultOrder(layout),
        };
    }

    if (isDesktopDeviceProfileEnabled()) {
        const deviceId = getLocalDeviceId();
        if (deviceId) {
            const profile = ensureDeviceProfile(layout, deviceId);
            const sections = profile.sections || {};
            if (!sections[sectionId]) {
                const existingOrder = profile.order?.length
                    ? normalizeLayoutItems(profile.order)
                    : getEffectiveHomepageOrderForDevice(layout, deviceId);
                sections[sectionId] = {
                    order: existingOrder,
                    hiddenWidgetIds: profile.hiddenWidgetIds ? [...profile.hiddenWidgetIds] : [],
                    widgetLayoutNumber: profile.widgetLayoutNumber,
                    widgetGap: profile.widgetGap,
                };
            }
            profile.activeSectionId = normalizeSectionId(profile.activeSectionId);
            profile.sections = sections;
            layout.profiles![deviceId] = profile;
        }
    }

    await plugin.saveData(layoutFileName, layout);
}

export async function setActiveComponentSectionForCurrentDevice(
    plugin: Plugin,
    sectionId: string,
    layoutFileName = "widgetLayout.json",
): Promise<void> {
    const rawLayout = await plugin.loadData(layoutFileName) as WidgetLayoutData | null;
    const layout = await migrateLegacyLayout(plugin, rawLayout, layoutFileName);
    if (!isDesktopDeviceProfileEnabled()) return;

    const deviceId = getLocalDeviceId();
    if (!deviceId) return;

    const profile = ensureDeviceProfile(layout, deviceId);
    profile.activeSectionId = normalizeSectionId(sectionId);
    layout.profiles![deviceId] = profile;
    await plugin.saveData(layoutFileName, layout);
}

export async function getActiveComponentSectionForCurrentDevice(
    plugin: Plugin,
    layoutFileName = "widgetLayout.json",
): Promise<string> {
    const layout = await plugin.loadData(layoutFileName) as WidgetLayoutData | null;
    const deviceId = isDesktopDeviceProfileEnabled() ? getLocalDeviceId() : null;
    return getActiveSectionIdFromLayout(layout, deviceId);
}

export async function removeComponentSectionLayouts(
    plugin: Plugin,
    sectionIds: string[],
    layoutFileName = "widgetLayout.json",
): Promise<void> {
    const normalizedIds = [...new Set(sectionIds.map(normalizeSectionId))]
        .filter((sectionId) => sectionId !== DEFAULT_COMPONENT_SECTION_ID);
    if (normalizedIds.length === 0) return;

    const layout = await plugin.loadData(layoutFileName) as WidgetLayoutData | null;
    if (!layout) return;

    for (const sectionId of normalizedIds) {
        if (layout.defaultSections) {
            delete layout.defaultSections[sectionId];
        }
    }

    if (layout.profiles) {
        for (const profile of Object.values(layout.profiles)) {
            for (const sectionId of normalizedIds) {
                if (profile.sections) {
                    delete profile.sections[sectionId];
                }
                if (profile.activeSectionId === sectionId) {
                    profile.activeSectionId = DEFAULT_COMPONENT_SECTION_ID;
                }
            }
        }
    }

    await plugin.saveData(layoutFileName, layout);
}

function reindexLayoutItems(items: LayoutItem[]): LayoutItem[] {
    return items.map((item, index) => ({ ...item, index }));
}

export async function moveWidgetToComponentSectionForCurrentDevice(
    plugin: Plugin,
    widgetId: string,
    options: MoveWidgetToSectionOptions,
    layoutFileName = "widgetLayout.json",
): Promise<boolean> {
    if (!isDesktopDeviceProfileEnabled() || !(await isRuntimeComponentSectionsEnabled(plugin))) {
        return false;
    }

    const deviceId = getLocalDeviceId();
    if (!deviceId) return false;

    if (options.currentContainerEl) {
        await saveLayoutForContainer(plugin, {
            containerSelector: ".custom-content",
            layoutFileName,
            containerEl: options.currentContainerEl,
            sectionsEnabled: true,
            sectionId: options.fromSectionId,
        });
    }

    const rawLayout = await plugin.loadData(layoutFileName) as WidgetLayoutData | null;
    const layout = await migrateLegacyLayout(plugin, rawLayout, layoutFileName);
    const profile = ensureDeviceProfile(layout, deviceId);
    const sections = profile.sections || {};
    const fromSectionId = normalizeSectionId(options.fromSectionId || profile.activeSectionId);
    const toSectionId = normalizeSectionId(options.toSectionId);

    if (fromSectionId === toSectionId) {
        return false;
    }

    const fromSection = sections[fromSectionId] || {
        order: getSectionOrderForDevice(layout, deviceId, fromSectionId),
    };
    const targetSection = sections[toSectionId] || {
        order: getSectionOrderForDevice(layout, deviceId, toSectionId),
    };
    const currentItem = fromSection.order.find((item) => item.id === widgetId);
    const style = sanitizeLayoutStyle(options.style ?? currentItem?.style ?? null, options.currentContainerEl || null);
    const targetWithoutWidget = removeWidgetFromOrder(targetSection.order || [], widgetId);
    const nextTargetOrder = reindexLayoutItems([
        ...targetWithoutWidget,
        {
            id: widgetId,
            style,
            index: targetWithoutWidget.length,
        },
    ]);

    sections[fromSectionId] = {
        ...fromSection,
        order: reindexLayoutItems(removeWidgetFromOrder(fromSection.order || [], widgetId)),
        hiddenWidgetIds: (fromSection.hiddenWidgetIds || []).filter((id) => id !== widgetId),
    };
    sections[toSectionId] = {
        ...targetSection,
        order: nextTargetOrder,
        hiddenWidgetIds: (targetSection.hiddenWidgetIds || []).filter((id) => id !== widgetId),
    };

    if (!layout.defaultSections) {
        layout.defaultSections = {};
    }
    if (layout.defaultSections[fromSectionId]) {
        layout.defaultSections[fromSectionId] = {
            order: reindexLayoutItems(removeWidgetFromOrder(layout.defaultSections[fromSectionId].order || [], widgetId)),
        };
    }
    const defaultTargetOrder = removeWidgetFromOrder(layout.defaultSections[toSectionId]?.order || [], widgetId);
    layout.defaultSections[toSectionId] = {
        order: reindexLayoutItems([
            ...defaultTargetOrder,
            {
                id: widgetId,
                style,
                index: defaultTargetOrder.length,
            },
        ]),
    };

    layout.profiles![deviceId] = {
        ...profile,
        activeSectionId: fromSectionId,
        sections,
    };

    await plugin.saveData(layoutFileName, layout);
    return true;
}

function removeWidgetFromOrder(order: LayoutItem[], widgetId: string): LayoutItem[] {
    return order.filter(item => item.id !== widgetId);
}

export async function hideWidgetForCurrentDevice(
    plugin: Plugin,
    widgetId: string,
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
): Promise<boolean> {
    if (!isDesktopDeviceProfileEnabled()) {
        console.warn("[Layout] 当前设备隐藏仅支持桌面端");
        return false;
    }

    const deviceId = getLocalDeviceId();
    if (!deviceId) {
        console.warn("[Layout] 无法获取当前设备 ID");
        return false;
    }

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        console.warn("[Layout] 布局数据不存在");
        return false;
    }

    const sectionsEnabled = options.sectionsEnabled ?? await isRuntimeComponentSectionsEnabled(plugin);
    const sectionId = normalizeSectionId(options.sectionId || getActiveSectionIdFromLayout(layout, deviceId));
    const profile = ensureDeviceProfile(layout, deviceId);

    if (sectionsEnabled) {
        const sections = profile.sections || {};
        const currentSection = sections[sectionId] || {
            order: getSectionOrderForDevice(layout, deviceId, sectionId),
        };
        const currentOrder = currentSection.order || [];
        const newOrder = removeWidgetFromOrder(currentOrder, widgetId);

        if (newOrder.length === currentOrder.length) {
            return true;
        }

        const existingHiddenIds = currentSection.hiddenWidgetIds || [];
        const newHiddenIds = [...new Set([...existingHiddenIds, widgetId])];

        sections[sectionId] = {
            ...currentSection,
            order: newOrder,
            hiddenWidgetIds: newHiddenIds,
        };
        layout.profiles![deviceId] = {
            ...profile,
            activeSectionId: sectionId,
            sections,
        };
        await plugin.saveData("widgetLayout.json", layout);
        return true;
    }

    // 从当前设备 profile 中移除组件
    const currentOrder = profile.order || [];
    const newOrder = removeWidgetFromOrder(currentOrder, widgetId);

    if (newOrder.length === currentOrder.length) {
        return true;
    }

    // 初始化 hiddenWidgetIds（若不存在）
    const existingHiddenIds = profile.hiddenWidgetIds || [];
    // 将该 widgetId 加入 hiddenWidgetIds（去重）
    const newHiddenIds = [...new Set([...existingHiddenIds, widgetId])];

    layout.profiles![deviceId] = {
        ...profile,
        order: newOrder,
        hiddenWidgetIds: newHiddenIds,
    };
    await plugin.saveData("widgetLayout.json", layout);
    return true;
}

export async function deleteWidgetGlobally(
    plugin: Plugin,
    widgetId: string
): Promise<boolean> {
    // 删除组件内容文件
    await plugin.removeData(`widget-${widgetId}.json`);

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        return true;
    }

    // 从 defaultOrder 中移除
    if (layout.defaultOrder) {
        layout.defaultOrder = removeWidgetFromOrder(layout.defaultOrder, widgetId);
    }

    if (layout.defaultSections) {
        for (const section of Object.values(layout.defaultSections)) {
            section.order = removeWidgetFromOrder(section.order || [], widgetId);
        }
    }

    // 从所有设备 profiles 中移除
    if (layout.profiles) {
        for (const deviceId of Object.keys(layout.profiles)) {
            if (layout.profiles[deviceId].order) {
                layout.profiles[deviceId].order = removeWidgetFromOrder(
                    layout.profiles[deviceId].order,
                    widgetId
                );
            }
            // 从 hiddenWidgetIds 中移除
            if (layout.profiles[deviceId].hiddenWidgetIds) {
                layout.profiles[deviceId].hiddenWidgetIds = layout.profiles[deviceId].hiddenWidgetIds.filter(
                    id => id !== widgetId
                );
            }
            if (layout.profiles[deviceId].sections) {
                for (const section of Object.values(layout.profiles[deviceId].sections!)) {
                    section.order = removeWidgetFromOrder(section.order || [], widgetId);
                    if (section.hiddenWidgetIds) {
                        section.hiddenWidgetIds = section.hiddenWidgetIds.filter(id => id !== widgetId);
                    }
                }
            }
        }
    }

    // 从旧结构 order 中移除（兼容）
    if (layout.order) {
        layout.order = removeWidgetFromOrder(layout.order, widgetId);
    }

    await plugin.saveData("widgetLayout.json", layout);
    return true;
}

/**
 * 从 widgetLayout.json 读取 widgetLayoutNumber 和 widgetGap
 * 优先读取当前设备 profile，否则回退到全局值
 */
export async function loadWidgetLayoutSettings(
    plugin: Plugin,
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
): Promise<{ widgetLayoutNumber: number; widgetGap: number; source: string }> {
    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    const deviceId = getLocalDeviceId();
    const sectionsEnabled = options.sectionsEnabled ?? await isRuntimeComponentSectionsEnabled(plugin);
    const sectionId = normalizeSectionId(options.sectionId || getActiveSectionIdFromLayout(layout, deviceId));

    // 默认回退值
    const defaults = { widgetLayoutNumber: 4, widgetGap: 0.2 };

    // 桌面端：优先读取设备 profile
    if (isDesktopDeviceProfileEnabled() && deviceId && layout?.profiles?.[deviceId]) {
        const profile = layout.profiles[deviceId];
        if (sectionsEnabled) {
            const section = profile.sections?.[sectionId];
            if (section?.widgetLayoutNumber !== undefined || section?.widgetGap !== undefined) {
                return {
                    widgetLayoutNumber: section.widgetLayoutNumber ?? defaults.widgetLayoutNumber,
                    widgetGap: section.widgetGap ?? defaults.widgetGap,
                    source: `device section (${deviceId}/${sectionId})`,
                };
            }
        }
        if (profile.widgetLayoutNumber !== undefined || profile.widgetGap !== undefined) {
            return {
                widgetLayoutNumber: profile.widgetLayoutNumber ?? defaults.widgetLayoutNumber,
                widgetGap: profile.widgetGap ?? defaults.widgetGap,
                source: `device profile (${deviceId})`,
            };
        }
    }

    // 回退到全局值
    if (layout?.widgetLayoutNumber !== undefined || layout?.widgetGap !== undefined) {
        return {
            widgetLayoutNumber: layout.widgetLayoutNumber ?? defaults.widgetLayoutNumber,
            widgetGap: layout.widgetGap ?? defaults.widgetGap,
            source: "global",
        };
    }

    return { ...defaults, source: "default" };
}

/**
 * 保存 widgetLayoutNumber 和 widgetGap 到 widgetLayout.json
 * 桌面端保存到设备 profile，移动端保存到全局
 */
export async function saveWidgetLayoutSettings(
    plugin: Plugin,
    settings: { widgetLayoutNumber: number; widgetGap: number },
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
): Promise<void> {
    const layout = (await plugin.loadData("widgetLayout.json")) as WidgetLayoutData | null || {};
    const sectionsEnabled = options.sectionsEnabled ?? await isRuntimeComponentSectionsEnabled(plugin);

    if (isDesktopDeviceProfileEnabled()) {
        const deviceId = getLocalDeviceId();
        if (deviceId) {
            const profile = ensureDeviceProfile(layout, deviceId);
            if (sectionsEnabled) {
                const sectionId = normalizeSectionId(options.sectionId || profile.activeSectionId);
                const sections = profile.sections || {};
                sections[sectionId] = {
                    ...sections[sectionId],
                    order: sections[sectionId]?.order || getSectionOrderForDevice(layout, deviceId, sectionId),
                    widgetLayoutNumber: settings.widgetLayoutNumber,
                    widgetGap: settings.widgetGap,
                };
                layout.profiles![deviceId] = {
                    ...profile,
                    activeSectionId: sectionId,
                    sections,
                };
            } else {
                profile.widgetLayoutNumber = settings.widgetLayoutNumber;
                profile.widgetGap = settings.widgetGap;
                layout.profiles![deviceId] = profile;
            }
        }
    } else {
        // 移动端：保存到全局
        layout.widgetLayoutNumber = settings.widgetLayoutNumber;
        layout.widgetGap = settings.widgetGap;
    }

    await plugin.saveData("widgetLayout.json", layout);
}

// ==================== 隐藏组件管理 ====================

export type HiddenWidgetItem = {
    id: string;
    style: string | null;
    contentData: any | null;
};

/**
 * 获取当前设备已隐藏的组件列表
 */
export async function getHiddenWidgetsForCurrentDevice(
    plugin: Plugin,
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
): Promise<HiddenWidgetItem[]> {
    if (!isDesktopDeviceProfileEnabled()) {
        return [];
    }

    const deviceId = getLocalDeviceId();
    if (!deviceId) {
        console.warn("[Layout] 无法获取当前设备 ID");
        return [];
    }

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        return [];
    }

    const sectionsEnabled = options.sectionsEnabled ?? await isRuntimeComponentSectionsEnabled(plugin);
    const sectionId = normalizeSectionId(options.sectionId || getActiveSectionIdFromLayout(layout, deviceId));
    const hiddenWidgetIds = getHiddenWidgetIdsForDevice(layout, deviceId, sectionsEnabled, sectionId);
    if (hiddenWidgetIds.length === 0) {
        return [];
    }

    const defaultOrder = sectionsEnabled
        ? getDefaultSectionOrder(layout, sectionId)
        : (layout.defaultOrder || []);
    const hiddenWidgets: HiddenWidgetItem[] = [];

    for (const widgetId of hiddenWidgetIds) {
        // 从 defaultOrder 获取样式
        const defaultItem = defaultOrder.find(item => item.id === widgetId);
        const style = defaultItem?.style || null;

        // 读取组件内容
        const contentData = await plugin.loadData(`widget-${widgetId}.json`);

        hiddenWidgets.push({
            id: widgetId,
            style,
            contentData,
        });
    }

    return hiddenWidgets;
}

/**
 * 恢复当前设备已隐藏的组件
 * 按照 defaultOrder 的位置插回，若找不到则追加到末尾
 */
export async function restoreWidgetForCurrentDevice(
    plugin: Plugin,
    widgetId: string,
    options: { sectionsEnabled?: boolean; sectionId?: string | null } = {},
): Promise<boolean> {
    if (!isDesktopDeviceProfileEnabled()) {
        console.warn("[Layout] 当前设备恢复仅支持桌面端");
        return false;
    }

    const deviceId = getLocalDeviceId();
    if (!deviceId) {
        console.warn("[Layout] 无法获取当前设备 ID");
        return false;
    }

    const layout = await plugin.loadData("widgetLayout.json") as WidgetLayoutData | null;
    if (!layout) {
        console.warn("[Layout] 布局数据不存在");
        return false;
    }

    const profile = layout.profiles?.[deviceId];
    if (!profile) {
        console.warn("[Layout] 当前设备 profile 不存在");
        return false;
    }

    const sectionsEnabled = options.sectionsEnabled ?? await isRuntimeComponentSectionsEnabled(plugin);
    const sectionId = normalizeSectionId(options.sectionId || getActiveSectionIdFromLayout(layout, deviceId));
    const section = sectionsEnabled ? getProfileSection(layout, deviceId, sectionId) : null;
    const hiddenWidgetIds = sectionsEnabled ? (section?.hiddenWidgetIds || []) : (profile.hiddenWidgetIds || []);
    if (!hiddenWidgetIds.includes(widgetId)) {
        console.info(`[Layout] 组件 ${widgetId} 不在隐藏列表中`);
        return false;
    }

    // 从 hiddenWidgetIds 中移除
    const newHiddenIds = hiddenWidgetIds.filter(id => id !== widgetId);

    // 获取当前 order
    const currentOrder = sectionsEnabled
        ? (section?.order || getSectionOrderForDevice(layout, deviceId, sectionId))
        : (profile.order || []);

    // 从 defaultOrder 中找到该组件的样式
    const defaultOrder = sectionsEnabled
        ? getDefaultSectionOrder(layout, sectionId)
        : (layout.defaultOrder || []);
    const defaultItem = defaultOrder.find(item => item.id === widgetId);

    // 构建要插入的组件项
    const widgetItem: LayoutItem = {
        id: widgetId,
        style: defaultItem?.style || null,
        index: currentOrder.length,
    };

    // 计算插入位置：参照 defaultOrder 中该组件前后的组件在当前 order 中的位置
    let insertIndex = currentOrder.length; // 默认追加到末尾

    const defaultIndex = defaultOrder.findIndex(item => item.id === widgetId);
    if (defaultIndex !== -1) {
        // 向前查找：找到 defaultOrder 中该组件前面最近一个在当前 order 中的组件
        for (let i = defaultIndex - 1; i >= 0; i--) {
            const prevWidgetId = defaultOrder[i].id;
            const prevIndexInCurrent = currentOrder.findIndex(item => item.id === prevWidgetId);
            if (prevIndexInCurrent !== -1) {
                insertIndex = prevIndexInCurrent + 1;
                break;
            }
        }

        // 如果向前没找到，向后查找：找到 defaultOrder 中该组件后面最近一个在当前 order 中的组件
        if (insertIndex === currentOrder.length) {
            for (let i = defaultIndex + 1; i < defaultOrder.length; i++) {
                const nextWidgetId = defaultOrder[i].id;
                const nextIndexInCurrent = currentOrder.findIndex(item => item.id === nextWidgetId);
                if (nextIndexInCurrent !== -1) {
                    insertIndex = nextIndexInCurrent;
                    break;
                }
            }
        }
    }

    // 插入组件
    const newOrder = [...currentOrder];
    newOrder.splice(insertIndex, 0, widgetItem);

    // 更新 index
    newOrder.forEach((item, idx) => {
        item.index = idx;
    });

    // 保存
    if (sectionsEnabled) {
        const sections = profile.sections || {};
        sections[sectionId] = {
            ...sections[sectionId],
            order: newOrder,
            hiddenWidgetIds: newHiddenIds,
        };
        layout.profiles[deviceId] = {
            ...profile,
            activeSectionId: sectionId,
            sections,
        };
    } else {
        layout.profiles[deviceId] = {
            ...profile,
            order: newOrder,
            hiddenWidgetIds: newHiddenIds,
        };
    }

    await plugin.saveData("widgetLayout.json", layout);
    console.info(`[Layout] 已恢复组件 ${widgetId} 到位置 ${insertIndex}`);
    return true;
}

// ==================== 同步签名 ====================

/**
 * 构建当前设备有效签名，用于多设备同步检测。
 * 签名包含：归一化配置 + 当前设备有效布局 + 各 widget 内容签名。
 * index.ts 和 homepage.svelte 应统一使用此函数，确保口径一致。
 */
export async function buildHomepageAppliedSignature(
    plugin: Plugin,
    config: Record<string, unknown> | null,
    layout: WidgetLayoutData | null,
    deviceId: string | null,
    sectionsEnabled = false,
): Promise<string> {
    const parts: string[] = [];

    // 1. 归一化配置签名（排除 deviceProfiles，bannerDeviceProfiles 只保留当前设备 bannerHeight）
    try {
        const normalizedConfig = normalizeConfigForSignatureHelper(config, deviceId);
        parts.push("cfg:" + JSON.stringify(normalizedConfig));
    } catch {
        parts.push("cfg:null");
    }

    // 2. 当前设备有效布局
    try {
        const activeSectionId = sectionsEnabled ? getActiveSectionIdFromLayout(layout, deviceId) : null;
        const effectiveOrder = getEffectiveHomepageOrderForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
        const hiddenWidgetIds = getHiddenWidgetIdsForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
        const widgetLayoutNumber = getWidgetLayoutNumberForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
        const widgetGap = getWidgetGapForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
        const layoutPart = {
            activeSectionId,
            order: effectiveOrder.map((item) => ({ id: item.id, style: item.style })),
            hiddenWidgetIds: [...hiddenWidgetIds].sort(),
            widgetLayoutNumber,
            widgetGap,
        };
        parts.push("layout:" + JSON.stringify(layoutPart));
    } catch {
        parts.push("layout:null");
    }

    // 3. 当前 order 中各 widget 内容签名
    try {
        const activeSectionId = sectionsEnabled ? getActiveSectionIdFromLayout(layout, deviceId) : null;
        const effectiveOrder = getEffectiveHomepageOrderForDevice(layout, deviceId, sectionsEnabled, activeSectionId);
        const widgetSigs: string[] = [];
        for (const item of effectiveOrder) {
            try {
                const content = await plugin.loadData(`widget-${item.id}.json`);
                const normalized = normalizeWidgetConfigForHomepageSignature(content);
                widgetSigs.push(`${item.id}:${JSON.stringify(normalized)}`);
            } catch {
                widgetSigs.push(`${item.id}:null`);
            }
        }
        parts.push("widgets:" + widgetSigs.join(","));
    } catch {
        parts.push("widgets:null");
    }

    return parts.join("|");
}

function normalizeConfigForSignatureHelper(config: Record<string, unknown> | null, deviceId: string | null): unknown {
    if (!config || typeof config !== "object") return config;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(config)) {
        if (key === "deviceProfiles") continue;
        if (key === "bannerDeviceProfiles") {
            const profiles = config[key] as Record<string, Record<string, unknown>> | undefined;
            if (deviceId && profiles?.[deviceId]?.bannerHeight !== undefined) {
                normalized[key] = {
                    [deviceId]: {
                        bannerHeight: profiles[deviceId].bannerHeight,
                    },
                };
            }
            continue;
        }
        normalized[key] = config[key];
    }
    return normalized;
}
