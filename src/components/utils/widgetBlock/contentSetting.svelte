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

    // 文档数量限制下拉框的绑定值
    let docLimit: number = 5;
    let docJournalLimit: number = 5;

    let showCompletedTasks = true; // 默认显示已完成任务

    // 倒数日相关变量
    let eventList = [{ name: "", date: "" }];

    // 天气相关变量
    let customWeatherCity: string = "北京";

    // 热搜相关变量
    let hotSource: string = "bilibili";
    const hotSources = [
        { value: "bilibili", label: "B站" },
        { value: "weibo", label: "微博" },
        { value: "baidu", label: "百度" },
    ];

    // 时间范围相关
    let timeRangeType: "past" | "custom" = "past";
    let pastMonthCount: number = 6;

    // 颜色相关
    let selectedColorPreset: "github" | "blue" | "custom" = "github";
    let customColor: string = "#1ea769"; // 默认 GitHub 绿色

    // 下拉选项
    const limitOptions = [5, 10, 15, 20];

    // 自定义网页链接
    let customWebUrl: string = "";

    // 自定义显示块ID
    let customBlockID: string = "";

    // 时间日期相关
    let showSeconds: boolean = true;
    let dateFormat: string = "YYYY年MM月DD日";
    let showLunar: boolean = true;
    let showZodiac: boolean = true;
    let showSolarTerm: boolean = true;
    let showWeek: boolean = true;
    let showDate: boolean = true;
    // 背景图设置 - 远程 URL
    let morningBgUrl =
        "https://haowallpaper.com/link/common/file/previewFileImg/16637944029171072";
    let afternoonBgUrl =
        "https://haowallpaper.com/link/common/file/previewFileImg/16989237330693504";
    let nightBgUrl =
        "https://haowallpaper.com/link/common/file/previewFileImg/15477811848581440";

    // 声明文件输入元素引用
    let morningBgInput: HTMLInputElement | null = null;
    let afternoonBgInput: HTMLInputElement | null = null;
    let nightBgInput: HTMLInputElement | null = null;
    // 存储 base64 图片数据
    let morningBgImage = null;
    let afternoonBgImage = null;
    let nightBgImage = null;

    // 下拉选择项
    let morningImageType = "remote"; // 可选 remote / local
    let afternoonImageType = "remote";
    let nightImageType = "remote";

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
                    afternoonBgImage = reader.result; // 安全赋值
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
            let parsedData;

            if (typeof settingData === "string") {
                try {
                    parsedData = JSON.parse(settingData); // 如果是字符串就解析
                } catch (e) {
                    console.error("无法解析 settingData", e);
                    return;
                }
            } else {
                parsedData = settingData; // 如果已经是对象就不解析
            }

            selectedContentType = parsedData.type || "latest-docs";
            activeTab = parsedData.activeTab || "note";

            if (parsedData.type === "latest-docs") {
                docLimit = parsedData.data?.[0]?.limit || 5;
            } else if (parsedData.type === "heatmap") {
                pastMonthCount = parsedData.data?.[0]?.pastMonthCount || 6;
                selectedColorPreset =
                    parsedData.data?.[0]?.selectedColorPreset || "github";
                customColor = parsedData.data?.[0]?.customColor || "#1ea769";
            } else if (parsedData.type === "recent-journals") {
                docJournalLimit = parsedData.data?.[0]?.limit || 5;
            } else if (parsedData.type === "countdown") {
                eventList = parsedData.data || [{ name: "", date: "" }];
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
            } else if (parsedData.type === "TaskMan") {
                showCompletedTasks =
                    parsedData.data?.showCompletedTasks ?? true;
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
                <label for="content-type">选择组件类型：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="favorites">收藏文档</option>
                    <option value="TaskMan">任务管理</option>
                    <option value="latest-docs">最新文档</option>
                    <option value="recent-journals">最近日记</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "latest-docs"}
                    <!-- 最新文档设置区域 -->
                    <div class="content-panel latest-docs">
                        <div class="form-group">
                            <label for="doc-limit">显示条目数：</label>
                            <select id="doc-limit" bind:value={docLimit}>
                                {#each limitOptions as option}
                                    <option value={option}>{option} 条</option>
                                {/each}
                            </select>
                        </div>
                        <p>这里是“最新文档”的配置项。</p>
                    </div>
                {:else if selectedContentType === "favorites"}
                    <div class="content-panel favorites">
                        <!-- 收藏文档设置区域 -->
                        <h4>收藏文档设置</h4>
                        <p>这里是“收藏文档”的配置项。</p>
                    </div>
                {:else if selectedContentType === "recent-journals"}
                    <div class="content-panel recent-journals">
                        <!-- 最近日记设置区域 -->
                        <h4>最近日记设置</h4>
                        <div class="form-group">
                            <label for="journal-limit">显示条目数：</label>
                            <select
                                id="journal-limit"
                                bind:value={docJournalLimit}
                            >
                                {#each limitOptions as option}
                                    <option value={option}>{option} 条</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                {:else if selectedContentType === "TaskMan"}
                    <div class="content-panel TaskMan">
                        <!-- 任务管理设置区域 -->
                        <h4>任务管理设置</h4>
                        <div class="form-group">
                            <label>
                                <input
                                    type="checkbox"
                                    bind:checked={showCompletedTasks}
                                />
                                显示已完成的任务
                            </label>
                        </div>
                    </div>
                {/if}
            </div>
        {:else if activeTab === "info"}
            <!-- 信息资讯 -->
            <div class="content-type-select">
                <label for="content-type">选择组件类型：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="HOT">热搜</option>
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
                        <p>当前选中的平台：{hotSource}</p>
                    </div>
                {:else if selectedContentType === "other"}
                    <div class="content-panel TaskMan"></div>
                {/if}
            </div>
        {:else if activeTab === "visualization"}
            <!-- 可视化 -->
            <div class="content-type-select">
                <label for="content-type">选择组件类型：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="heatmap">热力图</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "heatmap"}
                    <div class="content-panel heatmap">
                        <h4>热力图设置</h4>

                        <!-- 时间范围类型 -->
                        <div class="form-group">
                            <label for="month-count">显示过去几个月：</label>
                            <select
                                id="month-count"
                                bind:value={pastMonthCount}
                            >
                                {#each [1, 2, 3, 4, 5, 6] as month}
                                    <option value={month}>{month} 个月</option>
                                {/each}
                            </select>
                        </div>

                        <!-- 颜色选择 -->
                        <div class="form-group">
                            <label for="color-preset-select"
                                >选择颜色风格：</label
                            >
                            <select
                                id="color-preset-select"
                                bind:value={selectedColorPreset}
                            >
                                <option value="github">GitHub 绿色</option>
                                <option value="blue">蓝色系</option>
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
                {:else if selectedContentType === "other"}
                    <div class="content-panel TaskMan"></div>
                {/if}
            </div>
        {:else if activeTab === "tool"}
            <!-- 日常工具 -->
            <div class="content-type-select">
                <label for="content-type">选择组件类型：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="countdown">倒数日</option>
                    <option value="weather">今日天气</option>
                    <option value="timedate">时间日期</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "countdown"}
                    <div class="content-panel countdown">
                        <h4>倒数日设置</h4>
                        <div class="countdown-form-group">
                            {#each eventList as event, index}
                                <div class="event-form-group">
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
                                    <button on:click={() => removeEvent(index)}>
                                        <span>❌</span> 删除
                                    </button>
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
                        <h4>当前时间设置</h4>
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

                        {#if showDate}
                            <div class="form-group">
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
                            </div>
                        {/if}

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
                                            >早晨：</label
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
                                            >中午：</label
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
                                            >晚上：</label
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
                {/if}
            </div>
        {:else if activeTab === "custom"}
            <!-- 自定义 -->
            <div class="content-type-select">
                <label for="content-type">选择组件类型：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="custom-protyle">自定义文档编辑器内容</option>
                    <option value="custom-text">自定义文字内容</option>
                    <option value="custom-web">自定义网页</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "custom-text"}
                    <div class="content-panel custom-text">
                        <h4>自定义文字内容</h4>
                        <p>
                            在这里输入你想要显示的自定义文字内容，以 markdown
                            格式编写。
                        </p>
                        <textarea
                            placeholder="请输入自定义文字..."
                            bind:value={customTextInputValue}
                        ></textarea>
                    </div>
                {:else if selectedContentType === "custom-web"}
                    <div class="content-panel custom-web">
                        <h4>自定义网页设置</h4>
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
                        <h4>自定义文档编辑器内容</h4>
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
                let contentTypeJson = {};

                if (selectedContentType === "latest-docs") {
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "latest-docs",
                        blockId: currentBlockId,
                        data: [{ limit: docLimit }],
                    };
                } else if (selectedContentType === "favorites") {
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "favorites",
                        blockId: currentBlockId,
                        data: [],
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
                        data: [{ limit: docJournalLimit }],
                    };
                } else if (selectedContentType === "TaskMan") {
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "TaskMan",
                        blockId: currentBlockId,
                        data: {
                            showCompletedTasks,
                        },
                    };
                } else if (selectedContentType === "countdown") {
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "countdown",
                        blockId: currentBlockId,
                        data: eventList.filter(
                            (event) => event.name && event.date,
                        ),
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
