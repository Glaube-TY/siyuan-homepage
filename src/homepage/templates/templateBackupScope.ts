/**
 * 个人布局模板备份组件范围纯 helper。
 *
 * 职责：
 * - 计算备份组件范围：分栏开启时执行完整不变量校验后只取全局 order；分栏关闭时只取全局 order，休眠 sections 中的 section-only ID 不触发读取；
 * - 在备份副本（structuredClone）中按全局 order 过滤休眠 sections 的 section-only ID，保留分栏 ID 与合法成员，不写回用户 layout；
 * - 读取 layout 中全部 section IDs（无论开关状态），用于旧备份兼容。
 *
 * 第一铁律约束：
 * - 不修改传入的 layout；
 * - 不读取其他设备 profile；
 * - 不写回用户持久化布局；
 * - 读取失败、暂缺、半写入都不等于空数据。
 */

import {
    normalizeLayoutItems,
    type WidgetLayoutData,
    type WidgetLayoutProfileData,
    type WidgetLayoutProfileSectionData,
} from "@/components/utils/widgetBlock/utils/layout-shared";
import { assertSectionLayoutInvariants } from "@/components/utils/widgetBlock/utils/layout-section-ops";
import { normalizeComponentSections, type ComponentSection } from "@/homepage/homepageSetting/config";

/**
 * 从 view config 中读取分栏定义（与 layout-shared 中保持一致，避免依赖未导出内部函数）。
 */
function componentSectionsFromViewConfig(config: Record<string, unknown>): ComponentSection[] {
    return normalizeComponentSections(config.componentSections);
}

/**
 * 收集当前设备 profile 的全局 order ID 集合。
 */
function collectGlobalOrderIds(layout: WidgetLayoutData, deviceId: string): Set<string> {
    const profile = layout?.profiles?.[deviceId];
    const ids = new Set<string>();
    for (const item of normalizeLayoutItems(profile?.order || layout?.order)) {
        if (item.id) ids.add(item.id);
    }
    return ids;
}

/**
 * 计算备份组件范围。
 *
 * 规则：
 * - 分栏开启：先执行完整分栏不变量校验（requireAllAssigned=true），通过后组件范围以全局 order 为唯一全集；sections 只能证明成员归属，不能补造引用。
 * - 分栏关闭：组件范围只来自当前 profile 全局 order；休眠 sections 中的历史 section-only ID 不得触发组件读取，也不得阻止备份。
 *
 * 返回 ok=false 时 reason 描述不变量失败原因，调用方必须停止备份/应用并提示。
 */
export function collectBackupReferencedWidgetIds(
    layout: WidgetLayoutData,
    deviceId: string,
): { ok: true; ids: Set<string> } | { ok: false; reason: string } {
    const profile = layout?.profiles?.[deviceId];
    const globalOrderIds = collectGlobalOrderIds(layout, deviceId);

    const sectionsEnabled = profile?.componentSectionsModeEnabled === true;
    if (!sectionsEnabled) {
        return { ok: true, ids: globalOrderIds };
    }

    const sectionIds = Object.keys(profile?.sections || {});
    if (sectionIds.length === 0) {
        return { ok: false, reason: "分栏模式开启但缺少分栏定义，无法安全备份" };
    }

    try {
        assertSectionLayoutInvariants(
            normalizeLayoutItems(profile?.order || layout?.order),
            profile?.sections || {},
            sectionIds,
            { requireAllAssigned: true },
        );
    } catch (error) {
        return {
            ok: false,
            reason: `分栏不变量校验失败：${error instanceof Error ? error.message : String(error)}`,
        };
    }

    return { ok: true, ids: globalOrderIds };
}

/**
 * 在备份副本中按全局 order 过滤休眠 sections 的 section-only ID。
 *
 * 规则：
 * - 不修改传入的 layout，只在 structuredClone 副本上操作；
 * - 分栏开启：不变量已通过，保留 sections 原样；
 * - 分栏关闭：从休眠 sections 中移除不在全局 order 的 section-only ID，保留分栏 ID 与合法成员；
 * - 不写回用户 layout。
 */
