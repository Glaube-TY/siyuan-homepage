import latestDocs from "./widget/latestDocs/latestDocs.svelte";
import latestDailyNotes from "./widget/latestDailyNotes/latestDailyNotes.svelte";
import TaskMan from "./widget/tasks/recentTasks.svelte";
import countdown from "./widget/countdown/countdown.svelte";
import weather from "./widget/weather/weather.svelte";
import HOT from "./widget/HOT/HOT.svelte";
import favorites from "./widget/favorites/favorites.svelte";
import heatmap from "./widget/heatmap/heatmap.svelte";
import customText from "./widget/customText/customText.svelte";
import customWeb from "./widget/webview/webview.svelte";
import customProtyle from "./widget/protyle/protyle.svelte";
import timedate from "./widget/timedate/timedate.svelte";
import focus from "./widget/focus/focus.svelte";
import sql from "./widget/sql/sql.svelte";
import TaskManPlus from "./widget/tasksPlus/tasksPlus.svelte";
import quickNotes from "./widget/quickNotes/quickNotes.svelte";
import dailyQuote from "./widget/dailyQuote/dailyQuote.svelte";
import visualChart from "./widget/visualChart/visualChart.svelte";
import globalCalendar from "./widget/globalCalendar/globalCalendar.svelte";
import habitTracker from "./widget/habitTracker/habitTracker.svelte";
import musicPlayer from "./widget/musicPlayer/musicPlayer.svelte";
import Stikynot from "./widget/stikynot/stikynot.svelte";
import News from "./widget/News/News.svelte";
import childDocs from "./widget/childDocs/childDocs.svelte";
import constellation from "./widget/constellation/constellation.svelte";
import historyDays from "./widget/historyDays/historyDays.svelte";
import statisticalCard from "./widget/statisticalCard/statisticalCard.svelte";
import almanac from "./widget/almanac/almanac.svelte";
import PicCaro from "./widget/PicCaro/PicCaro.svelte";
import CYBMOK from "./widget/CYBMOK/CYBMOK.svelte";
import countdownTimer from "./widget/countdownTimer/countdownTimer.svelte";
import conditionDocs from "./widget/conditionDocs/conditionDocs.svelte";
import fixedAssets from "./widget/fixedAssets/fixedAssets.svelte";
import reviewDocs from "./widget/reviewDocs/reviewDocs.svelte";
import enhancedDiary from "./widget/enhancedDiary/enhancedDiary.svelte";
import accounting from "./widget/accounting/accounting.svelte";
import KbPremiumGatePanel from "@/features/kb/components/panels/kb-premium-gate-panel.svelte";
import { visualChartContextMenuActions } from "./widget/visualChart/openVisualChartConsole";
import type { WidgetContextMenuAction } from "./widgetContextMenuActions";
import {
    WIDGET_PRESENTATION_CONTRACT_VERSION,
    type WidgetDefinition,
    type WidgetKind,
    type WidgetPlacement,
    type WidgetPresentationCategory,
    type WidgetPresentationScope,
    type WidgetContentVariantResolver,
} from "@/homepage/theme/widgetPresentation/types";
import type { Component } from "svelte";
import { getHistoricalWidgetTitles } from "@/homepage/theme/widgetPresentation/titleCompatibility";

const VALID_WIDGET_PLACEMENTS: readonly WidgetPlacement[] = Object.freeze([
    "homepage", "sidebar", "mobile", "mobile-runtime", "preview", "dock",
]);
const DEFAULT_WIDGET_PLACEMENTS: readonly WidgetPlacement[] = Object.freeze([
    "homepage", "sidebar", "mobile", "preview",
]);
const WIDGET_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SEMANTIC_LABEL_EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const VALID_PLACEMENTS = new Set<WidgetPlacement>(VALID_WIDGET_PLACEMENTS);

type DefinitionInput = {
    type: string;
    kind: WidgetKind;
    category: WidgetPresentationCategory;
    component: Component<any>;
    label: string;
    icon: string;
    plugin?: boolean;
    scope: WidgetPresentationScope;
    stateful?: boolean;
    placements?: readonly WidgetPlacement[];
    contentVariant?: WidgetContentVariantResolver;
    variants?: readonly string[];
    contextMenuActions?: readonly WidgetContextMenuAction[];
};

export interface RegisteredWidgetDefinition extends WidgetDefinition {
    readonly contextMenuActions?: readonly WidgetContextMenuAction[];
}

