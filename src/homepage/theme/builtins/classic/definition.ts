import { HOMEPAGE_THEME_API_VERSION } from "../../api/themeApiVersion";
import type { HomepageThemeDefinition } from "../../api/types";
import ClassicTheme from "./ClassicTheme.svelte";
import { classicWidgetPresentation } from "./widgets/manifest";

export const definition: HomepageThemeDefinition = {
    apiVersion: HOMEPAGE_THEME_API_VERSION,
    id: "builtin.classic",
    name: "经典主页",
    description: "完整保留现有主页功能与经典布局的免费主题。",
    version: "1.0.0",
    author: "Glaube-TY",
    access: "free",
    surfaces: ["desktop-homepage"],
    renderer: ClassicTheme,
    widgetPresentation: classicWidgetPresentation,
    preview: { tags: ["免费", "经典", "兼容"] },
    features: { banner: true, widgetAppearance: "user-configurable" },
};

export default definition;
