import { HOMEPAGE_THEME_API_VERSION } from "../../api/themeApiVersion";
import type { HomepageThemeDefinition } from "../../api/types";
import PaperTheme from "./PaperTheme.svelte";
import { paperWorkspaceWidgetPresentation } from "./widgets/manifest";

export const definition: HomepageThemeDefinition = {
    apiVersion: HOMEPAGE_THEME_API_VERSION,
    id: "builtin.paper",
    name: "纸质",
    description: "带有纸张纤维、归档卡片与印刷层级的温润知识工作区。",
    version: "1.0.0",
    author: "Glaube-TY",
    access: "vip",
    surfaces: ["desktop-homepage"],
    renderer: PaperTheme,
    widgetPresentation: paperWorkspaceWidgetPresentation,
    preview: { tags: ["纸张质感", "归档卡片", "知识工作区"] },
    features: { banner: true, widgetAppearance: "theme-controlled" },
};

export default definition;
