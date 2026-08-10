export type WidgetTitleSource = "historical-default" | "custom";

const HISTORICAL_WIDGET_TITLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
    "latest-docs": Object.freeze(["🕒最近文档", "最近文档"]),
    favorites: Object.freeze(["💖收藏文档", "收藏文档"]),
    "recent-journals": Object.freeze(["📓最近日记", "最近日记"]),
    TaskMan: Object.freeze(["📋任务管理", "任务管理"]),
    childDocs: Object.freeze(["📄子文档", "子文档"]),
    conditionDocs: Object.freeze(["📄条件文档", "条件文档"]),
    "quick-notes": Object.freeze(["快速笔记"]),
    TaskManPlus: Object.freeze(["📋任务管理Plus", "任务管理Plus", "任务管理 Plus"]),
    sql: Object.freeze(["SQL 查询结果"]),
    fixedAssets: Object.freeze(["固定资产"]),
    reviewDocs: Object.freeze(["📚复习文档", "复习文档"]),
});

export function getHistoricalWidgetTitles(widgetType: string): readonly string[] | undefined {
    return HISTORICAL_WIDGET_TITLES[widgetType];
}

export function classifyWidgetTitle(widgetType: string, configuredTitle: string): WidgetTitleSource {
    const normalized = configuredTitle.trim();
    return HISTORICAL_WIDGET_TITLES[widgetType]?.some((title) => title.trim() === normalized)
        ? "historical-default"
        : "custom";
}
