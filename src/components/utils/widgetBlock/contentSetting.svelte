<script lang="ts">
    import { onMount } from "svelte";

    // 弹窗接收的 props
    export let plugin: any;
    export let onClose: () => void;
    export let onConfirm: (contentTypeJson: string) => void;

    // 当前区块 ID
    export let currentBlockId: string = "";

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

    // 下拉选项
    const limitOptions = [5, 10, 15, 20];

    function addEvent() {
        eventList = [...eventList, { name: "", date: "" }];
    }

    function removeEvent(index) {
        eventList = eventList.filter((_, i) => i !== index);
    }

    // 模拟加载文档数据
    onMount(async () => {
        // 这里可以模拟加载文档数据
        // 实际应用中可能需要从 API 获取数据
    });
</script>

<div class="settings-container">
    <div class="settings-body">
        <!-- 内容类型选择 -->
        <div class="content-type-select">
            <label for="content-type">选择内容类型：</label>
            <select id="content-type" bind:value={selectedContentType}>
                <option value="latest-docs">最新文档</option>
                <option value="favorites">收藏文档</option>
                <option value="recent-tasks">最近任务</option>
                <option value="countdown">倒数日</option>
                <option value="recent-journals">最近日记</option>
                <option value="recent-tasks">最近任务</option>
                <option value="countdown">倒数日</option>
                <option value="weather">今日天气</option>
                <option value="HOT">热搜</option>
                <option value="custom-text">自定义文字</option>
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
                        <select id="journal-limit" bind:value={docJournalLimit}>
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
            {:else if selectedContentType === "countdown"}
                <div class="content-panel countdown">
                    <!-- 倒数日设置区域 -->
                    <h4>倒数日设置</h4>
                    {#each eventList as event, index}
                        <div class="event-form-group">
                            <div class="form-group">
                                <label for="event-name-{index}">名称：</label>
                                <input
                                    id="event-name-{index}"
                                    type="text"
                                    bind:value={event.name}
                                    placeholder="例如：纪念日"
                                />
                            </div>
                            <div class="form-group">
                                <label for="event-date-{index}">日期：</label>
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
                    <button on:click={() => addEvent()}>➕ 添加新事件</button>
                </div>
            {:else if selectedContentType === "weather"}
                <div class="content-panel weather">
                    <!-- 今日天气设置区域 -->
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
            {:else if selectedContentType === "HOT"}
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
            {:else if selectedContentType === "custom-text"}
                <div class="content-panel custom-text">
                    <!-- 自定义文字设置区域 -->
                    <h4>自定义文字设置</h4>
                    <textarea
                        placeholder="请输入自定义文字..."
                        bind:value={customTextInputValue}
                    ></textarea>
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
                            type: "latest-docs",
                            blockId: currentBlockId,
                            limit: docLimit,
                        };
                    } else if (selectedContentType === "favorites") {
                        contentTypeJson = {
                            type: "favorites",
                            blockId: currentBlockId,
                            data: [],
                        };
                    } else if (selectedContentType === "recent-journals") {
                        contentTypeJson = {
                            type: "recent-journals",
                            blockId: currentBlockId,
                            limit: docJournalLimit,
                        };
                    } else if (selectedContentType === "recent-tasks") {
                        contentTypeJson = {
                            type: "recent-tasks",
                            blockId: currentBlockId,
                            data: [],
                        };
                    } else if (selectedContentType === "countdown") {
                        contentTypeJson = {
                            type: "countdown",
                            blockId: currentBlockId,
                            data: eventList.filter(
                                (event) => event.name && event.date,
                            ),
                        };
                    } else if (selectedContentType === "weather") {
                        contentTypeJson = {
                            type: "weather",
                            blockId: currentBlockId,
                            data: {
                                city: customWeatherCity,
                            },
                        };
                    } else if (selectedContentType === "custom-text") {
                        const customText = customTextInputValue;
                        contentTypeJson = {
                            type: "custom-text",
                            blockId: currentBlockId,
                            data: customText,
                        };
                    } else if (selectedContentType === "HOT") {
                        contentTypeJson = {
                            type: "HOT",
                            blockId: currentBlockId,
                            data: {
                                source: hotSource,
                            },
                        };
                    }

                    onConfirm(JSON.stringify(contentTypeJson));
                }}>✔ 确定</button
            >
            <button class="cancel-button" on:click={onClose}>❌ 取消</button>
        </div>
    </div>
</div>

<style>
    .settings-container {
        padding: 1.5rem;
        background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.3);
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
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background-color: #fff;
        appearance: none;
        background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%2364748b' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 0.75rem center;
        background-size: 12px auto;
    }

    .dynamic-content-area {
        margin-bottom: 1.5rem;
        padding: 1rem;
        background-color: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
    }

    .content-panel h4 {
        color: #1e293b;
        margin-bottom: 0.5rem;
    }

    .hot .form-group select {
        background-color: #fffbe6;
        border-color: #facc15;
    }

    textarea {
        width: 100%;
        min-height: 100px;
        padding: 0.75rem;
        font-size: 14px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        resize: vertical;
        font-family: inherit;
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
        background: linear-gradient(45deg, #10b981 0%, #059669 100%);
        color: white;
        box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2);
    }

    .cancel-button {
        background: linear-gradient(45deg, #f1f5f9 0%, #e2e8f0 100%);
        color: #475569;
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
</style>
