/**
 * 分栏纯顺序计算 helper。
 *
 * 职责：
 * - 判断是否首次开启分栏（无任何有效分栏成员）；
 * - 按分栏顺序重排全局 order（每段连续，保留内部顺序和 style）；
 * - 按邻接关系处理删除分栏的组件迁入；
 * - 无归属组件追加到第一个分栏；
 * - 校验分栏布局不变量。
 *
 * 本文件不执行任何 I/O 或事务，所有副作用由调用方在事务内提交。
 *
 * 第一铁律约束：
 * - 不读取其他设备 profile；
 * - 不修改旧根数据；
 * - 视图异常不影响共享业务数据。
 */

import type { LayoutItem, WidgetLayoutProfileData, WidgetLayoutProfileSectionData } from "./layout-shared";

/**
 * 重新编号 layout items。
 */
export function reindexLayoutItems(items: LayoutItem[]): LayoutItem[] {
    return items.map((item, index) => ({ ...item, index }));
}

/**
 * 判断当前 profile 是否处于"首次开启分栏"状态：
 * - 之前未启用有效分栏（componentSectionsModeEnabled 非 true，或任何分栏都没有成员）；
 * - 当前没有任何有效分栏成员（遍历所有已有分栏，不只是配置中的）。
 */
export function hasNoSectionMembers(profile: WidgetLayoutProfileData): boolean {
    const sections = profile.sections;
    if (!sections) return true;
    for (const section of Object.values(sections)) {
        if (section.widgetIds.length > 0) return false;
    }
    return true;
}

/**
 * 校验分栏布局不变量（纯断言，失败即抛错）。
 *
 * 校验项：
 * 1. 全局 order 无重复 ID；
 * 2. section-only ID 不存在；
 * 3. 分栏开启时每个全局组件恰好属于一个分栏；
 * 4. 每个分栏形成连续片段；
 * 5. 非空分栏片段在全局 order 中的出现顺序必须与 sectionIds 顺序一致；
 * 6. nextSections.widgetIds 的规范化顺序应与从全局 order 过滤所得顺序一致。
 *
 * 不做 I/O，不修复数据，仅作为事务收尾前的纯校验。
 */
export function assertSectionLayoutInvariants(
    globalOrder: LayoutItem[],
    sections: Record<string, WidgetLayoutProfileSectionData>,
    sectionIds: string[],
    options: { requireAllAssigned?: boolean } = {},
): void {
    const globalIds = new Set<string>();
    for (const item of globalOrder) {
        if (globalIds.has(item.id)) {
            throw new Error(`分栏布局不变量校验失败：全局 order 存在重复 ID ${item.id}`);
        }
        globalIds.add(item.id);
    }

    for (const sectionId of sectionIds) {
        const section = sections[sectionId];
        if (!section) continue;
        for (const id of section.widgetIds) {
            if (!globalIds.has(id)) {
                throw new Error(`分栏布局不变量校验失败：分栏 ${sectionId} 包含全局 order 之外的 ID ${id}`);
            }
        }
    }

    if (!options.requireAllAssigned) return;

    const assignedIds = new Set<string>();
    for (const sectionId of sectionIds) {
        const section = sections[sectionId];
        if (!section) continue;
        for (const id of section.widgetIds) {
            if (assignedIds.has(id)) {
                throw new Error(`分栏布局不变量校验失败：ID ${id} 同时属于多个分栏`);
            }
            assignedIds.add(id);
        }
    }
    for (const item of globalOrder) {
        if (!assignedIds.has(item.id)) {
            throw new Error(`分栏布局不变量校验失败：全局组件 ${item.id} 未归属任何分栏`);
        }
    }

    // 4. 每个分栏形成连续片段；5. 非空分栏片段出现顺序与 sectionIds 顺序一致。
    const idToSectionId = new Map<string, string>();
    for (const sectionId of sectionIds) {
        const section = sections[sectionId];
        if (!section) continue;
        for (const id of section.widgetIds) {
            idToSectionId.set(id, sectionId);
        }
    }
    let currentSection: string | null = null;
    const sectionEncountered = new Set<string>();
    const nonEmptySectionEncounterOrder: string[] = [];
    for (const item of globalOrder) {
        const sectionId = idToSectionId.get(item.id) || null;
        if (sectionId !== currentSection) {
            if (sectionId && sectionEncountered.has(sectionId)) {
                throw new Error(`分栏布局不变量校验失败：分栏 ${sectionId} 片段不连续`);
            }
            currentSection = sectionId;
            if (sectionId) {
                sectionEncountered.add(sectionId);
                nonEmptySectionEncounterOrder.push(sectionId);
            }
        }
    }

    const expectedNonEmptyOrder = sectionIds.filter((id) => {
        const section = sections[id];
        return section && section.widgetIds.length > 0;
    });
    if (nonEmptySectionEncounterOrder.length !== expectedNonEmptyOrder.length) {
        throw new Error(
            `分栏布局不变量校验失败：非空分栏片段数量不一致，期望 ${expectedNonEmptyOrder.length} 个，实际 ${nonEmptySectionEncounterOrder.length} 个`,
        );
    }
    for (let i = 0; i < expectedNonEmptyOrder.length; i++) {
        if (nonEmptySectionEncounterOrder[i] !== expectedNonEmptyOrder[i]) {
            throw new Error(
                `分栏布局不变量校验失败：非空分栏片段出现顺序不一致，期望[${i}]=${expectedNonEmptyOrder[i]}，实际[${i}]=${nonEmptySectionEncounterOrder[i]}`,
            );
        }
    }

    // 6. nextSections.widgetIds 的规范化顺序应与从全局 order 过滤所得顺序一致。
    for (const sectionId of sectionIds) {
        const section = sections[sectionId];
        if (!section) continue;
        const expectedIds: string[] = [];
        const seen = new Set<string>();
        for (const item of globalOrder) {
            if (idToSectionId.get(item.id) === sectionId && !seen.has(item.id)) {
                expectedIds.push(item.id);
                seen.add(item.id);
            }
        }
        const actualIds = section.widgetIds;
        if (expectedIds.length !== actualIds.length) {
            throw new Error(
                `分栏布局不变量校验失败：分栏 ${sectionId} widgetIds 长度与全局过滤结果不一致`,
            );
        }
        for (let i = 0; i < expectedIds.length; i++) {
            if (expectedIds[i] !== actualIds[i]) {
                throw new Error(
                    `分栏布局不变量校验失败：分栏 ${sectionId} widgetIds[${i}] 期望 ${expectedIds[i]}，实际 ${actualIds[i]}`,
                );
            }
        }
    }
}