function defineWidget(input: DefinitionInput): RegisteredWidgetDefinition {
    const historicalDefaultTitles = getHistoricalWidgetTitles(input.type);
    return Object.freeze({
        type: input.type,
        kind: input.kind,
        presentationCategory: input.category,
        component: input.component,
        requiresPlugin: input.plugin === true,
        semanticLabel: input.label,
        semanticIcon: input.icon,
        supportedPlacements: Object.freeze([...(input.placements ?? DEFAULT_WIDGET_PLACEMENTS)]),
        defaultPresentationScope: input.scope,
        capabilities: Object.freeze({
            cssTokens: true,
            semanticParts: input.scope !== "native",
            themeIcon: input.scope !== "native",
            rendererOverride: false,
            stateful: input.stateful !== false,
        }),
        presentationContractVersion: input.scope !== "native" ? WIDGET_PRESENTATION_CONTRACT_VERSION : undefined,
        responsiveProfile: Object.freeze({ compact: 240, wide: 520 }),
        historicalDefaultTitles: historicalDefaultTitles
            ? Object.freeze([...historicalDefaultTitles])
            : undefined,
        presentationVariants: input.variants ? Object.freeze([...input.variants]) : undefined,
        resolveContentVariant: input.contentVariant,
        contextMenuActions: input.contextMenuActions
            ? Object.freeze([...input.contextMenuActions])
            : undefined,
    });
}

export function validateWidgetDefinition(definition: RegisteredWidgetDefinition): void {
    if (!WIDGET_TYPE_PATTERN.test(definition.type)) throw new Error(`非法 Widget type: ${definition.type}`);
    if (!definition.semanticLabel.trim()) throw new Error(`Widget ${definition.type} 缺少 semanticLabel`);
    if (!WIDGET_PRESENTATION_CATEGORIES.has(definition.presentationCategory)) {
        throw new Error(`Widget ${definition.type} 缺少合法 presentationCategory`);
    }
    if (SEMANTIC_LABEL_EMOJI_PATTERN.test(definition.semanticLabel)) throw new Error(`Widget ${definition.type} 的 semanticLabel 不能包含 Emoji`);
    if (!definition.semanticIcon.trim()) throw new Error(`Widget ${definition.type} 缺少 semanticIcon`);
    if (!["full", "chrome", "native"].includes(definition.defaultPresentationScope)) {
        throw new Error(`Widget ${definition.type} 缺少合法 defaultPresentationScope`);
    }
    if (definition.defaultPresentationScope !== "native" && !definition.capabilities.semanticParts) {
        throw new Error(`Widget ${definition.type} 的 ${definition.defaultPresentationScope} scope 必须支持 semanticParts`);
    }
    if (typeof definition.component !== "function") throw new Error(`Widget ${definition.type} 缺少 component`);
    if (definition.supportedPlacements.length === 0) throw new Error(`Widget ${definition.type} 未声明 placement`);
    if (definition.supportedPlacements.some((placement) => !VALID_PLACEMENTS.has(placement))) {
        throw new Error(`Widget ${definition.type} 声明了非法 placement`);
    }
    if (new Set(definition.supportedPlacements).size !== definition.supportedPlacements.length) {
        throw new Error(`Widget ${definition.type} 重复声明 placement`);
    }
    if (definition.responsiveProfile && definition.responsiveProfile.compact >= definition.responsiveProfile.wide) {
        throw new Error(`Widget ${definition.type} 的 responsiveProfile 断点顺序非法`);
    }
    if (definition.resolveContentVariant !== undefined && typeof definition.resolveContentVariant !== "function") {
        throw new Error(`Widget ${definition.type} 的 resolveContentVariant 必须是函数`);
    }
    if (definition.presentationVariants) {
        if (!definition.resolveContentVariant) throw new Error(`Widget ${definition.type} 注册了展示变体但缺少 resolver`);
        if (definition.presentationVariants.length < 2) throw new Error(`Widget ${definition.type} 的展示变体至少应有两种`);
        if (new Set(definition.presentationVariants).size !== definition.presentationVariants.length) {
            throw new Error(`Widget ${definition.type} 重复声明展示变体`);
        }
        for (const variant of definition.presentationVariants) {
            if (!PRESENTATION_VARIANT_PATTERN.test(variant) || !variant.startsWith(`${definition.type.toLowerCase()}.`)) {
                throw new Error(`Widget ${definition.type} 声明了非法展示变体: ${variant}`);
            }
        }
    }
    if (definition.contextMenuActions) {
        const ids = definition.contextMenuActions.map((action) => action.id);
        if (new Set(ids).size !== ids.length) throw new Error(`Widget ${definition.type} 重复声明右键动作`);
        for (const action of definition.contextMenuActions) {
            if (!/^[a-z0-9][a-z0-9._-]{2,95}$/.test(action.id)) throw new Error(`Widget ${definition.type} 声明了非法右键动作 ID: ${action.id}`);
            if (typeof action.label === "string" && !action.label.trim()) throw new Error(`Widget ${definition.type} 的右键动作 ${action.id} 缺少名称`);
            if (typeof action.execute !== "function") throw new Error(`Widget ${definition.type} 的右键动作 ${action.id} 缺少执行器`);
        }
    }
}

