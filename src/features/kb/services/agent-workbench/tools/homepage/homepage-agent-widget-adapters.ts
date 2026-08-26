import { getMobileWidgetActiveTab } from "../../../../../../homepage/mobileHomepage/mobile-widget-categories";
import { assertHomepagePatchContainsNoSensitiveFields } from "./homepage-agent-widget-sanitizer";
import { getHomepageAgentWidgetDescriptor } from "./homepage-agent-widget-catalog";
import {
  isPremiumDailyQuoteMode,
  isPremiumTimedateMode,
  isPremiumWeatherStyle,
} from "../../../../../../features/entitlement/homepage-premium-features";
import {
  DAILY_QUOTE_AI_PROMPT_MAX_LENGTH,
  DEFAULT_DAILY_QUOTE_AI_PROMPT,
} from "../../../../../../components/utils/widgetBlock/widget/dailyQuote/dailyQuoteAiConfig";
import {
  getProtyleDisplayPreset,
  PROTYLE_CONTENT_PADDING_OPTIONS,
  PROTYLE_OUTER_PADDING_OPTIONS,
} from "../../../../../../components/utils/widgetBlock/widget/protyle/protyleDisplayConfig";

const ARRAY_DATA_TYPES = new Set(["latest-docs", "custom-text", "custom-web", "custom-protyle"]);
const SIYUAN_ID = /^\d{14}-[a-z0-9]{7}$/i;

const DEFAULT_DATA: Record<string, Record<string, unknown>> = {
  "latest-docs": { latestDocsTitle: "🕒最近文档", latestDocsPrefix: "📄", limit: 5, docNotebookId: "", latestDocsSortBy: "updated", ensureOpenDocs: false, useBuiltinDocIcon: false, showLatestDocDetails: true },
  favorites: { favoritiesTitle: "💖收藏文档", favoritiesDocPrefix: "❤", favoritiesSortOrder: "favoritedDesc", favoritesNotebookId: "", showNoteMeta: true, useBuiltinDocIcon: false, favoritesGroupingEnabled: false, favoritesGroupIds: "" },
  TaskMan: { TaskManTitle: "📋任务管理", tasksNotebookId: "", showCompletedTasks: true, showTasksDetails: true },
  TaskManPlus: { TaskManPlusTitle: "📋任务管理Plus", isCustomFilter: false, internalFilter: "all", customFilter: "", tasksSort: "startdate" },
  "quick-notes": { quickNotesTitle: "快速笔记", quickNotesSort: "DOC_ASC" },
  weather: { cityName: "", cityCode: "", weatherStyle: "default" },
  "custom-text": { customText: "" }, "custom-web": { url: "" }, "custom-protyle": { isRandomDoc: false, customBlockId: "", ...getProtyleDisplayPreset("compact") },
  focus: { focusImageType: "remote", focusBgImage: "", breakImageType: "remote", breakBgImage: "" },
  musicPlayer: { musicFolderPath: "", sourceMode: "local", cloudStreamQuality: "original", cloudTranscodeFormat: "auto", autoPlay: false },
  dailyQuote: { dailyQuoteMode: "custom", customDailyQuoteContent: "", dailyQuoteSource: "classic", dailyQuoteAiPrompt: DEFAULT_DAILY_QUOTE_AI_PROMPT, dailyQuoteAiUseMemory: true, dailyQuoteFontSize: 1, dailyQuoteBgSelect: "remote", dailyQuoteRemoteBg: "" },
  timedate: { timeType: "classic", showSeconds: true, showDate: true, showWeek: true, showLunar: true, showZodiac: true, showSolarTerm: true, dateFormat: "YYYY年MM月DD日" },
  HOT: { source: "bilibili" }, News: { NewsType: "daily-news-bulletin" }, constellation: { selectedConstellation: "摩羯" }, historyDays: { historyDaysType: "list" },
  almanac: { almanacStyle: "classic" }, stikynot: { stikynotStyle: "default" }, CYBMOK: { CMKnockSound: "普通" },
  PicCaro: { PicAutoPlay: false, PicInterval: 3, PicNavigation: false, PicPagination: false, PicPaginationType: "bullets", PicEffect: "slide", PicSlidesPerView: "1", PicRandomSwitch: false },
  countdownTimer: { countdownTimerStyle: "default" },
  fixedAssets: { fixedAssetsTitle: "固定资产", fixedAssetsListLimit: 6, fixedAssetsSortBy: "updated", fixedAssetsShowHourly: true, fixedAssetsShowMonthly: true, fixedAssetsShowWeekly: false, fixedAssetsShowQuarterly: false, fixedAssetsShowYearly: false, fixedAssetsItemCostPeriod: "day" },
  accounting: { accountingTitle: "记账", accountingHomeRecentLimit: 5, accountingShowBudget: true, accountingShowRecentRecords: true },
  reviewDocs: { reviewDocsTitle: "📚复习文档", reviewDocsLimit: 20, reviewDocsDefaultView: "due", reviewDocsShowFuture: true, reviewDocsFutureDays: 7, reviewDocsShowDocs: true, reviewDocsShowBlocks: true, reviewDocsShowNote: true, reviewDocsShowPath: true, reviewDocsShowStats: true, reviewDocsSortBy: "dueAsc", reviewDocsDefaultIntervals: "0,1,2,4,7,15,30,60" },
};

