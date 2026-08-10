import type { HomepageThemeAppearanceContext } from "../../api/types";

export interface ClassicPresentationSettings {
    titleAlign: "left" | "center" | "right";
    quickButtonStyle: "default" | "flat" | "glass";
    bannerTitleColor: string;
    bannerStatusColor: string;
    bannerButtonColor: string;
    bannerGlassEnabled: boolean;
    bannerGlassColorMode: "theme" | "custom";
    bannerGlassColor: string;
    bannerGlassOpacity: number;
    bannerGlassBlur: number;
}

const DEFAULTS: ClassicPresentationSettings = Object.freeze({
    titleAlign: "center",
    quickButtonStyle: "default",
    bannerTitleColor: "#ffffff",
    bannerStatusColor: "#ffffff",
    bannerButtonColor: "#ffffff",
    bannerGlassEnabled: false,
    bannerGlassColorMode: "theme",
    bannerGlassColor: "#ffffff",
    bannerGlassOpacity: 18,
    bannerGlassBlur: 12,
});

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function stringValue(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/** Classic renderer 内部消费的兼容设置。它不是公开 Theme Props 的一部分。 */
export function resolveClassicPresentationSettings(
    settings: HomepageThemeAppearanceContext["settings"],
): ClassicPresentationSettings {
    return {
        titleAlign: enumValue(settings.titleAlign, ["left", "center", "right"], DEFAULTS.titleAlign),
        quickButtonStyle: enumValue(settings.quickButtonStyle, ["default", "flat", "glass"], DEFAULTS.quickButtonStyle),
        bannerTitleColor: stringValue(settings.bannerTitleColor, DEFAULTS.bannerTitleColor),
        bannerStatusColor: stringValue(settings.bannerStatusColor, DEFAULTS.bannerStatusColor),
        bannerButtonColor: stringValue(settings.bannerButtonColor, DEFAULTS.bannerButtonColor),
        bannerGlassEnabled: settings.bannerGlassEnabled === true,
        bannerGlassColorMode: enumValue(settings.bannerGlassColorMode, ["theme", "custom"], DEFAULTS.bannerGlassColorMode),
        bannerGlassColor: stringValue(settings.bannerGlassColor, DEFAULTS.bannerGlassColor),
        bannerGlassOpacity: numberValue(settings.bannerGlassOpacity, DEFAULTS.bannerGlassOpacity, 0, 100),
        bannerGlassBlur: numberValue(settings.bannerGlassBlur, DEFAULTS.bannerGlassBlur, 0, 48),
    };
}

/**
 * 将历史主页配置只在运行时映射到 Classic 的通用 appearance.settings。
 * 不迁移、不覆盖，也不删除任何用户配置。
 */
export function createClassicRuntimeAppearanceSettings(
    persistedSettings: Readonly<Record<string, unknown>>,
    legacySettings: ClassicPresentationSettings,
): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...persistedSettings, ...legacySettings });
}
