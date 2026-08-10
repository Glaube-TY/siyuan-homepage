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
import musicPlayer from "./widget/musicPlayer/musicPlayer.svelte";
import Stikynot from "./widget/stikynot/stikynot.svelte";
import News from "./widget/News/News.svelte";
import databaseChart from "./widget/databaseChart/databaseChart.svelte";
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
import {
    WIDGET_PRESENTATION_CONTRACT_VERSION,
    type WidgetDefinition,
    type WidgetKind,
    type WidgetPlacement,
    type WidgetPresentationScope,
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
    component: Component<any>;
    label: string;
    icon: string;
    plugin?: boolean;
    scope: WidgetPresentationScope;
    stateful?: boolean;
    placements?: readonly WidgetPlacement[];
};

function defineWidget(input: DefinitionInput): WidgetDefinition {
    const historicalDefaultTitles = getHistoricalWidgetTitles(input.type);
    return Object.freeze({
        type: input.type,
        kind: input.kind,
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
    });
}

export function validateWidgetDefinition(definition: WidgetDefinition): void {
    if (!WIDGET_TYPE_PATTERN.test(definition.type)) throw new Error(`非法 Widget type: ${definition.type}`);
    if (!definition.semanticLabel.trim()) throw new Error(`Widget ${definition.type} 缺少 semanticLabel`);
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
}

export class WidgetDefinitionRegistry {
    readonly #definitions = new Map<string, WidgetDefinition>();

