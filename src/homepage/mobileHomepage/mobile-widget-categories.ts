import { isPremiumWidgetType } from "../../features/entitlement/homepage-premium-features";

export type MobileWidgetSectionId = "note" | "visualization" | "tool" | "info" | "custom";
export type MobileWidgetCategoryId = "all" | MobileWidgetSectionId;

export interface MobileWidgetCategory {
    id: MobileWidgetCategoryId;
    label: string;
}

export interface MobileWidgetCatalogItem {
    type: string;
    label: string;
    description: string;
    activeTab: MobileWidgetSectionId;
    requiresAdvanced: boolean;
}

export const MOBILE_WIDGET_CATEGORIES: MobileWidgetCategory[] = [
    { id: "all", label: "全部" },
    { id: "note", label: "笔记数据" },
    { id: "visualization", label: "可视化" },
    { id: "tool", label: "日常工具" },
    { id: "info", label: "信息资讯" },
    { id: "custom", label: "自定义" },
];

const MOBILE_WIDGET_CATALOG_BASE: Array<Omit<MobileWidgetCatalogItem, "requiresAdvanced">> = [
    {
        type: "globalCalendar",
        label: "全局日历",
        description: "汇总任务、日记和重要日期",
        activeTab: "visualization",
    },
    {
        type: "statisticalCard",
        label: "统计卡片",
        description: "展示关键统计数字",
        activeTab: "visualization",
    },
    {
        type: "TaskMan",
        label: "任务管理",
        description: "查看最近任务与完成状态",
        activeTab: "note",
    },
    {
        type: "latest-docs",
        label: "最近文档",
        description: "快速打开最近更新的文档",
        activeTab: "note",
    },
    {
        type: "favorites",
        label: "收藏文档",
        description: "打开已收藏的常用文档",
        activeTab: "note",
    },
    {
        type: "quick-notes",
        label: "快速笔记",
        description: "查看快速记录内容",
        activeTab: "note",
    },
    {
        type: "countdown",
        label: "纪念日",
        description: "展示重要日期和剩余天数",
        activeTab: "tool",
    },
    {
        type: "timedate",
        label: "时间日期",
        description: "展示时间、日期和日历信息",
        activeTab: "tool",
    },
    {
        type: "dailyQuote",
        label: "每日一句",
        description: "展示自定义或远程语录",
        activeTab: "info",
    },
    {
        type: "TaskManPlus",
        label: "任务管理 Plus",
        description: "按筛选条件查看任务",
        activeTab: "note",
    },
    {
        type: "recent-journals",
        label: "最近日记",
        description: "查看最近创建的日记",
        activeTab: "note",
    },
    {
        type: "childDocs",
        label: "子文档",
        description: "展示指定文档的子文档",
        activeTab: "note",
    },
    {
        type: "conditionDocs",
        label: "条件文档",
        description: "按关键词或标签筛选文档",
        activeTab: "note",
    },
    {
        type: "heatmap",
        label: "热力图",
        description: "展示写作或块统计热力图",
        activeTab: "visualization",
    },
    {
        type: "visualChart",
        label: "可视化图表",
        description: "连接数据库、SQL、文档等数据生成动态图表",
        activeTab: "visualization",
    },
    {
        type: "sql",
        label: "SQL 查询",
        description: "展示自定义 SQL 查询结果",
        activeTab: "visualization",
    },
    {
        type: "weather",
        label: "今日天气",
        description: "展示天气信息",
        activeTab: "tool",
    },
    {
        type: "HOT",
        label: "热搜",
        description: "展示热门资讯",
        activeTab: "info",
    },
    {
        type: "News",
        label: "新闻资讯",
        description: "展示每日资讯或新闻摘要",
        activeTab: "info",
    },
    {
        type: "reviewDocs",
        label: "复习文档",
        description: "查看到期复习内容",
        activeTab: "note",
    },
    {
        type: "enhancedDiary",
        label: "增强日记",
        description: "进入增强日记工作区",
        activeTab: "note",
    },
    {
        type: "focus",
        label: "高级番茄钟",
        description: "开始专注和休息计时",
        activeTab: "tool",
    },
    {
        type: "habitTracker",
        label: "习惯打卡",
        description: "记录习惯与连续完成情况",
        activeTab: "tool",
    },
    {
        type: "musicPlayer",
        label: "音乐播放器",
        description: "播放本地音乐文件夹",
        activeTab: "tool",
    },
    {
        type: "almanac",
        label: "黄历",
        description: "展示今日黄历信息",
        activeTab: "tool",
    },
    {
        type: "PicCaro",
        label: "图片轮播",
        description: "轮播展示本地图片",
        activeTab: "tool",
    },
    {
        type: "CYBMOK",
        label: "赛博木鱼",
        description: "敲击木鱼并记录功德",
        activeTab: "tool",
    },
    {
        type: "fixedAssets",
        label: "固定资产",
        description: "展示资产与周期成本",
        activeTab: "tool",
    },
    {
        type: "accounting",
        label: "记账",
        description: "记录收支流水和预算概览",
        activeTab: "tool",
    },
    {
        type: "constellation",
        label: "星座运势",
        description: "查看每日星座运势",
        activeTab: "info",
    },
    {
        type: "historyDays",
        label: "历史上的今天",
        description: "展示历史事件",
        activeTab: "info",
    },
    {
        type: "custom-text",
        label: "文字内容",
        description: "展示一段自定义文字",
        activeTab: "custom",
    },
    {
        type: "custom-web",
        label: "网页浏览器",
        description: "嵌入一个网页入口",
        activeTab: "custom",
    },
    {
        type: "custom-protyle",
        label: "文档编辑器",
        description: "显示指定文档或块",
        activeTab: "custom",
    },
    {
        type: "countdownTimer",
        label: "倒计时",
        description: "展示倒计时计时器",
        activeTab: "tool",
    },
];

export const MOBILE_WIDGET_CATALOG: MobileWidgetCatalogItem[] = MOBILE_WIDGET_CATALOG_BASE.map((item) => ({
    ...item,
    requiresAdvanced: isPremiumWidgetType(item.type),
}));

const CATALOG_BY_TYPE = new Map(MOBILE_WIDGET_CATALOG.map((item) => [item.type, item]));

export function getMobileWidgetLabel(widgetType: string | undefined): string {
    if (!widgetType) return "组件";
    return CATALOG_BY_TYPE.get(widgetType)?.label || widgetType;
}

export function getMobileWidgetActiveTab(widgetType: string | undefined): MobileWidgetSectionId {
    if (!widgetType) return "note";
    return CATALOG_BY_TYPE.get(widgetType)?.activeTab || "note";
}

export function getMobileWidgetCategory(widgetType: string | undefined): MobileWidgetSectionId {
    return getMobileWidgetActiveTab(widgetType);
}
