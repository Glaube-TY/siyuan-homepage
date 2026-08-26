import { HOMEPAGE_THEME_API_VERSION } from "../../api/themeApiVersion";
import type { HomepageThemeDefinition } from "../../api/types";
import CardTheme from "./CardTheme.svelte";
import { cardWidgetPresentation } from "./widgets/manifest";

export const definition: HomepageThemeDefinition = {
    apiVersion: HOMEPAGE_THEME_API_VERSION,
    id: "builtin.card",
    name: "卡片",
    description: "用统一光照、克制层级与内容化卡片，构建精确而有深度的数字工作台。",
    version: "1.1.0",
    author: "Glaube-TY",
    access: "vip",
    surfaces: ["desktop-homepage"],
    renderer: CardTheme,
    widgetPresentation: cardWidgetPresentation,
    preview: { tags: ["卡片", "现代", "分层"] },
    features: { banner: true, widgetAppearance: "theme-controlled" },
};

export default definition;
