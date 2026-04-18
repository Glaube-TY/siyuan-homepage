<script lang="ts">
    import { showMessage, fetchSyncPost, openTab } from "siyuan";
    import { sql } from "@/api";
    import { onMount, onDestroy } from "svelte";
    import * as echarts from "echarts";
    import "echarts-wordcloud";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    const parsedContent = $derived(JSON.parse(contentTypeJson));
    const visualChartType = $derived(
        parsedContent.data?.visualChartType || "progressBar"
    );

    let themeColor: any;
    let textColor: any;
    let primaryColor: any;

    let progressBars = $state([]);
    let progressBarType = $state("number");
    let newTitle = $state("");
    let newProgressType = $state("number");
    let newProgressNumber: number = $state();
    let newProgressSQL = $state("");
    let newTargetType = $state("number");
    let newTargetNumber: number = $state();
    let newTargetSQL = $state("");
    let newStartDate = $state("");
    let newEndDate = $state("");
    let tasks = $state([]);
    let selectedTasks: any = $state();
    let addedTaskIds = $state(new Set());

    // timeout id 记录
    let initChartsTimeout: ReturnType<typeof setTimeout> | null = null;
    let onMountTimeout: ReturnType<typeof setTimeout> | null = null;
    let redrawTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // 组件销毁标记
    let isDestroyed = false;
    // tagCloud 图表容器本地引用
    let tagCloudContainer: HTMLDivElement | null = $state(null);
    // 外层容器引用（用于 progressBar resize）
    let contentDisplayRef: HTMLDivElement | null = $state(null);
    // 主题观察器
    let themeObserver: MutationObserver | null = null;
    // 主题调度 timeout id
    let themeScheduleTimeout: ReturnType<typeof setTimeout> | null = null;
    // 上次主题签名
    let lastThemeSignature: string = "";
    // ResizeObserver
    let resizeObserver: ResizeObserver | null = null;
    // resize 调度 raf id
    let resizeRafId: number | null = null;
    // 进度条图表实例缓存
    let progressBarCharts: Map<string, echarts.ECharts> = new Map();

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
                initChartsTimeout = setTimeout(() => initCharts(), 50);
                await saveConfig();
            }
        }
        initChartsTimeout = setTimeout(() => initCharts(), 50);
        await saveConfig();
        newTitle = "";
        newProgressNumber = 0;
        newTargetNumber = 0;
        newStartDate = "";
        newEndDate = "";

        await saveConfig();
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
        const repo = await fetchSyncPost("/api/tag/getTag", { sort: 1, ignoreMaxListHint: true, app: "homepageVisualChart" });
        const tagsList = repo.data;
        const tagData = tagsList.map((tag: { name: string; count: number }) => ({
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

    function formatTagSearchQuery(tagName: string): string {
        let query = tagName;
        if (!query.startsWith("#")) {
            query = `#${query}`;
        }
        if (!query.endsWith("#")) {
            query = `${query}#`;
        }
        return query;
    }

    function openTagSearchTab(tagName: string): void {
        const query = formatTagSearchQuery(tagName);

        // 获取 app
        const app = plugin?.app || window.siyuan?.ws?.app;
        if (!app) {
            showMessage("打开标签搜索失败");
            return;
        }

        try {
            openTab({
                app: app,
                search: {
                    k: query,
                },
            });
        } catch (e) {
            showMessage("打开标签搜索失败");
        }
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

        onMountTimeout = setTimeout(async () => {
            if (isDestroyed) return;

            // 初始化图表
            await initCharts();

            // 延后重绘，确保主题样式已稳定
            redrawTimeoutId = setTimeout(() => {
                if (!isDestroyed) {
                    applyChartTheme();
                }
            }, 100);

            // 监听主题变化
            setupThemeObserver();
        }, 0);
    });

    async function initCharts() {
        if (isDestroyed) return;

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

                // 先 dispose 现有图表
                const existingChart = echarts.getInstanceByDom(chartDom);
                if (existingChart) existingChart.dispose();

                const myChart = echarts.init(chartDom);
                myChart.setOption(getProgressOption(bar));
                progressBarCharts.set(bar.id, myChart);
            });
        } else if (visualChartType === "tagCloud") {
            const tagData = await getTag();
            if (!tagCloudContainer) return;

            const myChart = echarts.init(tagCloudContainer);
            const option = getTagCloudOption(tagData);
            myChart.setOption(option);

            // 防止重复绑定
            myChart.off("click");
            myChart.on("click", (params: any) => {
                if (params.name) {
                    openTagSearchTab(params.name);
                }
            });
        }
    }

    function applyChartTheme() {
        // 重新获取主题颜色
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
                const myChart = progressBarCharts.get(bar.id);
                if (myChart) {
                    myChart.setOption(getProgressOption(bar));
                    myChart.resize();
                }
            });
        } else if (visualChartType === "tagCloud" && tagCloudContainer) {
            const myChart = echarts.getInstanceByDom(tagCloudContainer);
            if (myChart) {
                getTag().then((tagData) => {
                    const option = getTagCloudOption(tagData);
                    myChart.setOption(option);
                    myChart.resize();
                });
            }
        }
    }

    function getThemeSignature(): string {
        const mode = window.siyuan?.config?.appearance?.mode ?? 0;
        const surface = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-surface").trim();
        const onSurface = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-on-surface").trim();
        const primary = getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-primary").trim();
        return `${mode}|${surface}|${onSurface}|${primary}`;
    }

    function scheduleThemeUpdate() {
        if (themeScheduleTimeout) {
            clearTimeout(themeScheduleTimeout);
        }
        themeScheduleTimeout = setTimeout(() => {
            if (isDestroyed) return;
            const newSignature = getThemeSignature();
            if (newSignature !== lastThemeSignature) {
                lastThemeSignature = newSignature;
                applyChartTheme();
            }
        }, 50);
    }

    function setupThemeObserver() {
        // 初始化主题签名
        lastThemeSignature = getThemeSignature();

        // 观察 document.documentElement 和 document.body 的属性变化
        themeObserver = new MutationObserver(() => {
            if (isDestroyed) return;
            // 调度主题更新（去重 + 延后）
            scheduleThemeUpdate();
        });

        // 观察 html 和 body 的 class/style 变化
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style", "data-theme"],
        });

        if (document.body) {
            themeObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["class", "style", "data-theme"],
            });
        }

        // 观察 head 中的主题样式表变化
        const headObserver = new MutationObserver((mutations) => {
            if (isDestroyed) return;
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    const addedNodes = Array.from(mutation.addedNodes);
                    const hasThemeStyle = addedNodes.some((node: any) => {
                        if (node.nodeName === "LINK" || node.nodeName === "STYLE") {
                            const href = node.getAttribute?.("href") || "";
                            return href.includes("theme") || href.includes("appearance");
                        }
                        return false;
                    });
                    if (hasThemeStyle) {
                        scheduleThemeUpdate();
                    }
                }
            }
        });

        headObserver.observe(document.head, {
            childList: true,
        });

        // 保存引用以便清理
        (themeObserver as any)._headObserver = headObserver;

        // 设置 ResizeObserver 监听容器尺寸变化
        setupResizeObserver();

        // 监听页面可见性变化
        document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    function scheduleChartResize() {
        if (resizeRafId) {
            cancelAnimationFrame(resizeRafId);
        }
        resizeRafId = requestAnimationFrame(() => {
            resizeRafId = null;
            if (isDestroyed) return;

            if (visualChartType === "progressBar") {
                // 对所有 progressBar 图表进行 resize
                progressBarCharts.forEach((chart) => {
                    chart.resize();
                });
            } else if (visualChartType === "tagCloud" && tagCloudContainer) {
                const myChart = echarts.getInstanceByDom(tagCloudContainer);
                if (myChart && tagCloudContainer.clientWidth > 0 && tagCloudContainer.clientHeight > 0) {
                    myChart.resize();
                }
            }
        });
    }

    function setupResizeObserver() {
        if (typeof ResizeObserver === "undefined") return;

        const target = visualChartType === "tagCloud" ? tagCloudContainer : contentDisplayRef;
        if (!target) return;

        resizeObserver = new ResizeObserver(() => {
            if (isDestroyed) return;
            scheduleChartResize();
        });

        resizeObserver.observe(target);
    }

    function handleVisibilityChange() {
        if (document.visibilityState === "visible" && !isDestroyed) {
            scheduleChartResize();
        }
    }

    onDestroy(() => {
        isDestroyed = true;

        // 清理所有 timeout
        if (initChartsTimeout) {
            clearTimeout(initChartsTimeout);
            initChartsTimeout = null;
        }
        if (onMountTimeout) {
            clearTimeout(onMountTimeout);
            onMountTimeout = null;
        }
        if (redrawTimeoutId) {
            clearTimeout(redrawTimeoutId);
            redrawTimeoutId = null;
        }

        // 清理主题调度 timeout
        if (themeScheduleTimeout) {
            clearTimeout(themeScheduleTimeout);
            themeScheduleTimeout = null;
        }

        // 断开主题观察器
        if (themeObserver) {
            themeObserver.disconnect();
            // 断开 head observer
            if ((themeObserver as any)._headObserver) {
                (themeObserver as any)._headObserver.disconnect();
            }
            themeObserver = null;
        }

        // 断开 ResizeObserver
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        // 取消 resize raf
        if (resizeRafId) {
            cancelAnimationFrame(resizeRafId);
            resizeRafId = null;
        }

        // 移除 visibilitychange 监听
        document.removeEventListener("visibilitychange", handleVisibilityChange);

        // 销毁所有 ECharts 实例
        if (visualChartType === "progressBar") {
            progressBarCharts.forEach((chart) => {
                chart.dispose();
            });
            progressBarCharts.clear();
        } else if (visualChartType === "tagCloud") {
            if (tagCloudContainer) {
                const chart = echarts.getInstanceByDom(tagCloudContainer);
                if (chart) chart.dispose();
            }
        }
    });
</script>

<div class="content-display" bind:this={contentDisplayRef}>
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
                        onclick={() => removeProgressBar(bar.id)}>×</button
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
></textarea>
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
></textarea>
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
                <button onclick={addProgressBar}>添加</button>
            </div>
        </div>
    {:else if visualChartType === "tagCloud"}
        <div bind:this={tagCloudContainer} class="chart-container"></div>
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
