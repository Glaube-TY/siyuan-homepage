<script lang="ts">
    import { onMount } from "svelte";
    import { getNotebooks } from "@/components/tools/getNotebooks";
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

    // import DatabaseChartSet from "./widget/databaseChart/databaseChartSet.svelte";

    import "./contentSettingStyle/contentSetting.scss";

    // 弹窗接收的 props
    export let plugin: any;
    export let onClose: () => void;
    export let onConfirm: (contentTypeJson: string) => void;

    // 当前区块 ID
    export let currentBlockId: string = "";

    let activeTab = "note";

    let notebooks = [];

    // 下拉选项绑定值
    let selectedContentType: string = "latest-docs";
    let customTextInputValue: string = "";

    // 子文档配置
    let childDocsTitle: string = "📄子文档";
    let childDocsPrefix: string = "📄";
    let showChildDocsDetails: boolean = true;
    let childDocsParentId: string = "";
    let childDocsSortOrder: string = "updated";
    let showChildDocsFloatDoc: boolean = true;
    let childDocsFloatDocShowTime: number = 0.1;

    // 条件文档配置
    let conditionDocsTitle: string = "📄条件文档";
    let conditionDocsCondition: string = "keyword";
    let conditionDocsKeyPosition: string = "anywhere";
    let conditionDocsKeyWord: string = "";
    let conditionDocsSortOrder: string = "updated";
    let showConditionDocsFloatDoc: boolean = true;
    let conditionDocsFloatDocShowTime: number = 0.1;
    let conditionDocsTag: string = "";

    // 最近文档配置
    let docLimit: number = 5;
    let ensureOpenDocs: boolean = false;
    let selectedNotebookIds: { label: string; value: string }[] = [];
    let docNotebookId: string = "";
    let latestDocsTitle: string = "🕒最近文档";
    let latestDocsPrefix: string = "📄";
    let showLatestDocDetails: boolean = true;
    let showLatestDocFloatDoc: boolean = true;
    let latestDocsFloatDocShowTime: number = 0.1;

    // 最近日记配置
    let docJournalLimit: number = 5;
    let recentJournalsShowType: string = "list";
    let recentJournalsCalendarIcon: string = "📝";
    let recentJournalsCalendarIconSize: number = 16;
    let showLatestDailyNotesFloatDoc: boolean = true;
    let latestDailyNotesFloatDocShowTime: number = 0.1;

    // 收藏文档配置
    let favoritiesTitle: string = "💖收藏文档";
    let favoritiesSortOrder: string = "created";
    let showNoteMeta: boolean = true;
    let favoritiesDocPrefix: string = "❤";
    let favoritesNotebookId: string = ""; // 指定收藏文档所在笔记本 ID
    let selectedFavoritesNotebookIds: { label: string; value: string }[] = [];
    let showFavFloatDoc: boolean = true;
    let favFloatDocShowTime: number = 0.1;

    // 任务管理相关变量
    let showCompletedTasks = true; // 默认显示已完成任务
    let tasksNotebookId: string = ""; // 任务管理笔记本 ID
    let showTasksDetails = true; // 默认显示任务详情
    let TaskManTitle: string = "📋任务管理";
    let selectedTasksNotebookIds: { label: string; value: string }[] = [];

    // 任务管理Plus 相关变量
    let TaskManPlusTitle: string = "📋任务管理Plus";
    let isCustomFilter: boolean = false;
    let internalFilter: string = "all";
    let customFilter: string = "";
    let tasksSort: string = "startdate";

    // 快速笔记相关变量
    let quickNotesTitle: string = "📝快速笔记";
    let quickNotesSort: string = "DOC_ASC";

    // 便签相关变量
    let stikynotStyle: string = "default";

    // 倒数日相关变量
    let eventList = [{ name: "", date: "", anniversary: false }];
    let countdownStyle = "list";
    let countdownCard1BgSelect = "remote";
    let countdownCard1RemoteBg =
        "https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664";
    let countdownCard1LocalBg = "";
    let countdownCard2BgColor: string = "#000000";
    let countdownList2BgColor: string = "#000000";

    // 天气相关变量
    let customWeatherCityName: string = "";
    let customWeatherCityCode: string = "";
    let weatherStyle: string = "default";

    // 热搜相关变量
    let hotSource: string = "bilibili";

    // 每日一言相关变量
    let dailyQuoteMode: string = "custom";
    let customDailyQuoteContent: string = "";
    let dailyQuoteSource: string = "classic";
    let dailyQuoteFontSize: number = 1;
    let dailyQuoteBgSelect = "remote";
    let dailyQuoteRemoteBg =
        "https://haowallpaper.com/link/common/file/previewFileImg/17169460970507648";
    let dailyQuoteLocalBg = "";
    let dailyQuoteBgInput: HTMLInputElement | null = null;

    // 新闻资讯相关变量
    let NewsType: string = "daily-news-bulletin";

    // 星座运势相关变量
    let selectedConstellation: string = "摩羯";

    // 历史上的今天相关变量
    let historyDaysType: string = "list";

    // 热力图相关
    let timeRangeType: "past" | "custom" = "past";
    let heatmapTitle: string = "📅创作热力图";
    let pastMonthCount: number = 6;
    let showLabel: boolean = true;
    let selectedColorPreset: "github" | "blue" | "custom" = "github";
    let customColor: string = "#1ea769";
    let heatmapCountType: string = "block";

    // 自定义网页链接
    let customWebUrl: string = "";

    // 自定义显示块ID
    let isRandomDoc: boolean = false;
    let customBlockID: string = "";

    // 时钟组件相关变量
    let timeType: string = "classic";
    // 时钟组件经典样式相关变量
    let timedateFontSize: number = 3;
    let showSeconds: boolean = true;
    let dateFormat: string = "YYYY年MM月DD日";
    let showLunar: boolean = true;
    let showZodiac: boolean = true;
    let showSolarTerm: boolean = true;
    let showWeek: boolean = true;
    let showDate: boolean = true;
    let morningBgUrl =
        "https://haowallpaper.com/link/common/file/previewFileImg/16637944029171072";
    let afternoonBgUrl =
        "https://haowallpaper.com/link/common/file/previewFileImg/16989237330693504";
    let nightBgUrl =
        "https://haowallpaper.com/link/common/file/previewFileImg/15477811848581440";
    let morningBgImage = null;
    let afternoonBgImage = null;
    let nightBgImage = null;
    let morningImageType = "remote";
    let afternoonImageType = "remote";
    let nightImageType = "remote";
    // 简单时钟配置
    let simple1Size: number = 3;
    let simple1FontWeight: number = 4;
    let simple1ShowSecond: boolean = true;
    let simple1ShowDate: boolean = true;
    // 简单时钟2配置
    let simple2BgSelect: string = "remote";
    let simple2RemoteBg: string =
        "https://haowallpaper.com/link/common/file/previewFileImg/17882739641666944";
    let simple2LocalBg: string = "";
    // 表盘时钟配置
    let dial1ShowSecond: boolean = true;
    let dial1ShowMarkers: boolean = true;
    let dial1ShowDate: boolean = true;
    // 表盘2配置
    let dial2ShowSecond: boolean = true;
    let dial2ShowMarkers: boolean = true;
    let dial2ShowDate: boolean = true;
    // 表盘3配置
    let dial3ShowSecond: boolean = true;
    // 表盘4配置
    let dial4ShowSecond: boolean = true;
    // 表盘5配置
    let dial5ShowSecond: boolean = true;
    // 表盘6配置
    let dial6ShowSecond: boolean = true;
    // 表盘7配置
    let dial7ShowSecond: boolean = true;
    // 表盘8配置
    let dial8ShowSecond: boolean = true;
    // 表盘9配置
    let dial9ShowSecond: boolean = true;

    // 专注设置
    let focusImageType = "remote";
    let breakImageType = "remote";
    let focusBgImage =
        "https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464";
    let breakBgImage =
        "https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d";
    let focusLocalImage = null;
    let breakLocalImage = null;

    // SQL 查询
    let sqlTitle: string = "🔍SQL 查询结果";
    let sqlInput: string = "";
    let columnOrder: string = "";
    let hiddenFields: string = "";

    // 可视化图表相关
    let visualChartType: string = "progressBar";

    // 数据库图表相关
    let databaseChartID: string = "";
    let databaseChartType: string = "line";
    let databaseChartTitle: string = "";
    let databaseChartLineType: string = "XY";
    let databaseChartLineXAxisSource: string = "";
    let databaseChartLineXAxisTitle: string = "";
    let databaseChartLineYAxisSource: string[] = [];
    let databaseChartLineYAxisTitle: string = "";
    let databaseChartLineCountColumn: string = "";
    let databaseChartLineCountXAxisTitle: string = "";
    let databaseChartLineCountYAxisTitle: string = "";
    let databaseChartLineSmooth: boolean = false;
    let databaseChartLineCountSort: string = "none";
    let databaseChartLineMarkPoint: string = "circle";
    let databaseChartLineMarkPointSize: number = 8;
    let databaseChartLineStyle: string = "solid";
    let databaseChartLineWidth: number = 2;

    // 统计卡片相关
    let statisticalCardTitle: string = "统计卡片";
    let statisticalCardTitleSize: number = 1;
    let statisticalCardTitleColor: string = "#000000";
    let statisticalCardContent: string = "notebooksCount";
    let statisticalCardCountSize: number = 2;
    let statisticalCardCountColor: string = "#000000";
    let customSQLCount: string = "";

    // 音乐播放器相关
    let musicFolderPath = "";
    let autoPlay = false;

    //  黄历相关
    let almanacStyle: string = "classic";

    // 图片轮播相关
    let PicFolderPath: string = ""; // 图片文件夹路径
    let PicAutoPlay: boolean = false; // 是否自动播放
    let PicInterval: number = 3; // 切换间隔（秒）
    let PicNavigation: boolean = false; // 是否显示导航按钮
    let PicPagination: boolean = false; // 是否显示分页按钮
    let PicPaginationType: string = "bullets"; // 分页按钮类型
    let PicPaginationDyBu: boolean = false; // 动态分页圆点
    let PicPaginationPrOp: boolean = false; // 分页进度条是否反方向
    let PicEffect: string = "slide"; // 切换效果
    let PicSlidesPerView: string = "1"; // 每页显示的图片数量
    let PicRandomSwitch: boolean = false; // 是否随机切换

    // 赛博木鱼配置
    let CMKnockSound: string = "普通";

    // 倒计时定时器样式
    let countdownTimerStyle: string = "default";

    let advancedEnabled = false;

    onMount(async () => {
        const settingData = await plugin.loadData(
            `widget-${currentBlockId}.json`,
        );

        notebooks = await getNotebooks(plugin);

        if (settingData) {
            let parsedData: any;

            if (typeof settingData === "string") {
                try {
                    parsedData = JSON.parse(settingData);
                } catch (e) {
                    console.error("无法解析 settingData", e);
                    return;
                }
            } else {
                parsedData = settingData;
            }

            selectedContentType = parsedData.type || "latest-docs";
            activeTab = parsedData.activeTab || "note";

            if (parsedData.type === "latest-docs") {
                docLimit = parsedData.data?.[0]?.limit || 5;
                ensureOpenDocs = parsedData.data?.[0]?.ensureOpenDocs || false;
                docNotebookId = parsedData.data?.[0]?.docNotebookId || "";
                selectedNotebookIds = docNotebookId
                    ? docNotebookId.split(",").map((id) => {
                          // 根据ID在notebooks数组中查找对应的笔记本名称
                          const notebook = notebooks.find(
                              (notebook) => notebook.id === id,
                          );
                          return {
                              label: notebook ? notebook.name : id, // 如果找不到匹配的笔记本，使用ID作为标签
                              value: id,
                          };
                      })
                    : [];
                latestDocsTitle =
                    parsedData.data?.[0]?.latestDocsTitle || "🕒最近文档";
                latestDocsPrefix =
                    parsedData.data?.[0]?.latestDocsPrefix || "📄";
                showLatestDocDetails =
                    parsedData.data?.[0]?.showLatestDocDetails ?? true;
                showLatestDocFloatDoc =
                    parsedData.data?.[0]?.showLatestDocFloatDoc ?? true;
                latestDocsFloatDocShowTime =
                    parsedData.data?.[0]?.latestDocsFloatDocShowTime || 0.1;
            } else if (parsedData.type === "favorites") {
                favoritiesTitle =
                    parsedData.data?.favoritiesTitle || "💖收藏文档";
                favoritiesSortOrder =
                    parsedData.data?.favoritiesSortOrder || "created";
                showNoteMeta = parsedData.data?.showNoteMeta ?? true;
                favoritiesDocPrefix =
                    parsedData.data?.favoritiesDocPrefix || favoritiesDocPrefix;
                favoritesNotebookId =
                    parsedData.data?.favoritesNotebookId || "";
                selectedFavoritesNotebookIds = favoritesNotebookId
                    ? favoritesNotebookId.split(",").map((id) => {
                          // 根据ID在notebooks数组中查找对应的笔记本名称
                          const notebook = notebooks.find(
                              (notebook) => notebook.id === id,
                          );
                          return {
                              label: notebook ? notebook.name : id, // 如果找不到匹配的笔记本，使用ID作为标签
                              value: id,
                          };
                      })
                    : [];
                showFavFloatDoc = parsedData.data?.showFavFloatDoc ?? true;
                favFloatDocShowTime =
                    parsedData.data?.favFloatDocShowTime || 0.1;
            } else if (parsedData.type === "heatmap") {
                heatmapTitle = parsedData.data?.heatmapTitle || "";
                pastMonthCount = parsedData.data?.pastMonthCount || 6;
                showLabel = parsedData.data?.showLabel ?? true;
                selectedColorPreset =
                    parsedData.data?.selectedColorPreset || "github";
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
            } else if (parsedData.type === "countdown") {
                eventList = parsedData.data?.eventList || [
                    { name: "", date: "", anniversary: false },
                ];
                countdownStyle = parsedData.data?.countdownStyle || "list";
                countdownCard1BgSelect =
                    parsedData.data?.countdownCard1BgSelect || "remote";
                countdownCard1RemoteBg =
                    parsedData.data?.countdownCard1RemoteBg || "";
                countdownCard1LocalBg =
                    parsedData.data?.countdownCard1LocalBg || "";
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

                morningImageType =
                    parsedData.data?.morningImageType ?? "remote";
                afternoonImageType =
                    parsedData.data?.afternoonImageType ?? "remote";
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
                showCompletedTasks =
                    parsedData.data?.showCompletedTasks ?? true;
                tasksNotebookId = parsedData.data?.tasksNotebookId || "";
                selectedTasksNotebookIds = tasksNotebookId
                    ? tasksNotebookId.split(",").map((id) => {
                          // 根据ID在notebooks数组中查找对应的笔记本名称
                          const notebook = notebooks.find(
                              (notebook) => notebook.id === id,
                          );
                          return {
                              label: notebook ? notebook.name : id, // 如果找不到匹配的笔记本，使用ID作为标签
                              value: id,
                          };
                      })
                    : [];
                showTasksDetails = parsedData.data?.showTasksDetails ?? true;
                TaskManTitle = parsedData.data?.TaskManTitle || "📋任务管理";
            } else if (parsedData.type === "focus") {
                focusImageType = parsedData.data?.focusImageType || "remote";
                breakImageType = parsedData.data?.breakImageType || "remote";

                focusBgImage = parsedData.data?.focusBgImage || focusBgImage;
                breakBgImage = parsedData.data?.breakBgImage || breakBgImage;

                focusLocalImage =
                    parsedData.data?.focusLocalImage || focusLocalImage;
                breakLocalImage =
                    parsedData.data?.breakLocalImage || breakLocalImage;
            } else if (parsedData.type === "sql") {
                sqlTitle = parsedData.data?.sqlTitle || sqlTitle;
                sqlInput = parsedData.data?.sqlInput || "";
                columnOrder = parsedData.data?.columnOrder || "";
                hiddenFields = parsedData.data?.hiddenFields || "";
            } else if (parsedData.type === "TaskManPlus") {
                TaskManPlusTitle =
                    parsedData.data?.TaskManPlusTitle || TaskManPlusTitle;
                isCustomFilter =
                    parsedData.data?.isCustomFilter || isCustomFilter;
                internalFilter =
                    parsedData.data?.internalFilter || internalFilter;
                customFilter = parsedData.data?.customFilter || customFilter;
                tasksSort = parsedData.data?.tasksSort || tasksSort;
            } else if (parsedData.type === "quick-notes") {
                quickNotesTitle =
                    parsedData.data?.quickNotesTitle || quickNotesTitle;
                quickNotesSort =
                    parsedData.data?.quickNotesSort || quickNotesSort;
            } else if (parsedData.type === "dailyQuote") {
                dailyQuoteMode =
                    parsedData.data?.dailyQuoteMode || dailyQuoteMode;
                customDailyQuoteContent =
                    parsedData.data?.customDailyQuoteContent ||
                    customDailyQuoteContent;
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
                visualChartType =
                    parsedData.data?.visualChartType || visualChartType;
            } else if (parsedData.type === "musicPlayer") {
                musicFolderPath = parsedData.data?.musicFolderPath || "";
                autoPlay = parsedData.data?.autoPlay || false;
            } else if (parsedData.type === "almanac") {
                almanacStyle = parsedData.data?.almanacStyle || "";
            } else if (parsedData.type === "stikynot") {
                stikynotStyle = parsedData.data?.stikynotStyle || "";
            } else if (parsedData.type === "News") {
                NewsType = parsedData.data?.NewsType || NewsType;
            } else if (parsedData.type === "databaseChart") {
                databaseChartID =
                    parsedData.data?.databaseChartID || databaseChartID;
                databaseChartType =
                    parsedData.data?.databaseChartType || databaseChartType;
                databaseChartTitle =
                    parsedData.data?.databaseChartTitle || databaseChartTitle;

                databaseChartLineType =
                    parsedData.data?.databaseChartLineType ||
                    databaseChartLineType;

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
                    parsedData.data?.databaseChartLineSmooth ||
                    databaseChartLineSmooth;
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
                    parsedData.data?.databaseChartLineWidth ||
                    databaseChartLineWidth;
                databaseChartLineStyle =
                    parsedData.data?.databaseChartLineStyle ||
                    databaseChartLineStyle;
            } else if (parsedData.type === "childDocs") {
                childDocsTitle =
                    parsedData.data?.childDocsTitle || childDocsTitle;
                childDocsPrefix =
                    parsedData.data?.childDocsPrefix || childDocsPrefix;
                showChildDocsDetails =
                    parsedData.data?.showChildDocsDetails ??
                    showChildDocsDetails;
                childDocsParentId =
                    parsedData.data?.childDocsParentId || childDocsParentId;
                childDocsSortOrder =
                    parsedData.data?.childDocsSortOrder || childDocsSortOrder;
                showChildDocsFloatDoc =
                    parsedData.data?.showChildDocsFloatDoc ??
                    showChildDocsFloatDoc;
                childDocsFloatDocShowTime =
                    parsedData.data?.childDocsFloatDocShowTime ||
                    childDocsFloatDocShowTime;
            } else if (parsedData.type === "constellation") {
                selectedConstellation =
                    parsedData.data?.selectedConstellation ||
                    selectedConstellation;
            } else if (parsedData.type === "historyDays") {
                historyDaysType =
                    parsedData.data?.historyDaysType || historyDaysType;
            } else if (parsedData.type === "statisticalCard") {
                statisticalCardTitle =
                    parsedData.data?.statisticalCardTitle ||
                    statisticalCardTitle;
                statisticalCardTitleSize =
                    parsedData.data?.statisticalCardTitleSize ||
                    statisticalCardTitleSize;
                statisticalCardTitleColor =
                    parsedData.data?.statisticalCardTitleColor ||
                    statisticalCardTitleColor;
                statisticalCardContent =
                    parsedData.data?.statisticalCardContent ||
                    statisticalCardContent;
                statisticalCardCountSize =
                    parsedData.data?.statisticalCardCountSize ||
                    statisticalCardCountSize;
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
                PicPaginationType =
                    parsedData.data?.PicPaginationType || "bullets";
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
            } else if (parsedData.type === "conditionDocs") {
                conditionDocsTitle =
                    parsedData.data?.conditionDocsTitle || conditionDocsTitle;
                conditionDocsCondition =
                    parsedData.data?.conditionDocsCondition ||
                    conditionDocsCondition;
                conditionDocsKeyPosition =
                    parsedData.data?.conditionDocsKeyPosition ||
                    conditionDocsKeyPosition;
                conditionDocsKeyWord =
                    parsedData.data?.conditionDocsKeyWord ||
                    conditionDocsKeyWord;
                conditionDocsSortOrder =
                    parsedData.data?.conditionDocsSortOrder ||
                    conditionDocsSortOrder;
                showConditionDocsFloatDoc =
                    parsedData.data?.showConditionDocsFloatDoc ??
                    showConditionDocsFloatDoc;
                conditionDocsFloatDocShowTime =
                    parsedData.data?.conditionDocsFloatDocShowTime ||
                    conditionDocsFloatDocShowTime;
                conditionDocsTag =
                    parsedData.data?.conditionDocsTag || conditionDocsTag;
            }
        }

        advancedEnabled = plugin.ADVANCED;
    });
