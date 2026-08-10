import { HOMEPAGE_THEME_API_VERSION } from "./themeApiVersion";
import type { HomepageThemeDefinition, HomepageThemeSurface } from "./types";

export const HOMEPAGE_THEME_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SUPPORTED_SURFACES: readonly HomepageThemeSurface[] = ["desktop-homepage"];

export function isSafeHomepageThemeId(value: unknown): value is string {
    return typeof value === "string" && HOMEPAGE_THEME_ID_PATTERN.test(value);
}

export function validateHomepageThemeDefinition(definition: HomepageThemeDefinition): void {
    if (!definition || typeof definition !== "object") {
        throw new Error("主题定义必须是对象");
    }
    if (definition.apiVersion !== HOMEPAGE_THEME_API_VERSION) {
        throw new Error(`不支持的主页主题 API 版本: ${String(definition.apiVersion)}`);
    }
    if (!isSafeHomepageThemeId(definition.id)) {
        throw new Error(`非法主页主题 ID: ${String(definition.id)}`);
    }
    for (const key of ["name", "version", "author"] as const) {
        if (typeof definition[key] !== "string" || !definition[key].trim()) {
            throw new Error(`主页主题缺少有效字段: ${key}`);
        }
    }
    if (definition.access !== "free" && definition.access !== "vip") {
        throw new Error(`非法主页主题权限: ${String(definition.access)}`);
    }
    if (typeof definition.renderer !== "function") {
        throw new Error(`主页主题 ${definition.id} 缺少 renderer`);
    }
    if (!Array.isArray(definition.surfaces) || definition.surfaces.length === 0) {
        throw new Error(`主页主题 ${definition.id} 未声明 surface`);
    }
    if (definition.surfaces.some((surface) => !SUPPORTED_SURFACES.includes(surface))) {
        throw new Error(`主页主题 ${definition.id} 声明了不支持的 surface`);
    }
}
