<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { lsNotebooks } from "@/api";
    import {
        getMobileWidgetActiveTab,
        getMobileWidgetLabel,
    } from "./mobile-widget-categories";
    import {
        collectCountdownLegacyEventsFromWidgets,
        loadCountdownEvents,
        mergeCountdownEvents,
        saveCountdownEvents,
        type CountdownEventInput,
    } from "../../components/utils/widgetBlock/widget/countdown/countdownData";
    import {
        resolveDatabaseIdFromExistingWidgets,
        syncDatabaseIdToSameTypeWidgets,
        type DatabaseWidgetType,
    } from "../../components/utils/widgetBlock/widget/sharedDatabaseId";

    interface Props {
        plugin: any;
        currentBlockId: string;
        widgetType: string;
        onClose: () => void;
        onConfirm: (contentTypeJson: string) => void | Promise<void>;
    }

    interface Notebook {
        id: string;
        name: string;
    }

    interface WidgetConfig {
        activeTab?: string;
        type?: string;
        blockId?: string;
        data?: any;
    }

    type FieldType =
        | "text"
        | "textarea"
        | "number"
        | "select"
        | "switch"
        | "color"
        | "notebooks"
        | "info";

    interface FieldOption {
        value: string | number;
        label: string;
    }

    interface MobileField {
        key: string;
        type: FieldType;
        label: string;
        description?: string;
        placeholder?: string;
        options?: FieldOption[];
        min?: number;
        max?: number;
        step?: number;
        rows?: number;
    }

    type FormState = Record<string, any>;
    type CountdownEventForm = CountdownEventInput & {
        name: string;
        date: string;
        anniversary: boolean;
    };

    let { plugin, currentBlockId, widgetType, onClose, onConfirm }: Props = $props();

    let form = $state<FormState>({});
    let notebooks = $state<Notebook[]>([]);
    let existingConfig = $state<WidgetConfig | null>(null);
    let isReady = $state(false);
    let isSaving = $state(false);
    let countdownEvents = $state<CountdownEventForm[]>([
        { name: "", date: "", anniversary: false },
    ]);

    const title = $derived(getMobileWidgetLabel(widgetType));
    const fields = $derived(getFields(widgetType, form));

    const defaultBackgrounds = {
        countdownCard1:
            "https://haowallpaper.com/link/common/file/previewFileImg/16665839129185664",
        dailyQuote:
            "https://haowallpaper.com/link/common/file/previewFileImg/17169460970507648",
        timedateMorning:
            "https://haowallpaper.com/link/common/file/previewFileImg/16637944029171072",
        timedateAfternoon:
            "https://haowallpaper.com/link/common/file/previewFileImg/16989237330693504",
        timedateNight:
            "https://haowallpaper.com/link/common/file/previewFileImg/15477811848581440",
        simple2:
            "https://haowallpaper.com/link/common/file/previewFileImg/17882739641666944",
        focus:
            "https://haowallpaper.com/link/common/file/previewFileImg/15063728140422464",
        focusBreak:
            "https://haowallpaper.com/link/common/file/previewFileImg/019ba092d7bb53bcacfdb5a626cbff0d019ba092d7bb53bcacfdb5a626cbff0d",
    };

    const databaseWidgetFields: Record<
        string,
        { type: DatabaseWidgetType; field: string }
    > = {
        countdown: { type: "countdown", field: "countdownDatabaseId" },
        focus: { type: "focus", field: "focusDatabaseId" },
        CYBMOK: { type: "CYBMOK", field: "CYBMOKDatabaseId" },
        fixedAssets: { type: "fixedAssets", field: "fixedAssetsDatabaseId" },
        reviewDocs: { type: "reviewDocs", field: "reviewDocsDatabaseId" },
    };

    function parseWidgetConfig(raw: any): WidgetConfig | null {
        if (!raw) return null;
        if (typeof raw !== "string") return raw;
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn("[mobile content form] 无法解析组件配置", error);
            return null;
        }
    }

    function getMatchingData(config: WidgetConfig | null = existingConfig): any {
        if (!config || config.type !== widgetType) return {};
        const data = config.data;
        if (Array.isArray(data)) return data[0] || {};
        if (data && typeof data === "object") return data;
        return {};
    }

    function normalizeString(value: unknown, fallback = ""): string {
        return typeof value === "string" ? value : fallback;
    }

    function normalizeNumber(value: unknown, fallback: number): number {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    }

    function normalizeBoolean(value: unknown, fallback: boolean): boolean {
        return typeof value === "boolean" ? value : fallback;
    }

    function createDefaultForm(type: string): FormState {
        const defaults: Record<string, FormState> = {
            "latest-docs": {
                latestDocsTitle: "🕒最近文档",
                latestDocsPrefix: "📄",
                limit: 5,
                docNotebookId: "",
                ensureOpenDocs: false,
                useBuiltinDocIcon: false,
                showLatestDocDetails: true,
            },
            favorites: {
                favoritiesTitle: "💖收藏文档",
                favoritiesDocPrefix: "❤",
                favoritiesSortOrder: "created",
                favoritesNotebookId: "",
                showNoteMeta: true,
                useBuiltinDocIcon: false,
            },
            "recent-journals": {
                limit: 5,
                recentJournalsShowType: "list",
                recentJournalsCalendarIcon: "📝",
                recentJournalsCalendarIconSize: 16,
                useBuiltinDocIcon: false,
            },
            childDocs: {
                childDocsTitle: "📄子文档",
                childDocsPrefix: "📄",
                childDocsParentId: "",
                childDocsSortOrder: "updated",
                showChildDocsDetails: true,
                useBuiltinDocIcon: false,
            },
            conditionDocs: {
                conditionDocsTitle: "📄条件文档",
                conditionDocsCondition: "keyword",
                conditionDocsKeyPosition: "anywhere",
                conditionDocsKeyWord: "",
                conditionDocsTag: "",
                conditionDocsSortOrder: "updated",
                useBuiltinDocIcon: false,
            },
            reviewDocs: {
                reviewDocsTitle: "📚复习文档",
                reviewDocsDatabaseId: "",
                reviewDocsLimit: 20,
                reviewDocsDefaultView: "due",
                reviewDocsShowFuture: true,
                reviewDocsFutureDays: 7,
                reviewDocsShowDocs: true,
                reviewDocsShowBlocks: true,
                reviewDocsShowNote: true,
                reviewDocsShowPath: true,
                reviewDocsShowStats: true,
                reviewDocsSortBy: "dueAsc",
                reviewDocsDefaultIntervals: "0,1,2,4,7,15,30,60",
            },
            TaskMan: {
                TaskManTitle: "📋任务管理",
                tasksNotebookId: "",
                showCompletedTasks: true,
                showTasksDetails: true,
            },
            TaskManPlus: {
                TaskManPlusTitle: "📋任务管理Plus",
                isCustomFilter: false,
                internalFilter: "all",
                customFilter: "",
                tasksSort: "startdate",
            },
            "quick-notes": {
                quickNotesTitle: "快速笔记",
                quickNotesSort: "DOC_ASC",
            },
            countdown: {
                countdownStyle: "list1",
                countdownDatabaseId: "",
                countdownCard1BgSelect: "remote",
                countdownCard1RemoteBg: defaultBackgrounds.countdownCard1,
                countdownCard1LocalBg: "",
                countdownCard2BgColor: "#000000",
                countdownList2BgColor: "#000000",
            },
            countdownTimer: {
                advancedEnabled: false,
                countdownTimerStyle: "default",
            },
            heatmap: {
                timeRangeType: "past",
                heatmapTitle: "创作热力图",
                pastMonthCount: 6,
                showLabel: true,
                selectedColorPreset: "github",
                customColor: "#1ea769",
                heatmapCountType: "block",
            },
            visualChart: {
                visualChartType: "progressBar",
            },
            databaseChart: {
                databaseChartID: "",
                databaseChartType: "line",
                databaseChartTitle: "",
                databaseChartLineType: "XY",
                databaseChartLineXAxisSource: "",
                databaseChartLineXAxisTitle: "",
                databaseChartLineYAxisSourceText: "",
                databaseChartLineYAxisTitle: "",
                databaseChartLineCountColumn: "",
                databaseChartLineCountXAxisTitle: "",
                databaseChartLineCountYAxisTitle: "",
                databaseChartLineSmooth: false,
                databaseChartLineCountSort: "none",
                databaseChartLineMarkPoint: "circle",
                databaseChartLineMarkPointSize: 8,
                databaseChartLineStyle: "solid",
                databaseChartLineWidth: 2,
            },
            sql: {
                sqlTitle: "SQL 查询结果",
                sqlInput: "",
                columnOrder: "",
                hiddenFields: "",
            },
            statisticalCard: {
                statisticalCardTitle: "统计卡片",
                statisticalCardTitleSize: 1,
                statisticalCardTitleColor: "#000000",
                statisticalCardContent: "notebooksCount",
                statisticalCardCountSize: 2,
                statisticalCardCountColor: "#000000",
                customSQLCount: "",
            },
            timedate: {
                timeType: "classic",
                showSeconds: true,
                dateFormat: "YYYY年MM月DD日",
                showLunar: true,
                showZodiac: true,
                showSolarTerm: true,
                showWeek: true,
                showDate: true,
                morningImageType: "remote",
                afternoonImageType: "remote",
                nightImageType: "remote",
                morningBgUrl: defaultBackgrounds.timedateMorning,
                afternoonBgUrl: defaultBackgrounds.timedateAfternoon,
                nightBgUrl: defaultBackgrounds.timedateNight,
                morningBgImage: null,
                afternoonBgImage: null,
                nightBgImage: null,
                timedateFontSize: 3,
                simple1Size: 3,
                simple1FontWeight: 4,
                simple1ShowSecond: true,
                simple1ShowDate: true,
                simple2BgSelect: "remote",
                simple2RemoteBg: defaultBackgrounds.simple2,
                simple2LocalBg: "",
                dial1ShowSecond: true,
                dial1ShowMarkers: true,
                dial1ShowDate: true,
                dial2ShowSecond: true,
                dial2ShowMarkers: true,
                dial2ShowDate: true,
                dial3ShowSecond: true,
                dial4ShowSecond: true,
                dial5ShowSecond: true,
                dial6ShowSecond: true,
                dial7ShowSecond: true,
                dial8ShowSecond: true,
                dial9ShowSecond: true,
            },
            dailyQuote: {
                dailyQuoteMode: "custom",
                customDailyQuoteContent: "",
                dailyQuoteSource: "classic",
                dailyQuoteFontSize: 1,
                dailyQuoteBgSelect: "remote",
                dailyQuoteRemoteBg: defaultBackgrounds.dailyQuote,
                dailyQuoteLocalBg: "",
            },
            weather: {
                cityName: "",
                cityCode: "",
                weatherStyle: "default",
            },
            HOT: {
                source: "bilibili",
            },
            "custom-text": {
                customText: "",
            },
            "custom-web": {
                url: "",
            },
            "custom-protyle": {
                isRandomDoc: false,
                customBlockId: "",
            },
            focus: {
                focusImageType: "remote",
                focusBgImage: defaultBackgrounds.focus,
                focusLocalImage: null,
                breakImageType: "remote",
                breakBgImage: defaultBackgrounds.focusBreak,
                breakLocalImage: null,
                focusDatabaseId: "",
            },
            musicPlayer: {
                musicFolderPath: "",
                autoPlay: false,
            },
            almanac: {
                almanacStyle: "classic",
            },
            stikynot: {
                stikynotStyle: "default",
            },
            News: {
                NewsType: "daily-news-bulletin",
            },
            constellation: {
                selectedConstellation: "摩羯",
            },
            historyDays: {
                historyDaysType: "list",
            },
            PicCaro: {
                PicFolderPath: "",
                PicAutoPlay: false,
                PicInterval: 3,
                PicNavigation: false,
                PicPagination: false,
                PicPaginationType: "bullets",
                PicPaginationDyBu: false,
                PicPaginationPrOp: false,
                PicEffect: "slide",
                PicSlidesPerView: "1",
                PicRandomSwitch: false,
            },
            CYBMOK: {
                CMKnockSound: "普通",
                CYBMOKDatabaseId: "",
            },
            fixedAssets: {
                fixedAssetsTitle: "固定资产",
                fixedAssetsDatabaseId: "",
                fixedAssetsListLimit: 6,
                fixedAssetsSortBy: "updated",
                fixedAssetsShowHourly: true,
                fixedAssetsShowMonthly: true,
                fixedAssetsShowWeekly: false,
                fixedAssetsShowQuarterly: false,
                fixedAssetsShowYearly: false,
                fixedAssetsItemCostPeriod: "day",
            },
            accounting: {
                accountingTitle: "记账",
                accountingHomeRecentLimit: 5,
                accountingShowBudget: true,
                accountingShowRecentRecords: true,
            },
            enhancedDiary: {},
        };

        return { ...(defaults[type] || {}) };
    }

    function normalizeLoadedForm(type: string, source: any): FormState {
        const next = { ...createDefaultForm(type), ...(source || {}) };

        if (type === "databaseChart") {
            const ySource = source?.databaseChartLineYAxisSource;
            next.databaseChartLineYAxisSourceText = Array.isArray(ySource)
                ? ySource.join(",")
                : normalizeString(ySource, next.databaseChartLineYAxisSourceText);
        }

        if (type === "custom-protyle") {
            next.customBlockId = source?.customBlockId || source?.customBlockID || "";
        }

        return next;
    }

    async function resolveDatabaseField(config: WidgetConfig | null): Promise<void> {
        const databaseWidget = databaseWidgetFields[widgetType];
        if (!databaseWidget) return;

        try {
            const resolved = await resolveDatabaseIdFromExistingWidgets(
                plugin,
                databaseWidget.type,
                currentBlockId,
                config || { type: widgetType, data: form },
            );
            if (resolved.databaseId && !form[databaseWidget.field]) {
                form[databaseWidget.field] = resolved.databaseId;
            }
        } catch (error) {
            console.warn("[mobile content form] 解析共享数据库 ID 失败", error);
        }
    }

    async function loadCountdownEventDrafts(): Promise<void> {
        if (widgetType !== "countdown") return;

        const source = getMatchingData();
        const legacyEvents = Array.isArray(source?.eventList)
            ? source.eventList
            : [{ name: "", date: "", anniversary: false }];

        countdownEvents = legacyEvents.length
            ? legacyEvents.map((event) => ({
                  ...event,
                  name: event.name || "",
                  date: event.date || "",
                  anniversary: event.anniversary ?? false,
              }))
            : [{ name: "", date: "", anniversary: false }];

        if (!form.countdownDatabaseId?.trim()) return;

        try {
            const result = await loadCountdownEvents(form.countdownDatabaseId);
            if (result.status.ok && result.events.length > 0) {
                countdownEvents = result.events.map((event) => ({ ...event }));
            }
        } catch (error) {
            console.warn("[mobile content form] 读取倒数日事件失败", error);
        }
    }

    async function initialize(): Promise<void> {
        try {
            const result = await lsNotebooks();
            notebooks = result.notebooks;
        } catch (error) {
            notebooks = [];
            console.warn("[mobile content form] 读取笔记本失败", error);
        }

        let loadedConfig: WidgetConfig | null = null;
        if (currentBlockId) {
            try {
                loadedConfig = parseWidgetConfig(
                    await plugin.loadData(`widget-${currentBlockId}.json`),
                );
            } catch (error) {
                console.warn("[mobile content form] 读取组件配置失败", error);
            }
        }

        existingConfig = loadedConfig;
        form = normalizeLoadedForm(widgetType, getMatchingData(loadedConfig));
        await resolveDatabaseField(loadedConfig);
        await loadCountdownEventDrafts();
        isReady = true;
    }

    function selectedNotebookIds(key: string): string[] {
        return normalizeString(form[key])
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function isNotebookSelected(key: string, id: string): boolean {
        return selectedNotebookIds(key).includes(id);
    }

    function toggleNotebook(key: string, id: string): void {
        const selected = new Set(selectedNotebookIds(key));
        if (selected.has(id)) {
            selected.delete(id);
        } else {
            selected.add(id);
        }
        form[key] = Array.from(selected).join(",");
    }

    function addCountdownEvent(): void {
        countdownEvents = [
            ...countdownEvents,
            { name: "", date: "", anniversary: false },
        ];
    }

    function removeCountdownEvent(index: number): void {
        countdownEvents =
            countdownEvents.length <= 1
                ? [{ name: "", date: "", anniversary: false }]
                : countdownEvents.filter((_, currentIndex) => currentIndex !== index);
    }

    function baseConfig(): WidgetConfig {
        const activeTab =
            existingConfig?.type === widgetType
                ? existingConfig.activeTab || getMobileWidgetActiveTab(widgetType)
                : getMobileWidgetActiveTab(widgetType);

        return {
            activeTab,
            type: widgetType,
            blockId: currentBlockId,
        };
    }

    function withExistingData(overrides: Record<string, any>): Record<string, any> {
        return {
            ...getMatchingData(),
            ...overrides,
        };
    }

    function buildWidgetConfig(): WidgetConfig {
        const base = baseConfig();

        switch (widgetType) {
            case "latest-docs":
                return {
                    ...base,
                    data: [
                        withExistingData({
                            limit: normalizeNumber(form.limit, 5),
                            docNotebookId: normalizeString(form.docNotebookId),
                            ensureOpenDocs: normalizeBoolean(form.ensureOpenDocs, false),
                            latestDocsTitle: normalizeString(
                                form.latestDocsTitle,
                                "🕒最近文档",
                            ),
                            latestDocsPrefix: normalizeString(form.latestDocsPrefix, "📄"),
                            useBuiltinDocIcon: normalizeBoolean(
                                form.useBuiltinDocIcon,
                                false,
                            ),
                            showLatestDocDetails: normalizeBoolean(
                                form.showLatestDocDetails,
                                true,
                            ),
                            showLatestDocFloatDoc: false,
                            latestDocsFloatDocShowTime: 0.1,
                        }),
                    ],
                };
            case "custom-text":
                return {
                    ...base,
                    data: [
                        withExistingData({
                            customText: normalizeString(form.customText),
                        }),
                    ],
                };
            case "custom-web":
                return {
                    ...base,
                    data: [
                        withExistingData({
                            url: normalizeString(form.url),
                        }),
                    ],
                };
            case "custom-protyle":
                return {
                    ...base,
                    data: [
                        withExistingData({
                            isRandomDoc: normalizeBoolean(form.isRandomDoc, false),
                            customBlockId: normalizeString(form.customBlockId),
                        }),
                    ],
                };
            case "favorites":
                return {
                    ...base,
                    data: withExistingData({
                        favoritiesTitle: normalizeString(
                            form.favoritiesTitle,
                            "💖收藏文档",
                        ),
                        favoritiesSortOrder: normalizeString(
                            form.favoritiesSortOrder,
                            "created",
                        ),
                        showNoteMeta: normalizeBoolean(form.showNoteMeta, true),
                        favoritiesDocPrefix: normalizeString(
                            form.favoritiesDocPrefix,
                            "❤",
                        ),
                        useBuiltinDocIcon: normalizeBoolean(
                            form.useBuiltinDocIcon,
                            false,
                        ),
                        favoritesNotebookId: normalizeString(form.favoritesNotebookId),
                        showFavFloatDoc: false,
                        favFloatDocShowTime: 0.1,
                    }),
                };
            case "recent-journals":
                return {
                    ...base,
                    data: withExistingData({
                        limit: normalizeNumber(form.limit, 5),
                        recentJournalsShowType: normalizeString(
                            form.recentJournalsShowType,
                            "list",
                        ),
                        recentJournalsCalendarIcon: normalizeString(
                            form.recentJournalsCalendarIcon,
                            "📝",
                        ),
                        recentJournalsCalendarIconSize: normalizeNumber(
                            form.recentJournalsCalendarIconSize,
                            16,
                        ),
                        useBuiltinDocIcon: normalizeBoolean(
                            form.useBuiltinDocIcon,
                            false,
                        ),
                        showLatestDailyNotesFloatDoc: false,
                        latestDailyNotesFloatDocShowTime: 0.1,
                    }),
                };
            case "TaskMan":
                return {
                    ...base,
                    data: withExistingData({
                        TaskManTitle: normalizeString(form.TaskManTitle, "📋任务管理"),
                        tasksNotebookId: normalizeString(form.tasksNotebookId),
                        showCompletedTasks: normalizeBoolean(
                            form.showCompletedTasks,
                            true,
                        ),
                        showTasksDetails: normalizeBoolean(form.showTasksDetails, true),
                    }),
                };
            case "countdown":
                return {
                    ...base,
                    data: withExistingData({
                        countdownStyle: normalizeString(form.countdownStyle, "list1"),
                        countdownDatabaseId: normalizeString(form.countdownDatabaseId),
                        countdownCard1BgSelect: normalizeString(
                            form.countdownCard1BgSelect,
                            "remote",
                        ),
                        countdownCard1RemoteBg: normalizeString(
                            form.countdownCard1RemoteBg,
                            defaultBackgrounds.countdownCard1,
                        ),
                        countdownCard1LocalBg: normalizeString(
                            form.countdownCard1LocalBg,
                        ),
                        countdownCard2BgColor: normalizeString(
                            form.countdownCard2BgColor,
                            "#000000",
                        ),
                        countdownList2BgColor: normalizeString(
                            form.countdownList2BgColor,
                            "#000000",
                        ),
                    }),
                };
            case "weather":
                return {
                    ...base,
                    data: withExistingData({
                        cityName: normalizeString(form.cityName),
                        cityCode: normalizeString(form.cityCode),
                        weatherStyle: normalizeString(form.weatherStyle, "default"),
                    }),
                };
            case "HOT":
                return {
                    ...base,
                    data: withExistingData({
                        source: normalizeString(form.source, "bilibili"),
                    }),
                };
            case "timedate":
                return {
                    ...base,
                    data: withExistingData({
                        timeType: normalizeString(form.timeType, "classic"),
                        showSeconds: normalizeBoolean(form.showSeconds, true),
                        dateFormat: normalizeString(form.dateFormat, "YYYY年MM月DD日"),
                        showLunar: normalizeBoolean(form.showLunar, true),
                        showZodiac: normalizeBoolean(form.showZodiac, true),
                        showSolarTerm: normalizeBoolean(form.showSolarTerm, true),
                        showWeek: normalizeBoolean(form.showWeek, true),
                        showDate: normalizeBoolean(form.showDate, true),
                        morningImageType: normalizeString(
                            form.morningImageType,
                            "remote",
                        ),
                        afternoonImageType: normalizeString(
                            form.afternoonImageType,
                            "remote",
                        ),
                        nightImageType: normalizeString(form.nightImageType, "remote"),
                        morningBgUrl: normalizeString(
                            form.morningBgUrl,
                            defaultBackgrounds.timedateMorning,
                        ),
                        afternoonBgUrl: normalizeString(
                            form.afternoonBgUrl,
                            defaultBackgrounds.timedateAfternoon,
                        ),
                        nightBgUrl: normalizeString(
                            form.nightBgUrl,
                            defaultBackgrounds.timedateNight,
                        ),
                        morningBgImage: form.morningBgImage || null,
                        afternoonBgImage: form.afternoonBgImage || null,
                        nightBgImage: form.nightBgImage || null,
                        timedateFontSize: normalizeNumber(form.timedateFontSize, 3),
                        simple1Size: normalizeNumber(form.simple1Size, 3),
                        simple1FontWeight: normalizeNumber(form.simple1FontWeight, 4),
                        simple1ShowSecond: normalizeBoolean(
                            form.simple1ShowSecond,
                            true,
                        ),
                        simple1ShowDate: normalizeBoolean(form.simple1ShowDate, true),
                        simple2BgSelect: normalizeString(form.simple2BgSelect, "remote"),
                        simple2RemoteBg: normalizeString(
                            form.simple2RemoteBg,
                            defaultBackgrounds.simple2,
                        ),
                        simple2LocalBg: normalizeString(form.simple2LocalBg),
                        dial1ShowSecond: normalizeBoolean(
                            form.dial1ShowSecond,
                            true,
                        ),
                        dial1ShowMarkers: normalizeBoolean(
                            form.dial1ShowMarkers,
                            true,
                        ),
                        dial1ShowDate: normalizeBoolean(form.dial1ShowDate, true),
                        dial2ShowSecond: normalizeBoolean(
                            form.dial2ShowSecond,
                            true,
                        ),
                        dial2ShowMarkers: normalizeBoolean(
                            form.dial2ShowMarkers,
                            true,
                        ),
                        dial2ShowDate: normalizeBoolean(form.dial2ShowDate, true),
                        dial3ShowSecond: normalizeBoolean(
                            form.dial3ShowSecond,
                            true,
                        ),
                        dial4ShowSecond: normalizeBoolean(
                            form.dial4ShowSecond,
                            true,
                        ),
                        dial5ShowSecond: normalizeBoolean(
                            form.dial5ShowSecond,
                            true,
                        ),
                        dial6ShowSecond: normalizeBoolean(
                            form.dial6ShowSecond,
                            true,
                        ),
                        dial7ShowSecond: normalizeBoolean(
                            form.dial7ShowSecond,
                            true,
                        ),
                        dial8ShowSecond: normalizeBoolean(
                            form.dial8ShowSecond,
                            true,
                        ),
                        dial9ShowSecond: normalizeBoolean(
                            form.dial9ShowSecond,
                            true,
                        ),
                    }),
                };
            case "focus":
                return {
                    ...base,
                    data: withExistingData({
                        focusImageType: normalizeString(form.focusImageType, "remote"),
                        focusBgImage: normalizeString(
                            form.focusBgImage,
                            defaultBackgrounds.focus,
                        ),
                        focusLocalImage: form.focusLocalImage || null,
                        breakImageType: normalizeString(form.breakImageType, "remote"),
                        breakBgImage: normalizeString(
                            form.breakBgImage,
                            defaultBackgrounds.focusBreak,
                        ),
                        breakLocalImage: form.breakLocalImage || null,
                        focusDatabaseId: normalizeString(form.focusDatabaseId),
                    }),
                };
            case "sql":
                return {
                    ...base,
                    data: withExistingData({
                        sqlTitle: normalizeString(form.sqlTitle, "SQL 查询结果"),
                        sqlInput: normalizeString(form.sqlInput),
                        columnOrder: normalizeString(form.columnOrder),
                        hiddenFields: normalizeString(form.hiddenFields),
                    }),
                };
            case "TaskManPlus":
                return {
                    ...base,
                    data: withExistingData({
                        TaskManPlusTitle: normalizeString(
                            form.TaskManPlusTitle,
                            "📋任务管理Plus",
                        ),
                        isCustomFilter: normalizeBoolean(form.isCustomFilter, false),
                        internalFilter: normalizeString(form.internalFilter, "all"),
                        customFilter: normalizeString(form.customFilter),
                        tasksSort: normalizeString(form.tasksSort, "startdate"),
                    }),
                };
            case "quick-notes":
                return {
                    ...base,
                    data: withExistingData({
                        quickNotesTitle: normalizeString(
                            form.quickNotesTitle,
                            "快速笔记",
                        ),
                        quickNotesSort: normalizeString(form.quickNotesSort, "DOC_ASC"),
                    }),
                };
            case "dailyQuote":
                return {
                    ...base,
                    data: withExistingData({
                        dailyQuoteMode: normalizeString(form.dailyQuoteMode, "custom"),
                        customDailyQuoteContent: normalizeString(
                            form.customDailyQuoteContent,
                        ),
                        dailyQuoteSource: normalizeString(
                            form.dailyQuoteSource,
                            "classic",
                        ),
                        dailyQuoteFontSize: normalizeNumber(form.dailyQuoteFontSize, 1),
                        dailyQuoteBgSelect: normalizeString(
                            form.dailyQuoteBgSelect,
                            "remote",
                        ),
                        dailyQuoteRemoteBg: normalizeString(
                            form.dailyQuoteRemoteBg,
                            defaultBackgrounds.dailyQuote,
                        ),
                        dailyQuoteLocalBg: normalizeString(form.dailyQuoteLocalBg),
                    }),
                };
            case "visualChart":
                return {
                    ...base,
                    data: withExistingData({
                        visualChartType: normalizeString(
                            form.visualChartType,
                            "progressBar",
                        ),
                    }),
                };
            case "musicPlayer":
                return {
                    ...base,
                    data: withExistingData({
                        musicFolderPath: normalizeString(form.musicFolderPath),
                        autoPlay: normalizeBoolean(form.autoPlay, false),
                    }),
                };
            case "almanac":
                return {
                    ...base,
                    data: withExistingData({
                        almanacStyle: normalizeString(form.almanacStyle, "classic"),
                    }),
                };
            case "stikynot":
                return {
                    ...base,
                    data: withExistingData({
                        stikynotStyle: normalizeString(form.stikynotStyle, "default"),
                    }),
                };
            case "News":
                return {
                    ...base,
                    data: withExistingData({
                        NewsType: normalizeString(form.NewsType, "daily-news-bulletin"),
                    }),
                };
            case "databaseChart":
                return {
                    ...base,
                    data: withExistingData({
                        databaseChartID: normalizeString(form.databaseChartID),
                        databaseChartType: normalizeString(
                            form.databaseChartType,
                            "line",
                        ),
                        databaseChartTitle: normalizeString(form.databaseChartTitle),
                        databaseChartLineType: normalizeString(
                            form.databaseChartLineType,
                            "XY",
                        ),
                        databaseChartLineXAxisSource: normalizeString(
                            form.databaseChartLineXAxisSource,
                        ),
                        databaseChartLineXAxisTitle: normalizeString(
                            form.databaseChartLineXAxisTitle,
                        ),
                        databaseChartLineYAxisSource: normalizeString(
                            form.databaseChartLineYAxisSourceText,
                        )
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        databaseChartLineYAxisTitle: normalizeString(
                            form.databaseChartLineYAxisTitle,
                        ),
                        databaseChartLineCountColumn: normalizeString(
                            form.databaseChartLineCountColumn,
                        ),
                        databaseChartLineCountXAxisTitle: normalizeString(
                            form.databaseChartLineCountXAxisTitle,
                        ),
                        databaseChartLineCountYAxisTitle: normalizeString(
                            form.databaseChartLineCountYAxisTitle,
                        ),
                        databaseChartLineSmooth: normalizeBoolean(
                            form.databaseChartLineSmooth,
                            false,
                        ),
                        databaseChartLineWidth: normalizeNumber(
                            form.databaseChartLineWidth,
                            2,
                        ),
                        databaseChartLineStyle: normalizeString(
                            form.databaseChartLineStyle,
                            "solid",
                        ),
                        databaseChartLineCountSort: normalizeString(
                            form.databaseChartLineCountSort,
                            "none",
                        ),
                        databaseChartLineMarkPoint: normalizeString(
                            form.databaseChartLineMarkPoint,
                            "circle",
                        ),
                        databaseChartLineMarkPointSize: normalizeNumber(
                            form.databaseChartLineMarkPointSize,
                            8,
                        ),
                    }),
                };
            case "childDocs":
                return {
                    ...base,
                    data: withExistingData({
                        childDocsTitle: normalizeString(
                            form.childDocsTitle,
                            "📄子文档",
                        ),
                        childDocsPrefix: normalizeString(form.childDocsPrefix, "📄"),
                        useBuiltinDocIcon: normalizeBoolean(
                            form.useBuiltinDocIcon,
                            false,
                        ),
                        showChildDocsDetails: normalizeBoolean(
                            form.showChildDocsDetails,
                            true,
                        ),
                        childDocsParentId: normalizeString(form.childDocsParentId),
                        childDocsSortOrder: normalizeString(
                            form.childDocsSortOrder,
                            "updated",
                        ),
                        showChildDocsFloatDoc: false,
                        childDocsFloatDocShowTime: 0.1,
                    }),
                };
            case "constellation":
                return {
                    ...base,
                    data: withExistingData({
                        selectedConstellation: normalizeString(
                            form.selectedConstellation,
                            "摩羯",
                        ),
                    }),
                };
            case "historyDays":
                return {
                    ...base,
                    data: withExistingData({
                        historyDaysType: normalizeString(form.historyDaysType, "list"),
                    }),
                };
            case "statisticalCard":
                return {
                    ...base,
                    data: withExistingData({
                        statisticalCardTitle: normalizeString(
                            form.statisticalCardTitle,
                            "统计卡片",
                        ),
                        statisticalCardTitleSize: normalizeNumber(
                            form.statisticalCardTitleSize,
                            1,
                        ),
                        statisticalCardTitleColor: normalizeString(
                            form.statisticalCardTitleColor,
                            "#000000",
                        ),
                        statisticalCardContent: normalizeString(
                            form.statisticalCardContent,
                            "notebooksCount",
                        ),
                        statisticalCardCountSize: normalizeNumber(
                            form.statisticalCardCountSize,
                            2,
                        ),
                        statisticalCardCountColor: normalizeString(
                            form.statisticalCardCountColor,
                            "#000000",
                        ),
                        customSQLCount: normalizeString(form.customSQLCount),
                    }),
                };
            case "PicCaro":
                return {
                    ...base,
                    data: withExistingData({
                        PicFolderPath: normalizeString(form.PicFolderPath),
                        PicAutoPlay: normalizeBoolean(form.PicAutoPlay, false),
                        PicInterval: normalizeNumber(form.PicInterval, 3),
                        PicNavigation: normalizeBoolean(form.PicNavigation, false),
                        PicPagination: normalizeBoolean(form.PicPagination, false),
                        PicPaginationType: normalizeString(
                            form.PicPaginationType,
                            "bullets",
                        ),
                        PicPaginationDyBu: normalizeBoolean(
                            form.PicPaginationDyBu,
                            false,
                        ),
                        PicPaginationPrOp: normalizeBoolean(
                            form.PicPaginationPrOp,
                            false,
                        ),
                        PicEffect: normalizeString(form.PicEffect, "slide"),
                        PicSlidesPerView: normalizeString(form.PicSlidesPerView, "1"),
                        PicRandomSwitch: normalizeBoolean(
                            form.PicRandomSwitch,
                            false,
                        ),
                    }),
                };
            case "CYBMOK":
                return {
                    ...base,
                    data: withExistingData({
                        CMKnockSound: normalizeString(form.CMKnockSound, "普通"),
                        CYBMOKDatabaseId: normalizeString(form.CYBMOKDatabaseId),
                    }),
                };
            case "countdownTimer":
                return {
                    ...base,
                    data: withExistingData({
                        advancedEnabled: normalizeBoolean(
                            form.advancedEnabled,
                            false,
                        ),
                        countdownTimerStyle: normalizeString(
                            form.countdownTimerStyle,
                            "default",
                        ),
                    }),
                };
            case "fixedAssets":
                return {
                    ...base,
                    data: withExistingData({
                        fixedAssetsTitle: normalizeString(
                            form.fixedAssetsTitle,
                            "固定资产",
                        ),
                        fixedAssetsDatabaseId: normalizeString(
                            form.fixedAssetsDatabaseId,
                        ),
                        fixedAssetsListLimit: normalizeNumber(
                            form.fixedAssetsListLimit,
                            6,
                        ),
                        fixedAssetsSortBy: normalizeString(
                            form.fixedAssetsSortBy,
                            "updated",
                        ),
                        fixedAssetsShowHourly: normalizeBoolean(
                            form.fixedAssetsShowHourly,
                            true,
                        ),
                        fixedAssetsShowMonthly: normalizeBoolean(
                            form.fixedAssetsShowMonthly,
                            true,
                        ),
                        fixedAssetsShowWeekly: normalizeBoolean(
                            form.fixedAssetsShowWeekly,
                            false,
                        ),
                        fixedAssetsShowQuarterly: normalizeBoolean(
                            form.fixedAssetsShowQuarterly,
                            false,
                        ),
                        fixedAssetsShowYearly: normalizeBoolean(
                            form.fixedAssetsShowYearly,
                            false,
                        ),
                        fixedAssetsItemCostPeriod: normalizeString(
                            form.fixedAssetsItemCostPeriod,
                            "day",
                        ),
                    }),
                };
            case "accounting":
                return {
                    ...base,
                    data: withExistingData({
                        accountingTitle: normalizeString(
                            form.accountingTitle,
                            "记账",
                        ),
                        accountingHomeRecentLimit: normalizeNumber(
                            form.accountingHomeRecentLimit,
                            5,
                        ),
                        accountingShowBudget: normalizeBoolean(
                            form.accountingShowBudget,
                            true,
                        ),
                        accountingShowRecentRecords: normalizeBoolean(
                            form.accountingShowRecentRecords,
                            true,
                        ),
                    }),
                };
            case "reviewDocs":
                return {
                    ...base,
                    data: withExistingData({
                        reviewDocsTitle: normalizeString(
                            form.reviewDocsTitle,
                            "📚复习文档",
                        ),
                        reviewDocsDatabaseId: normalizeString(
                            form.reviewDocsDatabaseId,
                        ),
                        reviewDocsLimit: normalizeNumber(form.reviewDocsLimit, 20),
                        reviewDocsDefaultView: normalizeString(
                            form.reviewDocsDefaultView,
                            "due",
                        ),
                        reviewDocsShowFuture: normalizeBoolean(
                            form.reviewDocsShowFuture,
                            true,
                        ),
                        reviewDocsFutureDays: normalizeNumber(
                            form.reviewDocsFutureDays,
                            7,
                        ),
                        reviewDocsShowDocs: normalizeBoolean(
                            form.reviewDocsShowDocs,
                            true,
                        ),
                        reviewDocsShowBlocks: normalizeBoolean(
                            form.reviewDocsShowBlocks,
                            true,
                        ),
                        reviewDocsShowNote: normalizeBoolean(
                            form.reviewDocsShowNote,
                            true,
                        ),
                        reviewDocsShowPath: normalizeBoolean(
                            form.reviewDocsShowPath,
                            true,
                        ),
                        reviewDocsShowStats: normalizeBoolean(
                            form.reviewDocsShowStats,
                            true,
                        ),
                        reviewDocsSortBy: normalizeString(
                            form.reviewDocsSortBy,
                            "dueAsc",
                        ),
                        reviewDocsShowFloatDoc: false,
                        reviewDocsFloatDocShowTime: 0.1,
                        reviewDocsDefaultIntervals: normalizeString(
                            form.reviewDocsDefaultIntervals,
                            "0,1,2,4,7,15,30,60",
                        ),
                    }),
                };
            case "conditionDocs":
                return {
                    ...base,
                    data: withExistingData({
                        conditionDocsTitle: normalizeString(
                            form.conditionDocsTitle,
                            "📄条件文档",
                        ),
                        conditionDocsCondition: normalizeString(
                            form.conditionDocsCondition,
                            "keyword",
                        ),
                        conditionDocsKeyPosition: normalizeString(
                            form.conditionDocsKeyPosition,
                            "anywhere",
                        ),
                        conditionDocsKeyWord: normalizeString(
                            form.conditionDocsKeyWord,
                        ),
                        conditionDocsSortOrder: normalizeString(
                            form.conditionDocsSortOrder,
                            "updated",
                        ),
                        useBuiltinDocIcon: normalizeBoolean(
                            form.useBuiltinDocIcon,
                            false,
                        ),
                        showConditionDocsFloatDoc: false,
                        conditionDocsFloatDocShowTime: 0.1,
                        conditionDocsTag: normalizeString(form.conditionDocsTag),
                    }),
                };
            case "enhancedDiary":
                return {
                    ...base,
                    data: withExistingData({}),
                };
            default:
                return {
                    ...base,
                    data: existingConfig?.type === widgetType ? existingConfig.data : {},
                };
        }
    }

    async function saveCountdownEventsIfNeeded(): Promise<boolean> {
        if (widgetType !== "countdown") return true;

        const hasEvents = countdownEvents.some(
            (event) => event.name?.trim() || event.date?.trim(),
        );
        if (!hasEvents) return true;

        const databaseId = normalizeString(form.countdownDatabaseId).trim();
        if (!databaseId) {
            showMessage("请先填写倒数日数据库 ID，事件才会保存", 4000);
            return false;
        }

        try {
            const collectedLegacyEvents = await collectCountdownLegacyEventsFromWidgets(
                plugin,
                currentBlockId,
                null,
                countdownEvents,
            );
            const mergedEvents = mergeCountdownEvents(
                collectedLegacyEvents,
                countdownEvents,
            );
            const savedEvents = await saveCountdownEvents(databaseId, mergedEvents);
            countdownEvents = savedEvents.map((event) => ({ ...event }));
            return true;
        } catch (error) {
            showMessage(
                error instanceof Error ? error.message : "倒数日数据库保存失败",
                4000,
            );
            return false;
        }
    }

    async function syncDatabaseConfig(contentTypeJson: WidgetConfig): Promise<void> {
        const databaseWidget = databaseWidgetFields[widgetType];
        if (!databaseWidget) return;

        const databaseId = normalizeString(
            (contentTypeJson.data || {})[databaseWidget.field],
        );
        if (!databaseId) return;

        try {
            if (currentBlockId) {
                await plugin.saveData(`widget-${currentBlockId}.json`, contentTypeJson);
            }
            await syncDatabaseIdToSameTypeWidgets(
                plugin,
                databaseWidget.type,
                databaseId,
                currentBlockId,
            );
        } catch (error) {
            console.warn("[mobile content form] 同步同类组件数据库 ID 失败", error);
        }
    }

    async function submit(): Promise<void> {
        if (isSaving) return;
        isSaving = true;

        try {
            const countdownSaved = await saveCountdownEventsIfNeeded();
            if (!countdownSaved) return;

            const contentTypeJson = buildWidgetConfig();
            await syncDatabaseConfig(contentTypeJson);
            await onConfirm(JSON.stringify(contentTypeJson));
        } finally {
            isSaving = false;
        }
    }

    function option(value: string | number, label: string): FieldOption {
        return { value, label };
    }

    function getFields(type: string, state: FormState): MobileField[] {
        const titleField = (key: string, placeholder: string): MobileField => ({
            key,
            type: "text",
            label: "组件标题",
            placeholder,
        });

        const limitField = (key = "limit", label = "显示条数"): MobileField => ({
            key,
            type: "number",
            label,
            min: 1,
            max: 50,
            step: 1,
        });

        const notebookField = (key: string): MobileField => ({
            key,
            type: "notebooks",
            label: "笔记本范围",
            description: "不选择时默认包含全部笔记本",
        });

        switch (type) {
            case "latest-docs":
                return [
                    titleField("latestDocsTitle", "🕒最近文档"),
                    { key: "latestDocsPrefix", type: "text", label: "文档前缀" },
                    limitField(),
                    notebookField("docNotebookId"),
                    {
                        key: "ensureOpenDocs",
                        type: "switch",
                        label: "包含已打开文档",
                    },
                    {
                        key: "useBuiltinDocIcon",
                        type: "switch",
                        label: "优先使用文档图标",
                    },
                    {
                        key: "showLatestDocDetails",
                        type: "switch",
                        label: "显示更新时间",
                    },
                ];
            case "favorites":
                return [
                    titleField("favoritiesTitle", "💖收藏文档"),
                    { key: "favoritiesDocPrefix", type: "text", label: "文档前缀" },
                    notebookField("favoritesNotebookId"),
                    {
                        key: "favoritiesSortOrder",
                        type: "select",
                        label: "排序方式",
                        options: [
                            option("created", "按创建时间"),
                            option("updated", "按更新时间"),
                        ],
                    },
                    { key: "showNoteMeta", type: "switch", label: "显示文档信息" },
                    {
                        key: "useBuiltinDocIcon",
                        type: "switch",
                        label: "优先使用文档图标",
                    },
                ];
            case "recent-journals":
                return [
                    limitField(),
                    {
                        key: "recentJournalsShowType",
                        type: "select",
                        label: "显示方式",
                        options: [option("list", "列表"), option("calendar", "日历")],
                    },
                    {
                        key: "recentJournalsCalendarIcon",
                        type: "text",
                        label: "日记图标",
                    },
                    {
                        key: "recentJournalsCalendarIconSize",
                        type: "number",
                        label: "图标大小",
                        min: 10,
                        max: 40,
                    },
                    {
                        key: "useBuiltinDocIcon",
                        type: "switch",
                        label: "优先使用文档图标",
                    },
                ];
            case "childDocs":
                return [
                    titleField("childDocsTitle", "📄子文档"),
                    { key: "childDocsPrefix", type: "text", label: "文档前缀" },
                    {
                        key: "childDocsParentId",
                        type: "text",
                        label: "父文档 ID",
                        placeholder: "留空时使用当前文档",
                    },
                    {
                        key: "childDocsSortOrder",
                        type: "select",
                        label: "排序方式",
                        options: [
                            option("updated", "按更新时间"),
                            option("created", "按创建时间"),
                            option("name", "按名称"),
                        ],
                    },
                    {
                        key: "showChildDocsDetails",
                        type: "switch",
                        label: "显示文档信息",
                    },
                    {
                        key: "useBuiltinDocIcon",
                        type: "switch",
                        label: "优先使用文档图标",
                    },
                ];
            case "conditionDocs":
                return [
                    titleField("conditionDocsTitle", "📄条件文档"),
                    {
                        key: "conditionDocsCondition",
                        type: "select",
                        label: "筛选方式",
                        options: [option("keyword", "关键词"), option("tag", "标签")],
                    },
                    {
                        key: "conditionDocsKeyPosition",
                        type: "select",
                        label: "关键词位置",
                        options: [
                            option("anywhere", "任意位置"),
                            option("title", "标题"),
                            option("path", "路径"),
                        ],
                    },
                    {
                        key: "conditionDocsKeyWord",
                        type: "text",
                        label: "关键词",
                    },
                    { key: "conditionDocsTag", type: "text", label: "标签" },
                    {
                        key: "conditionDocsSortOrder",
                        type: "select",
                        label: "排序方式",
                        options: [
                            option("updated", "按更新时间"),
                            option("created", "按创建时间"),
                            option("name", "按名称"),
                        ],
                    },
                    {
                        key: "useBuiltinDocIcon",
                        type: "switch",
                        label: "优先使用文档图标",
                    },
                ];
            case "reviewDocs":
                return [
                    titleField("reviewDocsTitle", "📚复习文档"),
                    {
                        key: "reviewDocsDatabaseId",
                        type: "text",
                        label: "复习数据库 ID",
                    },
                    limitField("reviewDocsLimit"),
                    {
                        key: "reviewDocsDefaultView",
                        type: "select",
                        label: "默认视图",
                        options: [option("due", "到期"), option("all", "全部")],
                    },
                    {
                        key: "reviewDocsSortBy",
                        type: "select",
                        label: "排序方式",
                        options: [
                            option("dueAsc", "到期时间升序"),
                            option("dueDesc", "到期时间降序"),
                            option("updated", "更新时间"),
                        ],
                    },
                    {
                        key: "reviewDocsShowFuture",
                        type: "switch",
                        label: "显示未来复习",
                    },
                    {
                        key: "reviewDocsFutureDays",
                        type: "number",
                        label: "未来天数",
                        min: 1,
                        max: 365,
                    },
                    {
                        key: "reviewDocsShowDocs",
                        type: "switch",
                        label: "显示文档",
                    },
                    {
                        key: "reviewDocsShowBlocks",
                        type: "switch",
                        label: "显示块",
                    },
                    {
                        key: "reviewDocsShowPath",
                        type: "switch",
                        label: "显示路径",
                    },
                    {
                        key: "reviewDocsShowStats",
                        type: "switch",
                        label: "显示统计",
                    },
                ];
            case "TaskMan":
                return [
                    titleField("TaskManTitle", "📋任务管理"),
                    notebookField("tasksNotebookId"),
                    {
                        key: "showCompletedTasks",
                        type: "switch",
                        label: "显示已完成任务",
                    },
                    {
                        key: "showTasksDetails",
                        type: "switch",
                        label: "显示任务详情",
                    },
                ];
            case "TaskManPlus":
                return [
                    titleField("TaskManPlusTitle", "📋任务管理Plus"),
                    {
                        key: "isCustomFilter",
                        type: "switch",
                        label: "使用自定义筛选",
                    },
                    ...(state.isCustomFilter
                        ? [
                              {
                                  key: "customFilter",
                                  type: "textarea",
                                  label: "筛选语法",
                                  rows: 5,
                              } as MobileField,
                          ]
                        : [
                              {
                                  key: "internalFilter",
                                  type: "select",
                                  label: "筛选条件",
                                  options: [
                                      option("all", "所有任务"),
                                      option("uncompleted", "未完成任务"),
                                      option("completed", "已完成任务"),
                                      option("today", "今天任务"),
                                      option("tomorrow", "明天任务"),
                                      option("mostImportant", "重要任务"),
                                  ],
                              } as MobileField,
                          ]),
                    {
                        key: "tasksSort",
                        type: "select",
                        label: "排序方式",
                        options: [
                            option("startdate", "开始日期"),
                            option("deadline", "截止日期"),
                            option("priority", "优先级"),
                        ],
                    },
                ];
            case "quick-notes":
                return [
                    titleField("quickNotesTitle", "快速笔记"),
                    {
                        key: "quickNotesSort",
                        type: "select",
                        label: "排序方式",
                        options: [
                            option("DOC_ASC", "文档正序"),
                            option("DOC_INV", "文档逆序"),
                            option("UPD", "更新时间"),
                            option("CRE", "创建时间"),
                        ],
                    },
                ];
            case "countdown":
                return [
                    {
                        key: "countdownDatabaseId",
                        type: "text",
                        label: "倒数日数据库 ID",
                        description: "事件数据保存到该数据库",
                    },
                    {
                        key: "countdownStyle",
                        type: "select",
                        label: "显示样式",
                        options: [
                            option("list1", "列表"),
                            option("list2", "紧凑列表"),
                            option("card1", "卡片"),
                            option("card2", "横向卡片"),
                        ],
                    },
                    {
                        key: "countdownCard1BgSelect",
                        type: "select",
                        label: "卡片背景",
                        options: [option("remote", "远程图片"), option("color", "纯色")],
                    },
                    {
                        key: "countdownCard1RemoteBg",
                        type: "text",
                        label: "远程背景地址",
                    },
                    {
                        key: "countdownCard2BgColor",
                        type: "color",
                        label: "卡片颜色",
                    },
                    {
                        key: "countdownList2BgColor",
                        type: "color",
                        label: "列表颜色",
                    },
                ];
            case "countdownTimer":
                return [
                    {
                        key: "countdownTimerStyle",
                        type: "select",
                        label: "计时器样式",
                        options: [option("default", "默认"), option("ring1", "圆环 1")],
                    },
                    {
                        key: "advancedEnabled",
                        type: "switch",
                        label: "启用高级能力",
                    },
                ];
            case "heatmap":
                return [
                    titleField("heatmapTitle", "创作热力图"),
                    {
                        key: "pastMonthCount",
                        type: "number",
                        label: "显示月份",
                        min: 1,
                        max: 12,
                    },
                    { key: "showLabel", type: "switch", label: "显示标签" },
                    {
                        key: "selectedColorPreset",
                        type: "select",
                        label: "颜色方案",
                        options: [
                            option("github", "GitHub 绿色"),
                            option("blue", "蓝色"),
                            option("custom", "自定义"),
                        ],
                    },
                    ...(state.selectedColorPreset === "custom"
                        ? [
                              {
                                  key: "customColor",
                                  type: "color",
                                  label: "自定义颜色",
                              } as MobileField,
                          ]
                        : []),
                    {
                        key: "heatmapCountType",
                        type: "select",
                        label: "计数类型",
                        options: [option("block", "内容块"), option("words", "字数")],
                    },
                ];
            case "visualChart":
                return [
                    {
                        key: "visualChartType",
                        type: "select",
                        label: "图表类型",
                        options: [
                            option("progressBar", "进度条"),
                            option("tagCloud", "标签云图"),
                        ],
                    },
                ];
            case "databaseChart":
                return [
                    {
                        key: "databaseChartID",
                        type: "text",
                        label: "数据库 ID",
                    },
                    titleField("databaseChartTitle", "数据库图表"),
                    {
                        key: "databaseChartType",
                        type: "select",
                        label: "图表类型",
                        options: [
                            option("line", "折线图"),
                            option("bar", "柱状图"),
                            option("pie", "饼图"),
                        ],
                    },
                    {
                        key: "databaseChartLineXAxisSource",
                        type: "text",
                        label: "X 轴字段",
                    },
                    {
                        key: "databaseChartLineYAxisSourceText",
                        type: "text",
                        label: "Y 轴字段",
                        description: "多个字段用英文逗号分隔",
                    },
                    {
                        key: "databaseChartLineSmooth",
                        type: "switch",
                        label: "平滑曲线",
                    },
                ];
            case "sql":
                return [
                    titleField("sqlTitle", "SQL 查询结果"),
                    {
                        key: "sqlInput",
                        type: "textarea",
                        label: "SQL 语句",
                        rows: 6,
                    },
                    {
                        key: "columnOrder",
                        type: "text",
                        label: "列顺序",
                        description: "多个字段用英文逗号分隔",
                    },
                    {
                        key: "hiddenFields",
                        type: "text",
                        label: "隐藏字段",
                        description: "多个字段用英文逗号分隔",
                    },
                ];
            case "statisticalCard":
                return [
                    titleField("statisticalCardTitle", "统计卡片"),
                    {
                        key: "statisticalCardContent",
                        type: "select",
                        label: "统计类型",
                        options: [
                            option("notebooksCount", "笔记本数"),
                            option("docsCount", "文档数"),
                            option("blocksCount", "块数"),
                            option("wordsCount", "字数"),
                            option("tasksCount", "任务数"),
                            option("doneTasksCount", "已完成任务"),
                            option("undoneTasksCount", "未完成任务"),
                            option("dailynotesCount", "日记数"),
                            option("tagsCount", "标签数"),
                            option("citationCount", "引述数"),
                            option("codeBlocksCount", "代码数"),
                            option("mathBlocksCount", "公式数"),
                            option("customSQLCount", "SQL 查询结果数"),
                        ],
                    },
                    ...(state.statisticalCardContent === "customSQLCount"
                        ? [
                              {
                                  key: "customSQLCount",
                                  type: "textarea",
                                  label: "自定义 SQL",
                                  rows: 5,
                              } as MobileField,
                          ]
                        : []),
                    {
                        key: "statisticalCardTitleSize",
                        type: "number",
                        label: "标题大小",
                        min: 1,
                        max: 6,
                    },
                    {
                        key: "statisticalCardCountSize",
                        type: "number",
                        label: "数字大小",
                        min: 1,
                        max: 8,
                    },
                    {
                        key: "statisticalCardTitleColor",
                        type: "color",
                        label: "标题颜色",
                    },
                    {
                        key: "statisticalCardCountColor",
                        type: "color",
                        label: "数字颜色",
                    },
                ];
            case "timedate":
                return [
                    {
                        key: "timeType",
                        type: "select",
                        label: "显示样式",
                        options: [
                            option("classic", "经典"),
                            option("simple1", "简洁 1"),
                            option("simple2", "简洁 2"),
                            option("dial1", "表盘 1"),
                            option("dial2", "表盘 2"),
                            option("dial3", "表盘 3"),
                            option("dial4", "表盘 4"),
                            option("dial5", "表盘 5"),
                            option("dial6", "表盘 6"),
                            option("dial7", "表盘 7"),
                            option("dial8", "表盘 8"),
                            option("dial9", "表盘 9"),
                        ],
                    },
                    { key: "showSeconds", type: "switch", label: "显示秒" },
                    { key: "showDate", type: "switch", label: "显示日期" },
                    { key: "showWeek", type: "switch", label: "显示星期" },
                    { key: "showLunar", type: "switch", label: "显示农历" },
                    { key: "showZodiac", type: "switch", label: "显示生肖" },
                    {
                        key: "showSolarTerm",
                        type: "switch",
                        label: "显示节气",
                    },
                    {
                        key: "dateFormat",
                        type: "text",
                        label: "日期格式",
                    },
                    {
                        key: "timedateFontSize",
                        type: "number",
                        label: "字号",
                        min: 1,
                        max: 8,
                    },
                ];
            case "dailyQuote":
                return [
                    {
                        key: "dailyQuoteMode",
                        type: "select",
                        label: "语录来源",
                        options: [
                            option("custom", "自定义"),
                            option("remote", "远程语录"),
                        ],
                    },
                    ...(state.dailyQuoteMode === "custom"
                        ? [
                              {
                                  key: "customDailyQuoteContent",
                                  type: "textarea",
                                  label: "自定义内容",
                                  rows: 4,
                              } as MobileField,
                          ]
                        : [
                              {
                                  key: "dailyQuoteSource",
                                  type: "select",
                                  label: "远程来源",
                                  options: [
                                      option("classic", "经典"),
                                      option("celebrity", "名人名言"),
                                      option("emotion", "情感语录"),
                                      option("gaoxiao", "搞笑语录"),
                                      option("pyq", "朋友圈语录"),
                                      option("straybirdsZH", "飞鸟集（中文版）"),
                                      option("straybirdsEN", "飞鸟集（英文版）"),
                                      option("lovegarden", "爱情公寓语录"),
                                  ],
                              } as MobileField,
                          ]),
                    {
                        key: "dailyQuoteFontSize",
                        type: "number",
                        label: "字号",
                        min: 1,
                        max: 5,
                    },
                    {
                        key: "dailyQuoteBgSelect",
                        type: "select",
                        label: "背景",
                        options: [option("remote", "远程图片"), option("none", "无背景")],
                    },
                    {
                        key: "dailyQuoteRemoteBg",
                        type: "text",
                        label: "背景地址",
                    },
                ];
            case "weather":
                return [
                    { key: "cityName", type: "text", label: "城市名称" },
                    { key: "cityCode", type: "text", label: "城市代码" },
                    {
                        key: "weatherStyle",
                        type: "select",
                        label: "显示样式",
                        options: [
                            option("default", "默认"),
                            option("simple1", "简约 1"),
                            option("simple2", "简约 2"),
                        ],
                    },
                ];
            case "HOT":
                return [
                    {
                        key: "source",
                        type: "select",
                        label: "热搜来源",
                        options: [
                            option("bilibili", "哔哩哔哩"),
                            option("acfun", "A站"),
                            option("weibo", "微博"),
                            option("zhihu", "知乎"),
                            option("douyin", "抖音"),
                            option("kuaishou", "快手"),
                            option("baidu", "百度热搜"),
                            option("toutiao", "今日头条"),
                            option("ithome", "IT之家"),
                            option("sspai", "少数派"),
                        ],
                    },
                ];
            case "custom-text":
                return [
                    {
                        key: "customText",
                        type: "textarea",
                        label: "文字内容",
                        rows: 8,
                    },
                ];
            case "custom-web":
                return [
                    {
                        key: "url",
                        type: "text",
                        label: "网页地址",
                        placeholder: "https://example.com",
                    },
                ];
            case "custom-protyle":
                return [
                    {
                        key: "isRandomDoc",
                        type: "switch",
                        label: "随机文档",
                    },
                    {
                        key: "customBlockId",
                        type: "text",
                        label: "文档或块 ID",
                    },
                ];
            case "focus":
                return [
                    {
                        key: "focusDatabaseId",
                        type: "text",
                        label: "专注数据库 ID",
                    },
                    {
                        key: "focusImageType",
                        type: "select",
                        label: "专注背景",
                        options: [option("remote", "远程图片"), option("none", "无背景")],
                    },
                    {
                        key: "focusBgImage",
                        type: "text",
                        label: "专注背景地址",
                    },
                    {
                        key: "breakImageType",
                        type: "select",
                        label: "休息背景",
                        options: [option("remote", "远程图片"), option("none", "无背景")],
                    },
                    {
                        key: "breakBgImage",
                        type: "text",
                        label: "休息背景地址",
                    },
                ];
            case "musicPlayer":
                return [
                    {
                        key: "musicFolderPath",
                        type: "text",
                        label: "音乐文件夹路径",
                    },
                    { key: "autoPlay", type: "switch", label: "自动播放" },
                ];
            case "almanac":
                return [
                    {
                        key: "almanacStyle",
                        type: "select",
                        label: "黄历样式",
                        options: [option("classic", "经典"), option("simple", "简洁")],
                    },
                ];
            case "stikynot":
                return [
                    {
                        key: "stikynotStyle",
                        type: "select",
                        label: "便签样式",
                        options: [option("default", "默认"), option("simple", "简洁")],
                    },
                ];
            case "News":
                return [
                    {
                        key: "NewsType",
                        type: "select",
                        label: "资讯类型",
                        options: [
                            option("daily-news-bulletin", "每日早报"),
                            option("news", "新闻资讯"),
                        ],
                    },
                ];
            case "constellation":
                return [
                    {
                        key: "selectedConstellation",
                        type: "select",
                        label: "星座",
                        options: [
                            "白羊",
                            "金牛",
                            "双子",
                            "巨蟹",
                            "狮子",
                            "处女",
                            "天秤",
                            "天蝎",
                            "射手",
                            "摩羯",
                            "水瓶",
                            "双鱼",
                        ].map((item) => option(item, item)),
                    },
                ];
            case "historyDays":
                return [
                    {
                        key: "historyDaysType",
                        type: "select",
                        label: "显示方式",
                        options: [option("list", "列表"), option("card", "卡片")],
                    },
                ];
            case "PicCaro":
                return [
                    { key: "PicFolderPath", type: "text", label: "图片文件夹路径" },
                    { key: "PicAutoPlay", type: "switch", label: "自动播放" },
                    {
                        key: "PicInterval",
                        type: "number",
                        label: "切换间隔（秒）",
                        min: 1,
                        max: 60,
                    },
                    { key: "PicNavigation", type: "switch", label: "显示导航" },
                    { key: "PicPagination", type: "switch", label: "显示分页" },
                    {
                        key: "PicEffect",
                        type: "select",
                        label: "切换效果",
                        options: [
                            option("slide", "滑动"),
                            option("fade", "淡入淡出"),
                            option("cube", "立方体"),
                        ],
                    },
                    {
                        key: "PicRandomSwitch",
                        type: "switch",
                        label: "随机切换",
                    },
                ];
            case "CYBMOK":
                return [
                    {
                        key: "CYBMOKDatabaseId",
                        type: "text",
                        label: "木鱼数据库 ID",
                    },
                    {
                        key: "CMKnockSound",
                        type: "select",
                        label: "敲击音效",
                        options: [
                            option("普通", "普通"),
                            option("清脆", "清脆"),
                            option("低沉", "低沉"),
                        ],
                    },
                ];
            case "fixedAssets":
                return [
                    titleField("fixedAssetsTitle", "固定资产"),
                    {
                        key: "fixedAssetsDatabaseId",
                        type: "text",
                        label: "资产数据库 ID",
                    },
                    limitField("fixedAssetsListLimit"),
                    {
                        key: "fixedAssetsSortBy",
                        type: "select",
                        label: "排序方式",
                        options: [
                            option("updated", "按更新时间"),
                            option("created", "按创建时间"),
                            option("name", "按名称"),
                        ],
                    },
                    {
                        key: "fixedAssetsItemCostPeriod",
                        type: "select",
                        label: "费用周期",
                        options: [
                            option("day", "日"),
                            option("week", "周"),
                            option("month", "月"),
                            option("quarter", "季度"),
                            option("year", "年"),
                        ],
                    },
                    {
                        key: "fixedAssetsShowHourly",
                        type: "switch",
                        label: "显示小时费用",
                    },
                    {
                        key: "fixedAssetsShowMonthly",
                        type: "switch",
                        label: "显示月费用",
                    },
                    {
                        key: "fixedAssetsShowYearly",
                        type: "switch",
                        label: "显示年费用",
                    },
                ];
            case "accounting":
                return [
                    titleField("accountingTitle", "记账"),
                    limitField("accountingHomeRecentLimit"),
                    {
                        key: "accountingShowBudget",
                        type: "switch",
                        label: "显示预算",
                    },
                    {
                        key: "accountingShowRecentRecords",
                        type: "switch",
                        label: "显示最近流水",
                    },
                ];
            case "enhancedDiary":
                return [
                    {
                        key: "enhancedDiaryInfo",
                        type: "info",
                        label: "增强日记使用独立工作区",
                        description:
                            "移动端主页只负责放置入口，详细配置请在组件内部工作区完成。",
                    },
                ];
            default:
                return [
                    {
                        key: "fallback",
                        type: "info",
                        label: "该组件暂未提供移动端精简设置",
                        description: "保存会保留当前配置，不会改动底层数据结构。",
                    },
                ];
        }
    }

    onMount(() => {
        void initialize();
    });
</script>

<form class="mobile-content-form" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
    {#if !isReady}
        <div class="mobile-form-loading">正在读取 {title} 设置...</div>
    {:else}
        <div class="mobile-content-form-body">
            <section class="mobile-form-section">
                <div class="mobile-form-section-title">
                    <strong>{title}</strong>
                    <span>移动端精简设置</span>
                </div>

                {#each fields as field}
                    {#if field.type === "info"}
                        <div class="mobile-form-info">
                            <strong>{field.label}</strong>
                            {#if field.description}
                                <span>{field.description}</span>
                            {/if}
                        </div>
                    {:else if field.type === "switch"}
                        <label class="mobile-form-row mobile-form-row-switch">
                            <span>
                                <strong>{field.label}</strong>
                                {#if field.description}
                                    <small>{field.description}</small>
                                {/if}
                            </span>
                            <span class="mobile-switch">
                                <input type="checkbox" bind:checked={form[field.key]} />
                                <i></i>
                            </span>
                        </label>
                    {:else if field.type === "notebooks"}
                        <div class="mobile-form-row mobile-form-row-stack">
                            <span>
                                <strong>{field.label}</strong>
                                {#if field.description}
                                    <small>{field.description}</small>
                                {/if}
                            </span>
                            <div class="mobile-notebook-list">
                                {#each notebooks as notebook}
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={isNotebookSelected(field.key, notebook.id)}
                                            onchange={() => toggleNotebook(field.key, notebook.id)}
                                        />
                                        <span>{notebook.name}</span>
                                    </label>
                                {:else}
                                    <div class="mobile-notebook-empty">没有读取到笔记本</div>
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <label class="mobile-form-row mobile-form-row-stack">
                            <span>
                                <strong>{field.label}</strong>
                                {#if field.description}
                                    <small>{field.description}</small>
                                {/if}
                            </span>

                            {#if field.type === "select"}
                                <select bind:value={form[field.key]}>
                                    {#each field.options || [] as item}
                                        <option value={item.value}>{item.label}</option>
                                    {/each}
                                </select>
                            {:else if field.type === "textarea"}
                                <textarea
                                    bind:value={form[field.key]}
                                    rows={field.rows || 4}
                                    placeholder={field.placeholder || ""}
                                ></textarea>
                            {:else if field.type === "number"}
                                <input
                                    type="number"
                                    bind:value={form[field.key]}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step || 1}
                                    placeholder={field.placeholder || ""}
                                />
                            {:else if field.type === "color"}
                                <input type="color" bind:value={form[field.key]} />
                            {:else}
                                <input
                                    type="text"
                                    bind:value={form[field.key]}
                                    placeholder={field.placeholder || ""}
                                />
                            {/if}
                        </label>
                    {/if}
                {/each}
            </section>

            {#if widgetType === "countdown"}
                <section class="mobile-form-section">
                    <div class="mobile-form-section-title">
                        <strong>倒数日事件</strong>
                        <span>事件会保存到倒数日数据库</span>
                    </div>

                    <div class="mobile-countdown-events">
                        {#each countdownEvents as event, index}
                            <div class="mobile-countdown-event">
                                <label>
                                    <span>事件名称</span>
                                    <input type="text" bind:value={event.name} placeholder="例如：考试" />
                                </label>
                                <label>
                                    <span>日期</span>
                                    <input type="date" bind:value={event.date} />
                                </label>
                                <label class="mobile-countdown-anniversary">
                                    <span>周年事件</span>
                                    <span class="mobile-switch">
                                        <input type="checkbox" bind:checked={event.anniversary} />
                                        <i></i>
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    class="mobile-countdown-remove"
                                    onclick={() => removeCountdownEvent(index)}
                                >
                                    删除事件
                                </button>
                            </div>
                        {/each}
                    </div>

                    <button type="button" class="mobile-countdown-add" onclick={addCountdownEvent}>
                        添加事件
                    </button>
                </section>
            {/if}
        </div>

        <div class="mobile-form-actions">
            <button type="button" class="mobile-form-cancel" onclick={onClose}>取消</button>
            <button type="submit" class="mobile-form-confirm" disabled={isSaving}>
                {isSaving ? "保存中..." : "保存"}
            </button>
        </div>
    {/if}
</form>
