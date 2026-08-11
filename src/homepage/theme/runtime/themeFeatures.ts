import type { HomepageThemeDefinition } from "../api/types";

/**
 * 兼容 API v1 主题：未声明能力时沿用历史行为，只有显式 false 才禁用 Banner。
 */
export function supportsHomepageThemeBanner(definition: HomepageThemeDefinition): boolean {
    return definition.features?.banner !== false;
}