export function filterBackupLayoutForConsistency(
    layout: WidgetLayoutData,
    deviceId: string,
): WidgetLayoutData {
    const cloned: WidgetLayoutData = structuredClone(layout);
    const profile = cloned.profiles?.[deviceId];
    if (!profile) return cloned;

    const globalOrderIds = collectGlobalOrderIds(cloned, deviceId);
    const sectionsEnabled = profile.componentSectionsModeEnabled === true;
    if (sectionsEnabled) {
        return cloned;
    }

    if (profile.sections) {
        const nextSections: Record<string, WidgetLayoutProfileSectionData> = {};
        for (const [sectionId, section] of Object.entries(profile.sections)) {
            const filteredWidgetIds = (section?.widgetIds || []).filter((id: string) => globalOrderIds.has(id));
            nextSections[sectionId] = {
                ...section,
                widgetIds: filteredWidgetIds,
            };
        }
        profile.sections = nextSections;
    }

    return cloned;
}

/**
 * 读取 layout 中全部 section IDs（无论 componentSectionsModeEnabled 是否开启）。
 *
 * 用于旧备份兼容：旧备份可能 componentSectionsModeEnabled=false 但仍保留休眠 sections 定义，
 * 此时仍需读取所有 section IDs 以与当前 view 对齐。
 */
export function collectAllSectionIdsFromLayout(
    layout: WidgetLayoutData,
    deviceId: string,
): string[] {
    const profile = layout?.profiles?.[deviceId];
    return Object.keys(profile?.sections || {});
}

/**
 * 兼容 helper：从 profile 收集全局 order + sections 成员 ID（仅用于清理补偿等只读判断）。
 *
 * 与备份范围不同：本函数用于“确认当前 layout 是否仍引用某组件”，必须遍历全局 order 与所有 sections
 * （包括休眠 sections 中的成员），以避免误删仍在休眠分栏中引用的组件。
 */
export function collectProfileReferencedIdsForCleanup(profile: WidgetLayoutProfileData | null | undefined): Set<string> {
    const ids = new Set<string>();
    if (!profile) return ids;
    for (const item of normalizeLayoutItems(profile.order)) {
        if (item.id) ids.add(item.id);
    }
    Object.values(profile.sections || {}).forEach((section) => {
        for (const id of section?.widgetIds || []) {
            if (id) ids.add(id);
        }
    });
    return ids;
}

/**
 * 从 layout + deviceId 收集当前 profile 引用的全部组件 ID（用于清理补偿等只读判断）。
 */
export function collectLayoutReferencedIdsForCleanup(
    layout: WidgetLayoutData,
    deviceId: string,
): Set<string> {
    return collectProfileReferencedIdsForCleanup(layout?.profiles?.[deviceId]);
}

/**
 * 备份专用 layout/view 一致性校验。
 *
 * 与正式提交校验 validateLayoutViewSectionConsistency 的区别：
 * - layout/view 开关和分栏 ID 顺序必须一致；
 * - 分栏开启执行完整不变量（requireAllAssigned=true）；
 * - 分栏关闭时允许旧休眠 sections 中存在 section-only ID（历史数据），不阻止备份生成；
 * - 不在备份过程中修改用户 layout，如需过滤 section-only ID 应在 structuredClone 副本上进行。
 */
export function validateLayoutViewSectionConsistencyForBackup(
    layout: WidgetLayoutData,
    deviceId: string,
    viewConfig: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
    const profile = layout?.profiles?.[deviceId];
    const sectionsEnabled = viewConfig.componentSectionsEnabled === true;

    if ((profile?.componentSectionsModeEnabled === true) !== sectionsEnabled) {
        return {
            ok: false,
            reason: `layout 分栏模式（${profile?.componentSectionsModeEnabled === true}）与 view 原始开关（${sectionsEnabled}）不一致`,
        };
    }

    const configuredSections = componentSectionsFromViewConfig(viewConfig);
    const layoutSectionIds = Object.keys(profile?.sections || {});
    const viewSectionIds = configuredSections.map((section) => section.id);

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
        const activeSectionId = profile?.activeSectionId ?? null;
        if (!activeSectionId || typeof activeSectionId !== "string" || !layoutSectionIds.includes(activeSectionId)) {
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
        // 分栏关闭时仅禁止重复 ID，不拒绝 section-only 历史 ID。
        const seen = new Set<string>();
        for (const section of Object.values(profile?.sections || {})) {
            for (const id of section?.widgetIds || []) {
                if (seen.has(id)) {
                    return { ok: false, reason: `分栏关闭状态下存在重复 ID ${id}` };
                }
                seen.add(id);
            }
        }
    }

    return { ok: true };
}