/**
 * 按分栏顺序重排全局 order：每个分栏作为一个连续片段。
 *
 * 正确规则：
 * 1. 从 globalOrder 建立：
 *    - 去重后的组件全集；
 *    - style 映射；
 *    - 原全局位置映射。
 * 2. section.widgetIds 只作为成员集合：
 *    - 去除不在 globalOrder 的 ID；
 *    - 去除分栏内重复；
 *    - 去除跨分栏重复归属，按 sectionIds 顺序保留首次归属；
 *    - 不使用 widgetIds 数组顺序决定组件顺序。
 * 3. 每个分栏的现有成员顺序必须通过过滤原 globalOrder 得到。
 * 4. 无归属组件：
 *    - assignOrphansToFirstSection=true 时，按原全局相对顺序追加到第一个分栏成员片段末尾；
 *    - 不允许插入第一个分栏片段中间；
 *    - 没有分栏时保留原全局顺序。
 * 5. 完成成员归属后，按 sectionIds 顺序拼接分栏片段：
 *    - 调整分栏顺序只移动完整片段；
 *    - 每个分栏内部仍保持原 globalOrder 顺序；
 *    - style 只来自 globalOrder。
 * 6. 输出的 nextSections.widgetIds 可以按最终全局过滤顺序规范化，但其语义仍只是成员关系。
 */
