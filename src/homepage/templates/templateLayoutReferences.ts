/**
 * 模板应用清理使用的组件引用分析纯 helper。
 *
 * 职责：
 * - 从 profile 收集全局 order + sections 成员 ID（用于模板覆盖后的清理补偿等只读判断）；
 * - 从 layout + deviceId 收集当前 profile 引用的全部组件 ID。
 *
 * 约束：
 * - 不修改传入的 layout；
 * - 不读取其他设备 profile；
 * - 不写回用户持久化布局。
 */

import {
    normalizeLayoutItems,
    type WidgetLayoutData,
    type WidgetLayoutProfileData,
} from "@/components/utils/widgetBlock/utils/layout-shared";

/**
 * 兼容 helper：从 profile 收集全局 order + sections 成员 ID（仅用于清理补偿等只读判断）。
 *
 * 本函数用于“确认当前 layout 是否仍引用某组件”，必须遍历全局 order 与所有 sections
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
