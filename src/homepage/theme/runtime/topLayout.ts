export type HomepageTopContentLayout = "split" | "inline" | "stacked";
export type HomepageTopBannerPosition = "before" | "after";
export type HomepageTopPrimaryPosition = "content-first" | "actions-first";
export type HomepageTopBannerContent = "none" | "all";

export interface HomepageTopLayoutModel {
    contentLayout: HomepageTopContentLayout;
    bannerPosition: HomepageTopBannerPosition;
    primaryPosition: HomepageTopPrimaryPosition;
    bannerContent: HomepageTopBannerContent;
    align: "left" | "center" | "right";
}

export const DEFAULT_HOMEPAGE_TOP_LAYOUT: Readonly<HomepageTopLayoutModel> = Object.freeze({
    contentLayout: "split",
    bannerPosition: "after",
    primaryPosition: "content-first",
    bannerContent: "none",
    align: "center",
});

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizeHomepageTopLayout(
    value: unknown,
    fallbackIntegrated = false,
): HomepageTopLayoutModel {
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
        contentLayout: enumValue(source.contentLayout, ["split", "inline", "stacked"], DEFAULT_HOMEPAGE_TOP_LAYOUT.contentLayout),
        bannerPosition: enumValue(source.bannerPosition, ["before", "after"], DEFAULT_HOMEPAGE_TOP_LAYOUT.bannerPosition),
        primaryPosition: enumValue(source.primaryPosition, ["content-first", "actions-first"], DEFAULT_HOMEPAGE_TOP_LAYOUT.primaryPosition),
        bannerContent: enumValue(source.bannerContent, ["none", "all"], fallbackIntegrated ? "all" : DEFAULT_HOMEPAGE_TOP_LAYOUT.bannerContent),
        align: enumValue(source.align, ["left", "center", "right"], DEFAULT_HOMEPAGE_TOP_LAYOUT.align),
    };
}
