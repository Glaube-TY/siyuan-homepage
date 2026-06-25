export type MobileWidgetCategoryId = "all" | "task" | "docs" | "data" | "tools";
export type MobileAddCategoryId = "common" | "custom" | MobileWidgetCategoryId;

export interface MobileWidgetCategory {
    id: MobileWidgetCategoryId;
    label: string;
    types: string[];
}

export interface MobileWidgetCatalogItem {
    type: string;
    label: string;
    description: string;
    category: Exclude<MobileWidgetCategoryId, "all">;
    activeTab: "note" | "visualization" | "tool" | "info" | "custom";
    common?: boolean;
}

export const MOBILE_WIDGET_CATEGORIES: MobileWidgetCategory[] = [
    { id: "all", label: "全部", types: [] },
    {
        id: "task",
        label: "任务",
        types: ["TaskMan", "TaskManPlus", "quick-notes", "countdown", "countdownTimer"],
    },
    {
        id: "docs",
        label: "文档",
        types: ["latest-docs", "favorites", "recent-journals", "childDocs", "conditionDocs", "reviewDocs", "enhancedDiary"],
    },
    {
        id: "data",
        label: "数据",
        types: ["statisticalCard", "heatmap", "visualChart", "databaseChart", "sql"],
    },
    {
        id: "tools",
        label: "工具",
        types: [
            "timedate",
            "dailyQuote",
            "weather",
            "HOT",
            "custom-text",
            "custom-web",
            "custom-protyle",
            "focus",
            "musicPlayer",
            "almanac",
            "PicCaro",
            "CYBMOK",
            "fixedAssets",
            "News",
            "constellation",
            "historyDays",
            "stikynot",
        ],
    },
];

