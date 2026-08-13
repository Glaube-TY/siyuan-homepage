import type { HomepageThemeDefinition } from "../api/types";
import { homepageThemeRegistry } from "./themeRegistry";

type ThemeDefinitionModule = { definition?: HomepageThemeDefinition; default?: HomepageThemeDefinition };

let discovered = false;

export function registerBuiltinHomepageThemes(): void {
    if (discovered) return;
    discovered = true;
    const modules = import.meta.glob<ThemeDefinitionModule>("../builtins/*/definition.ts", { eager: true });
    for (const path of Object.keys(modules).sort((left, right) => {
        const leftRank = left.includes("/classic/") ? 0 : 1;
        const rightRank = right.includes("/classic/") ? 0 : 1;
        return leftRank - rightRank || left.localeCompare(right);
    })) {
        const module = modules[path];
        const definition = module.definition ?? module.default;
        if (!definition) throw new Error(`内置主页主题缺少 definition 导出: ${path}`);
        homepageThemeRegistry.register(definition);
    }
}
