<script lang="ts">
    import { onMount } from "svelte";
    import "./contentSettingStyle/contentSetting.scss";

    // 弹窗接收的 props
    export let plugin: any;
    export let onClose: () => void;
    export let onConfirm: (contentTypeJson: string) => void;

    // 当前区块 ID
    export let currentBlockId: string = "";

    let activeTab = "note";

    // 下拉选项绑定值
    let selectedContentType: string = "latest-docs";
    let customTextInputValue: string = "";

    // 最近文档配置
    let docLimit: number = 5;
    let ensureOpenDocs: boolean = false;
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

    // 任务管理相关变量
    let showCompletedTasks = true; // 默认显示已完成任务
    let tasksNotebookId: string = ""; // 任务管理笔记本 ID
    let showTasksDetails = true; // 默认显示任务详情
    let TaskManTitle: string = "📋任务管理";

    // 任务管理Plus 相关变量
    let TaskManPlusTitle: string = "📋任务管理Plus";
    let isCustomFilter: boolean = false;
    let internalFilter: string = "all";
    let customFilter: string = "";
    let tasksSort: string = "startdate";

    // 快速笔记相关变量
    let quickNotesTitle: string = "📝快速笔记";

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
    ];

    // 每日一言相关变量
    let dailyQuoteMode: string = "remote";
    let customDailyQuoteContent: string = "";
    let dailyQuoteSource: string = "classic";
    let dailyQuoteFontSize: number = 1;
    let dailyQuoteBgSelect = "remote";
    let dailyQuoteRemoteBg =
        "https://haowallpaper.com/link/common/file/previewFileImg/17169460970507648";
    let dailyQuoteLocalBg = "";
    let dailyQuoteBgInput: HTMLInputElement | null = null;

    // 时间范围相关
    let timeRangeType: "past" | "custom" = "past";
    let pastMonthCount: number = 6;

    // 热力图相关
    let selectedColorPreset: "github" | "blue" | "custom" = "github";
    let customColor: string = "#1ea769";

    // 下拉选项
    const limitOptions = [5, 10, 15, 20];

    // 自定义网页链接
    let customWebUrl: string = "";

    // 自定义显示块ID
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

    // 处理背景上传函数
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

    onMount(async () => {
        const settingData = await plugin.loadData(
            `widget-${currentBlockId}.json`,
        );
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
            } else if (parsedData.type === "heatmap") {
                pastMonthCount = parsedData.data?.[0]?.pastMonthCount || 6;
                selectedColorPreset =
                    parsedData.data?.[0]?.selectedColorPreset || "github";
                customColor = parsedData.data?.[0]?.customColor || "#1ea769";
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
            }
        }
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
            on:click={() => (activeTab = "info")}
            class:active={activeTab === "info"}>信息资讯</button
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
                            <label for="doc-notebook-id"
                                >文档笔记本 ID：（多个以逗号隔开）</label
                            >
                            <input
                                id="doc-notebook-id"
                                type="text"
                                bind:value={docNotebookId}
                                placeholder="输入笔记本ID"
                            />
                        </div>
                    </div>
                {:else if selectedContentType === "favorites"}
                    <div class="content-panel favorites">
                        <!-- 收藏文档设置区域 -->
                        <h4>收藏文档设置</h4>
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
                                <label for="doc-notebook-id"
                                    >文档笔记本 ID：（多个以逗号隔开）</label
                                >
                                <input
                                    id="doc-notebook-id"
                                    type="text"
                                    bind:value={favoritesNotebookId}
                                    placeholder="输入笔记本ID"
                                />
                            </div>
                        </div>
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
                            <label for="TaskMan-notebook-id"
                                >任务笔记本 ID：（多个以逗号隔开）</label
                            >
                            <input
                                id="TaskMan-notebook-id"
                                type="text"
                                bind:value={tasksNotebookId}
                                placeholder="输入笔记本ID"
                            />
                        </div>
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
                    </div>
                {:else if selectedContentType === "quick-notes"}
                    <div class="content-panel quick-notes">
                        <div class="form-group quick-notes-title">
                            <label for="quick-notes-title"
                                >组件标题： 组件标题：
                                <input
                                    id="quick-notes-title"
                                    type="text"
                                    bind:value={quickNotesTitle}
                                    placeholder="输入组件标题"
                                />
                            </label>
                        </div>
                    </div>
                {/if}
            </div>
        {:else if activeTab === "info"}
            <!-- 信息资讯 -->
            <div class="content-type-select">
                <label for="content-type">选择组件：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="HOT">热搜</option>
                    <option value="dailyQuote">每日一言</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "HOT"}
                    <div class="content-panel hot">
                        <h4>热搜设置</h4>
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
                    </div>
                {:else if selectedContentType === "dailyQuote"}
                    <div class="content-panel dailyQuote">
                        <div class="form-group dailyQuoteMode">
                            <label
                                >每日一言模式：<select
                                    bind:value={dailyQuoteMode}
                                >
                                    <option value="remote">远程接口</option>
                                    <option value="custom">自定义文字</option
                                    ></select
                                ></label
                            >
                            <label for=""
                                >字体大小：<input
                                    type="number"
                                    bind:value={dailyQuoteFontSize}
                                /></label
                            >
                        </div>
                        {#if dailyQuoteMode === "remote"}
                            <label for=""
                                >接口来源：<select
                                    bind:value={dailyQuoteSource}
                                >
                                    <option value="classic">今日语录</option>
                                    <option value="celebrity">名人名言</option>
                                    <option value="emotion">情感语录</option
                                    ><option value="gaoxiao">搞笑语录</option
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
                                {#if dailyQuoteBgSelect === "remote" && dailyQuoteRemoteBg}
                                    <img
                                        src={dailyQuoteRemoteBg}
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
                    </div>
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
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "heatmap"}
                    <div class="content-panel heatmap">
                        <h4>热力图设置</h4>

                        <!-- 时间范围类型 -->
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

                        <p>
                            注：热力图统计的是每日的块（block）数，而不是字数。
                        </p>
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
                    </div>
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
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "countdown"}
                    <div class="content-panel countdown">
                        <h4>倒数日设置</h4>
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
                    </div>
                {:else if selectedContentType === "weather"}
                    <div class="content-panel weather">
                        <h4>今日天气设置</h4>
                        <div class="form-group">
                            <label for="weather-city">城市名称：</label>
                            <input
                                id="weather-city"
                                type="text"
                                bind:value={customWeatherCity}
                                placeholder="例如：北京"
                            />
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
                                                src={morningBgUrl}
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
                                                src={afternoonBgUrl}
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
                                                src={nightBgUrl}
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
                                                src={focusBgImage}
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
                                                src={breakBgImage}
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
                    </div>
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
                    </div>
                {:else if selectedContentType === "custom-web"}
                    <div class="content-panel custom-web">
                        <h4>自定义网页浏览器</h4>
                        <p>请输入你想要显示的网页地址：</p>
                        <div class="form-group">
                            <label for="custom-web-url">网页地址：</label>
                            <input
                                id="custom-web-url"
                                type="text"
                                bind:value={customWebUrl}
                                placeholder="https://example.com"
                            />
                        </div>
                    </div>
                {:else if selectedContentType === "custom-protyle"}
                    <div class="content-panel custom-protyle">
                        <h4>自定义文档编辑器</h4>
                        <p>请输入你想要显示的文档块 ID：</p>
                        <div class="form-group">
                            <label for="protyle-block-id">块 ID：</label>
                            <input
                                id="protyle-block-id"
                                type="text"
                                bind:value={customBlockID}
                                placeholder="例如：20250310094404-1yla4zz"
                            />
                        </div>
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
                    const config = {
                        timeRangeType,
                        pastMonthCount,
                        selectedColorPreset,
                        customColor,
                    };
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "heatmap",
                        blockId: currentBlockId,
                        data: [config],
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
                        data: { quickNotesTitle },
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
                }

                onConfirm(JSON.stringify(contentTypeJson));
            }}
        >
            ✔ 确定
        </button>
        <button class="cancel-button" on:click={onClose}>❌ 取消</button>
    </div>
</div>
