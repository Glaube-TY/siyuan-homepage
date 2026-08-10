import type { HomepageThemeDefinition } from "../api/types";

export interface HomepageEntitlementSnapshot {
    advanced: boolean;
    canUseTheme(theme: HomepageThemeDefinition): boolean;
}

export function createHomepageEntitlementSnapshot(advanced: boolean): HomepageEntitlementSnapshot {
    return Object.freeze({
        advanced: advanced === true,
        canUseTheme: (theme) => theme.access === "free" || advanced === true,
    });
}
