<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { getDatabase } from "./widget/databaseChart/getDatabase";
    import { getImage } from "@/components/tools/getImage";
    import { getNotebooks } from "@/components/tools/getNotebooks";
    import MultiSelect from "svelte-multiselect";
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

    // 最近文档配置
    let docLimit: number = 5;
    let ensureOpenDocs: boolean = false;
    let selectedNotebookIds: { label: string; value: string }[] = [];
    let docNotebookId: string = "";
    let latestDocsTitle: string = "🕒最近文档";
    let latestDocsPrefix: string = "📄";
    let showLatestDocDetails: boolean = true;

    // 最近日记配置
    let docJournalLimit: number = 5;
    let recentJournalsShowType: string = "list";
    let recentJournalsCalendarIcon: string = "📝";
    let recentJournalsCalendarIconSize: number = 16;

    // 收藏文档配置
    let favoritiesTitle: string = "💖收藏文档";
    let favoritiesSortOrder: string = "created";
    let showNoteMeta: boolean = true;
    let favoritiesDocPrefix: string = "❤";
    let favoritesNotebookId: string = ""; // 指定收藏文档所在笔记本 ID
    let selectedFavoritesNotebookIds: { label: string; value: string }[] = [];

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
    let eventList = [{ name: "", date: "" }];
    let countdownStyle = "list";
    let countdownFullBgSelect = "remote";
    let countdownFullBg =
        "https://haowallpaper.com/link/common/file/previewFileImg/17021275790298496";
    let countdownLocalBg = null;
    let countdownBgInput: HTMLInputElement | null = null;
    let countdownFontSize: number = 3;

    // 天气相关变量
    let customWeatherCity: string = "北京";

    // 热搜相关变量
    let hotSource: string = "bilibili";
    const hotSources = [
        { value: "bilibili", label: "B站" },
        { value: "weibo", label: "微博" },
        { value: "baidu", label: "百度" },
        { value: "zhihu", label: "知乎" },
        { value: "toutiao", label: "头条" },
        { value: "douyin", label: "抖音" },
        { value: "GitHub", label: "GitHub" },
    ];

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
    const constellations = [
        "摩羯",
        "水瓶",
        "双鱼",
        "白羊",
        "金牛",
        "双子",
        "巨蟹",
        "狮子",
        "处女",
        "天秤",
        "天蝎",
        "射手",
    ];

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

    // 下拉选项
    const limitOptions = [5, 10, 15, 20, 50, 100];

    // 自定义网页链接
    let customWebUrl: string = "";

    // 自定义显示块ID
    let isRandomDoc: boolean = false;
    let customBlockID: string = "";

    // 时间日期相关
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
    let morningBgInput: HTMLInputElement | null = null;
    let afternoonBgInput: HTMLInputElement | null = null;
    let nightBgInput: HTMLInputElement | null = null;
    let morningBgImage = null;
    let afternoonBgImage = null;
    let nightBgImage = null;
    let morningImageType = "remote";
    let afternoonImageType = "remote";
    let nightImageType = "remote";

    // 专注设置
    let focusImageType = "remote";
    let breakImageType = "remote";
    let focusBgImage =
        "https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464";
    let breakBgImage =
        "https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d";
    let focusLocalImage = null;
    let breakLocalImage = null;
    let focusBgInput: HTMLInputElement | null = null;
    let breakBgInput: HTMLInputElement | null = null;

    // SQL 查询
    let sqlTitle: string = "🔍SQL 查询结果";
    let sqlInput: string = "";
    let columnOrder: string = "";
    let hiddenFields: string = "";

    // 可视化图表相关
    let visualChartType: string = "progressBar";

    // 数据库图表相关
    let databaseChartID: string = "";
    let databaseChartInfo: any[] = [];
    let confirmDatabaseChartID: Boolean = false;
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

    let advancedEnabled = false;

    async function selectMusicFolder() {
        try {
            if (
                !window.navigator.userAgent.includes("Electron") ||
                typeof window.require !== "function"
            )
                return showMessage("此功能仅在桌面版可用");
            const { filePaths } = await window
                .require("@electron/remote")
                .dialog.showOpenDialog({
                    properties: ["openDirectory", "createDirectory"],
                });

            if (filePaths && filePaths.length > 0) {
                musicFolderPath = filePaths[0];
            }
        } catch (error) {
            console.error("选择文件夹时发生错误：", error);
        }
    }

    // 处理倒数日背景上传函数
    function handleCountdownUpload() {
        const file = countdownBgInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                countdownLocalBg = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 处理每日一言背景上传
    function handleDailyQuoteUpload() {
        const file = dailyQuoteBgInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                dailyQuoteLocalBg = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 处理专注背景上传
    function handleFocusUpload() {
        const file = focusBgInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                focusLocalImage = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    // 处理休息背景上传
    function handleBreakUpload() {
        const file = breakBgInput?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result && typeof reader.result === "string") {
                breakLocalImage = reader.result;
            }
        };
        reader.readAsDataURL(file);
    }

    const handleBackgroundUpload = (timeOfDay) => {
        const reader = new FileReader();
        const file = eval(`${timeOfDay}BgInput`).files[0];

        if (!file) return;

        reader.onload = () => {
            if (timeOfDay === "morning") {
                if (reader.result && typeof reader.result === "string") {
                    morningBgImage = reader.result;
                }
            } else if (timeOfDay === "afternoon") {
                if (reader.result && typeof reader.result === "string") {
                    afternoonBgImage = reader.result;
                }
            } else if (timeOfDay === "night") {
                if (reader.result && typeof reader.result === "string") {
                    nightBgImage = reader.result;
                }
            }
        };

        reader.readAsDataURL(file);
    };

    function addEvent() {
        eventList = [...eventList, { name: "", date: "" }];
    }

    function removeEvent(index) {
        eventList = eventList.filter((_, i) => i !== index);
    }

    // 预览图片变量
    // 时间组件预览图
    let morningBgImageData: string = "";
    let afternoonBgImageData: string = "";
    let nightBgImageData: string = "";
    async function getTimeBGImage() {
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            if (morningImageType === "remote") {
                morningBgImageData = await getImage(morningBgUrl);
            }
            if (afternoonImageType === "remote") {
                afternoonBgImageData = await getImage(afternoonBgUrl);
            }
            if (nightImageType === "remote") {
                nightBgImageData = await getImage(nightBgUrl);
            }
        } else {
            if (morningImageType === "remote") {
                morningBgImageData = morningBgUrl;
            }
            if (afternoonImageType === "remote") {
                afternoonBgImageData = afternoonBgUrl;
            }
            if (nightImageType === "remote") {
                nightBgImageData = nightBgUrl;
            }
        }
    }
    // 番茄钟组件预览图
    let focusBgImageData: string = "";
    let breakBgImageData: string = "";
    async function getFocusBreakImage() {
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            if (focusImageType === "remote") {
                focusBgImageData = await getImage(focusBgImage);
            }
            if (breakImageType === "remote") {
                breakBgImageData = await getImage(breakBgImage);
            }
        } else {
            if (focusImageType === "remote") {
                focusBgImageData = focusBgImage;
            }
            if (breakImageType === "remote") {
                breakBgImageData = breakBgImage;
            }
        }
    }
    // 每日一言组件预览图
    let dailyQuoteBgImageData: string = "";
    async function getDailyQuoteBgImage() {
        if (
            !window.navigator.userAgent.includes("Electron") ||
            typeof window.require !== "function"
        ) {
            if (dailyQuoteBgSelect === "remote") {
                dailyQuoteBgImageData = await getImage(dailyQuoteRemoteBg);
            }
        } else {
            if (dailyQuoteBgSelect === "remote") {
                dailyQuoteBgImageData = dailyQuoteRemoteBg;
            }
        }
    }

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
            } else if (parsedData.type === "countdown") {
                eventList = parsedData.data?.eventList || [
                    { name: "", date: "" },
                ];
                countdownStyle = parsedData.data?.countdownStyle || "list";
                countdownLocalBg = parsedData.data?.countdownLocalBg || null;
                countdownFullBg =
                    parsedData.data?.countdownFullBg || countdownFullBg;
                countdownFullBgSelect =
                    parsedData.data?.countdownFullBgSelect ||
                    countdownFullBgSelect;
                countdownFontSize =
                    parsedData.data?.countdownFontSize || countdownFontSize;
            } else if (parsedData.type === "weather") {
                customWeatherCity = parsedData.data?.city || "北京";
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

                await getTimeBGImage();

                // 初始化 Base64 数据
                morningBgImage = parsedData.data?.morningBgImage || "";
                afternoonBgImage = parsedData.data?.afternoonBgImage || "";
                nightBgImage = parsedData.data?.nightBgImage || "";

                timedateFontSize =
                    parsedData.data?.timedateFontSize || timedateFontSize;
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
                await getFocusBreakImage();

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
                await getDailyQuoteBgImage();
                dailyQuoteLocalBg = parsedData.data?.dailyQuoteLocalBg || "";
            } else if (parsedData.type === "visualChart") {
                visualChartType =
                    parsedData.data?.visualChartType || visualChartType;
            } else if (parsedData.type === "musicPlayer") {
                musicFolderPath = parsedData.data?.musicFolderPath || "";
                autoPlay = parsedData.data?.autoPlay || false;
            } else if (parsedData.type === "stikynot") {
                stikynotStyle = parsedData.data?.stikynotStyle || "";
            } else if (parsedData.type === "News") {
                NewsType = parsedData.data?.NewsType || NewsType;
            } else if (parsedData.type === "databaseChart") {
                databaseChartID =
                    parsedData.data?.databaseChartID || databaseChartID;
                if (databaseChartID) {
                    databaseChartInfo = await getDatabase(databaseChartID);
                    if (databaseChartInfo.length === 0) {
                        showMessage("查询数据库失败");
                    } else {
                        confirmDatabaseChartID = true;
                    }
                }
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
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "latest-docs"}
                    <!-- 最近文档设置区域 -->
                    <div class="content-panel latest-docs">
                        <div class="form-group group1">
                            <label for="latest-docs-title"
                                >组件标题：<input
                                    id="latest-docs-title"
                                    type="text"
                                    bind:value={latestDocsTitle}
                                    placeholder="输入组件标题"
                                /></label
                            >
                            <label for="latest-docs-prefix"
                                >文档前缀：<input
                                    id="latest-docs-prefix"
                                    type="text"
                                    bind:value={latestDocsPrefix}
                                    placeholder="输入文档前缀"
                                /></label
                            >
                        </div>
                        <div class="form-group group2">
                            <label for="doc-limit"
                                >显示条目数：<select
                                    id="doc-limit"
                                    bind:value={docLimit}
                                >
                                    {#each limitOptions as option}
                                        <option value={option}
                                            >{option} 条</option
                                        >
                                    {/each}
                                </select></label
                            >
                            <label>
                                <input
                                    type="checkbox"
                                    bind:checked={ensureOpenDocs}
                                />
                                包含打开文档
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    bind:checked={showLatestDocDetails}
                                />
                                显示文档信息
                            </label>
                        </div>
                        <div class="form-group doc-notebook-id">
                            <label for="doc-notebook-id">文档笔记本：</label>
                            <MultiSelect
                                id="doc-notebook-id"
                                bind:selected={selectedNotebookIds}
                                options={notebooks.map((notebook) => ({
                                    label: notebook.name,
                                    value: notebook.id,
                                }))}
                                placeholder="选择笔记本..."
                            />
                        </div>
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/G0S9wtMEqi5R4LkvRd7cTRVXnGf?from=from_copylink" target="_blank">最近文档</a></div>
                    </div>
                {:else if selectedContentType === "favorites"}
                    <div class="content-panel favorites">
                        <!-- 收藏文档设置区域 -->
                        <div class="favorites-setting-top">
                            <div>
                                <div class="form-group">
                                    <label for="favorities-title"
                                        >组件标题：
                                        <input
                                            id="favorities-title"
                                            type="text"
                                            bind:value={favoritiesTitle}
                                            placeholder="输入组件标题"
                                        />
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label for="favorities-doc-prefix">
                                        文档前缀：
                                        <input
                                            id="favorities-doc-prefix"
                                            type="text"
                                            bind:value={favoritiesDocPrefix}
                                        />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <div class="form-group">
                                    <label for="favorities-sort-order"
                                        >排序方式：</label
                                    >
                                    <select
                                        id="favorities-sort-order"
                                        bind:value={favoritiesSortOrder}
                                    >
                                        <option value="created">创建时间</option
                                        >
                                        <option value="updated">更新时间</option
                                        >
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="favorities-show-note-meta">
                                        <input
                                            id="favorities-show-note-meta"
                                            type="checkbox"
                                            bind:checked={showNoteMeta}
                                        />
                                        显示文档信息</label
                                    >
                                </div>
                            </div>
                        </div>
                        <div class="favorites-setting-bottom">
                            <div class="form-group doc-notebook-id">
                                <label for="doc-notebook-id">文档笔记本：</label
                                >
                                <MultiSelect
                                    id="doc-notebook-id"
                                    bind:selected={selectedFavoritesNotebookIds}
                                    options={notebooks.map((notebook) => ({
                                        label: notebook.name,
                                        value: notebook.id,
                                    }))}
                                    placeholder="选择笔记本..."
                                />
                            </div>
                        </div>
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/HCICwChqpi9Iglkw6nwcVuP1nsf?from=from_copylink" target="_blank">收藏文档</a></div>
                    </div>
                {:else if selectedContentType === "recent-journals"}
                    <div class="content-panel recent-journals">
                        <!-- 最近日记设置区域 -->
                        <div>
                            <label for="recentJournalsShowType"
                                >选择显示模式：</label
                            >
                            <select
                                id="recentJournalsShowType"
                                class="form-control"
                                bind:value={recentJournalsShowType}
                            >
                                <option value="list">列表模式</option>
                                <option value="calendar">日历模式</option>
                            </select>
                        </div>
                        {#if recentJournalsShowType === "list"}
                            <div class="form-group">
                                <label for="journal-limit">显示日记数：</label>
                                <select
                                    id="journal-limit"
                                    bind:value={docJournalLimit}
                                >
                                    {#each limitOptions as option}
                                        <option value={option}
                                            >{option}
                                        </option>
                                    {/each}
                                </select>
                            </div>
                        {/if}
                        {#if recentJournalsShowType === "calendar"}
                            <div class="form-group recent-journals-calendar">
                                <label for="recentJournalsCalendarIcon">
                                    日记图标：
                                    <input
                                        id="recentJournalsCalendarIcon"
                                        type="text"
                                        bind:value={recentJournalsCalendarIcon}
                                    />
                                </label>
                                <label for="recentJournalsCalendarIconSize">
                                    图标大小：
                                    <input
                                        id="recentJournalsCalendarIconSize"
                                        min="10"
                                        max="50"
                                        type="number"
                                        bind:value={
                                            recentJournalsCalendarIconSize
                                        }
                                    />
                                </label>
                            </div>
                        {/if}
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/JeWrwUDxmiPX5lk0XbZcHI1bn5g?from=from_copylink" target="_blank">最近日记</a></div>
                    </div>
                {:else if selectedContentType === "TaskMan"}
                    <div class="content-panel TaskMan">
                        <!-- 任务管理设置区域 -->
                        <div class="form-group">
                            <label for="TaskMan-title">
                                组件标题：
                                <input
                                    id="TaskMan-title"
                                    type="text"
                                    bind:value={TaskManTitle}
                                    placeholder="输入组件标题"
                                />
                            </label>
                        </div>
                        <div class="form-group TaskMan-checkbox">
                            <label>
                                <input
                                    type="checkbox"
                                    bind:checked={showCompletedTasks}
                                />
                                显示已完成的任务
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    bind:checked={showTasksDetails}
                                />
                                显示任务详情
                            </label>
                        </div>
                        <div class="form-group TaskMan-notebook-id">
                            <label for="TaskMan-notebook-id">任务笔记本：</label
                            >
                            <MultiSelect
                                id="TaskMan-notebook-id"
                                bind:selected={selectedTasksNotebookIds}
                                options={notebooks.map((notebook) => ({
                                    label: notebook.name,
                                    value: notebook.id,
                                }))}
                                placeholder="选择笔记本..."
                            />
                        </div>
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/T18vwmZeqinQW2kxoxccpYVHndf?from=from_copylink" target="_blank">任务管理</a></div>
                    </div>
                {:else if selectedContentType === "TaskManPlus"}
                    <div class="content-panel TaskManPlus">
                        <!-- 任务管理Plus设置区域 -->
                        <div class="form-group TaskManPlus-title">
                            <label for="TaskManPlus-title">
                                组件标题：
                                <input
                                    id="TaskManPlus-title"
                                    type="text"
                                    bind:value={TaskManPlusTitle}
                                    placeholder="输入组件标题"
                                />
                            </label>
                        </div>
                        <div class="form-group TaskManPlus-isCustomFilter">
                            <label for="TaskManPlus-isCustomFilter">
                                <input
                                    id="TaskManPlus-isCustomFilter"
                                    type="checkbox"
                                    bind:checked={isCustomFilter}
                                />
                                自定义筛选条件
                            </label>
                        </div>
                        {#if !isCustomFilter}
                            <div class="form-group TaskManPlus-taskFilter">
                                <label for="TaskManPlus-taskFilter"
                                    >筛选条件：<select
                                        id="TaskManPlus-internalFilter"
                                        bind:value={internalFilter}
                                    >
                                        <option value="all">所有任务</option>
                                        <option value="uncompleted"
                                            >未完成任务</option
                                        >
                                        <option value="completed"
                                            >已完成任务</option
                                        >
                                        <option value="today">今天任务</option>
                                        <option value="tomorrow"
                                            >明天任务</option
                                        >
                                        <option value="mostImportant"
                                            >❗❗❗❗任务</option
                                        >
                                    </select></label
                                >
                            </div>
                        {:else}
                            <div class="form-group TaskManPlus-customFilter">
                                <label for="TaskManPlus-customFilter"
                                    >筛选语法：<textarea
                                        id="TaskManPlus-customFilter"
                                        placeholder="输入筛选语法"
                                        bind:value={customFilter}
                                    ></textarea></label
                                >
                                <p>
                                    使用前请先了解<a
                                        href="https://ttl8ygt82u.feishu.cn/wiki/CCwfwq75Ziu8m5kQ0HXcnVbfnod?from=from_copylink"
                                        target="_blank">筛选语法</a
                                    >，并根据需求进行调整。
                                </p>
                            </div>
                        {/if}
                        <label for="tasks-sort">
                            排序方式：
                            <select id="tasks-sort" bind:value={tasksSort}>
                                <option value="startdate">开始日期</option>
                                <option value="deadline">截止日期</option>
                                <option value="priority">优先级❗</option>
                            </select>
                        </label>
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/CCwfwq75Ziu8m5kQ0HXcnVbfnod?from=from_copylink" target="_blank">任务管理Plus</a></div>
                    </div>
                {:else if selectedContentType === "quick-notes"}
                    <div class="content-panel quick-notes">
                        <div class="form-group quick-notes-title">
                            <label for="quick-notes-title"
                                >组件标题：
                                <input
                                    id="quick-notes-title"
                                    type="text"
                                    bind:value={quickNotesTitle}
                                    placeholder="输入组件标题"
                                />
                            </label>
                        </div>
                        <label for="quick-notes-sort"
                            >排序方式：
                            <select
                                id="quick-notes-sort"
                                bind:value={quickNotesSort}
                            >
                                <option value="DOC_ASC">文档正序</option>
                                <option value="DOC_INV">文档逆序</option>
                                <option value="UPD">更新时间</option>
                                <option value="CRE">创建时间</option>
                            </select>
                        </label>
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/XhZ7ww1PDimrZxkbxPqcvZrKnIb?from=from_copylink" target="_blank">快速笔记</a></div>
                    </div>
                {:else if selectedContentType === "stikynot"}
                    {#if advancedEnabled}
                        <div class="content-panel stikynot">
                            <div class="form-group stikynot-background">
                                <label for="stikynot-style">
                                    便签样式：
                                    <select
                                        name="stikynot-style"
                                        id="stikynot-style"
                                        bind:value={stikynotStyle}
                                    >
                                        <option value="default">默认</option>
                                        <option value="kraftPaper"
                                            >牛皮纸</option
                                        >
                                        <option value="wood">木纹</option>
                                        <option value="marble">大理石</option>
                                        <option value="Ink">水墨</option>
                                        <option value="beach">海滩</option>
                                        <option value="BlueSky">蓝天</option>
                                        <option value="sunsetHeart">夕阳</option
                                        >
                                        <option value="Stars">星空</option>
                                        <option value="waterDrop">雨窗</option>
                                        <option value="PinkPorcelain"
                                            >粉瓷</option
                                        >
                                    </select>
                                </label>
                            </div>
                        </div>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/Dmm6wkiPCi8sNzk1ju4cD14JnKy?from=from_copylink" target="_blank">便签</a></div>
                {:else if selectedContentType === "childDocs"}
                    {#if advancedEnabled}
                        <div class="content-panel childDocs">
                            <div class="form-group childDocs-title">
                                <label for="childDocs-title">
                                    组件标题：
                                    <input
                                        id="childDocs-title"
                                        type="text"
                                        bind:value={childDocsTitle}
                                        placeholder="输入组件标题"
                                    />
                                </label>
                            </div>
                            <div class="form-group childDocs-prefix">
                                <label for="childDocs-prefix">
                                    文档前缀：
                                    <input
                                        id="childDocs-prefix"
                                        type="text"
                                        bind:value={childDocsPrefix}
                                        placeholder="输入文档前缀"
                                    />
                                </label>
                                <label for="childDocs-sortOrder">
                                    排序方式：
                                    <select
                                        id="childDocs-sortOrder"
                                        bind:value={childDocsSortOrder}
                                    >
                                        <option value="updated">更新时间</option
                                        >
                                        <option value="created">创建时间</option
                                        >
                                    </select>
                                </label>
                                <label for="childDocs-showChildDocsDetails">
                                    显示详情：
                                    <input
                                        id="childDocs-showChildDocsDetails"
                                        type="checkbox"
                                        bind:checked={showChildDocsDetails}
                                    />
                                </label>
                            </div>
                            <div class="form-group childDocs-parentId">
                                <label for="childDocs-parentId">
                                    父文档ID：
                                    <input
                                        id="childDocs-parentId"
                                        type="text"
                                        bind:value={childDocsParentId}
                                        placeholder="输入父文档ID"
                                    />
                                </label>
                            </div>
                        </div>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/DAaIweKDBipUhbkGXOvcL6Q5nqh?from=from_copylink" target="_blank">子文档</a></div>
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
                    <div class="content-panel hot">
                        <div class="form-group">
                            <label for="hot-source">选择热搜平台：</label>
                            <select id="hot-source" bind:value={hotSource}>
                                {#each hotSources as source}
                                    <option value={source.value}
                                        >{source.label}</option
                                    >
                                {/each}
                            </select>
                        </div>
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/W7u5wQCEOibCxhkyA7mc5mDWnWh?from=from_copylink" target="_blank">热搜</a></div>
                        <p>注：若某一热搜来源失效请联系我更新~</p>
                    </div>
                {:else if selectedContentType === "dailyQuote"}
                    <div class="content-panel dailyQuote">
                        <div class="form-group dailyQuoteMode">
                            <label
                                >每日一言模式：<select
                                    bind:value={dailyQuoteMode}
                                >
                                    <option value="custom">自定义文字</option>
                                    <option value="remote">远程接口👑</option>
                                </select></label
                            >
                            <label for=""
                                >字体大小：<input
                                    type="number"
                                    bind:value={dailyQuoteFontSize}
                                /></label
                            >
                        </div>
                        {#if dailyQuoteMode === "remote"}
                            {#if advancedEnabled}
                                <label for=""
                                    >接口来源：<select
                                        bind:value={dailyQuoteSource}
                                    >
                                        <option value="classic">今日语录</option
                                        >
                                        <option value="celebrity"
                                            >名人名言</option
                                        >
                                        <option value="emotion">情感语录</option
                                        ><option value="gaoxiao"
                                            >搞笑语录</option
                                        ><option value="pyq">朋友圈语录</option
                                        ><option value="straybirdsZH"
                                            >飞鸟集（中文版）</option
                                        ><option value="straybirdsEN"
                                            >飞鸟集（英文版）</option
                                        ><option value="lovegarden"
                                            >爱情公寓语录</option
                                        ></select
                                    ></label
                                >
                            {:else}
                                <h3>👑会员专属权益👑</h3>
                            {/if}
                        {:else}
                            <label for=""
                                >自定义内容：（每句话一行）
                                <textarea
                                    name=""
                                    id=""
                                    cols="30"
                                    rows="10"
                                    bind:value={customDailyQuoteContent}
                                ></textarea>
                            </label>
                        {/if}
                        <div class="form-group dailyQuoteBackgroundImg">
                            <div class="type-select-and-input">
                                <label
                                    >背景设置：
                                    <select
                                        bind:value={dailyQuoteBgSelect}
                                        on:change={() => {
                                            if (
                                                dailyQuoteBgSelect === "remote"
                                            ) {
                                                dailyQuoteLocalBg = "";
                                            } else {
                                                dailyQuoteRemoteBg = "";
                                            }
                                        }}
                                    >
                                        <option value="remote">远程图片</option>
                                        <option value="local">本地图片</option>
                                    </select>
                                </label>
                                {#if dailyQuoteBgSelect === "remote"}
                                    <input
                                        type="text"
                                        bind:value={dailyQuoteRemoteBg}
                                        on:change={getDailyQuoteBgImage}
                                        placeholder="输入远程图片URL"
                                    />
                                {:else}
                                    <button
                                        on:click={() =>
                                            dailyQuoteBgInput?.click()}
                                        >上传图片</button
                                    >

                                    <input
                                        type="file"
                                        bind:this={dailyQuoteBgInput}
                                        accept="image/*"
                                        on:change={handleDailyQuoteUpload}
                                        style="display: none;"
                                    />
                                {/if}
                            </div>
                            <div class="image-preview">
                                {#if dailyQuoteBgSelect === "remote" && dailyQuoteBgImageData}
                                    <img
                                        src={dailyQuoteBgImageData}
                                        alt="每日一言背景预览"
                                    />
                                {:else if dailyQuoteBgSelect === "local" && dailyQuoteLocalBg}
                                    <img
                                        src={dailyQuoteLocalBg}
                                        alt="每日一言背景预览"
                                    />
                                {/if}
                            </div>
                        </div>
                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/QRVowj3azihjGukBoR5cmBKsnKg?from=from_copylink" target="_blank">每日一言</a></div>
                        <p>注：若某一接口失效请联系我更新~</p>
                    </div>
                {:else if selectedContentType === "News"}
                    {#if advancedEnabled}
                        <div class="content-panel News">
                            <div class="form-group News-type">
                                <label for="News-type">
                                    新闻类型：
                                    <select
                                        name="News-type"
                                        id="News-type"
                                        bind:value={NewsType}
                                    >
                                        <option value="daily-news-bulletin"
                                            >每日新闻快报</option
                                        >
                                        <option value="daily-news-bulletin-v2"
                                            >每日新闻快报v2</option
                                        >
                                        <option value="daily-news-bulletin-v3"
                                            >每日新闻快报v3</option
                                        >
                                        <option
                                            value="daily-news-bulletin-weather"
                                            >每日新闻快报+当地天气</option
                                        >
                                        <option value="daily-news-zhihu"
                                            >知乎日报</option
                                        >
                                    </select>
                                </label>
                            </div>
                        </div>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/FM0PwE2KVin6ytkQBuzca5pWnZf?from=from_copylink" target="_blank">新闻资讯</a></div>
                    <p>注：若某一接口失效请联系我更新~</p>
                {:else if selectedContentType === "constellation"}
                    {#if advancedEnabled}
                        <div class="content-panel constellation">
                            <h4>星座运势设置</h4>
                            <div class="form-group">
                                <label for="constellation">选择星座：</label>
                                <select
                                    id="constellation"
                                    bind:value={selectedConstellation}
                                >
                                    {#each constellations as constellation}
                                        <option value={constellation}
                                            >{constellation}</option
                                        >
                                    {/each}
                                </select>
                            </div>
                        </div>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/RqNUwkJaBiJwHHkFAc4cHmWenqb?from=from_copylink" target="_blank">星座运势</a></div>
                    <p>注：若某一接口失效请联系我更新~</p>
                {:else if selectedContentType === "historyDays"}
                    {#if advancedEnabled}
                        <label for="historyDaysType">
                            显示类型：
                            <select
                                id="historyDaysType"
                                bind:value={historyDaysType}
                            >
                                <option value="list">列表</option>
                                <option value="img">图片</option>
                            </select>
                        </label>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/SgHPwf76fiVlsnkxUNTcZ0ADnXg?from=from_copylink" target="_blank">历史上的今天</a></div>
                    <p>注：若接口失效请联系我更新~</p>
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
                    <option value="databaseChart">数据库图表👑</option>
                    <option value="statisticalCard">统计卡片👑</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "heatmap"}
                    <div class="content-panel heatmap">
                        <div class="form-group">
                            <label for="heatmap-title">热力图标题：</label>
                            <input
                                type="text"
                                id="heatmap-title"
                                bind:value={heatmapTitle}
                            />
                        </div>
                        <div class="form-group">
                            <label for="month-count">显示范围：</label>
                            <select
                                id="month-count"
                                bind:value={pastMonthCount}
                            >
                                {#each [1, 2, 3, 4, 5, 6] as month}
                                    <option value={month}
                                        >前 {month} 个月</option
                                    >
                                {/each}
                            </select>

                            <label for="show-label">
                                显示标签：
                                <input
                                    type="checkbox"
                                    id="show-label"
                                    bind:checked={showLabel}
                                />
                            </label>
                        </div>

                        <!-- 颜色选择 -->
                        <div class="form-group">
                            <label for="color-preset-select"
                                >选择区块颜色：</label
                            >
                            <select
                                id="color-preset-select"
                                bind:value={selectedColorPreset}
                            >
                                <option value="github">GitHub 绿色</option>
                                <option value="blue">蓝色</option>
                                <option value="custom">自定义颜色</option>
                            </select>
                        </div>

                        <!-- 自定义颜色选择器 -->
                        {#if selectedColorPreset === "custom"}
                            <div class="form-group">
                                <label for="custom-color-picker"
                                    >选择基础颜色：</label
                                >
                                <input
                                    id="custom-color-picker"
                                    type="color"
                                    bind:value={customColor}
                                />
                            </div>
                        {/if}

                        <div class="form-group">
                            <label for=""
                                >计数类型：<select
                                    bind:value={heatmapCountType}
                                >
                                    <option value="block">内容块</option>
                                    <option value="words">字数👑</option>
                                </select></label
                            >
                            {#if heatmapCountType === "words"}
                                <p>👑订阅会员专属</p>
                                <p>字数统计的块类型为：</p>
                                <p>
                                    段落块、标题块、列表块、代码块、公式块、引注块、表格块
                                </p>
                            {/if}
                        </div>

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/W2QjwU3DkiCMaok69yqcfV5knLc?from=from_copylink" target="_blank">热力图</a></div>
                    </div>
                {:else if selectedContentType === "sql"}
                    <div class="content-panel sql">
                        <div class="form-group">
                            <label for="sql-title">
                                组件标题：
                                <input
                                    id="sql-title"
                                    type="text"
                                    bind:value={sqlTitle}
                                />
                            </label>
                        </div>
                        <div class="form-group">
                            <label for="sql-input">SQL 语句：</label>
                            <textarea
                                id="sql-input"
                                bind:value={sqlInput}
                                placeholder="请输入 SQL 语句"
                            ></textarea>
                        </div>
                        <div class="form-group">
                            <label for="column-order">
                                列排序（逗号分隔）：
                                <input
                                    id="column-order"
                                    type="text"
                                    placeholder="例如：id,alias"
                                    bind:value={columnOrder}
                                />
                            </label>
                        </div>
                        <div class="form-group">
                            <label for="hidden-fields">
                                隐藏字段（逗号分隔）：
                                <input
                                    id="hidden-fields"
                                    type="text"
                                    placeholder="例如：alias,path"
                                    bind:value={hiddenFields}
                                />
                            </label>
                        </div>

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/QG5nw3GPkiKjk3kIG9lcYpzOn6g?from=from_copylink" target="_blank">SQL查询</a></div>
                    </div>
                {:else if selectedContentType === "visualChart"}
                    <div class="content-panel visualChart">
                        <div class="form-group">
                            <label for="">
                                图表类型：
                                <select bind:value={visualChartType}>
                                    <option value="progressBar">进度条</option>
                                    <option value="tagCloud">标签云图</option>
                                </select></label
                            >
                        </div>

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/M7FzwiwMQiNdKXkrIrucpOtenxb?from=from_copylink" target="_blank">可视化图表</a></div>
                    </div>
                {:else if selectedContentType === "databaseChart"}
                    {#if advancedEnabled}
                        <div class="content-panel databaseChart">
                            <div class="database-chart-ID">
                                <label for="">数据库ID： </label>
                                <input
                                    type="text"
                                    placeholder="请输入数据库ID"
                                    bind:value={databaseChartID}
                                    on:change={async () => {
                                        databaseChartInfo =
                                            await getDatabase(databaseChartID);

                                        if (databaseChartInfo.length === 0) {
                                            showMessage("❌查询数据库失败");
                                        } else {
                                            confirmDatabaseChartID = true;
                                            console.log(databaseChartInfo);
                                        }
                                    }}
                                />
                                {#if confirmDatabaseChartID}
                                    <span>✅数据库验证成功</span>
                                {:else}
                                    <span>❌数据库验证失败</span>
                                {/if}
                            </div>
                            <div class="database-chart-type">
                                <label for=""
                                    >图表类型：<select
                                        bind:value={databaseChartType}
                                    >
                                        <option value="line">折线图</option>
                                        <option value="bar">柱状图</option>
                                        <option value="pie">饼图</option>
                                        <option value="point">散点图</option>
                                    </select></label
                                >
                                <label for="">图表标题： </label>
                                <input
                                    type="text"
                                    placeholder="请输入图表标题"
                                    bind:value={databaseChartTitle}
                                />
                            </div>
                            {#if databaseChartType === "line"}
                                <div class="database-chart-line">
                                    <label for=""
                                        >数据类型：
                                        <select
                                            bind:value={databaseChartLineType}
                                        >
                                            <option value="XY">XY轴</option>
                                            <option value="count">数量</option>
                                        </select>
                                    </label>
                                    {#if databaseChartLineType === "XY"}
                                        <div class="database-chart-line-XY">
                                            <div class="database-chart-x-axis">
                                                <label for="">
                                                    X轴来源：
                                                    <select
                                                        bind:value={
                                                            databaseChartLineXAxisSource
                                                        }
                                                    >
                                                        {#each databaseChartInfo as column}
                                                            {#if column.type === "block" || column.type === "text" || column.type === "number" || column.type === "date" || column.type === "select" || column.type === "url" || column.type === "email" || column.type === "phone"}
                                                                <option
                                                                    value={column.id}
                                                                >
                                                                    {column.name}
                                                                    ({column.type})
                                                                </option>
                                                            {/if}
                                                        {/each}
                                                    </select>
                                                </label>
                                                <label for="">X轴标题：</label>
                                                <input
                                                    type="text"
                                                    placeholder="请输入X轴标题"
                                                    bind:value={
                                                        databaseChartLineXAxisTitle
                                                    }
                                                />
                                            </div>
                                            <div class="database-chart-y-axis">
                                                <label for="">
                                                    Y轴来源（多选）：
                                                    <div
                                                        class="multi-select-wrapper"
                                                    >
                                                        <select
                                                            multiple
                                                            bind:value={
                                                                databaseChartLineYAxisSource
                                                            }
                                                            size="2.5"
                                                            class="collapsed-multiselect"
                                                        >
                                                            {#each databaseChartInfo as column}
                                                                {#if column.type === "number"}
                                                                    <option
                                                                        value={column.id}
                                                                    >
                                                                        {column.name}
                                                                        ({column.type})
                                                                    </option>
                                                                {/if}
                                                            {/each}
                                                        </select>
                                                    </div>
                                                </label>
                                                <label for="">Y轴标题：</label>
                                                <input
                                                    type="text"
                                                    placeholder="请输入Y轴标题"
                                                    bind:value={
                                                        databaseChartLineYAxisTitle
                                                    }
                                                />
                                            </div>
                                        </div>
                                    {:else if databaseChartLineType === "count"}
                                        <div class="database-chart-count">
                                            <label for=""
                                                >统计列：
                                                <select
                                                    bind:value={
                                                        databaseChartLineCountColumn
                                                    }
                                                >
                                                    {#each databaseChartInfo as column}
                                                        {#if column.type === "block" || column.type === "text" || column.type === "number" || column.type === "date" || column.type === "select" || column.type === "url" || column.type === "email" || column.type === "phone"}
                                                            <option
                                                                value={column.id}
                                                            >
                                                                {column.name}
                                                                ({column.type})
                                                            </option>
                                                        {/if}
                                                    {/each}
                                                </select>
                                            </label>
                                            <div
                                                class="database-chart-count-axis"
                                            >
                                                <label for="">X轴标题： </label>
                                                <input
                                                    type="text"
                                                    bind:value={
                                                        databaseChartLineCountXAxisTitle
                                                    }
                                                />
                                                <label for="">Y轴标题： </label>
                                                <input
                                                    type="text"
                                                    bind:value={
                                                        databaseChartLineCountYAxisTitle
                                                    }
                                                />
                                            </div>
                                        </div>
                                    {/if}
                                    <div class="line-chart-style">
                                        <div class="line-chart-style-item">
                                            <label for=""
                                                >平滑曲线：<input
                                                    type="checkbox"
                                                    bind:checked={
                                                        databaseChartLineSmooth
                                                    }
                                                /></label
                                            >
                                            <label for=""
                                                >线条宽度：
                                                <input
                                                    type="number"
                                                    bind:value={
                                                        databaseChartLineWidth
                                                    }
                                                />
                                            </label>
                                            <label for=""
                                                >线条样式：
                                                <select
                                                    bind:value={
                                                        databaseChartLineStyle
                                                    }
                                                >
                                                    <option value="solid"
                                                        >实线</option
                                                    >
                                                    <option value="dashed"
                                                        >虚线</option
                                                    >
                                                    <option value="dotted"
                                                        >点线</option
                                                    >
                                                </select>
                                            </label>
                                        </div>

                                        <div class="line-chart-style-item">
                                            <label for=""
                                                >标记点：
                                                <select
                                                    bind:value={
                                                        databaseChartLineMarkPoint
                                                    }
                                                >
                                                    <option value="circle"
                                                        >圆点</option
                                                    >
                                                    <option value="rect"
                                                        >矩形</option
                                                    >
                                                    <option value="roundRect"
                                                        >圆角矩形</option
                                                    >
                                                    <option value="triangle"
                                                        >三角形</option
                                                    >
                                                    <option value="diamond"
                                                        >菱形</option
                                                    >
                                                    <option value="pin"
                                                        >大头针</option
                                                    >
                                                    <option value="arrow"
                                                        >箭头</option
                                                    >
                                                    <option value="none"
                                                        >无</option
                                                    >
                                                </select>
                                            </label>
                                            <label for=""
                                                >标记点大小：
                                                <input
                                                    type="number"
                                                    bind:value={
                                                        databaseChartLineMarkPointSize
                                                    }
                                                />
                                            </label>
                                        </div>
                                        <label for=""
                                            >排序方式：
                                            <select
                                                bind:value={
                                                    databaseChartLineCountSort
                                                }
                                            >
                                                <option value="none">无</option>
                                                <option value="asc">升序</option
                                                >
                                                <option value="desc"
                                                    >降序</option
                                                >
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            {:else if databaseChartType === "bar"}
                                <div>
                                    开发中……
                                </div>{:else if databaseChartType === "pie"}
                                <div>
                                    开发中……
                                </div>{:else if databaseChartType === "point"}
                                <div>开发中……</div>{/if}
                        </div>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/TVpYw7TRPiG6hRksrYKc7oBjnmd?from=from_copylink" target="_blank">数据库图表</a></div>
                    <p>组件开发中~</p>
                {:else if selectedContentType === "statisticalCard"}
                    {#if advancedEnabled}
                        <div class="content-panel statisticalCard">
                            <div class="form-group statisticalCardTitle">
                                <div>
                                    <label for="">标题：</label><input
                                        type="text"
                                        bind:value={statisticalCardTitle}
                                    />
                                </div>
                                <div>
                                    <label for=""
                                        >标题大小：<input
                                            type="number"
                                            bind:value={
                                                statisticalCardTitleSize
                                            }
                                        /></label
                                    >
                                    <label for=""
                                        >标题颜色：<input
                                            type="color"
                                            bind:value={
                                                statisticalCardTitleColor
                                            }
                                        /></label
                                    >
                                </div>
                            </div>
                            <div class="form-group statisticalCardContent">
                                <label for=""
                                    >统计内容：<select
                                        name=""
                                        id=""
                                        bind:value={statisticalCardContent}
                                    >
                                        <option value="notebooksCount"
                                            >笔记本数</option
                                        >
                                        <option value="docsCount">文档数</option
                                        >
                                        <option value="blocksCount">块数</option
                                        >
                                        <option value="wordsCount">字数</option>
                                        <option value="tasksCount"
                                            >任务数</option
                                        >
                                        <option value="doneTasksCount"
                                            >已完成任务数</option
                                        >
                                        <option value="undoneTasksCount"
                                            >未完成任务数</option
                                        >
                                        <option value="dailynotesCount"
                                            >日记数</option
                                        >
                                        <option value="tagsCount">标签数</option
                                        >
                                        <option value="citationCount"
                                            >引述数</option
                                        >
                                        <option value="codeBlocksCount"
                                            >代码数</option
                                        >
                                        <option value="mathBlocksCount"
                                            >公式数</option
                                        >
                                        <option value="customSQLCount"
                                            >SQL 查询结果数</option
                                        >
                                    </select></label
                                >
                                <div>
                                    <label for=""
                                        >数字大小：<input
                                            type="number"
                                            bind:value={
                                                statisticalCardCountSize
                                            }
                                        /></label
                                    >
                                    <label for=""
                                        >数字颜色：<input
                                            type="color"
                                            bind:value={
                                                statisticalCardCountColor
                                            }
                                        /></label
                                    >
                                </div>
                            </div>
                            {#if statisticalCardContent === "customSQLCount"}
                                <div class="form-group">
                                    <label for=""
                                        >自定义 SQL 查询：<textarea
                                            bind:value={customSQLCount}
                                        /></label
                                    >
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/B8kGwSDdui3vy3kz55EcJkVHnHD?from=from_copylink" target="_blank">统计卡片</a></div>
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
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "countdown"}
                    <div class="content-panel countdown">
                        <div class="form-group">
                            <label for="countdown-style">选择显示方式：</label>
                            <select
                                id="countdown-style"
                                bind:value={countdownStyle}
                            >
                                <option value="list">列表</option>
                                <option value="full">整页</option>
                            </select>
                        </div>
                        {#if countdownStyle === "full"}
                            <div class="form-group">
                                <label
                                    >背景设置：
                                    <select bind:value={countdownFullBgSelect}>
                                        <option value="remote">远程图片</option>
                                        <option value="local">本地图片</option>
                                    </select>
                                </label>
                                {#if countdownFullBgSelect === "remote"}
                                    <input
                                        type="text"
                                        bind:value={countdownFullBg}
                                        placeholder="输入远程图片URL"
                                    />
                                {:else}
                                    <button
                                        on:click={() =>
                                            countdownBgInput?.click()}
                                        >上传图片</button
                                    >
                                    <input
                                        type="file"
                                        bind:this={countdownBgInput}
                                        accept="image/*"
                                        on:change={handleCountdownUpload}
                                        style="display: none;"
                                    />
                                    <span>无预览直接确认</span>
                                {/if}
                            </div>
                            <div class="form-group">
                                <label>
                                    字体大小：
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        bind:value={countdownFontSize}
                                        placeholder="例如：3"
                                    />
                                </label>
                            </div>
                        {/if}
                        <div class="countdown-grid">
                            {#each eventList as event, index}
                                <div
                                    class="event-form-group"
                                    data-index={index}
                                >
                                    <div class="form-group">
                                        <label for="event-name-{index}"
                                            >名称：</label
                                        >
                                        <input
                                            id="event-name-{index}"
                                            type="text"
                                            bind:value={event.name}
                                            placeholder="例如：纪念日"
                                        />
                                        <button
                                            class="remove-event"
                                            title="删除"
                                            on:click={() => removeEvent(index)}
                                            style="margin-top: 0.5rem;"
                                        >
                                            🗑
                                        </button>
                                    </div>

                                    <div class="form-group">
                                        <label for="event-date-{index}"
                                            >日期：</label
                                        >
                                        <input
                                            id="event-date-{index}"
                                            class="date-input"
                                            type="date"
                                            bind:value={event.date}
                                        />
                                    </div>
                                </div>
                            {/each}
                        </div>
                        <button
                            class="add-event-btn"
                            style="margin: 1rem;"
                            on:click={() => addEvent()}>➕ 添加</button
                        >

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/KjYew1TbViBCIQkmsbBcBO6vnOd?from=from_copylink" target="_blank">倒数日</a></div>
                    </div>
                {:else if selectedContentType === "weather"}
                    <div class="content-panel weather">
                        <div class="form-group">
                            <label for="weather-city">城市名称：</label>
                            <input
                                id="weather-city"
                                type="text"
                                bind:value={customWeatherCity}
                                placeholder="例如：北京"
                            />

                            <hr>
                            <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/ER44wITRDi0m8okvcsGcxtZInix?from=from_copylink" target="_blank">今日天气</a></div>
                        </div>
                    </div>
                {:else if selectedContentType === "timedate"}
                    <div class="content-panel timedate">
                        <div
                            class="form-group"
                            style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;"
                        >
                            <label
                                ><input
                                    type="checkbox"
                                    bind:checked={showSeconds}
                                /> 显示秒数</label
                            >
                            <label
                                ><input
                                    type="checkbox"
                                    bind:checked={showDate}
                                /> 显示日期</label
                            >
                            <label
                                ><input
                                    type="checkbox"
                                    bind:checked={showWeek}
                                /> 显示星期</label
                            >
                            <label
                                ><input
                                    type="checkbox"
                                    bind:checked={showLunar}
                                /> 显示农历</label
                            >
                            <label
                                ><input
                                    type="checkbox"
                                    bind:checked={showZodiac}
                                /> 显示生肖</label
                            >
                            <label
                                ><input
                                    type="checkbox"
                                    bind:checked={showSolarTerm}
                                /> 显示节气</label
                            >
                        </div>

                        <div class="form-group">
                            {#if showDate}
                                <label for="dateFormat">日期格式：</label>
                                <select id="dateFormat" bind:value={dateFormat}>
                                    <option value="YYYY年MM月DD日"
                                        >YYYY年MM月DD日</option
                                    >
                                    <option value="YYYY-MM-DD"
                                        >YYYY-MM-DD</option
                                    >
                                    <option value="YYYY/MM/DD"
                                        >YYYY/MM/DD</option
                                    >
                                    <option value="YYYY.MM.DD"
                                        >YYYY.MM.DD</option
                                    >
                                </select>
                            {/if}
                            <label for="timedate-fontSize">
                                字体大小：
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    bind:value={timedateFontSize}
                                    placeholder="例如：3"
                                />
                            </label>
                        </div>

                        <!-- 隐藏的文件输入 -->
                        <input
                            type="file"
                            bind:this={morningBgInput}
                            accept="image/*"
                            on:change={() => handleBackgroundUpload("morning")}
                            style="display: none;"
                        />
                        <input
                            type="file"
                            bind:this={afternoonBgInput}
                            accept="image/*"
                            on:change={() =>
                                handleBackgroundUpload("afternoon")}
                            style="display: none;"
                        />
                        <input
                            type="file"
                            bind:this={nightBgInput}
                            accept="image/*"
                            on:change={() => handleBackgroundUpload("night")}
                            style="display: none;"
                        />

                        <div class="form-group">
                            <h5>背景图片设置</h5>

                            <!-- 早晨 -->
                            <div class="background-option">
                                <div class="background-row">
                                    <!-- 左侧配置 -->
                                    <div class="type-select-and-input">
                                        <label for="morning-bg-select"
                                            >早晨：（6点 ~ 12点）</label
                                        >
                                        <div class="type-select">
                                            <select
                                                id="morning-bg-select"
                                                bind:value={morningImageType}
                                            >
                                                <option value="remote"
                                                    >远程图片</option
                                                >
                                                <option value="local"
                                                    >本地图片</option
                                                >
                                            </select>
                                        </div>

                                        {#if morningImageType === "remote"}
                                            <input
                                                type="text"
                                                bind:value={morningBgUrl}
                                                on:change={async () => {
                                                    await getTimeBGImage();
                                                }}
                                                placeholder="请输入早晨背景图URL"
                                            />
                                        {:else}
                                            <button
                                                on:click={() =>
                                                    morningBgInput.click()}
                                                >上传图片</button
                                            >
                                            <input
                                                type="file"
                                                bind:this={morningBgInput}
                                                accept="image/*"
                                                on:change={() =>
                                                    handleBackgroundUpload(
                                                        "morning",
                                                    )}
                                                style="display: none;"
                                            />
                                        {/if}
                                    </div>

                                    <!-- 右侧预览 -->
                                    <div class="image-preview">
                                        {#if morningImageType === "remote" && morningBgUrl}
                                            <img
                                                src={morningBgImageData}
                                                alt="早晨预览"
                                            />
                                        {:else if morningImageType === "local" && morningBgImage}
                                            <img
                                                src={morningBgImage}
                                                alt="早晨预览"
                                            />
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- 中午 -->
                            <div class="background-option">
                                <div class="background-row">
                                    <!-- 左侧配置 -->
                                    <div class="type-select-and-input">
                                        <label for="afternoon-bg-select"
                                            >中午：（12点 ~ 18点）</label
                                        >
                                        <div class="type-select">
                                            <select
                                                id="afternoon-bg-select"
                                                bind:value={afternoonImageType}
                                            >
                                                <option value="remote"
                                                    >远程图片</option
                                                >
                                                <option value="local"
                                                    >本地图片</option
                                                >
                                            </select>
                                        </div>

                                        {#if afternoonImageType === "remote"}
                                            <input
                                                type="text"
                                                bind:value={afternoonBgUrl}
                                                on:change={async () => {
                                                    await getTimeBGImage();
                                                }}
                                                placeholder="请输入中午背景图URL"
                                            />
                                        {:else}
                                            <button
                                                on:click={() =>
                                                    afternoonBgInput.click()}
                                                >上传图片</button
                                            >
                                            <input
                                                type="file"
                                                bind:this={afternoonBgInput}
                                                accept="image/*"
                                                on:change={() =>
                                                    handleBackgroundUpload(
                                                        "afternoon",
                                                    )}
                                                style="display: none;"
                                            />
                                        {/if}
                                    </div>

                                    <!-- 右侧预览 -->
                                    <div class="image-preview">
                                        {#if afternoonImageType === "remote" && afternoonBgUrl}
                                            <img
                                                src={afternoonBgImageData}
                                                alt="中午预览"
                                            />
                                        {:else if afternoonImageType === "local" && afternoonBgImage}
                                            <img
                                                src={afternoonBgImage}
                                                alt="中午预览"
                                            />
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- 晚上 -->
                            <div class="background-option">
                                <div class="background-row">
                                    <!-- 左侧配置 -->
                                    <div class="type-select-and-input">
                                        <label for="night-bg-select"
                                            >晚上：（18点 ~ 6点）</label
                                        >
                                        <div class="type-select">
                                            <select
                                                id="night-bg-select"
                                                bind:value={nightImageType}
                                            >
                                                <option value="remote"
                                                    >远程图片</option
                                                >
                                                <option value="local"
                                                    >本地图片</option
                                                >
                                            </select>
                                        </div>

                                        {#if nightImageType === "remote"}
                                            <input
                                                type="text"
                                                bind:value={nightBgUrl}
                                                on:change={async () => {
                                                    await getTimeBGImage();
                                                }}
                                                placeholder="请输入晚上背景图URL"
                                            />
                                        {:else}
                                            <button
                                                on:click={() =>
                                                    nightBgInput.click()}
                                                >上传图片</button
                                            >
                                            <input
                                                type="file"
                                                bind:this={nightBgInput}
                                                accept="image/*"
                                                on:change={() =>
                                                    handleBackgroundUpload(
                                                        "night",
                                                    )}
                                                style="display: none;"
                                            />
                                        {/if}
                                    </div>

                                    <!-- 右侧预览 -->
                                    <div class="image-preview">
                                        {#if nightImageType === "remote" && nightBgUrl}
                                            <img
                                                src={nightBgImageData}
                                                alt="晚上预览"
                                            />
                                        {:else if nightImageType === "local" && nightBgImage}
                                            <img
                                                src={nightBgImage}
                                                alt="晚上预览"
                                            />
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/NlvZweO3LiUA2XkC2escjktKnXg?from=from_copylink" target="_blank">时钟</a></div>
                    </div>
                {:else if selectedContentType === "focus"}
                    <div class="content-panel focus">
                        <!-- 隐藏输入框 -->
                        <input
                            type="file"
                            bind:this={focusBgInput}
                            accept="image/*"
                            on:change={handleFocusUpload}
                            style="display: none;"
                        />
                        <input
                            type="file"
                            bind:this={breakBgInput}
                            accept="image/*"
                            on:change={handleBreakUpload}
                            style="display: none;"
                        />
                        <div class="form-group">
                            <h5>背景图片设置</h5>
                            <!-- 专注背景 -->
                            <div class="background-option">
                                <div class="background-row">
                                    <!-- 左侧配置 -->
                                    <div class="type-select-and-input">
                                        <label for="focus-bg-select"
                                            >专注背景：</label
                                        >
                                        <div class="type-select">
                                            <select
                                                id="focus-bg-select"
                                                bind:value={focusImageType}
                                            >
                                                <option value="remote"
                                                    >远程图片</option
                                                >
                                                <option value="local"
                                                    >本地图片</option
                                                >
                                            </select>
                                        </div>

                                        {#if focusImageType === "remote"}
                                            <input
                                                type="text"
                                                bind:value={focusBgImage}
                                                on:change={async () => {
                                                    await getFocusBreakImage();
                                                }}
                                                placeholder="请输入专注背景图URL"
                                            />
                                        {:else}
                                            <button
                                                on:click={() =>
                                                    focusBgInput.click()}
                                                >上传图片</button
                                            >
                                        {/if}
                                    </div>

                                    <!-- 右侧预览 -->
                                    <div class="image-preview">
                                        {#if focusImageType === "remote" && focusBgImage}
                                            <img
                                                src={focusBgImageData}
                                                alt="专注背景预览"
                                            />
                                        {:else if focusImageType === "local" && focusLocalImage}
                                            <img
                                                src={focusLocalImage}
                                                alt="专注背景预览"
                                            />
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- 休息背景 -->
                            <div class="background-option">
                                <div class="background-row">
                                    <!-- 左侧配置 -->
                                    <div class="type-select-and-input">
                                        <label for="break-bg-select"
                                            >休息背景：</label
                                        >
                                        <div class="type-select">
                                            <select
                                                id="break-bg-select"
                                                bind:value={breakImageType}
                                            >
                                                <option value="remote"
                                                    >远程图片</option
                                                >
                                                <option value="local"
                                                    >本地图片</option
                                                >
                                            </select>
                                        </div>

                                        {#if breakImageType === "remote"}
                                            <input
                                                type="text"
                                                bind:value={breakBgImage}
                                                on:change={async () => {
                                                    await getFocusBreakImage();
                                                }}
                                                placeholder="请输入休息背景图URL"
                                            />
                                        {:else}
                                            <button
                                                on:click={() =>
                                                    breakBgInput.click()}
                                                >上传图片</button
                                            >
                                        {/if}
                                    </div>

                                    <!-- 右侧预览 -->
                                    <div class="image-preview">
                                        {#if breakImageType === "remote" && breakBgImage}
                                            <img
                                                src={breakBgImageData}
                                                alt="休息背景预览"
                                            />
                                        {:else if breakImageType === "local" && breakLocalImage}
                                            <img
                                                src={breakLocalImage}
                                                alt="休息背景预览"
                                            />
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/R1KPw7ZqNi4iVJkjGdhcVYmtnkd?from=from_copylink" target="_blank">番茄钟</a></div>
                    </div>
                {:else if selectedContentType === "musicPlayer"}
                    {#if advancedEnabled}
                        <div class="content-panel musicPlayer">
                            <label class="folder-select-label">
                                <span>音乐路径：</span>
                                <input
                                    type="text"
                                    bind:value={musicFolderPath}
                                    placeholder="请选择音乐文件夹"
                                />
                                <button
                                    title="选择音乐文件夹"
                                    on:click={selectMusicFolder}>📁</button
                                >
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    bind:checked={autoPlay}
                                />
                                自动播放
                            </label>
                        </div>
                    {:else}
                        <h3>👑会员专属权益👑</h3>
                    {/if}
                    <hr>
                    <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/GJQNwPxiBiRGYAkbJxMcCHTanag?from=from_copylink" target="_blank">音乐播放器</a></div>
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
                    <div class="content-panel custom-text">
                        <h4>自定义文字内容</h4>
                        <textarea
                            placeholder="在这里输入你想要显示的自定义文字内容，以 Markdown
                            格式编写..."
                            bind:value={customTextInputValue}
                        ></textarea>

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/DkJnwuWzuipxpgkcTKZcEyaMnHf?from=from_copylink" target="_blank">自定义文字</a></div>
                    </div>
                {:else if selectedContentType === "custom-web"}
                    <div class="content-panel custom-web">
                        <p>输入要显示的网页地址：</p>
                        <div class="form-group">
                            <label for="custom-web-url">网页地址：</label>
                            <input
                                id="custom-web-url"
                                type="text"
                                bind:value={customWebUrl}
                                placeholder="https://example.com"
                            />
                        </div>

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/Tk3mwYwMTiQrpSkkzQpcPsdGnUd?from=from_copylink" target="_blank">网页浏览器</a></div>
                    </div>
                {:else if selectedContentType === "custom-protyle"}
                    <div class="content-panel custom-protyle">
                        <div class="form-group">
                            <label for="">
                                <input
                                    type="checkbox"
                                    bind:checked={isRandomDoc}
                                />
                                随机漫游文档
                            </label>
                        </div>
                        {#if !isRandomDoc}
                            <div class="form-group">
                                <label for="protyle-block-id"
                                    >输入想要显示的文档块 ID：</label
                                >
                                <input
                                    id="protyle-block-id"
                                    type="text"
                                    bind:value={customBlockID}
                                    placeholder="例如：20250310094404-1yla4zz"
                                />
                            </div>
                        {/if}

                        <hr>
                        <div>组件说明：<a href="https://ttl8ygt82u.feishu.cn/wiki/XQV7wtEtsihu2IkbYpWcOWSunKf?from=from_copylink" target="_blank">文档编辑器</a></div>
                    </div>
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

                if (countdownFullBgSelect === "remote") countdownLocalBg = null;

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
                            countdownFontSize,
                            countdownStyle,
                            countdownLocalBg,
                            countdownFullBg,
                            countdownFullBgSelect,
                            eventList: eventList.filter(
                                (event) => event.name && event.date,
                            ),
                        },
                    };
                } else if (selectedContentType === "weather") {
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "weather",
                        blockId: currentBlockId,
                        data: {
                            city: customWeatherCity,
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
                }

                onConfirm(JSON.stringify(contentTypeJson));
            }}
        >
            ✔ 确定
        </button>
        <button class="cancel-button" on:click={onClose}>❌ 取消</button>
    </div>
</div>
