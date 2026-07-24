import { createEmptyLayout } from "./deviceViewStorage";
import { getCurrentDeviceInfo } from "@/homepage/utils/deviceProfile";
import type {
    DeviceLayoutItem,
    DeviceLayoutSection,
    DeviceViewContext,
    DeviceViewLayout,
} from "./deviceViewTypes";

/**
 * 旧版本根布局到设备视图 Schema 2 的纯解析逻辑。
 * 本文件不执行任何 I/O、写盘或 manifest 提交，只负责：
 * - profile 选择（resolveLegacyProfile）
 * - 旧布局转换（getDesktopLayout / getSimpleLayout）
 * - 样式来源解析（resolveStyleBySource）
 * - 分栏设置规范化（buildSectionSettingsConfig）
 *
 * 第一铁律约束：
 * - 不读取其他设备目录；
 * - 匹配不到当前设备 profile 时只使用公共回退（defaultOrder/defaultSections）；
 * - 不扫描或合并多个旧设备 profile。
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function normalizeItems(value: unknown): DeviceLayoutItem[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: DeviceLayoutItem[] = [];
    for (const raw of value) {
        if (!isPlainObject(raw) || typeof raw.id !== "string" || !raw.id.trim() || seen.has(raw.id)) continue;
        seen.add(raw.id);
        result.push({ id: raw.id, style: typeof raw.style === "string" ? raw.style : null, index: result.length });
    }
    return result;
}

export function reindexItems(items: DeviceLayoutItem[]): DeviceLayoutItem[] {
    return items.map((item, index) => ({ ...item, index }));
}

export function firstNonEmptyOrder(...values: unknown[]): DeviceLayoutItem[] {
    for (const value of values) {
        const items = normalizeItems(value);
        if (items.length > 0) return items;
    }
    return [];
}

/**
 * 读取 homepageSettingConfig.json 中真实用户分栏 ID。
 * 旧用户已经存在的 overview/总览也是普通用户数据，必须保留。
 */
export function readConfiguredRealSectionIds(legacySettings: Record<string, unknown> | null): string[] {
    if (!legacySettings) return [];
    const rawSections = legacySettings.componentSections;
    if (!Array.isArray(rawSections)) return [];
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of rawSections) {
        if (!isPlainObject(item)) continue;
        const id = typeof item.id === "string" ? item.id.trim() : "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }
    return result;
}

export interface ResolvedLegacyProfile {
    profile: Record<string, unknown> | null;
    profileKey: string | undefined;
    fallback: boolean;
    strategy: "exact-id" | "legacy-id" | "legacy-metadata-id" | "machine-signature" | "public-fallback" | "ambiguous";
    ambiguousProfileKeys?: string[];
    note: string;
}

/**
 * 按真实旧设备结构选择 profile（适用于所有 surface）：
 * 1. profiles[context.physicalDeviceId] 明确存在（最高优先级）；
 * 2. 仅用 4.8.4 旧通用 ID 精确匹配 profile key 或旧 deviceProfiles.deviceId；
 * 3. 再按唯一机器签名匹配；否则使用公共回退。
 *
 * 匹配不到时不得使用其他设备 profile；不合并多个 profile。
 */