const WIDGET_PRESENTATION_CATEGORIES = new Set<WidgetPresentationCategory>([
    "collection", "metrics", "visualization", "editorial", "media", "control", "embedded", "workspace", "intrinsic",
]);
const PRESENTATION_VARIANT_PATTERN = /^[a-z0-9][a-z0-9._-]{1,95}$/;

function contentData(content: unknown): Record<string, unknown> {
    if (!content || typeof content !== "object" || Array.isArray(content)) return {};
    const data = (content as { data?: unknown }).data;
    return data && typeof data === "object" && !Array.isArray(data)
        ? data as Record<string, unknown>
        : {};
}

function dataVariant(
    field: string,
    variants: Readonly<Record<string, string>>,
    fallback: string,
): WidgetContentVariantResolver {
    return (content) => {
        const value = contentData(content)[field];
        return typeof value === "string" ? variants[value] ?? fallback : fallback;
    };
}

const resolveTimedateContentVariant = dataVariant("timeType", {
    classic: "timedate.classic",
    simple1: "timedate.simple-1",
    simple2: "timedate.simple-2",
    dial1: "timedate.dial", dial2: "timedate.dial", dial3: "timedate.dial",
    dial4: "timedate.dial", dial5: "timedate.dial", dial6: "timedate.dial",
    dial7: "timedate.dial", dial8: "timedate.dial", dial9: "timedate.dial",
}, "timedate.classic");

const resolveCountdownContentVariant: WidgetContentVariantResolver = (content) => {
    const view = contentData(content).countdownView;
    const viewMode = view && typeof view === "object" && !Array.isArray(view)
        ? (view as { viewMode?: unknown }).viewMode
        : undefined;
    return typeof viewMode === "string" && ["list", "compact", "cards", "timeline"].includes(viewMode)
        ? `countdown.${viewMode}`
        : "countdown.list";
};

const resolveVisualChartVariant: WidgetContentVariantResolver = (content) => {
    const data = contentData(content);
    const visualChart = data.visualChart && typeof data.visualChart === "object" && !Array.isArray(data.visualChart)
        ? data.visualChart as Record<string, unknown>
        : {};
    const type = String(visualChart.chartType || data.visualChartType || "bar");
    if (type === "progress" || type === "progressBar") return "visualchart.progress";
    if (type === "tagCloud" || type === "wordCloud") return "visualchart.tag-cloud";
    if (["pie", "donut", "gauge", "sunburst"].includes(type)) return "visualchart.circular";
    if (["heatmap", "funnel", "radar", "treemap"].includes(type)) return "visualchart.advanced";
    return "visualchart.cartesian";
};

export class WidgetDefinitionRegistry {
    readonly #definitions = new Map<string, RegisteredWidgetDefinition>();

