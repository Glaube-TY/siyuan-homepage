import { MOBILE_WIDGET_CATALOG } from "../../../../../../homepage/mobileHomepage/mobile-widget-categories";
import { getHomepageBusinessCapability, type HomepageBusinessCapability } from "./homepage-agent-business-capabilities";

const DISPLAY_ONLY_TYPES = new Set(["weather", "HOT", "News", "constellation", "historyDays", "almanac", "dailyQuote", "timedate", "heatmap"]);
const ADVANCED_TYPES = new Set([
  "accounting", "almanac", "constellation", "countdown", "countdownTimer", "CYBMOK",
  "databaseChart", "enhancedDiary", "fixedAssets", "heatmap", "historyDays", "musicPlayer",
  "News", "PicCaro", "reviewDocs", "statisticalCard", "stikynot", "focus", "globalCalendar", "habitTracker",
]);
const SINGLETON_TYPES = new Set(["musicPlayer"]);

const EDITABLE_FIELDS: Record<string, string[]> = {
  "latest-docs": ["limit", "docNotebookId", "latestDocsSortBy", "latestDocsTitle", "latestDocsPrefix", "showLatestDocDetails", "useBuiltinDocIcon", "showLatestDocFloatDoc", "latestDocsFloatDocShowTime"],
  favorites: ["favoritiesTitle", "favoritiesSortOrder", "favoritiesDocPrefix", "favoritesNotebookId", "showNoteMeta", "useBuiltinDocIcon", "favoritesGroupingEnabled", "favoritesGroupIds"],
  TaskMan: ["TaskManTitle", "tasksNotebookId", "showCompletedTasks", "showTasksDetails"],
  TaskManPlus: ["TaskManPlusTitle", "isCustomFilter", "internalFilter", "customFilter", "tasksSort"],
  "quick-notes": ["quickNotesTitle", "quickNotesSort"],
  weather: ["cityName", "cityCode", "weatherStyle"],
  "custom-text": ["customText"],
  "custom-web": ["url"],
  "custom-protyle": ["isRandomDoc", "customBlockId", "displayPreset", "showBreadcrumb", "showDocumentTitle", "contentWidthMode", "outerPadding", "contentPadding", "innerCard"],
  focus: ["focusImageType", "focusBgImage", "breakImageType", "breakBgImage"],
  musicPlayer: ["sourceMode", "cloudStreamQuality", "cloudTranscodeFormat", "autoPlay"],
  dailyQuote: ["dailyQuoteMode", "customDailyQuoteContent", "dailyQuoteSource", "dailyQuoteFontSize", "dailyQuoteBgSelect", "dailyQuoteRemoteBg"],
  timedate: ["timeType", "showSeconds", "showDate", "showWeek", "showLunar", "showZodiac", "showSolarTerm", "dateFormat"],
  HOT: ["source"], News: ["NewsType"], constellation: ["selectedConstellation"], historyDays: ["historyDaysType"],
  almanac: ["almanacStyle"], stikynot: ["stikynotStyle"], CYBMOK: ["CMKnockSound"],
  PicCaro: ["PicAutoPlay", "PicInterval", "PicNavigation", "PicPagination", "PicPaginationType", "PicEffect", "PicSlidesPerView", "PicRandomSwitch"],
  countdownTimer: ["countdownTimerStyle"],
  fixedAssets: ["fixedAssetsTitle", "fixedAssetsListLimit", "fixedAssetsSortBy", "fixedAssetsShowHourly", "fixedAssetsShowMonthly", "fixedAssetsShowWeekly", "fixedAssetsShowQuarterly", "fixedAssetsShowYearly", "fixedAssetsItemCostPeriod"],
  accounting: ["accountingTitle", "accountingHomeRecentLimit", "accountingShowBudget", "accountingShowRecentRecords"],
  reviewDocs: ["reviewDocsTitle", "reviewDocsLimit", "reviewDocsDefaultView", "reviewDocsShowFuture", "reviewDocsFutureDays", "reviewDocsShowDocs", "reviewDocsShowBlocks", "reviewDocsShowNote", "reviewDocsShowPath", "reviewDocsShowStats", "reviewDocsSortBy", "reviewDocsDefaultIntervals"],
};

export interface HomepageAgentWidgetDescriptor {
  type: string;
  label: string;
  description: string;
  category: string;
  activeTab: string;
  supportedSurfaces: Array<"desktop-homepage" | "mobile-homepage">;
  advancedRequired: boolean;
  singleton: boolean;
  editableFields: string[];
  businessCapability: HomepageBusinessCapability;
}

/**
 * 桌面主页 contentSetting.svelte 真实顶级分类（activeTab → 中文标签）。
 * Agent 整理 desktop-homepage 时必须使用这一套分类，不得使用移动端 task/docs/data/tools。
 */
export const DESKTOP_CONTENT_CATEGORY_LABELS: Record<string, string> = {
  note: "笔记数据",
  visualization: "可视化",
  tool: "日常工具",
  info: "信息资讯",
  custom: "自定义",
};

/** 移动主页分类（MOBILE_WIDGET_CATALOG.category）中文标签。 */
export const MOBILE_WIDGET_CATEGORY_LABELS: Record<string, string> = {
  task: "任务",
  docs: "文档",
  data: "数据",
  tools: "工具",
};

export const HOMEPAGE_AGENT_WIDGET_CATALOG: HomepageAgentWidgetDescriptor[] = MOBILE_WIDGET_CATALOG.map((item) => ({
  ...item,
  supportedSurfaces: ["desktop-homepage", "mobile-homepage"],
  advancedRequired: ADVANCED_TYPES.has(item.type),
  singleton: SINGLETON_TYPES.has(item.type),
  editableFields: [...(EDITABLE_FIELDS[item.type] ?? [])],
  businessCapability: getHomepageBusinessCapability(item.type)
    ?? (DISPLAY_ONLY_TYPES.has(item.type)
      ? { businessTool: null, reason: "display_only" }
      : { businessTool: null, reason: "no_dedicated_business_tool" }),
}));

const WIDGET_BY_TYPE = new Map(HOMEPAGE_AGENT_WIDGET_CATALOG.map((item) => [item.type, item]));

export function getHomepageAgentWidgetDescriptor(type: string): HomepageAgentWidgetDescriptor | undefined {
  return WIDGET_BY_TYPE.get(type);
}