export function resolveLegacyProfile(
    context: DeviceViewContext,
    legacy: Record<string, unknown>,
    legacySettings: Record<string, unknown> | null,
): ResolvedLegacyProfile {
    const profiles = isPlainObject(legacy.profiles) ? legacy.profiles : {};
    const directProfile = profiles[context.physicalDeviceId];
    if (isPlainObject(directProfile)) {
        return {
            profile: directProfile,
            profileKey: context.physicalDeviceId,
            fallback: false,
            strategy: "exact-id",
            note: "exact-id",
        };
    }

    const deviceProfiles = isPlainObject(legacySettings?.deviceProfiles)
        ? legacySettings!.deviceProfiles as Record<string, unknown>
        : {};
    const knownHistoricalIds = new Set(
        context.legacyProfileCandidateIds.filter((id): id is string => Boolean(id)),
    );
    const directHistoricalMatches = [...knownHistoricalIds].filter((profileKey) => (
        isPlainObject(profiles[profileKey])
    ));
    const metadataIdMatches = Object.entries(deviceProfiles)
        .filter(([profileKey, metadata]) => (
            isPlainObject(profiles[profileKey])
            && isPlainObject(metadata)
            && typeof metadata.deviceId === "string"
            && knownHistoricalIds.has(metadata.deviceId)
        ))
        .map(([profileKey]) => profileKey);
    const historicalMatches = [...new Set([...directHistoricalMatches, ...metadataIdMatches])];
    if (historicalMatches.length === 1) {
        const profileKey = historicalMatches[0];
        return {
            profile: profiles[profileKey] as Record<string, unknown>,
            profileKey,
            fallback: false,
            strategy: directHistoricalMatches.includes(profileKey) ? "legacy-id" : "legacy-metadata-id",
            note: directHistoricalMatches.includes(profileKey) ? "legacy-id" : "legacy-metadata-id",
        };
    }
    if (historicalMatches.length > 1) {
        return {
            profile: null,
            profileKey: undefined,
            fallback: false,
            strategy: "ambiguous",
            ambiguousProfileKeys: historicalMatches,
            note: "ambiguous",
        };
    }

    const info = getCurrentDeviceInfo();
    const normalize = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
    const isMobileFrontend = info.frontend === "mobile" || info.frontend === "browser-mobile";
    const normalizeOs = (value: string): string => {
        const v = value.trim().toLowerCase();
        if (v === "win32") return "windows";
        if (v === "darwin") return "darwin";
        return v;
    };
    const machineMatches = Object.entries(deviceProfiles)
        .filter(([profileKey, metadata]) => (
            isPlainObject(profiles[profileKey])
            && isPlainObject(metadata)
            && normalize(metadata.hostname) === normalize(info.deviceName)
            && normalizeOs(normalize(metadata.platform)) === normalize(info.os)
            // 官方 API 不提供 arch，跳过 arch 比较
            && metadata.isMobile === isMobileFrontend
        ))
        .map(([profileKey]) => profileKey);
    if (machineMatches.length === 1) {
        const profileKey = machineMatches[0];
        return {
            profile: profiles[profileKey] as Record<string, unknown>,
            profileKey,
            fallback: false,
            strategy: "machine-signature",
            note: "machine-signature",
        };
    }
    if (machineMatches.length > 1) {
        return {
            profile: null,
            profileKey: undefined,
            fallback: false,
            strategy: "ambiguous",
            ambiguousProfileKeys: machineMatches,
            note: "ambiguous",
        };
    }
    const fallbackProfile: Record<string, unknown> = {
        order: legacy.defaultOrder ?? legacy.order,
        sections: legacy.defaultSections,
        hiddenWidgetIds: legacy.hiddenWidgetIds,
    };
    const hasFallback = fallbackProfile.order !== undefined || isPlainObject(fallbackProfile.sections);
    return {
        profile: hasFallback ? fallbackProfile : null,
        profileKey: undefined,
        fallback: true,
        strategy: "public-fallback",
        note: "public-fallback",
    };
}

function findStyleInItems(items: DeviceLayoutItem[] | undefined, id: string): string | null {
    if (!items) return null;
    for (const item of items) {
        if (item.id === id) {
            return typeof item.style === "string" ? item.style : null;
        }
    }
    return null;
}

/**
 * 按来源优先级解析单个组件的样式。
 *
 * 要求：
 * - style 为 null 时继续向后寻找有效字符串；
 * - 不能从其他分栏取得样式（分栏模式下只查归属分栏）；
 * - 不改变组件 ID、成员顺序和配置内容。
 *
 * 分栏模式优先级（sectionId 非 null）：
 *   1. profile.sections[sectionId].order
 *   2. defaultSections[sectionId].order
 *   3. profile.order
 *   4. legacy.defaultOrder
 *   5. legacy.order
 *
 * 无分栏模式优先级（sectionId === null）：
 *   1. profile.order
 *   2. legacy.defaultOrder
 *   3. legacy.order
 *   4. 旧分栏样式只作为最后回退（遍历所有分栏）
 */
function resolveStyleBySource(
    id: string,
    sectionId: string | null,
    profile: Record<string, unknown> | null,
    defaultSections: Record<string, unknown>,
    legacy: Record<string, unknown>,
): string | null {
    if (sectionId !== null) {
        const profileSections = isPlainObject(profile?.sections) ? profile!.sections : {};
        const profileSection = isPlainObject(profileSections[sectionId]) ? profileSections[sectionId] : null;
        const styleFromProfileSection = findStyleInItems(normalizeItems(profileSection?.order), id);
        if (styleFromProfileSection) return styleFromProfileSection;

        const defaultSection = isPlainObject(defaultSections[sectionId]) ? defaultSections[sectionId] : null;
        const styleFromDefaultSection = findStyleInItems(normalizeItems(defaultSection?.order), id);
        if (styleFromDefaultSection) return styleFromDefaultSection;
    }

    const styleFromProfile = findStyleInItems(normalizeItems(profile?.order), id);
    if (styleFromProfile) return styleFromProfile;

    const styleFromDefaultOrder = findStyleInItems(normalizeItems(legacy.defaultOrder), id);
    if (styleFromDefaultOrder) return styleFromDefaultOrder;

    const styleFromLegacyOrder = findStyleInItems(normalizeItems(legacy.order), id);
    if (styleFromLegacyOrder) return styleFromLegacyOrder;

    if (sectionId === null) {
        const profileSections = isPlainObject(profile?.sections) ? profile!.sections : {};
        for (const raw of Object.values(profileSections)) {
            if (!isPlainObject(raw)) continue;
            const style = findStyleInItems(normalizeItems(raw.order), id);
            if (style) return style;
        }
        for (const raw of Object.values(defaultSections)) {
            if (!isPlainObject(raw)) continue;
            const style = findStyleInItems(normalizeItems(raw.order), id);
            if (style) return style;
        }
    }

    return null;
}

