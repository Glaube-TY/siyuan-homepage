<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import { checkExistingMusicPlayer } from "./widget/musicPlayer/musicPlayerInstanceGuard";
  import { lsNotebooks } from "@/api";
  import FavoritesSet from "./widget/favorites/favoritesSet.svelte";
  import FocusSet from "./widget/focus/focusSet.svelte";

  import ConstellationSet from "./widget/constellation/constellationSet.svelte";
  import ChildDocsSet from "./widget/childDocs/childDocsSet.svelte";
  import CountdownSet from "./widget/countdown/countdownSet.svelte";
  import CustomTextSet from "./widget/customText/customTextSet.svelte";
  import DailyQuoteSet from "./widget/dailyQuote/dailyQuoteSet.svelte";
  import HeatmapSet from "./widget/heatmap/heatmapSet.svelte";
  import HistoryDaysSet from "./widget/historyDays/historyDaysSet.svelte";
  import HOTSet from "./widget/HOT/HOTSet.svelte";
  import LatestDailyNotesSet from "./widget/latestDailyNotes/latestDailyNotesSet.svelte";
  import LatestDocsSet from "./widget/latestDocs/latestDocsSet.svelte";
  import MusicPlayerSet from "./widget/musicPlayer/musicPlayerSet.svelte";
  import NewsSet from "./widget/News/NewsSet.svelte";
  import ProtyleSet from "./widget/protyle/protyleSet.svelte";
  import QuickNotesSet from "./widget/quickNotes/quickNotesSet.svelte";
  import SqlSet from "./widget/sql/sqlSet.svelte";
  import StatisticalCardSet from "./widget/statisticalCard/statisticalCardSet.svelte";
  import StikynotSet from "./widget/stikynot/stikynotSet.svelte";
  import TimedateSet from "./widget/timedate/timedateSet.svelte";
  import VisualChartSet from "./widget/visualChart/visualChartSet.svelte";
  import WeatherSet from "./widget/weather/weatherSet.svelte";
  import WebviewSet from "./widget/webview/webviewSet.svelte";
  import TasksPlusSet from "./widget/tasksPlus/tasksPlusSet.svelte";
  import RecentTasksSet from "./widget/tasks/recentTasksSet.svelte";
  import AlmanacSet from "./widget/almanac/almanacSet.svelte";
  import PicCaroSet from "./widget/PicCaro/PicCaroSet.svelte";
  import CYBMOKSet from "./widget/CYBMOK/CYBMOKSet.svelte";
  import CountdownTimerSet from "./widget/countdownTimer/countdownTimerSet.svelte";
  import ConditionDocsSet from "./widget/conditionDocs/conditionDocsSet.svelte";
  import FixedAssetsSet from "./widget/fixedAssets/fixedAssetsSet.svelte";
  import ReviewDocsSet from "./widget/reviewDocs/reviewDocsSet.svelte";
  import EnhancedDiarySet from "./widget/enhancedDiary/enhancedDiarySet.svelte";
  import AccountingSet from "./widget/accounting/accountingSet.svelte";
  import SiyuanIcon from "@/components/utils/shared/SiyuanIcon.svelte";
  import {
    DEFAULT_ENHANCED_DIARY_CONFIG,
    type EnhancedDiaryConfig,
  } from "./widget/enhancedDiary/enhancedDiaryTypes";
  import {
    type CountdownWidgetDisplaySystem,
    type CountdownWidgetViewConfig,
  } from "./widget/countdown/countdownData";
  import { normalizeCountdownWidgetView } from "./widget/countdown/countdownCenterSettings";
  import {
    loadHomepageSettingConfig,
    normalizeNotebookOptions,
  } from "@/homepage/homepageSetting/config";
  import {
    clampRecentDocsLimit,
    normalizeRecentDocsSortBy,
    type RecentDocsSortBy,
  } from "@/components/tools/siyuanComponentDataApi";
  import type { NotebookOption } from "./widget/common/componentMigrationTypes";
  // import DatabaseChartSet from "./widget/databaseChart/databaseChartSet.svelte";

  interface Props {
    // 弹窗接收的 props
    plugin: any;
    onClose: () => void;
    onConfirm: (contentTypeJson: string) => void;
    // 当前区块 ID
    currentBlockId?: string;
    // 移动端添加组件时用于预选组件类型，不改变保存结构
    initialContentType?: string;
    initialActiveTab?: string;
    forceInitialContentType?: boolean;
  }

  let {
    plugin,
    onClose,
    onConfirm,
    currentBlockId = "",
    initialContentType = "",
    initialActiveTab = "",
    forceInitialContentType = false,
  }: Props = $props();

  let loadedWidgetConfig: Record<string, any> | null = $state(null);

  let activeTab = $state("note");

  let notebooks = $state([]);

  // 下拉选项绑定值
  let selectedContentType: string = $state("latest-docs");
  let customTextInputValue: string = $state("");

  // 子文档配置
  let childDocsTitle: string = $state("📄子文档");
  let childDocsPrefix: string = $state("📄");
  let childDocsUseBuiltinDocIcon: boolean = $state(false);
  let showChildDocsDetails: boolean = $state(true);
  let childDocsParentId: string = $state("");
  let childDocsSortOrder: string = $state("updated");
  let showChildDocsFloatDoc: boolean = $state(true);
  let childDocsFloatDocShowTime: number = $state(0.1);

  // 条件文档配置
  let conditionDocsTitle: string = $state("📄条件文档");
  let conditionDocsCondition: string = $state("keyword");
  let conditionDocsKeyPosition: string = $state("anywhere");
  let conditionDocsKeyWord: string = $state("");
  let conditionDocsSortOrder: string = $state("updated");
  let conditionDocsUseBuiltinDocIcon: boolean = $state(false);
  let showConditionDocsFloatDoc: boolean = $state(true);
  let conditionDocsFloatDocShowTime: number = $state(0.1);
  let conditionDocsTag: string = $state("");

  // 最近文档配置
  let docLimit: number = $state(5);
  let ensureOpenDocs: boolean = $state(false);
  let selectedNotebookIds: { label: string; value: string }[] = $state([]);
  let docNotebookId: string = $state("");
  let latestDocsSortBy: RecentDocsSortBy = $state("updated");
  let latestDocsTitle: string = $state("🕒最近文档");
  let latestDocsPrefix: string = $state("📄");
  let latestDocsUseBuiltinDocIcon: boolean = $state(false);
  let showLatestDocDetails: boolean = $state(true);
  let showLatestDocFloatDoc: boolean = $state(true);
  let latestDocsFloatDocShowTime: number = $state(0.1);

  // 最近日记配置
  let docJournalLimit: number = $state(5);
  let recentJournalsShowType: string = $state("list");
  let recentJournalsCalendarIcon: string = $state("📝");
  let recentJournalsCalendarIconSize: number = $state(16);
  let latestDailyNotesUseBuiltinDocIcon: boolean = $state(false);
  let showLatestDailyNotesFloatDoc: boolean = $state(true);
  let latestDailyNotesFloatDocShowTime: number = $state(0.1);

  // 收藏文档配置
  let favoritiesTitle: string = $state("💖收藏文档");
  let favoritiesSortOrder: string = $state("created");
  let showNoteMeta: boolean = $state(true);
  let favoritiesDocPrefix: string = $state("❤");
  let favoritesUseBuiltinDocIcon: boolean = $state(false);
  let favoritesNotebookId: string = $state(""); // 指定收藏文档所在笔记本 ID
  let selectedFavoritesNotebookIds: { label: string; value: string }[] = $state(
    [],
  );
  let showFavFloatDoc: boolean = $state(true);
  let favFloatDocShowTime: number = $state(0.1);

  // 任务管理相关变量
  let showCompletedTasks = $state(true); // 默认显示已完成任务
  let tasksNotebookId: string = $state(""); // 任务管理笔记本 ID
  let showTasksDetails = $state(true); // 默认显示任务详情
  let TaskManTitle: string = $state("📋任务管理");
  let selectedTasksNotebookIds: { label: string; value: string }[] = $state([]);

  // 任务管理Plus 相关变量
  let TaskManPlusTitle: string = $state("📋任务管理Plus");
  let isCustomFilter: boolean = $state(false);
  let internalFilter: string = $state("all");
  let customFilter: string = $state("");
  let tasksSort: string = $state("startdate");
  let tasksPlusSelectedNotebookIds: NotebookOption[] = $state([]);

  // 快速笔记相关变量
  let quickNotesTitle: string = $state("快速笔记");
  let quickNotesSort: string = $state("DOC_ASC");

  // 便签相关变量
  let stikynotStyle: string = $state("default");

  // 倒数日相关变量
  let countdownStyle = $state("list1");
  let countdownDisplaySystem = $state<CountdownWidgetDisplaySystem>("center");
  let countdownView = $state<CountdownWidgetViewConfig>(
    normalizeCountdownWidgetView(undefined),
  );
  let countdownCard1BgSelect = $state("remote");
  let countdownCard1RemoteBg = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664",
  );
  let countdownCard1LocalBg = $state("");
  let countdownCard2BgColor: string = $state("#000000");
  let countdownList2BgColor: string = $state("#000000");

  // 天气相关变量
  let customWeatherCityName: string = $state("");
  let customWeatherCityCode: string = $state("");
  let weatherStyle: string = $state("default");

  // 热搜相关变量
  let hotSource: string = $state("bilibili");

  // 每日一言相关变量
  let dailyQuoteMode: string = $state("custom");
  let customDailyQuoteContent: string = $state("");
  let dailyQuoteSource: string = $state("classic");
  let dailyQuoteFontSize: number = $state(1);
  let dailyQuoteBgSelect = $state("remote");
  let dailyQuoteRemoteBg = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/17169460970507648",
  );
  let dailyQuoteLocalBg = $state("");

  // 新闻资讯相关变量
  let NewsType: string = $state("daily-news-bulletin");

  // 星座运势相关变量
  let selectedConstellation: string = $state("摩羯");

  // 历史上的今天相关变量
  let historyDaysType: string = $state("list");

  // 热力图相关
  let timeRangeType: "past" | "custom" = "past";
  let heatmapTitle: string = $state("创作热力图");
  let pastMonthCount: number = $state(6);
  let showLabel: boolean = $state(true);
  let selectedColorPreset: "github" | "blue" | "custom" = $state("github");
  let customColor: string = $state("#1ea769");
  let heatmapCountType: string = $state("block");

  // 自定义网页链接
  let customWebUrl: string = $state("");

  // 自定义显示块ID
  let isRandomDoc: boolean = $state(false);
  let customBlockID: string = $state("");

  let enhancedDiaryDraftConfig = $state<EnhancedDiaryConfig>({
    ...DEFAULT_ENHANCED_DIARY_CONFIG,
    templates: { ...DEFAULT_ENHANCED_DIARY_CONFIG.templates },
  });

  // 时钟组件相关变量
  let timeType: string = $state("classic");
  // 时钟组件经典样式相关变量
  let timedateFontSize: number = $state(3);
  let showSeconds: boolean = $state(true);
  let dateFormat: string = $state("YYYY年MM月DD日");
  let showLunar: boolean = $state(true);
  let showZodiac: boolean = $state(true);
  let showSolarTerm: boolean = $state(true);
  let showWeek: boolean = $state(true);
  let showDate: boolean = $state(true);
  let morningBgUrl = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/16637944029171072",
  );
  let afternoonBgUrl = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/16989237330693504",
  );
  let nightBgUrl = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/15477811848581440",
  );
  let morningBgImage = $state(null);
  let afternoonBgImage = $state(null);
  let nightBgImage = $state(null);
  let morningImageType = $state("remote");
  let afternoonImageType = $state("remote");
  let nightImageType = $state("remote");
  // 简单时钟配置
  let simple1Size: number = $state(3);
  let simple1FontWeight: number = $state(4);
  let simple1ShowSecond: boolean = $state(true);
  let simple1ShowDate: boolean = $state(true);
  // 简单时钟2配置
  let simple2BgSelect: string = $state("remote");
  let simple2RemoteBg: string = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/17882739641666944",
  );
  let simple2LocalBg: string = $state("");
  // 表盘时钟配置
  let dial1ShowSecond: boolean = $state(true);
  let dial1ShowMarkers: boolean = $state(true);
  let dial1ShowDate: boolean = $state(true);
  // 表盘2配置
  let dial2ShowSecond: boolean = $state(true);
  let dial2ShowMarkers: boolean = $state(true);
  let dial2ShowDate: boolean = $state(true);
  // 表盘3配置
  let dial3ShowSecond: boolean = $state(true);
  // 表盘4配置
  let dial4ShowSecond: boolean = $state(true);
  // 表盘5配置
  let dial5ShowSecond: boolean = $state(true);
  // 表盘6配置
  let dial6ShowSecond: boolean = $state(true);
  // 表盘7配置
  let dial7ShowSecond: boolean = $state(true);
  // 表盘8配置
  let dial8ShowSecond: boolean = $state(true);
  // 表盘9配置
  let dial9ShowSecond: boolean = $state(true);

  // 专注设置
  let focusImageType = $state("remote");
  let breakImageType = $state("remote");
  let focusBgImage = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464",
  );
  let breakBgImage = $state(
    "https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d",
  );
  let focusLocalImage = $state(null);
  let breakLocalImage = $state(null);

  // SQL 查询
  let sqlTitle: string = $state("SQL 查询结果");
  let sqlInput: string = $state("");
  let columnOrder: string = $state("");
  let hiddenFields: string = $state("");

  // 可视化图表相关
  let visualChartType: string = $state("progressBar");

  // 数据库图表相关
  let databaseChartID: string = $state("");
  let databaseChartType: string = $state("line");
  let databaseChartTitle: string = $state("");
  let databaseChartLineType: string = $state("XY");
  let databaseChartLineXAxisSource: string = $state("");
  let databaseChartLineXAxisTitle: string = $state("");
  let databaseChartLineYAxisSource: string[] = $state([]);
  let databaseChartLineYAxisTitle: string = $state("");
  let databaseChartLineCountColumn: string = $state("");
  let databaseChartLineCountXAxisTitle: string = $state("");
  let databaseChartLineCountYAxisTitle: string = $state("");
  let databaseChartLineSmooth: boolean = $state(false);
  let databaseChartLineCountSort: string = $state("none");
  let databaseChartLineMarkPoint: string = $state("circle");
  let databaseChartLineMarkPointSize: number = $state(8);
  let databaseChartLineStyle: string = $state("solid");
  let databaseChartLineWidth: number = $state(2);

  // 统计卡片相关
  let statisticalCardTitle: string = $state("统计卡片");
  let statisticalCardTitleSize: number = $state(1);
  let statisticalCardTitleColor: string = $state("#000000");
  let statisticalCardContent: string = $state("notebooksCount");
  let statisticalCardCountSize: number = $state(2);
  let statisticalCardCountColor: string = $state("#000000");
  let customSQLCount: string = $state("");

  // 音乐播放器相关
  let musicFolderPath = $state("");
  let autoPlay = $state(false);
  let musicShowLyrics = $state(true);
  let musicShowCover = $state(true);
  let musicScanSubfolders = $state(false);
  let musicParseMetadata = $state(true);
  let musicShowFloatingMini = $state(false);

  //  黄历相关
  let almanacStyle: string = $state("classic");

  // 图片轮播相关
  let PicFolderPath: string = $state(""); // 图片文件夹路径
  let PicAutoPlay: boolean = $state(false); // 是否自动播放
  let PicInterval: number = $state(3); // 切换间隔（秒）
  let PicNavigation: boolean = $state(false); // 是否显示导航按钮
  let PicPagination: boolean = $state(false); // 是否显示分页按钮
  let PicPaginationType: string = $state("bullets"); // 分页按钮类型
  let PicPaginationDyBu: boolean = $state(false); // 动态分页圆点
  let PicPaginationPrOp: boolean = $state(false); // 分页进度条是否反方向
  let PicEffect: string = $state("slide"); // 切换效果
  let PicSlidesPerView: string = $state("1"); // 每页显示的图片数量
  let PicRandomSwitch: boolean = $state(false); // 是否随机切换

  // 赛博木鱼配置
  let CMKnockSound: string = $state("普通");

  // 倒计时定时器样式
  let countdownTimerStyle: string = $state("default");

  // 固定资产配置
  let fixedAssetsTitle: string = $state("固定资产");
  let fixedAssetsListLimit: number = $state(6);
  let fixedAssetsSortBy: string = $state("updated");
  let fixedAssetsShowHourly: boolean = $state(true);
  let fixedAssetsShowMonthly: boolean = $state(true);
  let fixedAssetsShowWeekly: boolean = $state(false);
  let fixedAssetsShowQuarterly: boolean = $state(false);
  let fixedAssetsShowYearly: boolean = $state(false);
  let fixedAssetsItemCostPeriod: string = $state("day");

  // 记账配置（仅展示配置，系统设置保存在 accounting/accounting-settings.json）
  let accountingTitle: string = $state("记账");
  let accountingHomeRecentLimit: number = $state(5);
  let accountingShowBudget: boolean = $state(true);
  let accountingShowRecentRecords: boolean = $state(true);

  // 复习文档配置
  let reviewDocsTitle: string = $state("📚复习文档");
  let reviewDocsLimit: number = $state(20);
  let reviewDocsDefaultView: string = $state("due");
  let reviewDocsShowFuture: boolean = $state(true);
  let reviewDocsFutureDays: number = $state(7);
  let reviewDocsShowDocs: boolean = $state(true);
  let reviewDocsShowBlocks: boolean = $state(true);
  let reviewDocsShowNote: boolean = $state(true);
  let reviewDocsShowPath: boolean = $state(true);
  let reviewDocsShowStats: boolean = $state(true);
  let reviewDocsSortBy: string = $state("dueAsc");
  let reviewDocsShowFloatDoc: boolean = $state(true);
  let reviewDocsFloatDocShowTime: number = $state(0.1);
  let reviewDocsDefaultIntervals: string = $state("0,1,2,4,7,15,30,60");
  let reviewDocsSelectedNotebookIds: NotebookOption[] = $state([]);

  let advancedEnabled = $state(false);
  let focusExistingData: Record<string, unknown> = {};

  function resolveActiveTabForContentType(contentType: string): string {
    if (
      [
        "latest-docs",
        "favorites",
        "recent-journals",
        "TaskMan",
        "TaskManPlus",
        "quick-notes",
        "childDocs",
        "conditionDocs",
        "reviewDocs",
        "stikynot",
        "enhancedDiary",
      ].includes(contentType)
    ) {
      return "note";
    }
    if (
      ["HOT", "dailyQuote", "News", "constellation", "historyDays"].includes(
        contentType,
      )
    ) {
      return "info";
    }
    if (
      [
        "heatmap",
        "sql",
        "visualChart",
        "databaseChart",
        "statisticalCard",
      ].includes(contentType)
    ) {
      return "visualization";
    }
    if (
      [
        "focus",
        "countdown",
        "weather",
        "timedate",
        "musicPlayer",
        "almanac",
        "PicCaro",
        "CYBMOK",
        "countdownTimer",
        "fixedAssets",
        "accounting",
      ].includes(contentType)
    ) {
      return "tool";
    }
    if (["custom-protyle", "custom-text", "custom-web"].includes(contentType)) {
      return "custom";
    }
    return "note";
  }

  onMount(async () => {
    const settingData = await plugin.loadData(`widget-${currentBlockId}.json`);

    const result = await lsNotebooks();
    notebooks = result.notebooks;

    // 加载全局配置（迁移状态等）
    const homepageConfig = await loadHomepageSettingConfig(plugin);
    if (homepageConfig) {
    }

    if (settingData && !forceInitialContentType) {
      let parsedData: any;

      if (typeof settingData === "string") {
        try {
          parsedData = JSON.parse(settingData);
        } catch {
          showMessage("组件配置解析失败，请检查该组件配置数据");
          return;
        }
      } else {
        parsedData = settingData;
      }

      selectedContentType = parsedData.type || "latest-docs";
      activeTab = parsedData.activeTab || "note";
      loadedWidgetConfig = parsedData;

      if (parsedData.type === "latest-docs") {
        docLimit = clampRecentDocsLimit(parsedData.data?.[0]?.limit, 5);
        ensureOpenDocs = parsedData.data?.[0]?.ensureOpenDocs || false;
        latestDocsSortBy = normalizeRecentDocsSortBy(
          parsedData.data?.[0]?.latestDocsSortBy,
          ensureOpenDocs ? "openAt" : "updated",
        );
        docNotebookId = parsedData.data?.[0]?.docNotebookId || "";
        selectedNotebookIds = docNotebookId
          ? docNotebookId.split(",").map((id) => {
              // 根据ID在notebooks数组中查找对应的笔记本名称
              const notebook = notebooks.find((notebook) => notebook.id === id);
              return {
                label: notebook ? notebook.name : id, // 如果找不到匹配的笔记本，使用ID作为标签
                value: id,
              };
            })
          : [];
        latestDocsTitle = parsedData.data?.[0]?.latestDocsTitle || "🕒最近文档";
        latestDocsPrefix = parsedData.data?.[0]?.latestDocsPrefix || "📄";
        showLatestDocDetails =
          parsedData.data?.[0]?.showLatestDocDetails ?? true;
        showLatestDocFloatDoc =
          parsedData.data?.[0]?.showLatestDocFloatDoc ?? true;
        latestDocsFloatDocShowTime =
          parsedData.data?.[0]?.latestDocsFloatDocShowTime || 0.1;
        latestDocsUseBuiltinDocIcon =
          parsedData.data?.[0]?.useBuiltinDocIcon ?? false;
      } else if (parsedData.type === "favorites") {
        favoritiesTitle = parsedData.data?.favoritiesTitle || "💖收藏文档";
        favoritiesSortOrder = parsedData.data?.favoritiesSortOrder || "created";
        showNoteMeta = parsedData.data?.showNoteMeta ?? true;
        favoritiesDocPrefix =
          parsedData.data?.favoritiesDocPrefix || favoritiesDocPrefix;
        favoritesNotebookId = parsedData.data?.favoritesNotebookId || "";
        selectedFavoritesNotebookIds = favoritesNotebookId
          ? favoritesNotebookId.split(",").map((id) => {
              // 根据ID在notebooks数组中查找对应的笔记本名称
              const notebook = notebooks.find((notebook) => notebook.id === id);
              return {
                label: notebook ? notebook.name : id, // 如果找不到匹配的笔记本，使用ID作为标签
                value: id,
              };
            })
          : [];
        showFavFloatDoc = parsedData.data?.showFavFloatDoc ?? true;
        favFloatDocShowTime = parsedData.data?.favFloatDocShowTime || 0.1;
        favoritesUseBuiltinDocIcon =
          parsedData.data?.useBuiltinDocIcon ?? false;
      } else if (parsedData.type === "heatmap") {
        heatmapTitle = parsedData.data?.heatmapTitle || "";
        pastMonthCount = parsedData.data?.pastMonthCount || 6;
        showLabel = parsedData.data?.showLabel ?? true;
        selectedColorPreset = parsedData.data?.selectedColorPreset || "github";
        customColor = parsedData.data?.customColor || "#1ea769";
        heatmapCountType = parsedData.data?.heatmapCountType || "block";
      } else if (parsedData.type === "recent-journals") {
        docJournalLimit = parsedData.data?.limit || 5;
        recentJournalsShowType =
          parsedData.data?.recentJournalsShowType || "list";
        recentJournalsCalendarIcon =
          parsedData.data?.recentJournalsCalendarIcon || "📝";
        recentJournalsCalendarIconSize =
          parsedData.data?.recentJournalsCalendarIconSize || 16;
        showLatestDailyNotesFloatDoc =
          parsedData.data?.showLatestDailyNotesFloatDoc ?? true;
        latestDailyNotesFloatDocShowTime =
          parsedData.data?.latestDailyNotesFloatDocShowTime || 0.1;
        latestDailyNotesUseBuiltinDocIcon =
          parsedData.data?.useBuiltinDocIcon ?? false;
      } else if (parsedData.type === "countdown") {
        countdownStyle = parsedData.data?.countdownStyle || "list1";
        countdownDisplaySystem =
          parsedData.data?.countdownDisplaySystem === "classic" ||
          parsedData.data?.countdownDisplaySystem === "center"
            ? parsedData.data.countdownDisplaySystem
            : parsedData.data?.countdownView
              ? "center"
              : "classic";
        countdownView = normalizeCountdownWidgetView(
          parsedData.data?.countdownView,
          countdownStyle,
        );
        countdownCard1BgSelect =
          parsedData.data?.countdownCard1BgSelect || "remote";
        countdownCard1RemoteBg = parsedData.data?.countdownCard1RemoteBg || "";
        countdownCard1LocalBg = parsedData.data?.countdownCard1LocalBg || "";
        countdownCard2BgColor =
          parsedData.data?.countdownCard2BgColor || "#000000";
        countdownList2BgColor =
          parsedData.data?.countdownList2BgColor || "#000000";
      } else if (parsedData.type === "weather") {
        customWeatherCityName = parsedData.data?.cityName || "";
        customWeatherCityCode = parsedData.data?.cityCode || "";
        weatherStyle = parsedData.data?.weatherStyle || "default";
      } else if (parsedData.type === "HOT") {
        hotSource = parsedData.data?.source || "bilibili";
      } else if (parsedData.type === "custom-text") {
        customTextInputValue = parsedData.data?.[0]?.customText || "";
      } else if (parsedData.type === "custom-web") {
        customWebUrl = parsedData.data?.[0]?.url || "";
      } else if (parsedData.type === "custom-protyle") {
        isRandomDoc = parsedData.data?.[0]?.isRandomDoc || false;
        customBlockID = parsedData.data?.[0]?.customBlockId || "";
      } else if (parsedData.type === "timedate") {
        // 时钟组件相关变量
        timeType = parsedData.data?.timeType || "classic";
        // 时钟组件经典样式相关变量
        showSeconds = parsedData.data?.showSeconds ?? true;
        dateFormat = parsedData.data?.dateFormat ?? "YYYY年MM月DD日";
        showLunar = parsedData.data?.showLunar ?? true;
        showZodiac = parsedData.data?.showZodiac ?? true;
        showSolarTerm = parsedData.data?.showSolarTerm ?? true;
        showWeek = parsedData.data?.showWeek ?? true;
        showDate = parsedData.data?.showDate ?? true;

        morningImageType = parsedData.data?.morningImageType ?? "remote";
        afternoonImageType = parsedData.data?.afternoonImageType ?? "remote";
        nightImageType = parsedData.data?.nightImageType ?? "remote";

        // 初始化远程 URL
        morningBgUrl = parsedData.data?.morningBgUrl || "";
        afternoonBgUrl = parsedData.data?.afternoonBgUrl || "";
        nightBgUrl = parsedData.data?.nightBgUrl || "";

        // 初始化 Base64 数据
        morningBgImage = parsedData.data?.morningBgImage || "";
        afternoonBgImage = parsedData.data?.afternoonBgImage || "";
        nightBgImage = parsedData.data?.nightBgImage || "";

        timedateFontSize =
          parsedData.data?.timedateFontSize || timedateFontSize;

        // 简单时钟配置
        simple1Size = parsedData.data?.simple1Size || 3;
        simple1FontWeight = parsedData.data?.simple1FontWeight || 4;
        simple1ShowSecond = parsedData.data?.simple1ShowSecond ?? true;
        simple1ShowDate = parsedData.data?.simple1ShowDate ?? true;
        // 简单时钟2配置
        simple2BgSelect = parsedData.data?.simple2BgSelect || "remote";
        simple2RemoteBg = parsedData.data?.simple2RemoteBg || "";
        simple2LocalBg = parsedData.data?.simple2LocalBg || "";
        // 表盘时钟配置
        dial1ShowSecond = parsedData.data?.dial1ShowSecond ?? true;
        dial1ShowMarkers = parsedData.data?.dial1ShowMarkers ?? true;
        dial1ShowDate = parsedData.data?.dial1ShowDate ?? true;
        // 表盘2配置
        dial2ShowSecond = parsedData.data?.dial2ShowSecond ?? true;
        dial2ShowMarkers = parsedData.data?.dial2ShowMarkers ?? true;
        dial2ShowDate = parsedData.data?.dial2ShowDate ?? true;
        // 表盘3配置
        dial3ShowSecond = parsedData.data?.dial3ShowSecond ?? true;
        // 表盘4配置
        dial4ShowSecond = parsedData.data?.dial4ShowSecond ?? true;
        // 表盘5配置
        dial5ShowSecond = parsedData.data?.dial5ShowSecond ?? true;
        // 表盘6配置
        dial6ShowSecond = parsedData.data?.dial6ShowSecond ?? true;
        // 表盘7配置
        dial7ShowSecond = parsedData.data?.dial7ShowSecond ?? true;
        // 表盘8配置
        dial8ShowSecond = parsedData.data?.dial8ShowSecond ?? true;
        // 表盘9配置
        dial9ShowSecond = parsedData.data?.dial9ShowSecond ?? true;
      } else if (parsedData.type === "TaskMan") {
        showCompletedTasks = parsedData.data?.showCompletedTasks ?? true;
        tasksNotebookId = parsedData.data?.tasksNotebookId || "";
        selectedTasksNotebookIds = tasksNotebookId
          ? tasksNotebookId.split(",").map((id) => {
              // 根据ID在notebooks数组中查找对应的笔记本名称
              const notebook = notebooks.find((notebook) => notebook.id === id);
              return {
                label: notebook ? notebook.name : id, // 如果找不到匹配的笔记本，使用ID作为标签
                value: id,
              };
            })
          : [];
        showTasksDetails = parsedData.data?.showTasksDetails ?? true;
        TaskManTitle = parsedData.data?.TaskManTitle || "📋任务管理";
      } else if (parsedData.type === "focus") {
        // 旧 showSyNotif 已停止使用，但仍作为未知历史字段随组件配置原样保留。
        focusExistingData =
          parsedData.data && typeof parsedData.data === "object"
            ? structuredClone(parsedData.data)
            : {};
        focusImageType = parsedData.data?.focusImageType || "remote";
        breakImageType = parsedData.data?.breakImageType || "remote";

        focusBgImage = parsedData.data?.focusBgImage || focusBgImage;
        breakBgImage = parsedData.data?.breakBgImage || breakBgImage;

        focusLocalImage = parsedData.data?.focusLocalImage || focusLocalImage;
        breakLocalImage = parsedData.data?.breakLocalImage || breakLocalImage;
      } else if (parsedData.type === "sql") {
        sqlTitle = parsedData.data?.sqlTitle || sqlTitle;
        sqlInput = parsedData.data?.sqlInput || "";
        columnOrder = parsedData.data?.columnOrder || "";
        hiddenFields = parsedData.data?.hiddenFields || "";
      } else if (parsedData.type === "TaskManPlus") {
        TaskManPlusTitle =
          parsedData.data?.TaskManPlusTitle || TaskManPlusTitle;
        isCustomFilter = parsedData.data?.isCustomFilter || isCustomFilter;
        internalFilter = parsedData.data?.internalFilter || internalFilter;
        customFilter = parsedData.data?.customFilter || customFilter;
        tasksSort = parsedData.data?.tasksSort || tasksSort;
        tasksPlusSelectedNotebookIds = normalizeNotebookOptions(
          parsedData.data?.tasksPlusSelectedNotebookIds,
        );
      } else if (parsedData.type === "quick-notes") {
        quickNotesTitle = parsedData.data?.quickNotesTitle || quickNotesTitle;
        quickNotesSort = parsedData.data?.quickNotesSort || quickNotesSort;
      } else if (parsedData.type === "dailyQuote") {
        dailyQuoteMode = parsedData.data?.dailyQuoteMode || dailyQuoteMode;
        customDailyQuoteContent =
          parsedData.data?.customDailyQuoteContent || customDailyQuoteContent;
        dailyQuoteSource =
          parsedData.data?.dailyQuoteSource || dailyQuoteSource;
        dailyQuoteFontSize =
          parsedData.data?.dailyQuoteFontSize || dailyQuoteFontSize;
        dailyQuoteBgSelect =
          parsedData.data?.dailyQuoteBgSelect || dailyQuoteBgSelect;
        dailyQuoteRemoteBg =
          parsedData.data?.dailyQuoteRemoteBg || dailyQuoteRemoteBg;
        dailyQuoteLocalBg = parsedData.data?.dailyQuoteLocalBg || "";
      } else if (parsedData.type === "visualChart") {
        visualChartType = parsedData.data?.visualChartType || visualChartType;
      } else if (parsedData.type === "musicPlayer") {
        musicFolderPath = parsedData.data?.musicFolderPath || "";
        autoPlay = parsedData.data?.autoPlay || false;
        musicShowLyrics =
          parsedData.data?.showLyrics !== undefined
            ? !!parsedData.data.showLyrics
            : true;
        musicShowCover =
          parsedData.data?.showCover !== undefined
            ? !!parsedData.data.showCover
            : true;
        musicScanSubfolders = !!parsedData.data?.scanSubfolders;
        musicParseMetadata =
          parsedData.data?.parseMetadata !== undefined
            ? !!parsedData.data.parseMetadata
            : true;
        musicShowFloatingMini = !!parsedData.data?.showFloatingMini;
      } else if (parsedData.type === "almanac") {
        almanacStyle = parsedData.data?.almanacStyle || "";
      } else if (parsedData.type === "stikynot") {
        stikynotStyle = parsedData.data?.stikynotStyle || "";
      } else if (parsedData.type === "News") {
        NewsType = parsedData.data?.NewsType || NewsType;
      } else if (parsedData.type === "databaseChart") {
        databaseChartID = parsedData.data?.databaseChartID || databaseChartID;
        databaseChartType =
          parsedData.data?.databaseChartType || databaseChartType;
        databaseChartTitle =
          parsedData.data?.databaseChartTitle || databaseChartTitle;

        databaseChartLineType =
          parsedData.data?.databaseChartLineType || databaseChartLineType;

        databaseChartLineXAxisSource =
          parsedData.data?.databaseChartLineXAxisSource ||
          databaseChartLineXAxisSource;
        databaseChartLineXAxisTitle =
          parsedData.data?.databaseChartLineXAxisTitle ||
          databaseChartLineXAxisTitle;
        databaseChartLineYAxisSource =
          parsedData.data?.databaseChartLineYAxisSource ||
          databaseChartLineYAxisSource;
        databaseChartLineYAxisTitle =
          parsedData.data?.databaseChartLineYAxisTitle ||
          databaseChartLineYAxisTitle;

        databaseChartLineCountColumn =
          parsedData.data?.databaseChartLineCountColumn ||
          databaseChartLineCountColumn;
        databaseChartLineCountXAxisTitle =
          parsedData.data?.databaseChartLineCountXAxisTitle ||
          databaseChartLineCountXAxisTitle;
        databaseChartLineCountYAxisTitle =
          parsedData.data?.databaseChartLineCountYAxisTitle ||
          databaseChartLineCountYAxisTitle;

        databaseChartLineSmooth =
          parsedData.data?.databaseChartLineSmooth || databaseChartLineSmooth;
        databaseChartLineCountSort =
          parsedData.data?.databaseChartLineCountSort ||
          databaseChartLineCountSort;
        databaseChartLineMarkPoint =
          parsedData.data?.databaseChartLineMarkPoint ||
          databaseChartLineMarkPoint;
        databaseChartLineMarkPointSize =
          parsedData.data?.databaseChartLineMarkPointSize ||
          databaseChartLineMarkPointSize;
        databaseChartLineWidth =
          parsedData.data?.databaseChartLineWidth || databaseChartLineWidth;
        databaseChartLineStyle =
          parsedData.data?.databaseChartLineStyle || databaseChartLineStyle;
      } else if (parsedData.type === "childDocs") {
        childDocsTitle = parsedData.data?.childDocsTitle || childDocsTitle;
        childDocsPrefix = parsedData.data?.childDocsPrefix || childDocsPrefix;
        showChildDocsDetails =
          parsedData.data?.showChildDocsDetails ?? showChildDocsDetails;
        childDocsParentId =
          parsedData.data?.childDocsParentId || childDocsParentId;
        childDocsSortOrder =
          parsedData.data?.childDocsSortOrder || childDocsSortOrder;
        showChildDocsFloatDoc =
          parsedData.data?.showChildDocsFloatDoc ?? showChildDocsFloatDoc;
        childDocsFloatDocShowTime =
          parsedData.data?.childDocsFloatDocShowTime ||
          childDocsFloatDocShowTime;
        childDocsUseBuiltinDocIcon =
          parsedData.data?.useBuiltinDocIcon ?? false;
      } else if (parsedData.type === "constellation") {
        selectedConstellation =
          parsedData.data?.selectedConstellation || selectedConstellation;
      } else if (parsedData.type === "historyDays") {
        historyDaysType = parsedData.data?.historyDaysType || historyDaysType;
      } else if (parsedData.type === "statisticalCard") {
        statisticalCardTitle =
          parsedData.data?.statisticalCardTitle || statisticalCardTitle;
        statisticalCardTitleSize =
          parsedData.data?.statisticalCardTitleSize || statisticalCardTitleSize;
        statisticalCardTitleColor =
          parsedData.data?.statisticalCardTitleColor ||
          statisticalCardTitleColor;
        statisticalCardContent =
          parsedData.data?.statisticalCardContent || statisticalCardContent;
        statisticalCardCountSize =
          parsedData.data?.statisticalCardCountSize || statisticalCardCountSize;
        statisticalCardCountColor =
          parsedData.data?.statisticalCardCountColor ||
          statisticalCardCountColor;
        customSQLCount = parsedData.data?.customSQLCount || "";
      } else if (parsedData.type === "PicCaro") {
        PicFolderPath = parsedData.data?.PicFolderPath || "";
        PicAutoPlay = parsedData.data?.PicAutoPlay ?? false;
        PicInterval = parsedData.data?.PicInterval || 3;
        PicNavigation = parsedData.data?.PicNavigation ?? false;
        PicPagination = parsedData.data?.PicPagination ?? false;
        PicPaginationType = parsedData.data?.PicPaginationType || "bullets";
        PicPaginationDyBu = parsedData.data?.PicPaginationDyBu ?? false;
        PicPaginationPrOp = parsedData.data?.PicPaginationPrOp ?? false;
        PicEffect = parsedData.data?.PicEffect || "slide"; // 切换效果
        PicSlidesPerView = parsedData.data?.PicSlidesPerView || "1"; // 每页显示的图片数量
        PicRandomSwitch = parsedData.data?.PicRandomSwitch ?? false; // 是否随机切换
      } else if (parsedData.type === "CYBMOK") {
        CMKnockSound = parsedData.data?.CMKnockSound || "普通";
      } else if (parsedData.type === "countdownTimer") {
        countdownTimerStyle =
          parsedData.data?.countdownTimerStyle || countdownTimerStyle;
      } else if (parsedData.type === "fixedAssets") {
        fixedAssetsTitle =
          parsedData.data?.fixedAssetsTitle || fixedAssetsTitle;
        fixedAssetsListLimit =
          parsedData.data?.fixedAssetsListLimit || fixedAssetsListLimit;
        fixedAssetsSortBy =
          parsedData.data?.fixedAssetsSortBy || fixedAssetsSortBy;
        fixedAssetsShowHourly =
          parsedData.data?.fixedAssetsShowHourly ?? fixedAssetsShowHourly;
        fixedAssetsShowMonthly =
          parsedData.data?.fixedAssetsShowMonthly ?? fixedAssetsShowMonthly;
        fixedAssetsShowWeekly =
          parsedData.data?.fixedAssetsShowWeekly ?? fixedAssetsShowWeekly;
        fixedAssetsShowQuarterly =
          parsedData.data?.fixedAssetsShowQuarterly ?? fixedAssetsShowQuarterly;
        fixedAssetsShowYearly =
          parsedData.data?.fixedAssetsShowYearly ?? fixedAssetsShowYearly;
        fixedAssetsItemCostPeriod =
          parsedData.data?.fixedAssetsItemCostPeriod ||
          fixedAssetsItemCostPeriod;
      } else if (parsedData.type === "accounting") {
        accountingTitle =
          parsedData.data?.accountingTitle ||
          parsedData.data?.title ||
          accountingTitle;
        accountingHomeRecentLimit =
          parsedData.data?.accountingHomeRecentLimit ||
          parsedData.data?.homeRecentLimit ||
          accountingHomeRecentLimit;
        accountingShowBudget =
          parsedData.data?.accountingShowBudget ??
          parsedData.data?.showBudget ??
          accountingShowBudget;
        accountingShowRecentRecords =
          parsedData.data?.accountingShowRecentRecords ??
          parsedData.data?.showRecentRecords ??
          accountingShowRecentRecords;
      } else if (parsedData.type === "reviewDocs") {
        reviewDocsTitle = parsedData.data?.reviewDocsTitle || reviewDocsTitle;
        reviewDocsLimit = parsedData.data?.reviewDocsLimit || reviewDocsLimit;
        reviewDocsDefaultView =
          parsedData.data?.reviewDocsDefaultView || reviewDocsDefaultView;
        reviewDocsShowFuture =
          parsedData.data?.reviewDocsShowFuture ?? reviewDocsShowFuture;
        reviewDocsFutureDays =
          parsedData.data?.reviewDocsFutureDays || reviewDocsFutureDays;
        reviewDocsShowDocs =
          parsedData.data?.reviewDocsShowDocs ?? reviewDocsShowDocs;
        reviewDocsShowBlocks =
          parsedData.data?.reviewDocsShowBlocks ?? reviewDocsShowBlocks;
        reviewDocsShowNote =
          parsedData.data?.reviewDocsShowNote ?? reviewDocsShowNote;
        reviewDocsShowPath =
          parsedData.data?.reviewDocsShowPath ?? reviewDocsShowPath;
        reviewDocsShowStats =
          parsedData.data?.reviewDocsShowStats ?? reviewDocsShowStats;
        reviewDocsSortBy =
          parsedData.data?.reviewDocsSortBy || reviewDocsSortBy;
        reviewDocsShowFloatDoc =
          parsedData.data?.reviewDocsShowFloatDoc ?? reviewDocsShowFloatDoc;
        reviewDocsFloatDocShowTime =
          parsedData.data?.reviewDocsFloatDocShowTime ||
          reviewDocsFloatDocShowTime;
        reviewDocsDefaultIntervals =
          parsedData.data?.reviewDocsDefaultIntervals ||
          reviewDocsDefaultIntervals;
        reviewDocsSelectedNotebookIds = normalizeNotebookOptions(
          parsedData.data?.reviewDocsSelectedNotebookIds,
        );
      } else if (parsedData.type === "conditionDocs") {
        conditionDocsTitle =
          parsedData.data?.conditionDocsTitle || conditionDocsTitle;
        conditionDocsCondition =
          parsedData.data?.conditionDocsCondition || conditionDocsCondition;
        conditionDocsKeyPosition =
          parsedData.data?.conditionDocsKeyPosition || conditionDocsKeyPosition;
        conditionDocsKeyWord =
          parsedData.data?.conditionDocsKeyWord || conditionDocsKeyWord;
        conditionDocsSortOrder =
          parsedData.data?.conditionDocsSortOrder || conditionDocsSortOrder;
        showConditionDocsFloatDoc =
          parsedData.data?.showConditionDocsFloatDoc ??
          showConditionDocsFloatDoc;
        conditionDocsFloatDocShowTime =
          parsedData.data?.conditionDocsFloatDocShowTime ||
          conditionDocsFloatDocShowTime;
        conditionDocsTag =
          parsedData.data?.conditionDocsTag || conditionDocsTag;
        conditionDocsUseBuiltinDocIcon =
          parsedData.data?.useBuiltinDocIcon ?? false;
      }
    } else if (initialContentType) {
      selectedContentType = initialContentType;
      activeTab =
        initialActiveTab || resolveActiveTabForContentType(initialContentType);
    }

    advancedEnabled = plugin.ADVANCED;
  });
