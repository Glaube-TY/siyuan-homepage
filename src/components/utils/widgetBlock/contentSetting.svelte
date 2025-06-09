<script lang="ts">
    import { onMount } from "svelte";

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
    let docLimit: number = 5; // 默认显示 5 条
    let docJournalLimit: number = 5;

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
                    <option value="latest-docs">最新文档</option>
                    <option value="favorites">收藏文档</option>
                    <option value="recent-tasks">最近任务</option>
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
                {:else if selectedContentType === "recent-tasks"}
                    <div class="content-panel recent-tasks">
                        <!-- 最近任务设置区域 -->
                        <h4>最近任务设置</h4>
                        <p>这里是“最近任务”的配置项。</p>
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
                    <div class="content-panel recent-tasks"></div>
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
                    </div>
                {:else if selectedContentType === "other"}
                    <div class="content-panel recent-tasks"></div>
                {/if}
            </div>
        {:else if activeTab === "tool"}
            <!-- 日常工具 -->
            <div class="content-type-select">
                <label for="content-type">选择组件类型：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="countdown">倒数日</option>
                    <option value="weather">今日天气</option>
                </select>
            </div>
            <!-- 动态内容区域 -->
            <div class="dynamic-content-area">
                {#if selectedContentType === "countdown"}
                    <div class="content-panel countdown">
                        <h4>倒数日设置</h4>
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
                                        type="date"
                                        bind:value={event.date}
                                    />
                                </div>
                                <button on:click={() => removeEvent(index)}
                                    >❌ 删除</button
                                >
                            </div>
                        {/each}
                        <button on:click={() => addEvent()}
                            >➕ 添加新事件</button
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
                {/if}
            </div>
        {:else if activeTab === "custom"}
            <!-- 自定义 -->
            <div class="content-type-select">
                <label for="content-type">选择组件类型：</label>
                <select id="content-type" bind:value={selectedContentType}>
                    <option value="custom-text">自定义文字内容</option>
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
                {:else if selectedContentType === "other"}
                    <div class="content-panel other"></div>
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
                } else if (selectedContentType === "recent-tasks") {
                    contentTypeJson = {
                        activeTab: activeTab,
                        type: "recent-tasks",
                        blockId: currentBlockId,
                        data: [],
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
                        data: [{customText: customTextInputValue}],
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
                }

                onConfirm(JSON.stringify(contentTypeJson));
            }}
        >
            ✔ 确定
        </button>
        <button class="cancel-button" on:click={onClose}>❌ 取消</button>
    </div>
</div>

<style>
    .settings-container {
        padding: 1.5rem;
        background: var(--b3-theme-background);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--b3-border-color);
        max-width: 480px;
        font-family: "Segoe UI", system-ui, sans-serif;
    }

    .content-type-select {
        margin-bottom: 1.5rem;
    }

    .content-type-select label {
        display: block;
        margin-bottom: 0.5rem;
        color: #475569;
        font-size: 14px;
        font-weight: 500;
    }

    select {
        width: 100%;
        padding: 0.5rem;
        font-size: 14px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background-color: var(--b3-theme-surface);
        appearance: none;
        background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%2364748b' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 0.75rem center;
        background-size: 12px auto;
    }

    .dynamic-content-area {
        margin-bottom: 1.5rem;
        padding: 1rem;
        background-color: var(--b3-theme-surface);
        border-radius: 8px;
        border: 1px solid var(--b3-border-color);
    }

    .content-panel h4 {
        color: var(--b3-theme-text);
        margin-bottom: 0.5rem;
    }

    .hot .form-group select {
        background-color: #fffbe6;
        border-color: #facc15;
    }

    textarea {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        min-height: 100px;
        padding: 0.75rem;
        font-size: 14px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        resize: vertical;
        font-family: inherit;
        overflow: auto;
    }

    .action-buttons-row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
    }

    .confirm-button,
    .cancel-button {
        flex: 1;
        padding: 0.5rem 1rem;
        font-size: 14px;
        font-weight: 600;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease-in-out;
    }

    .confirm-button {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2);
    }

    .cancel-button {
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        box-shadow: 0 2px 4px rgba(148, 163, 184, 0.2);
    }

    .event-form-group {
        background-color: #f1f5f9;
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
        position: relative;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        transition: background-color 0.2s ease;
    }

    .event-form-group:hover {
        background-color: #e2e8f0;
    }

    .tab-nav {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .tab-nav button {
        padding: 0.5rem 1rem;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease-in-out;
    }

    .tab-nav button.active {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
    }

    .tab-content {
        padding-top: 1rem;
    }
</style>
