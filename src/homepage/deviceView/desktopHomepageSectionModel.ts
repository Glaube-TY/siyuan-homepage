import type {
    ComponentSection,
} from "@/homepage/homepageSetting/config";
import { normalizeComponentSectionsNavAlign } from "@/homepage/homepageSetting/config";
import {
    rearrangeGlobalOrderBySections,
    type LayoutItem,
    type WidgetLayoutProfileSectionData,
} from "@/components/utils/widgetBlock/utils/layout-section-ops";
import type { WidgetLayoutData } from "@/components/utils/widgetBlock/utils/layout-shared";
import {
    createDeviceViewBlockedError,
} from "./deviceViewErrors";
import type {
    DeviceLayoutSection,
    DeviceViewContext,
    DeviceViewLayout,
    DeviceViewSettings,
} from "./deviceViewTypes";
import { assertDeviceViewSegment } from "./deviceViewPaths";
import { isPlainJsonObject } from "./jsonSafe";

export const DESKTOP_HOMEPAGE_SECTION_MODEL_VERSION = 1;

export interface DesktopHomepageSection {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    widgetIds: string[];
    widgetLayoutNumber?: number;
    widgetGap?: number;
}

/**
 * 纯函数：从当前桌面主页 DeviceViewLayout 或兼容层 WidgetLayoutData 中派生统一的 ComponentSection 列表。
 * 分栏顺序严格采用 Object.keys(sections) 的插入顺序。
 */
export function deriveDesktopHomepageSectionsFromLayout(
    layout: DeviceViewLayout | WidgetLayoutData | null | undefined,
    scopeId?: string,
): ComponentSection[] {
    if (!layout) return [];
    let rawSections: Record<string, { name?: string; createdAt?: number; updatedAt?: number }> | undefined;
    if ("sections" in layout && layout.sections) {
        rawSections = layout.sections as Record<string, { name?: string; createdAt?: number; updatedAt?: number }>;
    } else if ("profiles" in layout && layout.profiles) {
        const profile = scopeId ? layout.profiles[scopeId] : Object.values(layout.profiles)[0];
        rawSections = profile?.sections;
    }
    if (!rawSections) return [];
    const entries = Object.entries(rawSections);
    const now = Date.now();
    return entries.map(([id, section], index) => {
        const trimmedName = typeof section?.name === "string" && section.name.trim()
            ? section.name.trim()
            : `分区 ${index + 1}`;
        const createdAt = typeof section?.createdAt === "number" && Number.isFinite(section.createdAt)
            ? section.createdAt
            : now;
        const updatedAt = typeof section?.updatedAt === "number" && Number.isFinite(section.updatedAt)
            ? section.updatedAt
            : createdAt;
        return {
            id,
            name: trimmedName,
            createdAt,
            updatedAt,
        };
    });
}

/**
 * 纯函数：根据当前桌面主页 layout 和 view.json 中的非结构配置，派生运行期完整配置。
 *
 * 规则：
 * - 剥离 view 中任何可能残留的 componentSectionsEnabled 与 componentSections；
 * - componentSectionsEnabled 由 layout.componentSectionsModeEnabled 派生；
 * - componentSections 由 layout.sections 统一派生；
 * - componentSectionsNavAlign 取 view 原值（空时默认 center）。
 */
export function deriveDesktopHomepageConfig(
    layout: DeviceViewLayout | WidgetLayoutData | null | undefined,
    rawViewConfig: Record<string, unknown> | null | undefined,
    scopeId?: string,
): Record<string, unknown> {
    const raw = rawViewConfig ?? {};
    const {
        componentSectionsEnabled: _ignoredEnabled,
        componentSections: _ignoredSections,
        ...cleanSettings
    } = raw;

    const sections = deriveDesktopHomepageSectionsFromLayout(layout, scopeId);
    let modeEnabled: boolean | undefined;
    if (layout) {
        if ("componentSectionsModeEnabled" in layout && layout.componentSectionsModeEnabled !== undefined) {
            modeEnabled = (layout as DeviceViewLayout).componentSectionsModeEnabled;
        } else if ("profiles" in layout && layout.profiles) {
            const profile = scopeId ? layout.profiles[scopeId] : Object.values(layout.profiles)[0];
            modeEnabled = profile?.componentSectionsModeEnabled;
        }
    }
    const sectionsEnabled = modeEnabled === true && sections.length > 0;
    const navAlign = normalizeComponentSectionsNavAlign(raw.componentSectionsNavAlign);

    return {
        ...cleanSettings,
        componentSectionsEnabled: sectionsEnabled,
        componentSections: sections,
        componentSectionsNavAlign: navAlign,
    };
}