</script>

<div class="settings-container">
  <!-- 分类导航栏 -->
  <div class="tab-nav">
    <button
      onclick={() => (activeTab = "note")}
      class:active={activeTab === "note"}>笔记数据</button
    >
    <button
      onclick={() => (activeTab = "visualization")}
      class:active={activeTab === "visualization"}>可视化</button
    >
    <button
      onclick={() => (activeTab = "tool")}
      class:active={activeTab === "tool"}>日常工具</button
    >
    <button
      onclick={() => (activeTab = "info")}
      class:active={activeTab === "info"}>信息资讯</button
    >
    <button
      onclick={() => (activeTab = "custom")}
      class:active={activeTab === "custom"}>自定义</button
    >
  </div>

  <!-- 动态内容容器 -->
  <div class="tab-content">
    {#if activeTab === "note"}
      <!-- 笔记数据 -->
      <div class="content-type-select">
        <label for="content-type">选择组件：</label>
        <select id="content-type" bind:value={selectedContentType}>
          <option value="favorites">收藏文档</option>
          <option value="TaskMan">任务管理</option>
          <option value="TaskManPlus">任务管理Plus</option>
          <option value="latest-docs">最近文档</option>
          <option value="recent-journals">最近日记</option>
          <option value="quick-notes">快速笔记</option>
          <option value="childDocs">子文档</option>
          <option value="conditionDocs">条件文档</option>
          <option value="reviewDocs">复习文档👑</option>
          <option value="stikynot">便签👑</option>
          {#if advancedEnabled || selectedContentType === "enhancedDiary"}
            <option value="enhancedDiary" disabled={!advancedEnabled}
              >强化日记👑</option
            >
          {/if}
        </select>
      </div>
      <!-- 动态内容区域 -->
      <div class="dynamic-content-area">
        {#if selectedContentType === "latest-docs"}
          <LatestDocsSet
            bind:docLimit
            bind:selectedNotebookIds
            {docNotebookId}
            bind:latestDocsSortBy
            bind:latestDocsTitle
            bind:latestDocsPrefix
            bind:useBuiltinDocIcon={latestDocsUseBuiltinDocIcon}
            bind:showLatestDocDetails
            bind:showLatestDocFloatDoc
            bind:latestDocsFloatDocShowTime
            {notebooks}
          />
        {:else if selectedContentType === "favorites"}
          <FavoritesSet
            bind:favoritiesTitle
            bind:favoritiesSortOrder
            bind:showNoteMeta
            bind:favoritiesDocPrefix
            bind:useBuiltinDocIcon={favoritesUseBuiltinDocIcon}
            bind:favoritesNotebookId
            bind:selectedFavoritesNotebookIds
            bind:showFavFloatDoc
            bind:favFloatDocShowTime
            {notebooks}
          />
        {:else if selectedContentType === "recent-journals"}
          <LatestDailyNotesSet
            bind:docJournalLimit
            bind:recentJournalsShowType
            bind:recentJournalsCalendarIcon
            bind:recentJournalsCalendarIconSize
            bind:useBuiltinDocIcon={latestDailyNotesUseBuiltinDocIcon}
            bind:showLatestDailyNotesFloatDoc
            bind:latestDailyNotesFloatDocShowTime
          />
        {:else if selectedContentType === "TaskMan"}
          <RecentTasksSet
            bind:TaskManTitle
            bind:showCompletedTasks
            bind:showTasksDetails
            bind:selectedTasksNotebookIds
            {notebooks}
            docNotebookId={tasksNotebookId}
          />
        {:else if selectedContentType === "TaskManPlus"}
          <TasksPlusSet
            bind:TaskManPlusTitle
            bind:isCustomFilter
            bind:internalFilter
            bind:customFilter
            bind:tasksSort
            bind:tasksPlusSelectedNotebookIds
            {notebooks}
          />
        {:else if selectedContentType === "quick-notes"}
          <QuickNotesSet bind:quickNotesTitle bind:quickNotesSort />
        {:else if selectedContentType === "stikynot"}
          <StikynotSet {advancedEnabled} bind:stikynotStyle />
        {:else if selectedContentType === "childDocs"}
          <ChildDocsSet
            bind:childDocsTitle
            bind:childDocsPrefix
            bind:useBuiltinDocIcon={childDocsUseBuiltinDocIcon}
            bind:showChildDocsDetails
            bind:childDocsParentId
            bind:childDocsSortOrder
            bind:showChildDocsFloatDoc
            bind:childDocsFloatDocShowTime
          />
        {:else if selectedContentType === "conditionDocs"}
          <ConditionDocsSet
            bind:conditionDocsTitle
            bind:conditionDocsCondition
            bind:conditionDocsKeyPosition
            bind:conditionDocsKeyWord
            bind:conditionDocsSortOrder
            bind:useBuiltinDocIcon={conditionDocsUseBuiltinDocIcon}
            bind:showConditionDocsFloatDoc
            bind:conditionDocsFloatDocShowTime
            bind:conditionDocsTag
          />
        {:else if selectedContentType === "reviewDocs"}
          <ReviewDocsSet
            {advancedEnabled}
            bind:reviewDocsTitle
            bind:reviewDocsLimit
            bind:reviewDocsDefaultView
            bind:reviewDocsShowFuture
            bind:reviewDocsFutureDays
            bind:reviewDocsShowDocs
            bind:reviewDocsShowBlocks
            bind:reviewDocsShowNote
            bind:reviewDocsShowPath
            bind:reviewDocsShowStats
            bind:reviewDocsSortBy
            bind:reviewDocsShowFloatDoc
            bind:reviewDocsFloatDocShowTime
            bind:reviewDocsDefaultIntervals
            bind:reviewDocsSelectedNotebookIds
            {notebooks}
          />
        {:else if selectedContentType === "enhancedDiary"}
          <EnhancedDiarySet
            {plugin}
            bind:draftConfig={enhancedDiaryDraftConfig}
          />
        {/if}
      </div>
    {:else if activeTab === "info"}
      <!-- 信息资讯 -->
      <div class="content-type-select">
        <label for="content-type">选择组件：</label>
        <select id="content-type" bind:value={selectedContentType}>
          <option value="HOT">热搜</option>
          <option value="dailyQuote">每日一言</option>
          <option value="News">新闻资讯👑</option>
          <option value="constellation">星座运势👑</option>
          <option value="historyDays">历史上的今天👑</option>
        </select>
      </div>
      <!-- 动态内容区域 -->
      <div class="dynamic-content-area">
        {#if selectedContentType === "HOT"}
          <HOTSet bind:hotSource />
        {:else if selectedContentType === "dailyQuote"}
          <DailyQuoteSet
            {advancedEnabled}
            bind:dailyQuoteMode
            bind:dailyQuoteFontSize
            bind:dailyQuoteSource
            bind:customDailyQuoteContent
            bind:dailyQuoteBgSelect
            bind:dailyQuoteRemoteBg
            bind:dailyQuoteLocalBg
          />
        {:else if selectedContentType === "News"}
          <NewsSet {advancedEnabled} bind:NewsType />
        {:else if selectedContentType === "constellation"}
          <ConstellationSet {advancedEnabled} bind:selectedConstellation />
        {:else if selectedContentType === "historyDays"}
          <HistoryDaysSet {advancedEnabled} bind:historyDaysType />
        {/if}
      </div>
    {:else if activeTab === "visualization"}
      <!-- 可视化 -->
      <div class="content-type-select">
        <label for="content-type">选择组件：</label>
        <select id="content-type" bind:value={selectedContentType}>
          <option value="heatmap">热力图</option>
          <option value="sql">SQL 查询</option>
          <option value="visualChart">可视化图表</option>
          <!-- <option value="databaseChart">数据库图表👑</option> -->
          <option value="statisticalCard">统计卡片👑</option>
        </select>
      </div>
      <!-- 动态内容区域 -->
      <div class="dynamic-content-area">
        {#if selectedContentType === "heatmap"}
          <HeatmapSet
            {advancedEnabled}
            bind:heatmapTitle
            bind:pastMonthCount
            bind:showLabel
            bind:selectedColorPreset
            bind:customColor
            bind:heatmapCountType
          />
        {:else if selectedContentType === "sql"}
          <SqlSet
            bind:sqlTitle
            bind:sqlInput
            bind:columnOrder
            bind:hiddenFields
          />
        {:else if selectedContentType === "visualChart"}
          <VisualChartSet bind:visualChartType />
          <!-- {:else if selectedContentType === "databaseChart"}
                    <DatabaseChartSet
                        {plugin}
                        {advancedEnabled}
                        bind:databaseChartID
                        bind:databaseChartTitle
                        bind:databaseChartType
                        bind:databaseChartLineType
                        bind:databaseChartLineXAxisSource
                        bind:databaseChartLineXAxisTitle
                        bind:databaseChartLineYAxisSource
                        bind:databaseChartLineYAxisTitle
                        bind:databaseChartLineCountColumn
                        bind:databaseChartLineCountXAxisTitle
                        bind:databaseChartLineCountYAxisTitle
                        bind:databaseChartLineSmooth
                        bind:databaseChartLineWidth
                        bind:databaseChartLineStyle
                        bind:databaseChartLineMarkPoint
                        bind:databaseChartLineMarkPointSize
                        bind:databaseChartLineCountSort
                    /> -->
        {:else if selectedContentType === "statisticalCard"}
          <StatisticalCardSet
            {advancedEnabled}
            bind:statisticalCardTitle
            bind:statisticalCardTitleSize
            bind:statisticalCardTitleColor
            bind:statisticalCardContent
            bind:statisticalCardCountSize
            bind:statisticalCardCountColor
            bind:customSQLCount
          />
        {/if}
      </div>
    {:else if activeTab === "tool"}
      <!-- 日常工具 -->
      <div class="content-type-select">
        <label for="content-type">选择组件：</label>
        <select id="content-type" bind:value={selectedContentType}>
          <option value="focus">番茄钟</option>
          <option value="countdown">纪念日👑</option>
          <option value="weather">今日天气</option>
          <option value="timedate">时钟</option>
          <option value="musicPlayer">音乐播放器👑</option>
          <option value="almanac">黄历👑</option>
          <option value="PicCaro">图片轮播👑</option>
          <option value="CYBMOK">赛博木鱼👑</option>
          <option value="countdownTimer">倒计时👑</option>
          <option value="fixedAssets">固定资产👑</option>
          <option value="accounting">记账👑</option>
        </select>
      </div>
      <!-- 动态内容区域 -->
      <div class="dynamic-content-area">
        {#if selectedContentType === "countdown"}
          <CountdownSet
            {advancedEnabled}
            {plugin}
            bind:countdownStyle
            bind:countdownDisplaySystem
            bind:countdownView
            bind:countdownCard1BgSelect
            bind:countdownCard1RemoteBg
            bind:countdownCard1LocalBg
            bind:countdownCard2BgColor
            bind:countdownList2BgColor
          />
        {:else if selectedContentType === "weather"}
          <WeatherSet
            bind:customWeatherCityName
            bind:customWeatherCityCode
            bind:weatherStyle
          />
        {:else if selectedContentType === "timedate"}
          <TimedateSet
            {plugin}
            bind:timeType
            bind:showSeconds
            bind:dateFormat
            bind:showLunar
            bind:showZodiac
            bind:showSolarTerm
            bind:showWeek
            bind:showDate
            bind:timedateFontSize
            bind:morningImageType
            bind:afternoonImageType
            bind:nightImageType
            bind:morningBgUrl
            bind:afternoonBgUrl
            bind:nightBgUrl
            bind:morningBgImage
            bind:afternoonBgImage
            bind:nightBgImage
            bind:simple1Size
            bind:simple1FontWeight
            bind:simple1ShowSecond
            bind:simple1ShowDate
            bind:simple2BgSelect
            bind:simple2RemoteBg
            bind:simple2LocalBg
            bind:dial1ShowSecond
            bind:dial1ShowMarkers
            bind:dial1ShowDate
            bind:dial2ShowSecond
            bind:dial2ShowMarkers
            bind:dial2ShowDate
            bind:dial3ShowSecond
            bind:dial4ShowSecond
            bind:dial5ShowSecond
            bind:dial6ShowSecond
            bind:dial7ShowSecond
            bind:dial8ShowSecond
            bind:dial9ShowSecond
          />
        {:else if selectedContentType === "focus"}
          <FocusSet
            {advancedEnabled}
            bind:focusImageType
            bind:breakImageType
            bind:focusBgImage
            bind:breakBgImage
            bind:focusLocalImage
            bind:breakLocalImage
          />
        {:else if selectedContentType === "musicPlayer"}
          <MusicPlayerSet
            {plugin}
            {advancedEnabled}
            blockId={currentBlockId}
            bind:musicFolderPath
            bind:autoPlay
            bind:showLyrics={musicShowLyrics}
            bind:showCover={musicShowCover}
            bind:scanSubfolders={musicScanSubfolders}
            bind:parseMetadata={musicParseMetadata}
            bind:showFloatingMini={musicShowFloatingMini}
          />
        {:else if selectedContentType === "almanac"}
          <AlmanacSet {advancedEnabled} bind:almanacStyle />
        {:else if selectedContentType === "PicCaro"}
          <PicCaroSet
            {advancedEnabled}
            bind:PicFolderPath
            bind:PicAutoPlay
            bind:PicInterval
            bind:PicNavigation
            bind:PicPagination
            bind:PicPaginationType
            bind:PicPaginationDyBu
            bind:PicPaginationPrOp
            bind:PicEffect
            bind:PicSlidesPerView
            bind:PicRandomSwitch
          />
        {:else if selectedContentType === "CYBMOK"}
          <CYBMOKSet {advancedEnabled} bind:CMKnockSound />
        {:else if selectedContentType === "countdownTimer"}
          <CountdownTimerSet {advancedEnabled} bind:countdownTimerStyle />
        {:else if selectedContentType === "fixedAssets"}
          <FixedAssetsSet
            {advancedEnabled}
            bind:fixedAssetsTitle
            bind:fixedAssetsListLimit
            bind:fixedAssetsSortBy
            bind:fixedAssetsShowHourly
            bind:fixedAssetsShowMonthly
            bind:fixedAssetsShowWeekly
            bind:fixedAssetsShowQuarterly
            bind:fixedAssetsShowYearly
            bind:fixedAssetsItemCostPeriod
          />
        {:else if selectedContentType === "accounting"}
          <AccountingSet
            {advancedEnabled}
            bind:accountingTitle
            bind:accountingHomeRecentLimit
            bind:accountingShowBudget
            bind:accountingShowRecentRecords
          />
        {/if}
      </div>
    {:else if activeTab === "custom"}
      <!-- 自定义 -->
      <div class="content-type-select">
        <label for="content-type">选择组件：</label>
        <select id="content-type" bind:value={selectedContentType}>
          <option value="custom-protyle">文档编辑器</option>
          <option value="custom-text">文字内容</option>
          <option value="custom-web">网页浏览器</option>
        </select>
      </div>
      <!-- 动态内容区域 -->
      <div class="dynamic-content-area">
        {#if selectedContentType === "custom-text"}
          <CustomTextSet bind:customTextInputValue />
        {:else if selectedContentType === "custom-web"}
          <WebviewSet bind:customWebUrl />
        {:else if selectedContentType === "custom-protyle"}
          <ProtyleSet bind:isRandomDoc bind:customBlockID />
        {/if}
      </div>
    {/if}
  </div>

  <!-- 操作按钮 -->
  <div class="action-buttons-row">
    <button
      class="confirm-button"
      onclick={async () => {
        if (selectedContentType === "countdown" && !advancedEnabled) {
          showMessage(
            "纪念日组件为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用",
            4000,
          );
          return;
        }
        if (selectedContentType === "reviewDocs" && !advancedEnabled) {
          showMessage("复习文档为高级会员专属组件，请开通后再配置", 4000);
          return;
        }

        if (focusImageType === "remote") focusLocalImage = null;
        if (breakImageType === "remote") breakLocalImage = null;

        if (countdownCard1BgSelect === "remote") countdownCard1LocalBg = null;

        if (morningImageType === "remote") morningBgImage = null;
        if (afternoonImageType === "remote") afternoonBgImage = null;
        if (nightImageType === "remote") nightBgImage = null;

        let contentTypeJson = {};

        if (selectedContentType === "latest-docs") {
          docNotebookId = selectedNotebookIds
            .map((item) => item.value)
            .join(",");
          contentTypeJson = {
            activeTab: activeTab,
            type: "latest-docs",
            blockId: currentBlockId,
            data: [
              {
                limit: clampRecentDocsLimit(docLimit, 5),
                docNotebookId,
                ensureOpenDocs: latestDocsSortBy === "openAt",
                latestDocsSortBy,
                latestDocsTitle,
                latestDocsPrefix,
                useBuiltinDocIcon: latestDocsUseBuiltinDocIcon,
                showLatestDocDetails,
                showLatestDocFloatDoc,
                latestDocsFloatDocShowTime,
              },
            ],
          };
        } else if (selectedContentType === "favorites") {
          // 保存前更新favoritesNotebookId字符串
          favoritesNotebookId = selectedFavoritesNotebookIds
            .map((item) => item.value)
            .join(",");
          contentTypeJson = {
            activeTab: activeTab,
            type: "favorites",
            blockId: currentBlockId,
            data: {
              favoritiesTitle,
              favoritiesSortOrder,
              showNoteMeta,
              favoritiesDocPrefix,
              useBuiltinDocIcon: favoritesUseBuiltinDocIcon,
              favoritesNotebookId,
              showFavFloatDoc,
              favFloatDocShowTime,
            },
          };
        } else if (selectedContentType === "heatmap") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "heatmap",
            blockId: currentBlockId,
            data: {
              timeRangeType,
              heatmapTitle,
              pastMonthCount,
              showLabel,
              selectedColorPreset,
              customColor,
              heatmapCountType,
            },
          };
        } else if (selectedContentType === "recent-journals") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "recent-journals",
            blockId: currentBlockId,
            data: {
              limit: docJournalLimit,
              recentJournalsShowType,
              recentJournalsCalendarIcon,
              recentJournalsCalendarIconSize,
              useBuiltinDocIcon: latestDailyNotesUseBuiltinDocIcon,
              showLatestDailyNotesFloatDoc,
              latestDailyNotesFloatDocShowTime,
            },
          };
        } else if (selectedContentType === "TaskMan") {
          // 保存前更新tasksNotebookId字符串
          tasksNotebookId = selectedTasksNotebookIds
            .map((item) => item.value)
            .join(",");
          contentTypeJson = {
            activeTab: activeTab,
            type: "TaskMan",
            blockId: currentBlockId,
            data: {
              showCompletedTasks,
              tasksNotebookId,
              showTasksDetails,
              TaskManTitle,
            },
          };
        } else if (selectedContentType === "countdown") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "countdown",
            blockId: currentBlockId,
            data: {
              countdownStyle,
              countdownDisplaySystem,
              countdownView,
              countdownCard1BgSelect,
              countdownCard1RemoteBg,
              countdownCard1LocalBg,
              countdownCard2BgColor,
              countdownList2BgColor,
            },
          };
        } else if (selectedContentType === "weather") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "weather",
            blockId: currentBlockId,
            data: {
              cityName: customWeatherCityName,
              cityCode: customWeatherCityCode,
              weatherStyle,
            },
          };
        } else if (selectedContentType === "custom-text") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "custom-text",
            blockId: currentBlockId,
            data: [{ customText: customTextInputValue }],
          };
        } else if (selectedContentType === "custom-web") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "custom-web",
            blockId: currentBlockId,
            data: [{ url: customWebUrl }],
          };
        } else if (selectedContentType === "HOT") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "HOT",
            blockId: currentBlockId,
            data: {
              source: hotSource,
            },
          };
        } else if (selectedContentType === "custom-protyle") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "custom-protyle",
            blockId: currentBlockId,
            data: [
              {
                isRandomDoc,
                customBlockId: customBlockID,
              },
            ],
          };
        } else if (selectedContentType === "timedate") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "timedate",
            blockId: currentBlockId,
            data: {
              // 时钟组件相关变量
              timeType,
              // 时钟组件经典样式相关变量
              showSeconds,
              dateFormat,
              showLunar,
              showZodiac,
              showSolarTerm,
              showWeek,
              showDate,
              morningImageType,
              afternoonImageType,
              nightImageType,
              morningBgUrl,
              afternoonBgUrl,
              nightBgUrl,
              morningBgImage,
              afternoonBgImage,
              nightBgImage,
              timedateFontSize,
              // 简单时钟配置
              simple1Size,
              simple1FontWeight,
              simple1ShowSecond,
              simple1ShowDate,
              // 简单时钟2配置
              simple2BgSelect,
              simple2RemoteBg,
              simple2LocalBg,
              // 表盘时钟配置
              dial1ShowSecond,
              dial1ShowMarkers,
              dial1ShowDate,
              // 表盘2配置
              dial2ShowSecond,
              dial2ShowMarkers,
              dial2ShowDate,
              // 表盘3配置
              dial3ShowSecond,
              // 表盘4配置
              dial4ShowSecond,
              // 表盘5配置
              dial5ShowSecond,
              // 表盘6配置
              dial6ShowSecond,
              // 表盘7配置
              dial7ShowSecond,
              // 表盘8配置
              dial8ShowSecond,
              // 表盘9配置
              dial9ShowSecond,
            },
          };
        } else if (selectedContentType === "focus") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "focus",
            blockId: currentBlockId,
            data: {
              ...focusExistingData,
              focusImageType,
              focusBgImage,
              focusLocalImage,
              breakImageType,
              breakBgImage,
              breakLocalImage,
            },
          };
        } else if (selectedContentType === "sql") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "sql",
            blockId: currentBlockId,
            data: {
              sqlTitle,
              sqlInput,
              columnOrder,
              hiddenFields,
            },
          };
        } else if (selectedContentType === "TaskManPlus") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "TaskManPlus",
            blockId: currentBlockId,
            data: {
              TaskManPlusTitle,
              isCustomFilter,
              internalFilter,
              customFilter,
              tasksSort,
              tasksPlusSelectedNotebookIds,
            },
          };
        } else if (selectedContentType === "quick-notes") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "quick-notes",
            blockId: currentBlockId,
            data: { quickNotesTitle, quickNotesSort },
          };
        } else if (selectedContentType === "dailyQuote") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "dailyQuote",
            blockId: currentBlockId,
            data: {
              dailyQuoteMode,
              customDailyQuoteContent,
              dailyQuoteSource,
              dailyQuoteFontSize,
              dailyQuoteBgSelect,
              dailyQuoteRemoteBg,
              dailyQuoteLocalBg,
            },
          };
        } else if (selectedContentType === "visualChart") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "visualChart",
            blockId: currentBlockId,
            data: {
              visualChartType,
            },
          };
        } else if (selectedContentType === "musicPlayer") {
          const existingMusicPlayerData =
            loadedWidgetConfig?.type === "musicPlayer" &&
            loadedWidgetConfig?.data &&
            !Array.isArray(loadedWidgetConfig.data)
              ? loadedWidgetConfig.data
              : {};
          contentTypeJson = {
            activeTab: activeTab,
            type: "musicPlayer",
            blockId: currentBlockId,
            data: {
              ...existingMusicPlayerData,
              musicFolderPath,
              autoPlay,
              showLyrics: musicShowLyrics,
              showCover: musicShowCover,
              scanSubfolders: musicScanSubfolders,
              parseMetadata: musicParseMetadata,
              showFloatingMini: musicShowFloatingMini,
            },
          };
        } else if (selectedContentType === "almanac") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "almanac",
            blockId: currentBlockId,
            data: { almanacStyle },
          };
        } else if (selectedContentType === "stikynot") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "stikynot",
            blockId: currentBlockId,
            data: { stikynotStyle },
          };
        } else if (selectedContentType === "News") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "News",
            blockId: currentBlockId,
            data: { NewsType },
          };
        } else if (selectedContentType === "databaseChart") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "databaseChart",
            blockId: currentBlockId,
            data: {
              databaseChartID,
              databaseChartType,
              databaseChartTitle,
              databaseChartLineType,
              databaseChartLineXAxisSource,
              databaseChartLineXAxisTitle,
              databaseChartLineYAxisSource: Array.isArray(
                databaseChartLineYAxisSource,
              )
                ? databaseChartLineYAxisSource
                : databaseChartLineYAxisSource
                  ? [databaseChartLineYAxisSource]
                  : [],
              databaseChartLineYAxisTitle,
              databaseChartLineCountColumn,
              databaseChartLineCountXAxisTitle,
              databaseChartLineCountYAxisTitle,
              databaseChartLineSmooth,
              databaseChartLineWidth,
              databaseChartLineStyle,
              databaseChartLineCountSort,
              databaseChartLineMarkPoint,
              databaseChartLineMarkPointSize,
            },
          };
        } else if (selectedContentType === "childDocs") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "childDocs",
            blockId: currentBlockId,
            data: {
              childDocsTitle,
              childDocsPrefix,
              useBuiltinDocIcon: childDocsUseBuiltinDocIcon,
              showChildDocsDetails,
              childDocsParentId,
              childDocsSortOrder,
              showChildDocsFloatDoc,
              childDocsFloatDocShowTime,
            },
          };
        } else if (selectedContentType === "constellation") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "constellation",
            blockId: currentBlockId,
            data: {
              selectedConstellation,
            },
          };
        } else if (selectedContentType === "historyDays") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "historyDays",
            blockId: currentBlockId,
            data: {
              historyDaysType,
            },
          };
        } else if (selectedContentType === "statisticalCard") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "statisticalCard",
            blockId: currentBlockId,
            data: {
              statisticalCardTitle,
              statisticalCardTitleSize,
              statisticalCardTitleColor,
              statisticalCardContent,
              statisticalCardCountSize,
              statisticalCardCountColor,
              customSQLCount,
            },
          };
        } else if (selectedContentType === "PicCaro") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "PicCaro",
            blockId: currentBlockId,
            data: {
              PicFolderPath,
              PicAutoPlay,
              PicInterval,
              PicNavigation,
              PicPagination,
              PicPaginationType,
              PicPaginationDyBu,
              PicPaginationPrOp,
              PicEffect,
              PicSlidesPerView,
              PicRandomSwitch,
            },
          };
        } else if (selectedContentType === "CYBMOK") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "CYBMOK",
            blockId: currentBlockId,
            data: {
              CMKnockSound,
            },
          };
        } else if (selectedContentType === "countdownTimer") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "countdownTimer",
            blockId: currentBlockId,
            data: {
              advancedEnabled,
              countdownTimerStyle,
            },
          };
        } else if (selectedContentType === "fixedAssets") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "fixedAssets",
            blockId: currentBlockId,
            data: {
              fixedAssetsTitle,
              fixedAssetsListLimit,
              fixedAssetsSortBy,
              fixedAssetsShowHourly,
              fixedAssetsShowMonthly,
              fixedAssetsShowWeekly,
              fixedAssetsShowQuarterly,
              fixedAssetsShowYearly,
              fixedAssetsItemCostPeriod,
            },
          };
        } else if (selectedContentType === "accounting") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "accounting",
            blockId: currentBlockId,
            data: {
              accountingTitle,
              accountingHomeRecentLimit,
              accountingShowBudget,
              accountingShowRecentRecords,
            },
          };
        } else if (selectedContentType === "reviewDocs") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "reviewDocs",
            blockId: currentBlockId,
            data: {
              reviewDocsTitle,
              reviewDocsLimit,
              reviewDocsDefaultView,
              reviewDocsShowFuture,
              reviewDocsFutureDays,
              reviewDocsShowDocs,
              reviewDocsShowBlocks,
              reviewDocsShowNote,
              reviewDocsShowPath,
              reviewDocsShowStats,
              reviewDocsSortBy,
              reviewDocsShowFloatDoc,
              reviewDocsFloatDocShowTime,
              reviewDocsDefaultIntervals,
              reviewDocsSelectedNotebookIds,
            },
          };
        } else if (selectedContentType === "conditionDocs") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "conditionDocs",
            blockId: currentBlockId,
            data: {
              conditionDocsTitle,
              conditionDocsCondition,
              conditionDocsKeyPosition,
              conditionDocsKeyWord,
              conditionDocsSortOrder,
              useBuiltinDocIcon: conditionDocsUseBuiltinDocIcon,
              showConditionDocsFloatDoc,
              conditionDocsFloatDocShowTime,
              conditionDocsTag,
            },
          };
        } else if (selectedContentType === "enhancedDiary") {
          contentTypeJson = {
            activeTab: activeTab,
            type: "enhancedDiary",
            blockId: currentBlockId,
            data: {},
          };
        }

        if (selectedContentType === "musicPlayer") {
          const { exists } = await checkExistingMusicPlayer(
            plugin,
            currentBlockId,
          );
          if (exists) {
            showMessage(
              "音乐播放器只能添加一个，请先删除主页或侧边栏中已有的音乐播放器。",
              5000,
            );
            return;
          }
        }

        onConfirm(JSON.stringify(contentTypeJson));
      }}
    >
      <SiyuanIcon name="confirm" size={14} />
      <span>确定</span>
    </button>
    <button class="cancel-button" onclick={onClose}>
      <SiyuanIcon name="cancel" size={14} />
      <span>取消</span>
    </button>
  </div>
