export interface HomepageSectionNavigationState {
    requestedSectionId?: string;
    activeSectionId?: string;
    sectionIds: readonly string[];
}

/**
 * 导航优先显示正在请求的分区；没有切换请求时显示实际活动分区。
 * 若旧状态均无效，则回退到第一个现有分区，避免出现“有内容但没有活动导航项”。
 */
export function resolveHomepageSectionNavigationActiveId(
    state: HomepageSectionNavigationState,
): string | undefined {
    const validSectionIds = state.sectionIds.filter((sectionId) => Boolean(sectionId));
    const validSet = new Set(validSectionIds);
    if (state.requestedSectionId && validSet.has(state.requestedSectionId)) {
        return state.requestedSectionId;
    }
    if (state.activeSectionId && validSet.has(state.activeSectionId)) {
        return state.activeSectionId;
    }
    return validSectionIds[0];
}