export const MOBILE_WIDGET_CATALOG: MobileWidgetCatalogItem[] = [
    {
        type: "statisticalCard",
        label: "统计卡片",
        description: "展示关键统计数字",
        category: "data",
        activeTab: "visualization",
        common: true,
    },
    {
        type: "TaskMan",
        label: "任务管理",
        description: "查看最近任务与完成状态",
        category: "task",
        activeTab: "note",
        common: true,
    },
    {
        type: "latest-docs",
        label: "最近文档",
        description: "快速打开最近更新的文档",
        category: "docs",
        activeTab: "note",
        common: true,
    },
    {
        type: "favorites",
        label: "收藏文档",
        description: "打开已收藏的常用文档",
        category: "docs",
        activeTab: "note",
        common: true,
    },
    {
        type: "quick-notes",
        label: "快速笔记",
        description: "查看快速记录内容",
        category: "task",
        activeTab: "note",
        common: true,
    },
    {
        type: "countdown",
        label: "倒数日",
        description: "展示重要日期和剩余天数",
        category: "task",
        activeTab: "tool",
        common: true,
    },
    {
        type: "timedate",
        label: "时间日期",
        description: "展示时间、日期和日历信息",
        category: "tools",
        activeTab: "tool",
        common: true,
    },
    {
        type: "dailyQuote",
        label: "每日一句",
        description: "展示自定义或远程语录",
        category: "tools",
        activeTab: "info",
        common: true,
    },
    {
        type: "TaskManPlus",
        label: "任务管理 Plus",
        description: "按筛选条件查看任务",
        category: "task",
        activeTab: "note",
    },
    {
        type: "recent-journals",
        label: "最近日记",
        description: "查看最近创建的日记",
        category: "docs",
        activeTab: "note",
    },
    {
        type: "childDocs",
        label: "子文档",
        description: "展示指定文档的子文档",
        category: "docs",
        activeTab: "note",
    },
    {
        type: "conditionDocs",
        label: "条件文档",
        description: "按关键词或标签筛选文档",
        category: "docs",
        activeTab: "note",
    },
    {
        type: "heatmap",
        label: "热力图",
        description: "展示写作或块统计热力图",
        category: "data",
        activeTab: "visualization",
    },
    {
        type: "visualChart",
        label: "可视化图表",
        description: "展示进度、折线等图表",
        category: "data",
        activeTab: "visualization",
    },
    {
        type: "sql",
        label: "SQL 查询",
        description: "展示自定义 SQL 查询结果",
        category: "data",
        activeTab: "visualization",
    },
    {
        type: "weather",
        label: "今日天气",
        description: "展示天气信息",
        category: "tools",
        activeTab: "tool",
    },
    {
        type: "HOT",
        label: "热搜",
        description: "展示热门资讯",
        category: "tools",
        activeTab: "info",
    },
    {
        type: "News",
        label: "新闻资讯",
        description: "展示每日资讯或新闻摘要",
        category: "tools",
        activeTab: "info",
    },
    {
        type: "reviewDocs",
        label: "复习文档",
        description: "查看到期复习内容",
        category: "docs",
        activeTab: "note",
    },
    {
        type: "enhancedDiary",
        label: "增强日记",
        description: "进入增强日记工作区",
        category: "docs",
        activeTab: "note",
    },
    {
        type: "databaseChart",
        label: "数据库图表",
        description: "基于数据库字段生成图表",
        category: "data",
        activeTab: "visualization",
    },
    {
        type: "focus",
        label: "专注计时",
        description: "开始专注和休息计时",
        category: "tools",
        activeTab: "tool",
    },
    {
        type: "musicPlayer",
        label: "音乐播放器",
        description: "播放本地音乐文件夹",
        category: "tools",
        activeTab: "tool",
    },
    {
        type: "almanac",
        label: "黄历",
        description: "展示今日黄历信息",
        category: "tools",
        activeTab: "tool",
    },
    {
        type: "PicCaro",
        label: "图片轮播",
        description: "轮播展示本地图片",
        category: "tools",
        activeTab: "tool",
    },
    {
        type: "CYBMOK",
        label: "赛博木鱼",
        description: "敲击木鱼并记录功德",
        category: "tools",
        activeTab: "tool",
    },
    {
        type: "fixedAssets",
        label: "固定资产",
        description: "展示资产与周期成本",
        category: "tools",
        activeTab: "tool",
    },
    {
        type: "constellation",
        label: "星座运势",
        description: "查看每日星座运势",
        category: "tools",
        activeTab: "info",
    },
    {
        type: "historyDays",
        label: "历史上的今天",
        description: "展示历史事件",
        category: "tools",
        activeTab: "info",
    },
    {
        type: "stikynot",
        label: "便签",
        description: "显示便签内容",
        category: "tools",
        activeTab: "note",
    },
    {
        type: "custom-text",
        label: "文字内容",
        description: "展示一段自定义文字",
        category: "tools",
        activeTab: "custom",
    },
    {
        type: "custom-web",
        label: "网页浏览器",
        description: "嵌入一个网页入口",
        category: "tools",
        activeTab: "custom",
    },
    {
        type: "custom-protyle",
        label: "文档编辑器",
        description: "显示指定文档或块",
        category: "tools",
        activeTab: "custom",
    },
    {
        type: "countdownTimer",
        label: "倒计时",
        description: "展示倒计时计时器",
        category: "task",
        activeTab: "tool",
    },
];

const CATALOG_BY_TYPE = new Map(MOBILE_WIDGET_CATALOG.map((item) => [item.type, item]));

export function getMobileWidgetLabel(widgetType: string | undefined): string {
    if (!widgetType) return "组件";
    return CATALOG_BY_TYPE.get(widgetType)?.label || widgetType;
}

export function getMobileWidgetActiveTab(widgetType: string | undefined): string {
    if (!widgetType) return "note";
    return CATALOG_BY_TYPE.get(widgetType)?.activeTab || "note";
}

export function getMobileWidgetCategory(widgetType: string | undefined): MobileWidgetCategoryId {
    if (!widgetType) return "tools";
    const catalogItem = CATALOG_BY_TYPE.get(widgetType);
    if (catalogItem) return catalogItem.category;
    const matchedCategory = MOBILE_WIDGET_CATEGORIES.find((category) => {
        return category.id !== "all" && category.types.includes(widgetType);
    });
    return matchedCategory?.id || "tools";
}

export function matchesMobileCategory(
    widgetType: string | undefined,
    categoryId: MobileWidgetCategoryId,
): boolean {
    if (categoryId === "all") return true;
    if (!widgetType) return false;
    const category = MOBILE_WIDGET_CATEGORIES.find((item) => item.id === categoryId);
    return !!category?.types.includes(widgetType) || getMobileWidgetCategory(widgetType) === categoryId;
}

export function sanitizeWidgetTypeClass(widgetType: string): string {
    return widgetType.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}