</div>

<style lang="scss">
  @use "./contentSettingStyle/contentSetting.scss" as *;

  // 共享布局类 - 限定在插件设置容器内，避免污染思源全局样式
  .settings-container :global(.setting-panel) {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .settings-container :global(.form-row) {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .settings-container :global(.form-row) > :global(*) {
    flex-shrink: 0;
  }

  .settings-container :global(.form-row-compact) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .settings-container :global(.form-row-compact) > :global(*) {
    flex-shrink: 0;
  }

  .settings-container :global(.form-inline-group) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: nowrap;
  }

  .settings-container :global(.form-grid-2) {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;

    @media (max-width: 480px) {
      grid-template-columns: 1fr;
    }
  }

  .settings-container :global(.form-grid-auto) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .settings-container :global(.form-field) {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 80px;
  }

  .settings-container :global(.form-field label) {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    white-space: nowrap;
    line-height: 1.5;
  }

  .settings-container :global(.form-field input),
  .settings-container :global(.form-field select) {
    width: 100%;
    height: 32px;
    box-sizing: border-box;
  }

  .settings-container :global(.field-xs) {
    width: 60px !important;
    min-width: 60px;
    flex: 0 0 auto !important;
  }

  .settings-container :global(.field-sm) {
    width: 100px !important;
    min-width: 100px;
    flex: 0 0 auto !important;
  }

  .settings-container :global(.field-md) {
    width: 160px !important;
    min-width: 160px;
    flex: 0 0 auto !important;
  }

  .settings-container :global(.field-lg) {
    width: 240px !important;
    min-width: 240px;
    flex: 0 0 auto !important;
  }

  .settings-container :global(.field-grow) {
    flex: 1 1 auto !important;
    min-width: 120px;
  }

  .settings-container :global(.field-full) {
    width: 100% !important;
    flex: 1 1 100% !important;
  }

  .settings-container :global(.form-field-full) {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    width: 100%;
  }

  .settings-container :global(.form-field-full label) {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    line-height: 1.5;
  }

  .settings-container :global(.form-field-full input),
  .settings-container :global(.form-field-full select) {
    width: 100%;
    height: 32px;
    box-sizing: border-box;
  }

  .settings-container :global(.form-field-full .multi-select-container) {
    width: 100%;
  }

  .settings-container :global(.form-checkbox-row) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0;
    min-height: 32px;
    margin-top: 1.25rem;
  }

  .settings-container :global(.form-checkbox-row input[type="checkbox"]) {
    width: auto;
    margin: 0;
  }

  .settings-container :global(.form-checkbox-row label) {
    font-size: 13px;
    font-weight: 500;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    user-select: none;
    line-height: 1.5;
  }

  .settings-container :global(.form-checkbox-group) {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }

  .settings-container :global(.form-checkbox-group-inline) {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .settings-container :global(.form-checkbox-group-inline .form-checkbox-row) {
    margin-top: 0;
  }

  .settings-container :global(.input-xs) {
    width: 50px !important;
    min-width: 50px;
  }

  .settings-container :global(.input-sm) {
    width: 80px !important;
    min-width: 80px;
  }

  .settings-container :global(.input-small) {
    width: 60px !important;
    min-width: 60px;
  }

  .settings-container :global(.input-medium) {
    width: 100px !important;
    min-width: 100px;
  }

  .settings-container :global(.input-large) {
    width: 200px !important;
    min-width: 200px;
  }

  .settings-container :global(.input-emoji) {
    width: 50px !important;
    min-width: 50px;
    text-align: center;
    font-size: 16px;
  }

  .settings-container :global(.input-prefix) {
    width: 80px !important;
    min-width: 80px;
  }

  .settings-container :global(.emoji-select-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 60px;
    height: 32px;
    padding: 0 0.75rem;
    font-size: 16px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--b3-list-hover);
      border-color: var(--b3-theme-primary);
    }
  }

  .settings-container :global(.emoji-select-btn--compact) {
    min-width: 48px;
    width: 48px;
    height: 28px;
    padding: 0;
    font-size: 14px;
  }

  .settings-container :global(.form-divider) {
    height: 1px;
    background: var(--b3-border-color);
    margin: 0.75rem 0;
  }

  .settings-container :global(.form-section-title) {
    font-size: 14px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--b3-border-color);
    margin-bottom: 0.5rem;
  }

  .settings-container :global(.form-help-text) {
    font-size: 12px;
    color: var(--b3-theme-on-surface-light);
    margin-top: 0.25rem;
  }
</style>
