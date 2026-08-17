import { MOBILE_WIDGET_CATALOG } from "../../../../../../homepage/mobileHomepage/mobile-widget-categories";
import { getHomepageBusinessCapability, type HomepageBusinessCapability } from "./homepage-agent-business-capabilities";

const ADVANCED_TYPES = new Set([
  "accounting", "almanac", "constellation", "countdown", "countdownTimer", "CYBMOK",
  "enhancedDiary", "fixedAssets", "heatmap", "historyDays", "musicPlayer",
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
  activeTab: string;
  supportedSurfaces: Array<"desktop-homepage" | "mobile-homepage">;
  advancedRequired: boolean;
  singleton: boolean;
  editableFields: string[];
  businessCapability: HomepageBusinessCapability;
}

/**
 * 组件内容设置的真实顶级分类（activeTab → 中文标签）。
 * 桌面与移动主页共用的组件内容分类。
 */
export const WIDGET_CONTENT_CATEGORY_LABELS: Record<string, string> = {
  note: "笔记数据",
  visualization: "可视化",
  tool: "日常工具",
  info: "信息资讯",
  custom: "自定义",
  workspace: "工作区",
};

/**
 * 仅桌面主页存在的组件（移动端目录没有）。
 * notebrain 面板配置由 AI 知识库自身管理，Agent 只负责布局与样式，不编辑展示配置。
 */
const DESKTOP_ONLY_WIDGET_DESCRIPTORS: HomepageAgentWidgetDescriptor[] = [
  {
    type: "notebrain",
    label: "AI 知识库",
    description: "桌面主页的 AI 知识库面板，展示配置由知识库自身管理。",
    activeTab: "workspace",
    supportedSurfaces: ["desktop-homepage"],
    advancedRequired: true,
    singleton: true,
    editableFields: [],
    businessCapability: getHomepageBusinessCapability("notebrain")!,
  },
];

export const HOMEPAGE_AGENT_WIDGET_CATALOG: HomepageAgentWidgetDescriptor[] = [
  ...MOBILE_WIDGET_CATALOG.map((item): HomepageAgentWidgetDescriptor => ({
    ...item,
    supportedSurfaces: ["desktop-homepage", "mobile-homepage"],
    advancedRequired: ADVANCED_TYPES.has(item.type),
    singleton: SINGLETON_TYPES.has(item.type),
    editableFields: [...(EDITABLE_FIELDS[item.type] ?? [])],
    businessCapability: getHomepageBusinessCapability(item.type)!,
  })),
  ...DESKTOP_ONLY_WIDGET_DESCRIPTORS,
];

const WIDGET_BY_TYPE = new Map(HOMEPAGE_AGENT_WIDGET_CATALOG.map((item) => [item.type, item]));

export function getHomepageAgentWidgetDescriptor(type: string): HomepageAgentWidgetDescriptor | undefined {
  return WIDGET_BY_TYPE.get(type);
}