</script>

<div class="settings-container">
    <!-- 分类导航栏 -->
    <div class="tab-nav">
        <button
            on:click={() => (activeTab = "note")}
            class:active={activeTab === "note"}>笔记数据</button
        >
        <button
            on:click={() => (activeTab = "visualization")}
            class:active={activeTab === "visualization"}>可视化</button
        >
        <button
            on:click={() => (activeTab = "tool")}
            class:active={activeTab === "tool"}>日常工具</button
        >
        <button
            on:click={() => (activeTab = "info")}
            class:active={activeTab === "info"}>信息资讯</button
        >
        <button
            on:click={() => (activeTab = "custom")}
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
                    <option value="childDocs">子文档👑</option>
                    <option value="stikynot">便签👑</option>
                    <option value="conditionDocs">条件文档👑</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "latest-docs"}
                    <LatestDocsSet
                        bind:docLimit
                        bind:ensureOpenDocs
                        bind:selectedNotebookIds
                        bind:docNotebookId
                        bind:latestDocsTitle
                        bind:latestDocsPrefix
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
                    />
                {:else if selectedContentType === "TaskManPlus"}
                    <TasksPlusSet
                        bind:TaskManPlusTitle
                        bind:isCustomFilter
                        bind:internalFilter
                        bind:customFilter
                        bind:tasksSort
                    />
                {:else if selectedContentType === "quick-notes"}
                    <QuickNotesSet bind:quickNotesTitle bind:quickNotesSort />
                {:else if selectedContentType === "stikynot"}
                    <StikynotSet {advancedEnabled} bind:stikynotStyle />
                {:else if selectedContentType === "childDocs"}
                    <ChildDocsSet
                        {advancedEnabled}
                        bind:childDocsTitle
                        bind:childDocsPrefix
                        bind:showChildDocsDetails
                        bind:childDocsParentId
                        bind:childDocsSortOrder
                        bind:showChildDocsFloatDoc
                        bind:childDocsFloatDocShowTime
                    />
                {:else if selectedContentType === "conditionDocs"}
                    <ConditionDocsSet
                        {advancedEnabled}
                        bind:conditionDocsTitle
                        bind:conditionDocsCondition
                        bind:conditionDocsKeyPosition
                        bind:conditionDocsKeyWord
                        bind:conditionDocsSortOrder
                        bind:showConditionDocsFloatDoc
                        bind:conditionDocsFloatDocShowTime
                        bind:conditionDocsTag
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
                        bind:dailyQuoteBgInput
                    />
                {:else if selectedContentType === "News"}
                    <NewsSet {advancedEnabled} bind:NewsType />
                {:else if selectedContentType === "constellation"}
                    <ConstellationSet
                        {advancedEnabled}
                        bind:selectedConstellation
                    />
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
                    <option value="countdown">倒数日</option>
                    <option value="weather">今日天气</option>
                    <option value="timedate">时钟</option>
                    <option value="musicPlayer">音乐播放器👑</option>
                    <option value="almanac">黄历👑</option>
                    <option value="PicCaro">图片轮播👑</option>
                    <option value="CYBMOK">赛博木鱼👑</option>
                    <option value="countdownTimer">倒计时👑</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "countdown"}
                    <CountdownSet
                        bind:countdownStyle
                        bind:eventList
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
                        bind:focusImageType
                        bind:breakImageType
                        bind:focusBgImage
                        bind:breakBgImage
                        bind:focusLocalImage
                        bind:breakLocalImage
                    />
                {:else if selectedContentType === "musicPlayer"}
                    <MusicPlayerSet
                        bind:advancedEnabled
                        bind:musicFolderPath
                        bind:autoPlay
                    />
                {:else if selectedContentType === "almanac"}
                    <AlmanacSet bind:advancedEnabled bind:almanacStyle />
                {:else if selectedContentType === "PicCaro"}
                    <PicCaroSet
                        bind:advancedEnabled
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
                    <CYBMOKSet
                        bind:advancedEnabled
                        {plugin}
                        bind:CMKnockSound
                    />
                {:else if selectedContentType === "countdownTimer"}
                    <CountdownTimerSet
                        bind:advancedEnabled
                        bind:countdownTimerStyle
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
            on:click={() => {
                if (focusImageType === "remote") focusLocalImage = null;
                if (breakImageType === "remote") breakLocalImage = null;

                if (countdownCard1BgSelect === "remote")
                    countdownCard1LocalBg = null;

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
                                limit: docLimit,
                                docNotebookId,
                                ensureOpenDocs,
                                latestDocsTitle,
                                latestDocsPrefix,
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
                            eventList: eventList,
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
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "musicPlayer",
                        blockId: currentBlockId,
                        data: { musicFolderPath, autoPlay },
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
                            showConditionDocsFloatDoc,
                            conditionDocsFloatDocShowTime,
                            conditionDocsTag,
                        },
                    };
                }

                onConfirm(JSON.stringify(contentTypeJson));
            }}
        >
            ✔ 确定
        </button>
        <button class="cancel-button" on:click={onClose}>❌ 取消</button>
    </div>
</div>
