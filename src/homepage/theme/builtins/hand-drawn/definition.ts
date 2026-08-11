import { HOMEPAGE_THEME_API_VERSION } from "../../api/themeApiVersion";
import type { HomepageThemeDefinition } from "../../api/types";
import HandDrawnTheme from "./HandDrawnTheme.svelte";
import { handDrawnWidgetPresentation } from "./widgets/manifest";

const handDrawnPreviewThumbnail = new URL("./hand-drawn-preview.svg", import.meta.url).href;

export const definition: HomepageThemeDefinition = {
    apiVersion: HOMEPAGE_THEME_API_VERSION,
    id: "builtin.hand-drawn",
    name: "手绘风格",
    description: "用双重歪线、铅笔勾边和随手标记组织主页的草图式工作区。",
    version: "1.0.0",
    author: "Glaube-TY",
    access: "vip",
    surfaces: ["desktop-homepage"],
    renderer: HandDrawnTheme,
    widgetPresentation: handDrawnWidgetPresentation,
    preview: {
        thumbnail: handDrawnPreviewThumbnail,
        tags: ["VIP", "手绘", "草图", "铅笔线条"],
    },
    features: { banner: true, widgetAppearance: "theme-controlled" },
};

export default definition;
