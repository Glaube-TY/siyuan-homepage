export const HOMEPAGE_THEME_TRANSITION_EVENT = "homepage-theme-transition";

export type HomepageThemeTransitionPhase = "start" | "ready" | "error";

export interface HomepageThemeTransitionEventDetail {
    phase: HomepageThemeTransitionPhase;
    requestId: number;
    themeId: string;
    themeName: string;
    firstActivation: boolean;
}

export function dispatchHomepageThemeTransition(
    detail: HomepageThemeTransitionEventDetail,
): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<HomepageThemeTransitionEventDetail>(
        HOMEPAGE_THEME_TRANSITION_EVENT,
        { detail: Object.freeze({ ...detail }) },
    ));
}
