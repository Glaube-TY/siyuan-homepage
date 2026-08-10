import type { HomepageThemeDefinition, HomepageThemeSurface } from "../api/types";
import { validateHomepageThemeDefinition } from "../api/themeValidation";
import { HOMEPAGE_THEME_API_VERSION } from "../api/themeApiVersion";

export const CLASSIC_HOMEPAGE_THEME_ID = "builtin.classic";

export class HomepageThemeRegistry {
    readonly #definitions = new Map<string, HomepageThemeDefinition>();

    register(definition: HomepageThemeDefinition): void {
        validateHomepageThemeDefinition(definition);
        if (this.#definitions.has(definition.id)) {
            throw new Error(`主页主题 ID 已注册: ${definition.id}`);
        }
        this.#definitions.set(definition.id, Object.freeze({
            ...definition,
            surfaces: Object.freeze([...definition.surfaces]),
            preview: definition.preview ? Object.freeze({
                ...definition.preview,
                tags: definition.preview.tags ? Object.freeze([...definition.preview.tags]) : undefined,
            }) : undefined,
        }));
    }

    get(id: string): HomepageThemeDefinition | undefined {
        return this.#definitions.get(id);
    }

    list(surface?: HomepageThemeSurface): readonly HomepageThemeDefinition[] {
        const definitions = [...this.#definitions.values()];
        return Object.freeze(surface
            ? definitions.filter((definition) => definition.surfaces.includes(surface))
            : definitions);
    }

    has(id: string): boolean {
        return this.#definitions.has(id);
    }
}

export const homepageThemeRegistry = new HomepageThemeRegistry();

export function registerHomepageTheme(definition: HomepageThemeDefinition): void {
    if (definition.id.startsWith("builtin.")) {
        throw new Error(`第三方主页主题不能使用内置命名空间: ${definition.id}`);
    }
    homepageThemeRegistry.register(definition);
}

export function getHomepageThemeApiVersion(): number {
    return HOMEPAGE_THEME_API_VERSION;
}