export function rearrangeGlobalOrderBySections(
    globalOrder: LayoutItem[],
    sections: Record<string, WidgetLayoutProfileSectionData>,
    sectionIds: string[],
    options: { assignOrphansToFirstSection?: boolean } = {},
): { nextGlobalOrder: LayoutItem[]; nextSections: Record<string, WidgetLayoutProfileSectionData> } {
    const globalOrderIds = new Set(globalOrder.map((item) => item.id));
    const styleById = new Map<string, string | null>();
    for (const item of globalOrder) {
        styleById.set(item.id, item.style);
    }

    // 清理各分栏：去 section-only、去分栏内重复、去跨分栏重复（保留第一次合法归属）。
    // widgetIds 只作为成员集合，不决定顺序。
    const assignedIds = new Set<string>();
    const cleanedMembers: Record<string, string[]> = {};
    for (const sectionId of sectionIds) {
        const section = sections[sectionId];
        const cleaned: string[] = [];
        for (const id of section?.widgetIds || []) {
            if (!globalOrderIds.has(id)) continue; // section-only ID 移除
            if (assignedIds.has(id)) continue; // 跨分栏重复：保留第一次归属
            assignedIds.add(id);
            cleaned.push(id);
        }
        cleanedMembers[sectionId] = cleaned;
    }

    // 收集无归属组件（按原全局相对顺序）。
    const orphanIds: string[] = [];
    for (const item of globalOrder) {
        if (!assignedIds.has(item.id)) {
            orphanIds.push(item.id);
            assignedIds.add(item.id);
        }
    }

    // 预计算每个分栏已有成员的过滤顺序（不含孤儿）。
    const sectionFilteredIds: Record<string, string[]> = {};
    for (const sectionId of sectionIds) {
        const memberSet = new Set(cleanedMembers[sectionId]);
        const ids: string[] = [];
        for (const item of globalOrder) {
            if (memberSet.has(item.id)) {
                ids.push(item.id);
            }
        }
        sectionFilteredIds[sectionId] = ids;
    }

    // 一次性重建 nextSections 和全局 order：
    // 每个分栏内部顺序 = 已有成员过滤顺序 + 孤儿（仅第一个分栏末尾）。
    const nextSections: Record<string, WidgetLayoutProfileSectionData> = {};
    const result: LayoutItem[] = [];
    const resultSeenIds = new Set<string>();

    for (const sectionId of sectionIds) {
        const originalSection = sections[sectionId];
        const sectionItemIds: string[] = [...sectionFilteredIds[sectionId]];

        // 将无归属组件追加到第一个分栏末尾。
        if (options.assignOrphansToFirstSection && sectionIds.length > 0 && sectionId === sectionIds[0] && orphanIds.length > 0) {
            for (const id of orphanIds) {
                if (!sectionItemIds.includes(id)) {
                    sectionItemIds.push(id);
                }
            }
        }

        const nextSection: WidgetLayoutProfileSectionData = { widgetIds: sectionItemIds };
        if (originalSection?.widgetLayoutNumber !== undefined) nextSection.widgetLayoutNumber = originalSection.widgetLayoutNumber;
        if (originalSection?.widgetGap !== undefined) nextSection.widgetGap = originalSection.widgetGap;
        nextSections[sectionId] = nextSection;
        for (const id of sectionItemIds) {
            if (resultSeenIds.has(id)) continue;
            resultSeenIds.add(id);
            const style = styleById.get(id);
            if (style === undefined) continue; // 防御：不在全局 order 中
            result.push({ id, style, index: 0 });
        }
    }

    // 兜底：保留仍未被 section 接收的组件（非 requireAllAssigned 场景，如分栏关闭）。
    for (const item of globalOrder) {
        if (!resultSeenIds.has(item.id)) {
            result.push({ id: item.id, style: item.style, index: 0 });
            resultSeenIds.add(item.id);
        }
    }

    const finalResult = {
        nextGlobalOrder: reindexLayoutItems(result),
        nextSections,
    };

    assertSectionLayoutInvariants(finalResult.nextGlobalOrder, finalResult.nextSections, sectionIds, {
        requireAllAssigned: options.assignOrphansToFirstSection === true && sectionIds.length > 0,
    });

    return finalResult;
}

interface RemovedRange {
    /** 该区间内被删除的 sectionId，按原顺序。 */
    removedIds: string[];
    /** 区间前最后一个保留分栏（若存在）。 */
    precedingRemaining: string | null;
    /** 区间后第一个保留分栏（若存在）。 */
    followingRemaining: string | null;
}

/**
 * 将 orderedSectionIds 划分为连续的删除区间。
 * 连续被删除的分栏视为一个区间，每个区间记录其前置/后置保留分栏。
 */
function collectRemovedRanges(
    orderedSectionIds: string[],
    removedSet: Set<string>,
): RemovedRange[] {
    const ranges: RemovedRange[] = [];
    let currentRange: RemovedRange | null = null;
    let lastRemaining: string | null = null;
    for (const sectionId of orderedSectionIds) {
        if (removedSet.has(sectionId)) {
            if (!currentRange) {
                currentRange = {
                    removedIds: [],
                    precedingRemaining: lastRemaining,
                    followingRemaining: null,
                };
            }
            currentRange.removedIds.push(sectionId);
        } else {
            if (currentRange) {
                currentRange.followingRemaining = sectionId;
                ranges.push(currentRange);
                currentRange = null;
            }
            lastRemaining = sectionId;
        }
    }
    if (currentRange) {
        ranges.push(currentRange);
    }
    return ranges;
}

