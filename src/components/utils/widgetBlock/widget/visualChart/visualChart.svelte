<script lang="ts">
    import { showMessage, fetchSyncPost } from "siyuan";
    import { sql } from "@/api";
    import { onMount } from "svelte";
    import * as echarts from "echarts";
    import "echarts-wordcloud";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsedContent = JSON.parse(contentTypeJson);
    const visualChartType =
        parsedContent.data?.visualChartType || "progressBar";

    let themeColor: any;
    let textColor: any;
    let primaryColor: any;

    let progressBars = [];
    let progressBarType = "number";
    let newTitle = "";
    let newProgressType = "number";
    let newProgressNumber: number;
    let newProgressSQL = "";
    let newTargetType = "number";
    let newTargetNumber: number;
    let newTargetSQL = "";
    let newStartDate = "";
    let newEndDate = "";
    let tasks = [];
    let selectedTasks: any;
    let addedTaskIds = new Set();

    // 进度条配置
    function getProgressOption(bar) {
        let progressPercentage = 0;

        if (bar.target !== 0) {
            progressPercentage = parseFloat(
                ((bar.progress / bar.target) * 100).toFixed(2),
            );
        }

        const formatter =
            bar.type === "date"
                ? `${bar.title}: {c0}% (${Math.round(bar.progress)}天/共${bar.target}天)`
                : `${bar.title}: {c0}% (${bar.progress}/${bar.target})`;

        return {
            grid: {
                show: "true",
                borderWidth: 0,
                top: 0,
                left: 0,
                height: "100%",
                width: "80%",
            },
            tooltip: {
                trigger: "axis",
                axisPointer: { type: "shadow" },
                formatter: formatter,
            },
            xAxis: {
                show: false,
                type: "value",
                max: 100,
            },
            yAxis: {
                type: "category",
                inverse: true,
                show: false,
                axisLabel: {
                    show: true,
                    color: textColor,
                    formatter: function (index) {
                        return [`{lg|${index + 1}}{title|${bar.title}} `].join(
                            "\n",
                        );
                    },
                    rich: {
                        lg: {
                            color: themeColor,
                            padding: [0, 5, 0, 0],
                        },
                        title: { color: textColor },
                    },
                },
                data: ["进度"],
            },
            series: [
                {
                    name: "进度",
                    type: "bar",
                    itemStyle: {
                        borderRadius: 30,
                        color: primaryColor,
                    },
                    barWidth: 15,
                    label: {
                        show: true,
                        position: "right",
                        color: textColor,
                        formatter: `${progressPercentage}%`,
                    },
                    data: [progressPercentage],
                },
            ],
        };
    }

    async function addProgressBar() {
        let newBar: any;
        if (progressBarType === "number") {
            let actualProgress = newProgressNumber;
            let actualTarget = newTargetNumber;

            try {
                // 处理进度 SQL
                if (newProgressType === "sql" && newProgressSQL) {
                    const progressResult = await sql(newProgressSQL);
                    if (progressResult.length === 1) {
                        const item = progressResult[0];
                        const values = Object.values(item);

                        if (
                            values.length === 1 &&
                            typeof values[0] === "string" &&
                            !isNaN(Number(values[0]))
                        ) {
                            actualProgress = Number(values[0]);
                        } else {
                            showMessage(
                                "进度查询结果格式不符合要求，应为一个仅含数字字符串的对象",
                            );
                        }
                    } else if (progressResult.length >= 1) {
                        actualProgress = progressResult.length;
                    } else if (progressResult.length === 0) {
                        showMessage("进度查询结果为空");
                    }
                }

                // 处理目标 SQL
                if (newTargetType === "sql" && newTargetSQL) {
                    const targetResult = await sql(newTargetSQL);
                    if (targetResult.length === 1) {
                        const item = targetResult[0];
                        const values = Object.values(item);

                        if (
                            values.length === 1 &&
                            typeof values[0] === "string" &&
                            !isNaN(Number(values[0]))
                        ) {
                            actualTarget = Number(values[0]);
                        } else {
                            showMessage(
                                "目标查询结果格式不符合要求，应为一个仅含数字字符串的对象",
                            );
                        }
                    } else if (targetResult.length >= 1) {
                        actualTarget = targetResult.length;
                    } else if (targetResult.length === 0) {
                        showMessage("目标查询结果为空");
                    }
                }
            } catch (error) {
                showMessage(`SQL 执行错误: ${error.message}`);
                return;
            }

            newBar = {
                id: generateId(),
                title: newTitle,
                type: "number",
                progressType: "number",
                progress: actualProgress,
                targetType: "number",
                target: actualTarget,
            };

            progressBars = [...progressBars, newBar];
        } else if (progressBarType === "date") {
            const today = new Date();
            const start = new Date(newStartDate);
            const end = new Date(newEndDate);

            if (!(start instanceof Date) || isNaN(start.getTime())) {
                showMessage("起始日期格式无效");
                return;
            }
            if (!(end instanceof Date) || isNaN(end.getTime())) {
                showMessage("结束日期格式无效");
                return;
            }

            const startTime = start.getTime();
            const endTime = end.getTime();
            const todayTime = today.getTime();

            if (startTime > endTime) {
                showMessage("起始日期不能晚于结束日期");
                return;
            }

            const totalDays = Math.floor(
                (endTime - startTime) / (1000 * 60 * 60 * 24),
            );
            const passedDays = Math.floor(
                (todayTime - startTime) / (1000 * 60 * 60 * 24),
            );

            const actualProgress = Math.max(0, Math.min(totalDays, passedDays));
            const actualTarget = totalDays;

            newBar = {
                id: generateId(),
                title: newTitle,
                type: "date",
                progressType: "number",
                progress: actualProgress,
                targetType: "number",
                target: actualTarget,
                startDate: start.toISOString().split("T")[0],
                endDate: end.toISOString().split("T")[0],
            };

            progressBars = [...progressBars, newBar];
        } else if (progressBarType === "task") {
            const selectedTaskIds = Array.from(selectedTasks);
            if (selectedTaskIds.length === 0) {
                showMessage("请选择至少一个任务");
                return;
            }

            const newBars = [];

            for (const taskId of selectedTaskIds) {
                const task = tasks.find((t) => t.Id === taskId);
                if (!task) continue;

                let start = task.startDate
                    ? new Date(task.startDate)
                    : parseSiYuanTimestamp(task.created);
                let end = task.deadline ? new Date(task.deadline) : null;

                if (!end) {
                    showMessage(`任务 "${task.taskname}" 缺少截止日期`);
                    continue;
                }

                const today = new Date();
                const startTime = start.getTime();
                const endTime = end.getTime();

                if (startTime > endTime) {
                    showMessage(`任务 "${task.taskname}" 起始时间晚于结束时间`);
                    continue;
                }

                const totalDays = Math.floor(
                    (endTime - startTime) / (1000 * 60 * 60 * 24),
                );
                const passedDays = Math.floor(
                    (today.getTime() - startTime) / (1000 * 60 * 60 * 24),
                );
                const actualProgress = Math.max(
                    0,
                    Math.min(totalDays, passedDays),
                );

                newBar = {
                    id: generateId(),
                    title: task.taskname,
                    type: "date",
                    progressType: "number",
                    progress: actualProgress,
                    targetType: "number",
                    target: totalDays,
                    startDate: start.toISOString().split("T")[0],
                    endDate: end.toISOString().split("T")[0],
                    taskId: task.Id,
                };

                newBars.push(newBar);
                addedTaskIds.add(task.Id);
            }

            if (newBars.length > 0) {
                progressBars = [...progressBars, ...newBars];
                setTimeout(() => initCharts(), 50);
                await saveConfig();
            }
        }
        setTimeout(() => initCharts(), 50);
        await saveConfig();
        newTitle = "";
        newProgressNumber = 0;
        newTargetNumber = 0;
        newStartDate = "";
        newEndDate = "";

        await saveConfig();
    }

    function initCharts() {
        progressBars.forEach((bar) => {
            const chartDom = document.querySelector(
                `.chart-container-${bar.id}`,
            ) as HTMLElement;
            if (!chartDom) return;

            const existingChart = echarts.getInstanceByDom(chartDom);
            if (existingChart) existingChart.dispose();

            const myChart = echarts.init(chartDom);
            myChart.setOption(getProgressOption(bar));
        });
    }

    async function removeProgressBar(id: number) {
        progressBars = progressBars.filter((bar) => bar.id !== id);
        await saveConfig();
    }

    async function saveConfig() {
        await plugin.saveData(`widget-${parsedContent.blockId}.json`, {
            ...parsedContent,
            data: {
                ...parsedContent.data,
                progressBars: progressBars.map((bar) => ({
                    id: bar.id,
                    title: bar.title,
                    type: bar.type,
                    progressType: bar.progressType,
                    progress: bar.progress,
                    targetType: bar.targetType,
                    target: bar.target,
                    startDate: bar.startDate,
                    endDate: bar.endDate,
                    taskId: bar.taskId,
                })),
            },
        });
    }

    async function getTasks() {
        const query = `
        SELECT *
        FROM blocks 
        WHERE subtype = 't' AND type != 'l' AND markdown LIKE '- [ ]%'
        ORDER BY updated DESC
        LIMIT 9999999999999;
    `;
        const response = await sql(query);

        const tasks = response
            .map((task) => {
                const lines = task.markdown.split("\n");
                const firstLine = lines[0].trim();

                if (!firstLine.includes("📅")) return null;

                const taskCheckMatch = firstLine.match(/^([*-]\s\[( |X|x)\])/);
                const taskCheck = taskCheckMatch
                    ? taskCheckMatch[0].trim()
                    : "";

                const taskname = firstLine
                    .replace(taskCheck, "")
                    .trim()
                    .split(/[📅⌛❗🔁⏰📍#]/)[0]
                    .trim();

                const regex = /([📅⌛❗🔁⏰📍#]+\s*[^📅⌛❗🔁⏰📍#]+)/g;
                const matches = firstLine.match(regex) || [];

                const parsed = {
                    deadline: "",
                    startDate: "",
                };

                matches.forEach((match: string) => {
                    const trimmed = match.trim();
                    if (trimmed.startsWith("📅")) {
                        parsed.deadline = trimmed.replace("📅", "").trim();
                    } else if (trimmed.startsWith("⌛")) {
                        parsed.startDate = trimmed.replace("⌛", "").trim();
                    }
                });

                return {
                    taskname,
                    startDate: parsed.startDate,
                    deadline: parsed.deadline,
                    created: task.created,
                    Id: task.id,
                };
            })
            .filter(Boolean);

        return tasks;
    }

    async function getTag() {
        const repo = await fetchSyncPost("/api/tag/getTag", { sort: 1 });
        const tagsList = repo.data;
        const tagData = tagsList.map((tag) => ({
            name: tag.name,
            count: tag.count,
        }));
        return tagData;
    }

    function getTagCloudOption(tagData) {
        return {
            tooltip: {
                show: true,
            },
            toolbox: {
                feature: {
                    saveAsImage: {},
                },
            },
            series: [
                {
                    name: "标签",
                    type: "wordCloud",
                    sizeRange: [10, 50],
                    rotationRange: [-45, 90],
                    textPadding: 0,
                    autoSize: {
                        enable: true,
                        minSize: 6,
                    },
                    data: tagData.map((tag) => ({
                        name: tag.name,
                        value: tag.count,
                        textStyle: {
                            color: `rgb(
                                ${Math.round(Math.random() * 160)},
                                ${Math.round(Math.random() * 160)},
                                ${Math.round(Math.random() * 160)}
                            )`,
                        },
                    })),
                },
            ],
        };
    }

    function parseSiYuanTimestamp(timestamp: string): Date {
        const year = parseInt(timestamp.substring(0, 4), 10);
        const month = parseInt(timestamp.substring(4, 6), 10) - 1;
        const day = parseInt(timestamp.substring(6, 8), 10);
        const hour = parseInt(timestamp.substring(8, 10), 10);
        const minute = parseInt(timestamp.substring(10, 12), 10);
        const second = parseInt(timestamp.substring(12, 14), 10);

        return new Date(year, month, day, hour, minute, second);
    }

    function generateId() {
        return "xxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    onMount(async () => {
        const savedConfig = await plugin.loadData(
            `widget-${parsedContent.blockId}.json`,
        );

        if (savedConfig?.data?.progressBars) {
            progressBars = await Promise.all(
                savedConfig.data.progressBars.map(async (bar) => {
                    let progress = bar.progress;
                    let target = bar.target;
                    if (bar.progressType === "sql" && bar.progressSQL) {
                        const progressResult = await sql(bar.progressSQL);
                        if (progressResult.length === 1) {
                            const item = progressResult[0];
                            const values = Object.values(item);

                            if (
                                values.length === 1 &&
                                typeof values[0] === "string" &&
                                !isNaN(Number(values[0]))
                            ) {
                                progress = Number(values[0]);
                            } else {
                                showMessage(
                                    "进度查询结果格式不符合要求，应为一个仅含数字字符串的对象",
                                );
                            }
                        } else if (progressResult.length >= 1) {
                            progress = progressResult.length;
                        } else if (progressResult.length === 0) {
                            showMessage("进度查询结果为空");
                        }
                    }
                    if (bar.targetType === "sql" && bar.targetSQL) {
                        const targetResult = await sql(bar.targetSQL);
                        if (targetResult.length === 1) {
                            const item = targetResult[0];
                            const values = Object.values(item);

                            if (
                                values.length === 1 &&
                                typeof values[0] === "string" &&
                                !isNaN(Number(values[0]))
                            ) {
                                target = Number(values[0]);
                            } else {
                                showMessage(
                                    "目标查询结果格式不符合要求，应为一个仅含数字字符串的对象",
                                );
                            }
                        } else if (targetResult.length >= 1) {
                            target = targetResult.length;
                        } else if (targetResult.length === 0) {
                            showMessage("目标查询结果为空");
                        }
                    }
                    if (bar.type === "date") {
                        const today = new Date();
                        const start = new Date(bar.startDate);
                        const end = new Date(bar.endDate);

                        if (
                            !(start instanceof Date) ||
                            isNaN(start.getTime())
                        ) {
                            showMessage("起始日期格式无效");
                            return;
                        }
                        if (!(end instanceof Date) || isNaN(end.getTime())) {
                            showMessage("结束日期格式无效");
                            return;
                        }

                        const startTime = start.getTime();
                        const endTime = end.getTime();
                        const todayTime = today.getTime();

                        if (startTime > endTime) {
                            showMessage("起始日期不能晚于结束日期");
                            return;
                        }

                        const totalDays = Math.floor(
                            (endTime - startTime) / (1000 * 60 * 60 * 24),
                        );
                        const passedDays = Math.floor(
                            (todayTime - startTime) / (1000 * 60 * 60 * 24),
                        );

                        progress = Math.max(0, Math.min(totalDays, passedDays));
                        target = totalDays;
                    }
                    return {
                        ...bar,
                        taskId: bar.taskId,
                        progress,
                        target,
                        startDate: bar.startDate ?? null,
                        endDate: bar.endDate ?? null,
                    };
                }),
            );
            addedTaskIds = new Set(
                progressBars
                    .filter((bar) => bar.taskId)
                    .map((bar) => bar.taskId),
            );
        }

        tasks = await getTasks();

        setTimeout(async () => {
            // 获取主题颜色
            themeColor = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-surface")
                .trim();
            textColor = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-on-surface")
                .trim();
            primaryColor = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-primary")
                .trim();

            if (visualChartType === "progressBar") {
                progressBars.forEach((bar) => {
                    const chartDom = document.querySelector(
                        `.chart-container-${bar.id}`,
                    ) as HTMLElement;
                    if (!chartDom) return;

                    const myChart = echarts.init(chartDom);
                    myChart.setOption(getProgressOption(bar));
                });
            } else if (visualChartType === "tagCloud") {
                const tagData = await getTag();
                const chartDom = document.querySelector(
                    ".chart-container",
                ) as HTMLElement;
                if (!chartDom) return;

                const myChart = echarts.init(chartDom);
                const option = getTagCloudOption(tagData);
                myChart.setOption(option);
            }
        }, 0);
    });
</script>

<div class="content-display">
    {#if visualChartType === "progressBar"}
        <div class="progressBar-container">
            {#each progressBars as bar (bar.id)}
                <div class="progress-item">
                    <div class="progress-title" title={bar.title}>
                        {bar.title}
                    </div>
                    <div class="chart-container chart-container-{bar.id}"></div>
                    <button
                        title="删除"
                        on:click={() => removeProgressBar(bar.id)}>×</button
                    >
                </div>
            {/each}
            <div class="add-controls">
                <label
                    >类型：
                    <select bind:value={progressBarType}>
                        <option value="number">数量</option>
                        <option value="date">日期</option>
                        <option value="task">任务</option>
                    </select>
                </label>
                {#if progressBarType === "number"}
                    <label
                        >标题：<input
                            bind:value={newTitle}
                            placeholder="进度标题"
                        /></label
                    >
                    <label
                        >进度：
                        <select bind:value={newProgressType}>
                            <option value="number">数字</option>
                            <option value="sql">SQL</option>
                        </select>
                        {#if newProgressType === "number"}
                            <input
                                type="number"
                                bind:value={newProgressNumber}
                                min="0"
                                max="100"
                            />
                        {:else}
                            <textarea
                                bind:value={newProgressSQL}
                                placeholder="SQL 语句"
                            />
                        {/if}
                    </label>
                    <label
                        >目标：
                        <select bind:value={newTargetType}>
                            <option value="number">数字</option>
                            <option value="sql">SQL</option>
                        </select>
                        {#if newTargetType === "number"}
                            <input
                                type="number"
                                bind:value={newTargetNumber}
                                min="0"
                                max="100"
                            />
                        {:else}
                            <textarea
                                bind:value={newTargetSQL}
                                placeholder="SQL 语句"
                            />
                        {/if}
                    </label>
                {:else if progressBarType === "date"}
                    <label
                        >标题：<input
                            bind:value={newTitle}
                            placeholder="进度标题"
                        /></label
                    >
                    <label
                        >起始：
                        <input type="date" bind:value={newStartDate} />
                    </label>
                    <label
                        >结束：
                        <input type="date" bind:value={newEndDate} />
                    </label>
                {:else if progressBarType === "task"}
                    <p>使用前请先了解“任务管理 Plus”</p>
                    <div class="task-list">
                        {#if tasks.length === 0}
                            <p>暂无符合条件的未完成任务</p>
                        {:else}
                            {#each tasks as task}
                                {#if !addedTaskIds?.has(task.Id)}
                                    <label class="task-item">
                                        <input
                                            type="checkbox"
                                            bind:group={selectedTasks}
                                            value={task.Id}
                                            disabled={!task.Id}
                                        />
                                        <span>{task.taskname}</span>
                                    </label>
                                {/if}
                            {/each}
                        {/if}
                    </div>
                {/if}
                <button on:click={addProgressBar}>添加</button>
            </div>
        </div>
    {:else if visualChartType === "tagCloud"}
        <div class="chart-container"></div>
    {/if}
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 1rem;
        box-sizing: border-box;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

        .chart-container {
            width: 100%;
            height: 100%;
        }

        .progressBar-container {
            width: 100%;
            flex-direction: column;
            gap: 1rem;
            overflow-y: auto;

            .progress-item {
                margin-top: 1rem;
                height: 1.5rem;
                background: var(--b3-theme-surface);
                padding: 1rem;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: space-between;

                &:hover button {
                    opacity: 1;
                }

                .progress-title {
                    width: fit-content;
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                button {
                    border: none;
                    background: none;
                    border-radius: 50%;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.3s;

                    &:hover {
                        cursor: pointer;
                        color: var(--b3-theme-on-surface);
                        background: red;
                    }
                }

                .chart-container {
                    flex: 1;
                }
            }

            .add-controls {
                display: flex;
                justify-content: center;
                align-items: center;
                flex-direction: column;
                gap: 0.5rem;
                margin-top: 1rem;
                opacity: 0;
                transition: opacity 0.3s;

                &:hover,
                &:focus-within {
                    opacity: 1;
                }

                input {
                    padding: 0.5rem;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 8px;
                    background: transparent;

                    &:focus {
                        outline: none;
                        border: 1.5px solid var(--b3-theme-primary);
                    }
                }

                textarea {
                    padding: 0.5rem;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 8px;
                    background: transparent;

                    &:focus {
                        outline: none;
                        border: 1.5px solid var(--b3-theme-primary);
                    }
                }

                select {
                    padding: 0.5rem;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 8px;
                    background: transparent;
                }

                button {
                    padding: 0.5rem;
                    border: 1px solid var(--b3-border-color);
                    border-radius: 8px;
                    background: transparent;

                    &:hover {
                        background: var(--b3-theme-surface);
                    }
                }

                .task-list {
                    width: 100%;
                    max-height: 200px;
                    display: flex;
                    gap: 1rem;
                    flex-direction: column;
                    align-items: center;
                    overflow-y: auto;

                    .task-item {
                        width: 200px;
                        height: 1rem;
                        background: var(--b3-theme-surface);
                        padding: 1rem;
                        border-radius: 8px;
                        gap: 0.5rem;
                        display: flex;
                        align-items: center;
                        justify-content: flex-start;

                        span {
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }
                    }
                }
            }
        }
    }
</style>