/**
 * 校验桌面主页 5.0 layout 的分栏不变量。
 */
export function assertDesktopHomepageLayoutInvariants(
    layout: DeviceViewLayout | WidgetLayoutData,
    contextOrScopeId: DeviceViewContext | string,
): void {
    const context: DeviceViewContext = typeof contextOrScopeId === "string"
        ? { scopeId: contextOrScopeId, surface: "desktop-homepage", physicalDeviceId: contextOrScopeId, isMobileShared: false, plugin: {} as any }
        : contextOrScopeId;

    if ("surface" in layout && layout.surface !== "desktop-homepage") return;

    let globalOrder: LayoutItem[];
    let sections: Record<string, { widgetIds: string[]; name?: string; createdAt?: number; updatedAt?: number }> | undefined;
    let modeEnabled: boolean | undefined;
    let activeSectionId: string | undefined;

    let modelVersion: number | undefined;
    if ("profiles" in layout && layout.profiles) {
        const profile = layout.profiles[context.scopeId];
        if (!profile) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页当前设备 profile 缺失：${context.scopeId}`,
            );
        }
        globalOrder = profile?.order ?? layout.order ?? [];
        sections = profile?.sections;
        modeEnabled = profile?.componentSectionsModeEnabled;
        activeSectionId = profile?.activeSectionId;
        modelVersion = profile?.componentSectionsModelVersion ?? layout.componentSectionsModelVersion;
    } else {
        const devLayout = layout as DeviceViewLayout;
        globalOrder = (devLayout.order || []) as LayoutItem[];
        sections = devLayout.sections;
        modeEnabled = devLayout.componentSectionsModeEnabled;
        activeSectionId = devLayout.activeSectionId;
        modelVersion = devLayout.componentSectionsModelVersion;
    }

    if (modelVersion !== DESKTOP_HOMEPAGE_SECTION_MODEL_VERSION) {
        throw createDeviceViewBlockedError(
            context,
            "desktop_section_layout_corrupted",
            "桌面主页分栏模型版本缺失或不受支持",
        );
    }

    const globalIds = new Set<string>();
    for (const item of globalOrder) {
        if (globalIds.has(item.id)) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页布局全局 order 存在重复组件 ${item.id}`,
            );
        }
        globalIds.add(item.id);
    }

    const sectionIds = Object.keys(sections || {});
    const seenSectionNames = new Set<string>();

    if (activeSectionId !== undefined && !sections?.[activeSectionId]) {
        throw createDeviceViewBlockedError(
            context,
            "desktop_section_layout_corrupted",
            `桌面主页活动分栏 ${activeSectionId} 不属于现有分栏`,
        );
    }

    // 校验每个分栏的成员和参数
    for (const sectionId of sectionIds) {
        const section = sections![sectionId];
        if (!section || !Array.isArray(section.widgetIds)) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页分栏 ${sectionId} 结构无效`,
            );
        }
        const trimmedName = typeof section.name === "string" ? section.name.trim() : "";
        if (!trimmedName || trimmedName.length > 60) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页分栏 ${sectionId} 名称长度无效`,
            );
        }
        const normalizedName = trimmedName.toLowerCase();
        if (seenSectionNames.has(normalizedName)) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页分栏名称重复：${trimmedName}`,
            );
        }
        seenSectionNames.add(normalizedName);
        if (typeof section.createdAt !== "number" || !Number.isFinite(section.createdAt) || section.createdAt < 0) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页分栏 ${sectionId} createdAt 无效`,
            );
        }
        if (typeof section.updatedAt !== "number" || !Number.isFinite(section.updatedAt) || section.updatedAt < 0) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页分栏 ${sectionId} updatedAt 无效`,
            );
        }
        for (const widgetId of section.widgetIds) {
            if (!globalIds.has(widgetId)) {
                throw createDeviceViewBlockedError(
                    context,
                    "desktop_section_layout_corrupted",
                    `桌面主页分栏 ${sectionId} 引用了全局 order 外的组件 ${widgetId}`,
                );
            }
        }
    }

    if (modeEnabled === true) {
        if (sectionIds.length === 0) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                "桌面主页分栏模式开启，但分栏列表为空",
            );
        }

        if (!activeSectionId) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                `桌面主页活动分栏 ${String(activeSectionId)} 不属于现有分栏`,
            );
        }

        // requireAllAssigned: 校验每个组件恰好属于一个分栏
        const assignedIds = new Set<string>();
        for (const sectionId of sectionIds) {
            const section = sections![sectionId];
            for (const id of section.widgetIds) {
                if (assignedIds.has(id)) {
                    throw createDeviceViewBlockedError(
                        context,
                        "desktop_section_layout_corrupted",
                        `桌面主页组件 ${id} 重复属于多个分栏`,
                    );
                }
                assignedIds.add(id);
            }
        }
        for (const item of globalOrder) {
            if (!assignedIds.has(item.id)) {
                throw createDeviceViewBlockedError(
                    context,
                    "desktop_section_layout_corrupted",
                    `桌面主页全局组件 ${item.id} 未归属任何分栏`,
                );
            }
        }

        // 片段连续性与顺序校验
        const idToSection = new Map<string, string>();
        for (const sectionId of sectionIds) {
            for (const id of sections![sectionId].widgetIds) {
                idToSection.set(id, sectionId);
            }
        }

        let currentSection: string | null = null;
        const encounteredSections = new Set<string>();
        const encounterOrder: string[] = [];
        for (const item of globalOrder) {
            const secId = idToSection.get(item.id) || null;
            if (secId !== currentSection) {
                if (secId && encounteredSections.has(secId)) {
                    throw createDeviceViewBlockedError(
                        context,
                        "desktop_section_layout_corrupted",
                        `桌面主页分栏 ${secId} 在全局 order 中的片段不连续`,
                    );
                }
                currentSection = secId;
                if (secId) {
                    encounteredSections.add(secId);
                    encounterOrder.push(secId);
                }
            }
        }

        const nonEmptySections = sectionIds.filter((id) => sections![id].widgetIds.length > 0);
        if (encounterOrder.length !== nonEmptySections.length || !encounterOrder.every((id, idx) => id === nonEmptySections[idx])) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_layout_corrupted",
                "桌面主页非空分栏在全局 order 中的出现顺序与分栏顺序不一致",
            );
        }
    } else {
        // 分栏模式未开启时，不要求全量归属，但禁止重复归属
        const assignedIds = new Set<string>();
        for (const sectionId of sectionIds) {
            const section = sections![sectionId];
            for (const id of section.widgetIds) {
                if (assignedIds.has(id)) {
                    throw createDeviceViewBlockedError(
                        context,
                        "desktop_section_layout_corrupted",
                        `桌面主页组件 ${id} 重复属于多个分栏`,
                    );
                }
                assignedIds.add(id);
            }
        }
    }
}

export interface DesktopHomepageSectionStorageOps {
    readLayout: (context: DeviceViewContext) => Promise<DeviceViewLayout | null>;
    readSettings: (context: DeviceViewContext) => Promise<DeviceViewSettings | null>;
    replaceLayout: (context: DeviceViewContext, layout: Omit<DeviceViewLayout, "revision">, options?: { expectedRevision?: number }) => Promise<DeviceViewLayout>;
    updateSettings: (context: DeviceViewContext, mutator: (config: Record<string, unknown>) => Record<string, unknown>, options?: { expectedRevision?: number }) => Promise<DeviceViewSettings>;
}

const defaultStorageOps: DesktopHomepageSectionStorageOps = {
    readLayout: (context) => import("./deviceViewStorage").then(({ readDeviceViewLayout }) => readDeviceViewLayout(context, { allowUnmigrated: true })),
    readSettings: (context) => import("./deviceViewStorage").then(({ readDeviceViewSettings }) => readDeviceViewSettings(context)),
    replaceLayout: (context, layout, options) => import("./deviceViewStorage").then(({ replaceDeviceViewLayout }) => replaceDeviceViewLayout(context, layout, options)),
    updateSettings: (context, mutator, options) => import("./deviceViewStorage").then(({ updateDeviceViewSettings }) => updateDeviceViewSettings(context, mutator, options)),
};

type RawViewSection = { id: string; name?: string; createdAt?: number; updatedAt?: number };

function blockLegacyViewSection(
    context: DeviceViewContext,
    message: string,
): never {
    throw createDeviceViewBlockedError(context, "desktop_section_migration_blocked", message);
}

function parseLegacyViewSections(
    context: DeviceViewContext,
    value: unknown,
): RawViewSection[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        blockLegacyViewSection(context, "桌面主页 view.componentSections 不是数组，无法安全迁移");
    }

    const sections: RawViewSection[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (!isPlainJsonObject(item)) {
            blockLegacyViewSection(context, `桌面主页 view.componentSections[${i}] 不是普通对象，无法安全迁移`);
        }
        const itemRecord = item as Record<string, unknown>;
        const unknownKey = Object.keys(itemRecord).find(
            (key) => !["id", "name", "createdAt", "updatedAt"].includes(key),
        );
        if (unknownKey) {
            blockLegacyViewSection(
                context,
                `桌面主页 view.componentSections[${i}] 包含未知字段 ${unknownKey}，无法安全迁移`,
            );
        }
        if (typeof itemRecord.id !== "string" || !itemRecord.id) {
            blockLegacyViewSection(context, `桌面主页 view.componentSections[${i}].id 无效，无法安全迁移`);
        }
        try {
            assertDeviceViewSegment(itemRecord.id, `桌面主页 view.componentSections[${i}].id`);
        } catch {
            blockLegacyViewSection(context, `桌面主页 view.componentSections[${i}].id 不是合法设备视图片段，无法安全迁移`);
        }
        if (seenIds.has(itemRecord.id)) {
            blockLegacyViewSection(context, `桌面主页 view.componentSections 包含重复 ID ${itemRecord.id}，无法安全迁移`);
        }
        seenIds.add(itemRecord.id);

        if ("name" in itemRecord && typeof itemRecord.name !== "string") {
            blockLegacyViewSection(context, `桌面主页 view.componentSections[${i}].name 类型无效，无法安全迁移`);
        }
        for (const key of ["createdAt", "updatedAt"] as const) {
            if (!(key in itemRecord)) continue;
            const timestamp = itemRecord[key];
            if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0) {
                blockLegacyViewSection(context, `桌面主页 view.componentSections[${i}].${key} 无效，无法安全迁移`);
            }
        }

        const name = typeof itemRecord.name === "string" && itemRecord.name.trim()
            ? itemRecord.name.trim()
            : undefined;
        sections.push({
            id: itemRecord.id,
            ...(name !== undefined ? { name } : {}),
            ...(typeof itemRecord.createdAt === "number" ? { createdAt: itemRecord.createdAt } : {}),
            ...(typeof itemRecord.updatedAt === "number" ? { updatedAt: itemRecord.updatedAt } : {}),
        });
    }
    return sections;
}

/**
 * 确保当前 desktop-homepage 的分栏模型已完成 4.x -> 5.0 幂等迁移。
 *
 * 幂等与崩溃恢复机制：
 * 1. 若 layout 已含 componentSectionsModelVersion === 1：
 *    - 严格校验 layout 不变量；
 *    - 若 view 仍含旧结构字段，只幂等清理 view，绝不重新合并旧 view。
 * 2. 若标记缺失（4.x 旧数据）：
 *    - 按照规则合并 layout 与 view，生成包含 componentSectionsModelVersion: 1 的权威 layout 并先提交；
 *    - 随后清理 view 中的旧结构字段。
 */
export async function ensureDesktopHomepageSectionsMigrated(
    context: DeviceViewContext,
    storageOps: DesktopHomepageSectionStorageOps = defaultStorageOps,
): Promise<{ migrated: boolean }> {
    if (context.surface !== "desktop-homepage") return { migrated: false };

    const layout = await storageOps.readLayout(context);
    const view = await storageOps.readSettings(context);
    if (!layout || !view) return { migrated: false };

    // === Case 1: 5.0 已就绪模型 ===
    if (layout.componentSectionsModelVersion === DESKTOP_HOMEPAGE_SECTION_MODEL_VERSION) {
        assertDesktopHomepageLayoutInvariants(layout, context);

        const config = view.config ?? {};
        if ("componentSectionsEnabled" in config || "componentSections" in config) {
            await cleanLegacyViewSectionFields(context, view.revision, storageOps);
            return { migrated: true };
        }
        return { migrated: false };
    }

    if (layout.componentSectionsModelVersion !== undefined && layout.componentSectionsModelVersion !== DESKTOP_HOMEPAGE_SECTION_MODEL_VERSION) {
        throw createDeviceViewBlockedError(
            context,
            "desktop_section_layout_corrupted",
            `未知桌面主页分栏模型版本 ${layout.componentSectionsModelVersion}，已停止自动处理，防止覆盖数据`,
        );
    }

    // === Case 2: 4.x -> 5.0 迁移 ===
    const viewConfig = view.config ?? {};

    // 校验 view 结构合法性（若存在）
    if (
        viewConfig.componentSectionsEnabled !== undefined &&
        typeof viewConfig.componentSectionsEnabled !== "boolean"
    ) {
        throw createDeviceViewBlockedError(
            context,
            "desktop_section_migration_blocked",
            "桌面主页 view.componentSectionsEnabled 不是布尔类型，无法安全迁移",
        );
    }

    const rawViewSections = parseLegacyViewSections(context, viewConfig.componentSections);

    const rawLayoutSections = layout.sections ?? {};
    const layoutSectionKeys = Object.keys(rawLayoutSections);
    const viewSectionIds = rawViewSections.map((s) => s.id);

    // 确定分栏主顺序：以 layout 现有顺序为先，再按 view 顺序追加 view-only 分栏
    const finalSectionIds: string[] = [
        ...layoutSectionKeys,
        ...viewSectionIds.filter((id) => !layoutSectionKeys.includes(id)),
    ];

    const migrationTimestamp = Date.now();
    const targetSectionsMap: Record<string, WidgetLayoutProfileSectionData> = {};

    const globalOrderItems: LayoutItem[] = (layout.order || []).map((item, index) => ({
        id: item.id,
        style: item.style ?? null,
        index,
    }));
    const globalOrderIds = new Set(globalOrderItems.map((item) => item.id));
    const assignedWidgets = new Set<string>();
    const seenSectionNames = new Set<string>();

    for (let i = 0; i < finalSectionIds.length; i++) {
        const id = finalSectionIds[i];
        const vSec = rawViewSections.find((s) => s.id === id);
        const lSec = rawLayoutSections[id];

        let name = vSec?.name || (typeof lSec?.name === "string" && lSec.name.trim() ? lSec.name.trim() : `分区 ${i + 1}`);
        if (name.length > 60) name = name.slice(0, 60);

        let uniqueName = name;
        let counter = 2;
        while (seenSectionNames.has(uniqueName.toLowerCase())) {
            const suffix = ` (${counter})`;
            uniqueName = name.length + suffix.length <= 60
                ? `${name}${suffix}`
                : `${name.slice(0, 60 - suffix.length)}${suffix}`;
            counter++;
        }
        seenSectionNames.add(uniqueName.toLowerCase());
        name = uniqueName;

        const createdAt = vSec?.createdAt ?? (typeof lSec?.createdAt === "number" && Number.isFinite(lSec.createdAt) ? lSec.createdAt : migrationTimestamp);
        const updatedAt = vSec?.updatedAt ?? (typeof lSec?.updatedAt === "number" && Number.isFinite(lSec.updatedAt) ? lSec.updatedAt : createdAt);

        const rawWidgetIds = Array.isArray(lSec?.widgetIds) ? lSec.widgetIds : [];
        const sectionWidgetIds: string[] = [];

        for (const rawId of rawWidgetIds) {
            if (typeof rawId !== "string" || !rawId.trim()) continue;
            const wid = rawId.trim();
            if (assignedWidgets.has(wid)) continue; // 跨分栏重复：保留首次归属
            assignedWidgets.add(wid);
            sectionWidgetIds.push(wid);
            if (!globalOrderIds.has(wid)) {
                // Section-only ID: 保留并追加到全局 order 末尾，style 为 null
                globalOrderIds.add(wid);
                globalOrderItems.push({ id: wid, style: null, index: globalOrderItems.length });
            }
        }

        targetSectionsMap[id] = {
            widgetIds: sectionWidgetIds,
            name,
            createdAt,
            updatedAt,
            ...(lSec?.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: lSec.widgetLayoutNumber } : {}),
            ...(lSec?.widgetGap !== undefined ? { widgetGap: lSec.widgetGap } : {}),
        };
    }

    // 确定分栏模式开关
    let effectiveEnabled: boolean;
    if (viewConfig.componentSectionsEnabled === false) {
        effectiveEnabled = false;
    } else if (viewConfig.componentSectionsEnabled === true) {
        effectiveEnabled = finalSectionIds.length > 0;
    } else if (layout.componentSectionsModeEnabled !== undefined) {
        effectiveEnabled = layout.componentSectionsModeEnabled && finalSectionIds.length > 0;
    } else {
        effectiveEnabled = false;
    }
    if (finalSectionIds.length === 0) {
        effectiveEnabled = false;
    }

    // 重排与归属
    const { nextGlobalOrder, nextSections } = rearrangeGlobalOrderBySections(
        globalOrderItems,
        targetSectionsMap,
        finalSectionIds,
        { assignOrphansToFirstSection: effectiveEnabled },
    );

    // 确定活动分栏
    let targetActiveSectionId: string | undefined;
    if (effectiveEnabled) {
        if (layout.activeSectionId && finalSectionIds.includes(layout.activeSectionId)) {
            targetActiveSectionId = layout.activeSectionId;
        } else if (finalSectionIds.length > 0) {
            targetActiveSectionId = finalSectionIds[0];
        }
    } else {
        targetActiveSectionId = undefined;
    }

    const targetDeviceSections: Record<string, DeviceLayoutSection> = {};
    for (const id of finalSectionIds) {
        const s = nextSections[id];
        if (!s) continue;
        targetDeviceSections[id] = {
            widgetIds: s.widgetIds,
            name: s.name,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            ...(s.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: s.widgetLayoutNumber } : {}),
            ...(s.widgetGap !== undefined ? { widgetGap: s.widgetGap } : {}),
        };
    }

    const migratedLayout: DeviceViewLayout = {
        schema: layout.schema,
        version: layout.version,
        revision: layout.revision,
        updatedAt: layout.updatedAt,
        deviceId: layout.deviceId,
        surface: layout.surface,
        order: nextGlobalOrder.map((item) => ({ id: item.id, style: item.style, index: item.index })),
        ...(layout.widgetLayoutNumber !== undefined ? { widgetLayoutNumber: layout.widgetLayoutNumber } : {}),
        ...(layout.widgetGap !== undefined ? { widgetGap: layout.widgetGap } : {}),
        ...(targetActiveSectionId !== undefined ? { activeSectionId: targetActiveSectionId } : {}),
        componentSectionsModeEnabled: effectiveEnabled,
        componentSectionsModelVersion: DESKTOP_HOMEPAGE_SECTION_MODEL_VERSION,
        sections: Object.keys(targetDeviceSections).length > 0 ? targetDeviceSections : undefined,
    };

    assertDesktopHomepageLayoutInvariants(migratedLayout, context);

    // Step 4a: 写入权威 layout 并验证
    await storageOps.replaceLayout(
        context,
        migratedLayout,
        { expectedRevision: layout.revision },
    );

    // Step 4b: 仅在旧字段存在时清理 view，缺失字段不产生无意义写入。
    if ("componentSectionsEnabled" in viewConfig || "componentSections" in viewConfig) {
        await cleanLegacyViewSectionFields(context, view.revision, storageOps);
    }
    return { migrated: true };
}

async function cleanLegacyViewSectionFields(
    context: DeviceViewContext,
    expectedViewRevision: number,
    storageOps: DesktopHomepageSectionStorageOps,
): Promise<void> {
    try {
        await storageOps.updateSettings(
            context,
            (config) => {
                const {
                    componentSectionsEnabled: _ignoredEnabled,
                    componentSections: _ignoredSections,
                    ...clean
                } = config;
                return clean;
            },
            { expectedRevision: expectedViewRevision },
        );
    } catch (_error) {
        // CAS 冲突时重新读取重试一次
        const latestView = await storageOps.readSettings(context);
        if (!latestView) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_migration_blocked",
                "桌面主页 view.json 缺失，无法完成分栏迁移清理",
            );
        }
        const config = latestView.config ?? {};
        if (!("componentSectionsEnabled" in config) && !("componentSections" in config)) {
            return;
        }
        try {
            await storageOps.updateSettings(
                context,
                (c) => {
                    const {
                        componentSectionsEnabled: _ignoredEnabled,
                        componentSections: _ignoredSections,
                        ...clean
                    } = c;
                    return clean;
                },
                { expectedRevision: latestView.revision },
            );
        } catch (retryError) {
            throw createDeviceViewBlockedError(
                context,
                "desktop_section_migration_blocked",
                `桌面主页 view.json 旧分栏字段清理重试失败: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
            );
        }
    }
}