export interface LegacySectionConfig {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}

/**
 * 根据迁移后的 layout.sections 同步 settings.config.componentSections。
 * - 布局中存在但设置未登记的合法分栏，以最小默认信息补入；
 * - 设置中存在但布局没有任何定义或成员的无效分栏，不保留；
 * - 保留旧设置中的名称、createdAt、updatedAt。
 */
export function buildSectionSettingsConfig(
    layout: DeviceViewLayout,
    legacySettings: Record<string, unknown> | null,
): { componentSections: LegacySectionConfig[]; componentSectionsEnabled: boolean } {
    const layoutSectionIds = layout.sections ? Object.keys(layout.sections) : [];
    const legacySectionsRaw = Array.isArray(legacySettings?.componentSections) ? legacySettings!.componentSections : [];
    const legacyByName = new Map<string, Record<string, unknown>>();
    for (const item of legacySectionsRaw) {
        if (!isPlainObject(item)) continue;
        const id = typeof item.id === "string" ? item.id.trim() : "";
        if (id) legacyByName.set(id, item as Record<string, unknown>);
    }
    const now = Date.now();
    const componentSections: LegacySectionConfig[] = [];
    for (const sectionId of layoutSectionIds) {
        const legacy = legacyByName.get(sectionId);
        const name = legacy && typeof legacy.name === "string" && legacy.name.trim()
            ? legacy.name.trim()
            : sectionId;
        const createdAt = legacy && typeof legacy.createdAt === "number" && Number.isFinite(legacy.createdAt)
            ? legacy.createdAt
            : now;
        const updatedAt = legacy && typeof legacy.updatedAt === "number" && Number.isFinite(legacy.updatedAt)
            ? legacy.updatedAt
            : createdAt;
        componentSections.push({ id: sectionId, name, createdAt, updatedAt });
    }
    return {
        componentSections,
        componentSectionsEnabled: layout.componentSectionsModeEnabled === true && componentSections.length > 0,
    };
}

/**
 * 将已发布旧根 widgetLayout.json 一次性生成最终 schema 2 设备视图布局。
 *
 * 真实旧数据规则：
 * - 旧用户已经存在的 overview/总览分栏必须保留为普通分栏，不再视为系统内置分栏；
 * - 所有真实用户分栏（含 overview）保留原组件及顺序；
 * - 兼容组件池（root hidden、未归属组件等）追加到第一个真实分栏；
 * - 无真实用户分栏时全部组件进入全局 order，不启用分栏模式；
 * - 旧 componentSectionsEnabled !== true 时，不生成分栏模式，旧分栏数据仅用于样式和顺序回退。
 *
 * 样式优先级（按来源解析）：
 * - 分栏模式：profile.sections[sectionId] → defaultSections[sectionId] → profile.order → defaultOrder → legacy.order
 * - 无分栏模式：profile.order → defaultOrder → legacy.order → 旧分栏样式（最后回退）
 */