    register(definition: RegisteredWidgetDefinition): void {
        validateWidgetDefinition(definition);
        if (this.#definitions.has(definition.type)) throw new Error(`Widget type 已注册: ${definition.type}`);
        this.#definitions.set(definition.type, definition);
    }

    get(type: string): RegisteredWidgetDefinition | undefined {
        return this.#definitions.get(type);
    }

    list(): readonly RegisteredWidgetDefinition[] {
        return Object.freeze([...this.#definitions.values()]);
    }
}

const BUILTIN_WIDGET_DEFINITIONS: readonly WidgetDefinition[] = Object.freeze([
    defineWidget({ type: "latest-docs", kind: "list", category: "collection", scope: "full", component: latestDocs, label: "最近文档", icon: "documents.recent", plugin: true }),
    defineWidget({ type: "heatmap", kind: "chart", category: "visualization", scope: "native", component: heatmap, label: "热力图", icon: "chart", plugin: true }),
    defineWidget({ type: "favorites", kind: "list", category: "collection", scope: "full", component: favorites, label: "收藏文档", icon: "documents.favorite", plugin: true }),
    defineWidget({ type: "recent-journals", kind: "calendar", category: "collection", scope: "full", component: latestDailyNotes, label: "最近日记", icon: "journal.recent", plugin: true, variants: ["recent-journals.list", "recent-journals.calendar"], contentVariant: dataVariant("recentJournalsShowType", { list: "recent-journals.list", calendar: "recent-journals.calendar" }, "recent-journals.list") }),
    defineWidget({ type: "TaskMan", kind: "task", category: "collection", scope: "full", component: TaskMan, label: "任务管理", icon: "task.list", plugin: true }),
    defineWidget({ type: "countdown", kind: "stat", category: "collection", scope: "native", component: countdown, label: "纪念日", icon: "calendar", plugin: true, variants: ["countdown.list", "countdown.compact", "countdown.cards", "countdown.timeline"], contentVariant: resolveCountdownContentVariant }),
    defineWidget({ type: "weather", kind: "stat", category: "metrics", scope: "native", component: weather, label: "今日天气", icon: "utility", plugin: true, variants: ["weather.default", "weather.simple-1", "weather.simple-2"], contentVariant: dataVariant("weatherStyle", { default: "weather.default", simple1: "weather.simple-1", simple2: "weather.simple-2" }, "weather.default") }),
    defineWidget({ type: "HOT", kind: "list", category: "collection", scope: "full", component: HOT, label: "热搜", icon: "list" }),
    defineWidget({ type: "custom-text", kind: "custom", category: "editorial", scope: "native", component: customText, label: "文字内容", icon: "note", stateful: false }),
    defineWidget({ type: "custom-web", kind: "embed", category: "embedded", scope: "native", component: customWeb, label: "网页浏览器", icon: "embed", stateful: false }),
    defineWidget({ type: "custom-protyle", kind: "embed", category: "editorial", scope: "native", component: customProtyle, label: "文档编辑器", icon: "documents", plugin: true, variants: ["custom-protyle.standard", "custom-protyle.compact", "custom-protyle.immersive", "custom-protyle.custom"], contentVariant: dataVariant("displayPreset", { standard: "custom-protyle.standard", compact: "custom-protyle.compact", immersive: "custom-protyle.immersive", custom: "custom-protyle.custom" }, "custom-protyle.standard") }),
    defineWidget({ type: "timedate", kind: "calendar", category: "intrinsic", scope: "native", component: timedate, label: "时间日期", icon: "calendar", plugin: true, variants: ["timedate.classic", "timedate.simple-1", "timedate.simple-2", "timedate.dial"], contentVariant: resolveTimedateContentVariant }),
    defineWidget({ type: "focus", kind: "utility", category: "control", scope: "native", component: focus, label: "专注计时", icon: "utility", plugin: true }),
    defineWidget({ type: "sql", kind: "chart", category: "visualization", scope: "chrome", component: sql, label: "SQL 查询", icon: "chart", plugin: true }),
    defineWidget({ type: "TaskManPlus", kind: "task", category: "collection", scope: "full", component: TaskManPlus, label: "任务管理 Plus", icon: "tasks", plugin: true }),
    defineWidget({ type: "quick-notes", kind: "note", category: "collection", scope: "full", component: quickNotes, label: "快速笔记", icon: "note", plugin: true }),
    defineWidget({ type: "dailyQuote", kind: "utility", category: "editorial", scope: "native", component: dailyQuote, label: "每日一句", icon: "utility", plugin: true }),
    defineWidget({ type: "visualChart", kind: "chart", category: "visualization", scope: "native", component: visualChart, label: "可视化图表", icon: "chart", plugin: true, variants: ["visualchart.cartesian", "visualchart.circular", "visualchart.advanced", "visualchart.progress", "visualchart.tag-cloud"], contentVariant: resolveVisualChartVariant, contextMenuActions: visualChartContextMenuActions }),
    defineWidget({ type: "globalCalendar", kind: "calendar", category: "visualization", scope: "full", component: globalCalendar, label: "全局日历", icon: "calendar", plugin: true }),
    defineWidget({ type: "habitTracker", kind: "task", category: "collection", scope: "full", component: habitTracker, label: "习惯打卡", icon: "task.list", plugin: true }),
    defineWidget({ type: "musicPlayer", kind: "media", category: "media", scope: "native", component: musicPlayer, label: "音乐播放器", icon: "media", plugin: true, placements: ["homepage", "sidebar", "mobile", "mobile-runtime", "preview", "dock"] }),
    defineWidget({ type: "stikynot", kind: "note", category: "editorial", scope: "native", component: Stikynot, label: "便签", icon: "note", plugin: true, variants: ["stikynot.plain", "stikynot.textured"], contentVariant: (content) => {
        const style = contentData(content).stikynotStyle;
        return typeof style === "string" && style !== "default" ? "stikynot.textured" : "stikynot.plain";
    } }),
    defineWidget({ type: "News", kind: "list", category: "collection", scope: "native", component: News, label: "新闻资讯", icon: "list", plugin: true }),
    defineWidget({ type: "childDocs", kind: "list", category: "collection", scope: "full", component: childDocs, label: "子文档", icon: "documents", plugin: true }),
    defineWidget({ type: "constellation", kind: "stat", category: "editorial", scope: "chrome", component: constellation, label: "星座运势", icon: "stat", plugin: true }),
    defineWidget({ type: "historyDays", kind: "list", category: "collection", scope: "native", component: historyDays, label: "历史上的今天", icon: "list", plugin: true, variants: ["historydays.list", "historydays.image"], contentVariant: dataVariant("historyDaysType", { list: "historydays.list", img: "historydays.image" }, "historydays.list") }),
    defineWidget({ type: "statisticalCard", kind: "stat", category: "metrics", scope: "native", component: statisticalCard, label: "统计卡片", icon: "stat", plugin: true }),
    defineWidget({ type: "almanac", kind: "calendar", category: "intrinsic", scope: "native", component: almanac, label: "黄历", icon: "calendar", plugin: true, variants: ["almanac.classic", "almanac.traditional"], contentVariant: dataVariant("almanacStyle", { classic: "almanac.classic", tradition1: "almanac.traditional" }, "almanac.classic") }),
    defineWidget({ type: "PicCaro", kind: "media", category: "media", scope: "native", component: PicCaro, label: "图片轮播", icon: "media", plugin: true }),
    defineWidget({ type: "CYBMOK", kind: "utility", category: "control", scope: "native", component: CYBMOK, label: "赛博木鱼", icon: "utility", plugin: true }),
    defineWidget({ type: "countdownTimer", kind: "utility", category: "control", scope: "native", component: countdownTimer, label: "倒计时", icon: "utility", plugin: true }),
    defineWidget({ type: "conditionDocs", kind: "list", category: "collection", scope: "full", component: conditionDocs, label: "条件文档", icon: "documents", plugin: true }),
    defineWidget({ type: "fixedAssets", kind: "complex", category: "workspace", scope: "chrome", component: fixedAssets, label: "固定资产", icon: "complex", plugin: true }),
    defineWidget({ type: "reviewDocs", kind: "list", category: "collection", scope: "chrome", component: reviewDocs, label: "复习文档", icon: "documents", plugin: true }),
    defineWidget({ type: "enhancedDiary", kind: "complex", category: "workspace", scope: "native", component: enhancedDiary, label: "增强日记", icon: "complex", plugin: true }),
    defineWidget({ type: "accounting", kind: "complex", category: "workspace", scope: "native", component: accounting, label: "记账", icon: "complex", plugin: true }),
    defineWidget({ type: "notebrain", kind: "complex", category: "workspace", scope: "native", component: KbPremiumGatePanel, label: "AI 知识库", icon: "complex", plugin: true, placements: ["homepage", "sidebar", "preview", "dock"] }),
]);

export const widgetDefinitionRegistry = new WidgetDefinitionRegistry();
for (const definition of BUILTIN_WIDGET_DEFINITIONS) widgetDefinitionRegistry.register(definition);

export function getWidgetDefinition(type: string): RegisteredWidgetDefinition | undefined {
    return widgetDefinitionRegistry.get(type);
}

export function listWidgetDefinitions(): readonly RegisteredWidgetDefinition[] {
    return widgetDefinitionRegistry.list();
}