const ENUM_FIELDS: Readonly<Record<string, readonly string[]>> = {
  latestDocsSortBy: ["viewedAt", "updated", "openAt", "closedAt"],
  favoritiesSortOrder: ["favoritedDesc", "favoritedAsc", "updatedDesc", "updatedAsc", "createdDesc", "createdAsc", "nameAsc", "nameDesc", "manual"],
  internalFilter: ["all", "uncompleted", "completed", "today", "tomorrow", "mostImportant"],
  tasksSort: ["startdate", "deadline", "priority"],
  quickNotesSort: ["DOC_ASC", "DOC_INV", "UPD", "CRE"],
  weatherStyle: ["default", "simple1", "simple2"],
  focusImageType: ["remote", "local"], breakImageType: ["remote", "local"],
  sourceMode: ["local", "subsonic"], cloudStreamQuality: ["original", "320", "192", "128"], cloudTranscodeFormat: ["auto", "mp3"],
  dailyQuoteMode: ["custom", "ai", "remote"], dailyQuoteSource: ["classic", "celebrity", "emotion", "gaoxiao", "pyq", "straybirdsZH", "straybirdsEN", "lovegarden"], dailyQuoteBgSelect: ["remote", "local"],
  timeType: ["classic", "simple1", "simple2", "dial1", "dial2", "dial3", "dial4", "dial5", "dial6", "dial7", "dial8", "dial9"],
  dateFormat: ["YYYY年MM月DD日", "YYYY-MM-DD", "YYYY/MM/DD", "YYYY.MM.DD"],
  source: ["bilibili", "acfun", "weibo", "zhihu", "douyin", "kuaishou", "douban-movie", "douban-group", "tieba", "hupu", "miyoushe", "ngabbs", "v2ex", "52pojie", "hostloc", "coolapk", "baidu", "thepaper", "toutiao", "qq-news", "sina", "sina-news", "netease-news", "huxiu", "ifanr", "sspai", "ithome", "ithome-xijiayi", "juejin", "jianshu", "guokr", "36kr", "51cto", "csdn", "nodeseek", "hellogithub", "lol", "genshin", "honkai", "starrail", "weread"],
  NewsType: ["daily-news-bulletin", "daily-news-bulletin-v2", "daily-news-bulletin-v3", "daily-news-bulletin-weather", "daily-news-zhihu", "news"],
  selectedConstellation: ["白羊", "金牛", "双子", "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼"],
  historyDaysType: ["list", "img", "card"], almanacStyle: ["classic", "tradition1", "simple"],
  stikynotStyle: ["default", "simple", "kraftPaper", "wood", "marble", "Ink", "beach", "BlueSky", "sunsetHeart", "Stars", "waterDrop", "PinkPorcelain"],
  CMKnockSound: ["普通", "空洞", "空灵"], PicPaginationType: ["bullets", "fraction", "progressbar"], PicEffect: ["slide", "fade", "cube", "coverflow", "flip"],
  countdownTimerStyle: ["default", "ring1"], fixedAssetsSortBy: ["updated", "dailyCost", "totalCost", "days", "name"],
  fixedAssetsItemCostPeriod: ["hour", "day", "week", "month", "quarter", "year"],
  reviewDocsDefaultView: ["due", "today", "overdue", "future", "all"], reviewDocsSortBy: ["dueAsc", "priorityDesc", "updatedDesc", "createdDesc", "reviewCountAsc"],
  displayPreset: ["standard", "compact", "immersive", "custom"], contentWidthMode: ["system", "full"],
};

const NUMBER_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  limit: [1, 200], latestDocsFloatDocShowTime: [0, 60], dailyQuoteFontSize: [0.5, 5],
  PicInterval: [1, 3600], fixedAssetsListLimit: [1, 200], accountingHomeRecentLimit: [1, 200],
  reviewDocsLimit: [1, 200], reviewDocsFutureDays: [0, 3650],
};

function isAbsoluteLocalPath(value: string): boolean {
  return /^[a-z]:[\\/]/i.test(value) || /^\/(?:Users|home|root|mnt|data|var|opt|tmp)(?:\/|$)/.test(value);
}