export function getDesktopLayout(
    context: DeviceViewContext,
    legacy: Record<string, unknown> | null,
    legacySettings: Record<string, unknown> | null,
    profileResolution: ResolvedLegacyProfile | null,
): DeviceViewLayout {
    const empty = createEmptyLayout(context);
    if (!legacy) return empty;
    const profile = profileResolution?.profile ?? null;
    const defaultSections = isPlainObject(legacy.defaultSections) ? legacy.defaultSections : {};
    const profileSections = isPlainObject(profile?.sections) ? profile!.sections : {};
    const mergedRawSections: Record<string, Record<string, unknown>> = {};
    for (const [sectionId, raw] of Object.entries(defaultSections)) {
        if (isPlainObject(raw)) mergedRawSections[sectionId] = raw as Record<string, unknown>;
    }
    for (const [sectionId, raw] of Object.entries(profileSections)) {
        if (isPlainObject(raw)) mergedRawSections[sectionId] = raw as Record<string, unknown>;
    }
    const configuredRealIds = readConfiguredRealSectionIds(legacySettings);
    const realSectionIds: string[] = [...configuredRealIds];
    const seenRealIds = new Set(configuredRealIds);
    for (const sectionId of Object.keys(mergedRawSections)) {
        if (seenRealIds.has(sectionId)) continue;
        seenRealIds.add(sectionId);
        realSectionIds.push(sectionId);
    }
    const sectionsEnabled = legacySettings?.componentSectionsEnabled === true;
    const componentSectionsModeEnabled = sectionsEnabled && realSectionIds.length > 0;
    const assignedIds = new Set<string>();
    const sections: Record<string, DeviceLayoutSection> = {};
    const globalOrder: DeviceLayoutItem[] = [];

    if (componentSectionsModeEnabled) {
        for (const sectionId of realSectionIds) {
            const rawSection = mergedRawSections[sectionId];
            const widgetIds: string[] = [];
            const appendToSection = (id: string) => {
                if (!id || assignedIds.has(id)) return;
                assignedIds.add(id);
                widgetIds.push(id);
            };
            for (const item of normalizeItems(rawSection?.order)) appendToSection(item.id);
            if (Array.isArray(rawSection?.hiddenWidgetIds)) {
                for (const id of rawSection!.hiddenWidgetIds) {
                    if (typeof id === "string") appendToSection(id);
                }
            }
            const section: DeviceLayoutSection = { widgetIds };
            if (typeof rawSection?.widgetLayoutNumber === "number") section.widgetLayoutNumber = rawSection.widgetLayoutNumber;
            if (typeof rawSection?.widgetGap === "number") section.widgetGap = rawSection.widgetGap;
            sections[sectionId] = section;
            for (const id of widgetIds) {
                const style = resolveStyleBySource(id, sectionId, profile, defaultSections, legacy);
                globalOrder.push({ id, style, index: globalOrder.length });
            }
        }
        const poolIds: string[] = [];
        const appendToPool = (id: string) => {
            if (!id || assignedIds.has(id) || poolIds.includes(id)) return;
            poolIds.push(id);
        };
        for (const item of normalizeItems(profile?.order)) appendToPool(item.id);
        if (Array.isArray(profile?.hiddenWidgetIds)) {
            for (const id of profile!.hiddenWidgetIds) {
                if (typeof id === "string") appendToPool(id);
            }
        }
        for (const [sectionId, rawSection] of Object.entries(mergedRawSections)) {
            if (realSectionIds.includes(sectionId)) continue;
            if (Array.isArray(rawSection?.hiddenWidgetIds)) {
                for (const id of rawSection!.hiddenWidgetIds) {
                    if (typeof id === "string") appendToPool(id);
                }
            }
        }
        if (realSectionIds.length > 0) {
            const firstSectionId = realSectionIds[0];
            const firstSection = sections[firstSectionId];
            for (const id of poolIds) {
                if (assignedIds.has(id)) continue;
                assignedIds.add(id);
                firstSection.widgetIds.push(id);
                const style = resolveStyleBySource(id, null, profile, defaultSections, legacy);
                globalOrder.push({ id, style, index: globalOrder.length });
            }
        }
    } else {
        // 未启用分栏：全局顺序优先 profile.order，回退 defaultOrder、legacy.order。
        // 旧 section.order 只能作为缺失组件的最后回退，不能重排根布局。
        const baseItems = firstNonEmptyOrder(profile?.order, legacy.defaultOrder, legacy.order);
        for (const item of baseItems) {
            if (assignedIds.has(item.id)) continue;
            assignedIds.add(item.id);
            const style = resolveStyleBySource(item.id, null, profile, defaultSections, legacy);
            globalOrder.push({ id: item.id, style, index: globalOrder.length });
        }
        const rootHiddenIds = Array.isArray(profile?.hiddenWidgetIds)
            ? profile!.hiddenWidgetIds.filter((id): id is string => typeof id === "string")
            : (Array.isArray(legacy.hiddenWidgetIds) ? legacy.hiddenWidgetIds.filter((id): id is string => typeof id === "string") : []);
        for (const id of rootHiddenIds) {
            if (assignedIds.has(id)) continue;
            assignedIds.add(id);
            const style = resolveStyleBySource(id, null, profile, defaultSections, legacy);
            globalOrder.push({ id, style, index: globalOrder.length });
        }
        // 旧 section.order 仅补充缺失组件，不重排已加入的全局顺序。
        for (const sectionId of realSectionIds) {
            const rawSection = mergedRawSections[sectionId];
            for (const item of normalizeItems(rawSection?.order)) {
                if (assignedIds.has(item.id)) continue;
                assignedIds.add(item.id);
                const style = resolveStyleBySource(item.id, null, profile, defaultSections, legacy);
                globalOrder.push({ id: item.id, style, index: globalOrder.length });
            }
            if (Array.isArray(rawSection?.hiddenWidgetIds)) {
                for (const id of rawSection!.hiddenWidgetIds) {
                    if (typeof id !== "string" || assignedIds.has(id)) continue;
                    assignedIds.add(id);
                    const style = resolveStyleBySource(id, null, profile, defaultSections, legacy);
                    globalOrder.push({ id, style, index: globalOrder.length });
                }
            }
        }
    }

    const oldActive = typeof profile?.activeSectionId === "string" ? profile!.activeSectionId : undefined;
    let activeSectionId: string | undefined;
    if (componentSectionsModeEnabled) {
        activeSectionId = oldActive && realSectionIds.includes(oldActive) ? oldActive : realSectionIds[0];
    }
    const widgetLayoutNumber = typeof profile?.widgetLayoutNumber === "number"
        ? profile!.widgetLayoutNumber
        : (typeof legacy.widgetLayoutNumber === "number" ? legacy.widgetLayoutNumber : undefined);
    const widgetGap = typeof profile?.widgetGap === "number"
        ? profile!.widgetGap
        : (typeof legacy.widgetGap === "number" ? legacy.widgetGap : undefined);
    const layout: DeviceViewLayout = {
        ...empty,
        order: reindexItems(globalOrder),
        activeSectionId,
        sections: componentSectionsModeEnabled ? sections : undefined,
        componentSectionsModeEnabled,
    };
    if (widgetLayoutNumber !== undefined) layout.widgetLayoutNumber = widgetLayoutNumber;
    if (widgetGap !== undefined) layout.widgetGap = widgetGap;
    return layout;
}

