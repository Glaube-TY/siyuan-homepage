import { HOMEPAGE_THEME_API_VERSION } from "../../api/themeApiVersion";
import type { HomepageThemeDefinition } from "../../api/types";
import SimpleTestTheme from "./SimpleTestTheme.svelte";

export const definition: HomepageThemeDefinition = {
    apiVersion: HOMEPAGE_THEME_API_VERSION,
    id: "builtin.simple-test",
    name: "简洁工作区",
    description: "现代、克制的横向知识工作区，让状态、操作、分区与内容保持清晰秩序。",
    version: "1.2.0",
    author: "Glaube-TY",
    access: "vip",
    surfaces: ["desktop-homepage"],
    renderer: SimpleTestTheme,
    preview: { tags: ["VIP", "简洁", "知识工作区", "横向布局"] },
    features: { banner: true, widgetAppearance: "theme-controlled" },
};

export default definition;