/**
 * 按邻接关系处理删除分栏的组件迁入。
 *
 * 规则（以删除前的分栏顺序为基准）：
 * 1. 删除区间前面存在仍保留的分栏：将区间内全部组件按原全局顺序追加到该前置分栏末尾。
 * 2. 删除区间前面没有保留分栏，但后面存在保留分栏：将区间内组件按原全局顺序插入后置分栏开头。
 * 3. 删除多个不连续分栏：每个删除区间分别寻找自己的前置或后置目标。
 * 4. 删除所有分栏：保留完整全局 order；sections 清空。
 * 5. 活动分栏被删除：通过 receivingSectionByRemoved 让调用方切换到该删除区间实际接收组件的目标分栏；
 *    即使删除区间为空，也会写入实际相邻目标，供调用方切换。
 * 6. 保留组件原 style、原相对顺序和组件文件。
 * 7. 完成邻接归并后，复用 rearrangeGlobalOrderBySections 处理历史无归属组件，
 *    确保只要仍有分栏，每个组件都有且只有一个归属，且分栏片段连续。
 */
export function mergeRemovedSectionRangesIntoAdjacentSections(
    globalOrder: LayoutItem[],
    sections: Record<string, WidgetLayoutProfileSectionData>,
    orderedSectionIds: string[],
    removedSectionIds: string[],
): {
    nextGlobalOrder: LayoutItem[];
    nextSections: Record<string, WidgetLayoutProfileSectionData>;
    receivingSectionByRemoved: Map<string, string>;
} {
    const removedSet = new Set(removedSectionIds);
    const remainingOrderedIds = orderedSectionIds.filter((id) => !removedSet.has(id));

    // 全部删除：保留完整全局 order，sections 清空。
    if (remainingOrderedIds.length === 0) {
        return {
            nextGlobalOrder: reindexLayoutItems(globalOrder),
            nextSections: {},
            receivingSectionByRemoved: new Map(),
        };
    }

    // 初始化剩余分栏（深拷贝 widgetIds 以便修改）。
    const nextSections: Record<string, WidgetLayoutProfileSectionData> = {};
    for (const sectionId of remainingOrderedIds) {
        const section = sections[sectionId];
        if (!section) continue;
        nextSections[sectionId] = {
            ...section,
            widgetIds: [...section.widgetIds],
        };
    }

    const ranges = collectRemovedRanges(orderedSectionIds, removedSet);
    const receivingSectionByRemoved = new Map<string, string>();

    for (const range of ranges) {
        // 决定接收分栏：优先前置，无前置时用后置。
        let receivingSectionId: string | null = null;
        let insertAtHead = false;
        if (range.precedingRemaining) {
            receivingSectionId = range.precedingRemaining;
        } else if (range.followingRemaining) {
            receivingSectionId = range.followingRemaining;
            insertAtHead = true;
        }

        // 即使区间没有组件，也要为每个 removedId 写入 receivingSectionByRemoved，
        // 让调用方在删除空活动分栏后切换到真实相邻目标。
        if (receivingSectionId && nextSections[receivingSectionId]) {
            for (const removedId of range.removedIds) {
                receivingSectionByRemoved.set(removedId, receivingSectionId);
            }
        }

        // 收集区间内所有组件 ID。
        const rangeWidgetIds = new Set<string>();
        for (const removedId of range.removedIds) {
            const section = sections[removedId];
            if (!section) continue;
            for (const id of section.widgetIds) rangeWidgetIds.add(id);
        }

        if (!receivingSectionId || !nextSections[receivingSectionId] || rangeWidgetIds.size === 0) continue;

        // 取得按 globalOrder 中相对顺序排列的区间组件。
        const rangeItemIds: string[] = [];
        for (const item of globalOrder) {
            if (rangeWidgetIds.has(item.id)) rangeItemIds.push(item.id);
        }

        // 从所有剩余分栏中移除这些 ID（防御性清理，正常情况下不应出现交叉归属）。
        for (const sectionId of Object.keys(nextSections)) {
            nextSections[sectionId].widgetIds = nextSections[sectionId].widgetIds.filter(
                (id) => !rangeWidgetIds.has(id),
            );
        }

        const receivingSection = nextSections[receivingSectionId];
        if (insertAtHead) {
            receivingSection.widgetIds = [...rangeItemIds, ...receivingSection.widgetIds];
        } else {
            const existingSet = new Set(receivingSection.widgetIds);
            for (const id of rangeItemIds) {
                if (!existingSet.has(id)) {
                    receivingSection.widgetIds.push(id);
                    existingSet.add(id);
                }
            }
        }
    }

    // 复用全局重排 helper：
    // - 清理 section-only、重复归属；
    // - 将无归属组件追加到第一个剩余分栏；
    // - 一次性重建全局 order，保证片段连续；
    // - 只要有剩余分栏，就 requireAllAssigned=true。
    const { nextGlobalOrder, nextSections: finalSections } = rearrangeGlobalOrderBySections(
        globalOrder,
        nextSections,
        remainingOrderedIds,
        { assignOrphansToFirstSection: true },
    );

    return {
        nextGlobalOrder,
        nextSections: finalSections,
        receivingSectionByRemoved,
    };
}