/**
 * 简单 surface（desktop-sidebar / mobile-homepage）的旧根一次性迁移。
 *
 * Profile 选择规则与 desktop-homepage 完全一致：
 * 1. profiles[context.physicalDeviceId]；
 * 2. defaultOrder；
 * 3. legacy.order。
 *
 * 匹配不到时不得使用其他设备 profile。
 * 旧 root.hiddenWidgetIds 中的组件解除隐藏并追加到全局 order 末尾，避免数据丢失。
 *
 * widgetLayoutNumber / widgetGap 优先级：
 * 1. 当前匹配 profile；
 * 2. 旧根布局；
 * 3. 不存在时保持最终默认值（不写入）。
 */
export function getSimpleLayout(
    context: DeviceViewContext,
    legacy: Record<string, unknown> | null,
    profileResolution: ResolvedLegacyProfile | null,
): DeviceViewLayout {
    const empty = createEmptyLayout(context);
    if (!legacy) return empty;
    const profile = profileResolution?.profile ?? null;
    const baseOrder = firstNonEmptyOrder(profile?.order, legacy.defaultOrder, legacy.order);
    const rootHiddenIds = Array.isArray(profile?.hiddenWidgetIds)
        ? profile!.hiddenWidgetIds.filter((id): id is string => typeof id === "string")
        : (Array.isArray(legacy.hiddenWidgetIds) ? legacy.hiddenWidgetIds.filter((id): id is string => typeof id === "string") : []);
    const seenIds = new Set(baseOrder.map((item) => item.id));
    const mergedOrder: DeviceLayoutItem[] = [...baseOrder];
    for (const id of rootHiddenIds) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        mergedOrder.push({ id, style: null, index: mergedOrder.length });
    }
    const layout: DeviceViewLayout = {
        ...empty,
        order: reindexItems(mergedOrder),
    };
    // 优先级：1. 当前匹配 profile；2. 旧根布局；3. 不存在时保持最终默认值。
    // 不使用其他设备 profile 的参数。
    const widgetLayoutNumber = typeof profile?.widgetLayoutNumber === "number"
        ? profile!.widgetLayoutNumber
        : (typeof legacy.widgetLayoutNumber === "number" ? legacy.widgetLayoutNumber : undefined);
    const widgetGap = typeof profile?.widgetGap === "number"
        ? profile!.widgetGap
        : (typeof legacy.widgetGap === "number" ? legacy.widgetGap : undefined);
    if (widgetLayoutNumber !== undefined) layout.widgetLayoutNumber = widgetLayoutNumber;
    if (widgetGap !== undefined) layout.widgetGap = widgetGap;
    return layout;
}
