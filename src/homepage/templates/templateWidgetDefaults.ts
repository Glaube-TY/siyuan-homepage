const VALID_ACTIVE_TABS = ["note", "info", "visualization", "tool", "custom"] as const;
export type ValidActiveTab = typeof VALID_ACTIVE_TABS[number];

const WIDGET_TYPE_TO_ACTIVE_TAB: Record<string, ValidActiveTab> = {
    "latest-docs": "note",
    "favorites": "note",
    "recent-journals": "note",
    "TaskMan": "note",
    "TaskManPlus": "note",
    "quick-notes": "note",
    "childDocs": "note",
    "conditionDocs": "note",
    "stikynot": "note",
    "HOT": "info",
    "dailyQuote": "info",
    "News": "info",
    "constellation": "info",
    "historyDays": "info",
    "heatmap": "visualization",
    "sql": "visualization",
    "visualChart": "visualization",
    "databaseChart": "visualization",
    "statisticalCard": "visualization",
    "focus": "tool",
    "countdown": "tool",
    "weather": "tool",
    "timedate": "tool",
    "musicPlayer": "tool",
    "almanac": "tool",
    "PicCaro": "tool",
    "CYBMOK": "tool",
    "countdownTimer": "tool",
    "fixedAssets": "tool",
    "accounting": "tool",
    "custom-text": "custom",
    "custom-web": "custom",
    "custom-protyle": "custom",
};

export function isValidActiveTab(value: unknown): value is ValidActiveTab {
    return typeof value === "string" && (VALID_ACTIVE_TABS as readonly string[]).includes(value);
}

export function getDefaultActiveTabForWidgetType(widgetType: string): ValidActiveTab {
    return WIDGET_TYPE_TO_ACTIVE_TAB[widgetType] ?? "note";
}
