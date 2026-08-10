import { isSafeHomepageThemeId } from "../api/themeValidation";
import { CLASSIC_HOMEPAGE_THEME_ID } from "../registry/themeRegistry";

export interface HomepageAppearanceConfig {
    schema: 1;
    preferredThemeId: string;
    themeSettings: Record<string, Record<string, unknown>>;
}

export const DEFAULT_HOMEPAGE_APPEARANCE: HomepageAppearanceConfig = Object.freeze({
    schema: 1,
    preferredThemeId: CLASSIC_HOMEPAGE_THEME_ID,
    themeSettings: {},
});

function normalizeThemeSettings(value: unknown): Record<string, Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, Record<string, unknown>> = {};
    for (const [themeId, settings] of Object.entries(value)) {
        if (!isSafeHomepageThemeId(themeId) || !settings || typeof settings !== "object" || Array.isArray(settings)) continue;
        result[themeId] = { ...(settings as Record<string, unknown>) };
    }
    return result;
}

export function normalizeHomepageAppearanceConfig(value: unknown): HomepageAppearanceConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { schema: 1, preferredThemeId: CLASSIC_HOMEPAGE_THEME_ID, themeSettings: {} };
    }
    const raw = value as Record<string, unknown>;
    return {
        schema: 1,
        preferredThemeId: isSafeHomepageThemeId(raw.preferredThemeId)
            ? raw.preferredThemeId
            : CLASSIC_HOMEPAGE_THEME_ID,
        themeSettings: normalizeThemeSettings(raw.themeSettings),
    };
}