    register(definition: WidgetDefinition): void {
        validateWidgetDefinition(definition);
        if (this.#definitions.has(definition.type)) throw new Error(`Widget type 已注册: ${definition.type}`);
        this.#definitions.set(definition.type, definition);
    }

    get(type: string): WidgetDefinition | undefined {
        return this.#definitions.get(type);
    }

    list(): readonly WidgetDefinition[] {
        return Object.freeze([...this.#definitions.values()]);
    }
}

const BUILTIN_WIDGET_DEFINITIONS: readonly WidgetDefinition[] = Object.freeze([
    defineWidget({ type: "latest-docs", kind: "list", scope: "full", component: latestDocs, label: "最近文档", icon: "documents.recent", plugin: true }),
    defineWidget({ type: "heatmap", kind: "chart", scope: "native", component: heatmap, label: "热力图", icon: "chart", plugin: true }),
    defineWidget({ type: "favorites", kind: "list", scope: "full", component: favorites, label: "收藏文档", icon: "documents.favorite", plugin: true }),
    defineWidget({ type: "recent-journals", kind: "calendar", scope: "full", component: latestDailyNotes, label: "最近日记", icon: "journal.recent", plugin: true }),
    defineWidget({ type: "TaskMan", kind: "task", scope: "full", component: TaskMan, label: "任务管理", icon: "task.list", plugin: true }),
    defineWidget({ type: "countdown", kind: "stat", scope: "native", component: countdown, label: "纪念日", icon: "calendar", plugin: true }),
    defineWidget({ type: "weather", kind: "stat", scope: "native", component: weather, label: "今日天气", icon: "utility", plugin: true }),
    defineWidget({ type: "HOT", kind: "list", scope: "full", component: HOT, label: "热搜", icon: "list" }),
    defineWidget({ type: "custom-text", kind: "custom", scope: "native", component: customText, label: "文字内容", icon: "note", stateful: false }),
    defineWidget({ type: "custom-web", kind: "embed", scope: "native", component: customWeb, label: "网页浏览器", icon: "embed", stateful: false }),
    defineWidget({ type: "custom-protyle", kind: "embed", scope: "native", component: customProtyle, label: "文档编辑器", icon: "documents", plugin: true }),
    defineWidget({ type: "timedate", kind: "calendar", scope: "native", component: timedate, label: "时间日期", icon: "calendar", plugin: true }),
    defineWidget({ type: "focus", kind: "utility", scope: "native", component: focus, label: "专注计时", icon: "utility", plugin: true }),
    defineWidget({ type: "sql", kind: "chart", scope: "chrome", component: sql, label: "SQL 查询", icon: "chart", plugin: true }),
    defineWidget({ type: "TaskManPlus", kind: "task", scope: "full", component: TaskManPlus, label: "任务管理 Plus", icon: "tasks", plugin: true }),
    defineWidget({ type: "quick-notes", kind: "note", scope: "full", component: quickNotes, label: "快速笔记", icon: "note", plugin: true }),
    defineWidget({ type: "dailyQuote", kind: "utility", scope: "native", component: dailyQuote, label: "每日一句", icon: "utility", plugin: true }),
    defineWidget({ type: "visualChart", kind: "chart", scope: "native", component: visualChart, label: "可视化图表", icon: "chart", plugin: true }),
    defineWidget({ type: "musicPlayer", kind: "media", scope: "native", component: musicPlayer, label: "音乐播放器", icon: "media", plugin: true, placements: ["homepage", "sidebar", "mobile", "mobile-runtime", "preview", "dock"] }),
    defineWidget({ type: "stikynot", kind: "note", scope: "native", component: Stikynot, label: "便签", icon: "note", plugin: true }),
    defineWidget({ type: "News", kind: "list", scope: "native", component: News, label: "新闻资讯", icon: "list", plugin: true }),
    defineWidget({ type: "databaseChart", kind: "chart", scope: "native", component: databaseChart, label: "数据库图表", icon: "chart", plugin: true }),
    defineWidget({ type: "childDocs", kind: "list", scope: "full", component: childDocs, label: "子文档", icon: "documents", plugin: true }),
    defineWidget({ type: "constellation", kind: "stat", scope: "chrome", component: constellation, label: "星座运势", icon: "stat", plugin: true }),
    defineWidget({ type: "historyDays", kind: "list", scope: "native", component: historyDays, label: "历史上的今天", icon: "list", plugin: true }),
    defineWidget({ type: "statisticalCard", kind: "stat", scope: "native", component: statisticalCard, label: "统计卡片", icon: "stat", plugin: true }),
    defineWidget({ type: "almanac", kind: "calendar", scope: "native", component: almanac, label: "黄历", icon: "calendar", plugin: true }),
    defineWidget({ type: "PicCaro", kind: "media", scope: "native", component: PicCaro, label: "图片轮播", icon: "media", plugin: true }),
    defineWidget({ type: "CYBMOK", kind: "utility", scope: "native", component: CYBMOK, label: "赛博木鱼", icon: "utility", plugin: true }),
    defineWidget({ type: "countdownTimer", kind: "utility", scope: "native", component: countdownTimer, label: "倒计时", icon: "utility", plugin: true }),
    defineWidget({ type: "conditionDocs", kind: "list", scope: "full", component: conditionDocs, label: "条件文档", icon: "documents", plugin: true }),
    defineWidget({ type: "fixedAssets", kind: "complex", scope: "chrome", component: fixedAssets, label: "固定资产", icon: "complex", plugin: true }),
    defineWidget({ type: "reviewDocs", kind: "list", scope: "chrome", component: reviewDocs, label: "复习文档", icon: "documents", plugin: true }),
    defineWidget({ type: "enhancedDiary", kind: "complex", scope: "native", component: enhancedDiary, label: "增强日记", icon: "complex", plugin: true }),
    defineWidget({ type: "accounting", kind: "complex", scope: "native", component: accounting, label: "记账", icon: "complex", plugin: true }),
    defineWidget({ type: "notebrain", kind: "complex", scope: "native", component: KbPremiumGatePanel, label: "AI 知识库", icon: "complex", plugin: true, placements: ["homepage", "sidebar", "preview", "dock"] }),
]);

export const widgetDefinitionRegistry = new WidgetDefinitionRegistry();
for (const definition of BUILTIN_WIDGET_DEFINITIONS) widgetDefinitionRegistry.register(definition);

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
    return widgetDefinitionRegistry.get(type);
}

export function listWidgetDefinitions(): readonly WidgetDefinition[] {
    return widgetDefinitionRegistry.list();
}