function validateField(type: string, key: string, value: unknown): void {
  const defaultValue = DEFAULT_DATA[type]?.[key];
  if (key === "outerPadding" && !PROTYLE_OUTER_PADDING_OPTIONS.includes(value as never)) throw new Error("outerPadding 不在允许范围内");
  if (key === "contentPadding" && !PROTYLE_CONTENT_PADDING_OPTIONS.includes(value as never)) throw new Error("contentPadding 不在允许范围内");
  if (key !== "contentPadding" && defaultValue !== undefined && typeof value !== typeof defaultValue) throw new Error(`字段 ${key} 必须是 ${typeof defaultValue} 类型`);
  if (typeof value === "string" && value.length > 10000) throw new Error(`字段 ${key} 文本过长`);
  if (key === "dailyQuoteAiPrompt" && (typeof value !== "string" || value.length > DAILY_QUOTE_AI_PROMPT_MAX_LENGTH)) throw new Error(`字段 ${key} 必须是不超过 ${DAILY_QUOTE_AI_PROMPT_MAX_LENGTH} 字符的文本`);
  if (typeof value === "string" && isAbsoluteLocalPath(value)) throw new Error(`字段 ${key} 不允许写入本地绝对路径`);
  if (key === "customText" && (typeof value !== "string" || value.length > 10000)) throw new Error("customText 必须是不超过 10000 字符的文本");
  if (key === "url") {
    if (typeof value !== "string") throw new Error("url 必须是字符串");
    if (value) {
      let parsed: URL;
      try { parsed = new URL(value); } catch { throw new Error("custom-web URL 无效"); }
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("custom-web 只允许不含凭据的 http/https URL");
    }
  }
  if (key === "customBlockId" && value !== "" && (typeof value !== "string" || !SIYUAN_ID.test(value))) throw new Error("customBlockId 不是合法思源 ID");
  const allowedValues = ENUM_FIELDS[key];
  if (allowedValues && !allowedValues.includes(String(value))) throw new Error(`字段 ${key} 不在允许范围内`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`字段 ${key} 必须是有限数字`);
  const range = NUMBER_RANGES[key];
  if (range && (typeof value !== "number" || value < range[0] || value > range[1])) throw new Error(`字段 ${key} 必须在 ${range[0]} 到 ${range[1]} 之间`);
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || value === undefined) throw new Error(`字段 ${key} 不是 JSON-safe 值`);
}

export function validateAndNormalizeHomepageWidgetPatch(
  type: string,
  patch: Record<string, unknown>,
  options: { advancedEnabled?: boolean } = {},
): Record<string, unknown> {
  const descriptor = getHomepageAgentWidgetDescriptor(type);
  if (!descriptor || descriptor.editableFields.length === 0) throw new Error(`组件 ${type} 不支持 Agent 修改展示配置`);
  if (!options.advancedEnabled && descriptor.advancedRequired) {
    throw new Error(`组件 ${type} 的展示配置修改需要高级功能`);
  }
  if (!options.advancedEnabled) {
    if (type === "favorites" && ("favoritesGroupingEnabled" in patch || "favoritesGroupIds" in patch)) throw new Error("收藏分组展示设置需要高级功能");
    if (type === "dailyQuote" && (isPremiumDailyQuoteMode(String(patch.dailyQuoteMode ?? "")) || "dailyQuoteSource" in patch || "dailyQuoteAiPrompt" in patch || "dailyQuoteAiUseMemory" in patch)) throw new Error("AI/远程每日一句设置需要高级功能");
    if (type === "timedate" && isPremiumTimedateMode(String(patch.timeType ?? ""))) throw new Error("该时间日期样式需要高级功能");
    if (type === "weather" && "weatherStyle" in patch && isPremiumWeatherStyle(String(patch.weatherStyle ?? ""))) throw new Error("该天气样式需要高级功能");
  }
  assertHomepagePatchContainsNoSensitiveFields(patch);
  const allowed = new Set(descriptor.editableFields);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) throw new Error(`字段 ${key} 不在组件 ${type} 的 Agent 可编辑白名单中`);
    validateField(type, key, value);
    output[key] = value;
  }
  return output;
}

export function readHomepageWidgetData(config: Record<string, unknown>): Record<string, unknown> {
  const data = config.data;
  if (Array.isArray(data)) return data[0] && typeof data[0] === "object" ? { ...data[0] as Record<string, unknown> } : {};
  return data && typeof data === "object" ? { ...data as Record<string, unknown> } : {};
}

export function applyHomepageWidgetPatch(config: Record<string, unknown>, type: string, patch: Record<string, unknown>, options: { advancedEnabled?: boolean } = {}): Record<string, unknown> {
  const normalized = validateAndNormalizeHomepageWidgetPatch(type, patch, options);
  const data = { ...readHomepageWidgetData(config), ...normalized };
  return { ...config, data: Array.isArray(config.data) || ARRAY_DATA_TYPES.has(type) ? [data] : data };
}

export function createHomepageWidgetConfig(type: string, instanceId: string, initialConfig: Record<string, unknown> = {}, options: { advancedEnabled?: boolean; surface?: "desktop-homepage" | "mobile-homepage" } = {}): Record<string, unknown> {
  const descriptor = getHomepageAgentWidgetDescriptor(type);
  if (!descriptor) throw new Error(`不支持的组件类型：${type}`);
  const normalizedInitial = Object.keys(initialConfig).length > 0
    ? validateAndNormalizeHomepageWidgetPatch(type, initialConfig, options)
    : {};
  const data = { ...(DEFAULT_DATA[type] ?? {}), ...normalizedInitial };
  return {
    ...(options.surface === "mobile-homepage" ? { activeTab: getMobileWidgetActiveTab(type) } : {}),
    type,
    instanceId,
    data: ARRAY_DATA_TYPES.has(type) ? [data] : data,
  };
}
