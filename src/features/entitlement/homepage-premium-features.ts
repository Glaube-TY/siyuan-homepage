export const PREMIUM_WIDGET_TYPES = new Set([
    "reviewDocs",
    "stikynot",
    "enhancedDiary",
    "News",
    "constellation",
    "historyDays",
    "visualChart",
    "globalCalendar",
    "statisticalCard",
    "focus",
    "habitTracker",
    "countdown",
    "musicPlayer",
    "almanac",
    "PicCaro",
    "CYBMOK",
    "countdownTimer",
    "fixedAssets",
    "accounting",
    "notebrain",
]);

export function isPremiumWidgetType(type: string | undefined): boolean {
    return type !== undefined && PREMIUM_WIDGET_TYPES.has(type);
}

export function isPremiumDailyQuoteMode(mode: string | undefined): boolean {
    return mode === "ai" || mode === "remote";
}

export function isPremiumHeatmapCountType(type: string | undefined): boolean {
    return type === "words" || type === "documentCreated" || type === "documentUpdated";
}

export function isPremiumTimedateMode(mode: string | undefined): boolean {
    return typeof mode === "string" && /^dial[3-9]$/.test(mode);
}

export function isPremiumWeatherStyle(style: string | undefined): boolean {
    return style === "simple1" || style === "simple2";
}

export function isPremiumBannerGlobalType(type: string | undefined): boolean {
    return type === "bing";
}

function resolveWidgetData(contentData: unknown): Record<string, unknown> {
    if (!contentData || typeof contentData !== "object" || Array.isArray(contentData)) return {};
    const data = (contentData as { data?: unknown }).data;
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
    return contentData as Record<string, unknown>;
}

export function resolveWidgetPremiumRequirement(
    widgetType: string | undefined,
    contentData: unknown,
): boolean {
    if (isPremiumWidgetType(widgetType)) return true;
    const data = resolveWidgetData(contentData);
    if (widgetType === "dailyQuote") return isPremiumDailyQuoteMode(String(data.dailyQuoteMode || "custom"));
    if (widgetType === "heatmap") return isPremiumHeatmapCountType(String(data.heatmapCountType || "block"));
    if (widgetType === "timedate") return isPremiumTimedateMode(String(data.timeType || "classic"));
    if (widgetType === "weather") return isPremiumWeatherStyle(String(data.weatherStyle || "default"));
    return false;
}
