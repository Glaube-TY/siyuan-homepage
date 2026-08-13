import { HOMEPAGE_THEME_API_VERSION } from "../../api/themeApiVersion";
import type { HomepageThemeDefinition } from "../../api/types";
import TechnologyTheme from "./TechnologyTheme.svelte";
import { technologyWidgetPresentation } from "./widgets/manifest";

export const definition: HomepageThemeDefinition = {
    apiVersion: HOMEPAGE_THEME_API_VERSION,
    id: "builtin.technology",
    name: "科技",
    description: "以深海网格、青色信息光与琥珀重点构成克制的未来控制台。",
    version: "1.0.0",
    author: "Glaube-TY",
    access: "vip",
    surfaces: ["desktop-homepage"],
    renderer: TechnologyTheme,
    widgetPresentation: technologyWidgetPresentation,
    preview: { tags: ["VIP", "科技", "HUD", "深海"] },
    features: { banner: true, widgetAppearance: "theme-controlled" },
};

export default definition;
