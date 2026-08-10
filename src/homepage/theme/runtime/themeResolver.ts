import type { HomepageThemeSurface, ThemeResolution } from "../api/types";
import type { HomepageThemeRegistry } from "../registry/themeRegistry";
import { CLASSIC_HOMEPAGE_THEME_ID } from "../registry/themeRegistry";
import type { HomepageEntitlementSnapshot } from "./entitlementResolver";

export function resolveHomepageTheme(options: {
    preferredThemeId: string;
    surface: HomepageThemeSurface;
    registry: HomepageThemeRegistry;
    entitlement: HomepageEntitlementSnapshot;
}): ThemeResolution {
    const fallback = options.registry.get(CLASSIC_HOMEPAGE_THEME_ID);
    if (!fallback) throw new Error("内置 Classic 主页主题未注册");
    const preferred = options.registry.get(options.preferredThemeId);
    if (!preferred) {
        return { preferredThemeId: options.preferredThemeId, effectiveThemeId: fallback.id, definition: fallback, fallbackReason: "not_registered" };
    }
    if (!preferred.surfaces.includes(options.surface)) {
        return { preferredThemeId: options.preferredThemeId, effectiveThemeId: fallback.id, definition: fallback, fallbackReason: "unsupported_surface" };
    }
    if (!options.entitlement.canUseTheme(preferred)) {
        return { preferredThemeId: options.preferredThemeId, effectiveThemeId: fallback.id, definition: fallback, fallbackReason: "vip_required" };
    }
    return { preferredThemeId: options.preferredThemeId, effectiveThemeId: preferred.id, definition: preferred };
}
