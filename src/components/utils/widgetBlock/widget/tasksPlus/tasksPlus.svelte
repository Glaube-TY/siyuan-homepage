<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { openDocs } from "@/components/tools/openDocs";
    import { gettasksList, formatTasksList } from "./tasksPlus";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    const parsed = JSON.parse(contentTypeJson);
    let TaskManPlusTitle = parsed.data?.TaskManPlusTitle || "📋任务管理Plus";
    let internalFilter = parsed.data?.internalFilter || "all";
    let isCustomFilter = parsed.data?.isCustomFilter || false;
    let customFilter = parsed.data?.customFilter || "";
    let tasksSort = parsed.data?.tasksSort || "startdate";
    let tasksList: any[] = [];
    let tasksListFormat: any;
    let reminderCheckInterval: number | null = null;

    function showSystemNotification(title: string, body: string) {
        if (!("Notification" in window)) {
            console.warn("此浏览器不支持桌面通知");
            return;
        }

        const symbol = document.querySelector("svg defs symbol#iconhomepage");
        if (!symbol) {
            console.warn("未找到 iconhomepage 图标");
            return;
        }

        // 创建 SVG 图标
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 1024 1024");
        svg.setAttribute("xmlns", svgNS);
        svg.innerHTML = symbol.innerHTML;

        // 转换为 base64
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(svg);
        const base64Svg = btoa(unescape(encodeURIComponent(svgStr)));
        const iconUrl = `data:image/svg+xml;base64,${base64Svg}`;

        if (Notification.permission === "granted") {
            new Notification(title, { body, icon: iconUrl });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }

    function setupReminderChecker(tasks: any[]) {
        const checkReminders = () => {
            const now = new Date();

            // 当前时间格式化为 "YYYY-MM-DD HH:mm"
            const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

            tasks.forEach((task) => {
                if (!task.parsed.reminder) return;

                const reminderRaw = task.parsed.reminder.trim();
                const [datePart, timePart] = reminderRaw.split(/\s+/);

                let reminderDate: Date | null = null;

                // ✅ 如果有日期+时间（如："2025-8-6 18:30"）
                if (timePart) {
                    const [y, m, d] = datePart.split("-").map(Number);
                    const [h, min] = timePart.split(":").map(Number);
                    reminderDate = new Date(y, m - 1, d, h || 0, min || 0);
                }
                // ✅ 如果只有时间（如："18:30"），则补上 deadline 或 startDate
                else {
                    const fallbackDate =
                        task.parsed.deadline || task.parsed.startDate;
                    if (!fallbackDate) return; // ❌ 缺少日期源，跳过

                    const [y, m, d] = fallbackDate.split("-").map(Number);
                    const [h, min] = datePart.split(":").map(Number);
                    reminderDate = new Date(y, m - 1, d, h || 0, min || 0);
                }

                if (!reminderDate || isNaN(reminderDate.getTime())) return;

                const reminderStr = `${reminderDate.getFullYear()}-${String(reminderDate.getMonth() + 1).padStart(2, "0")}-${String(reminderDate.getDate()).padStart(2, "0")} ${String(reminderDate.getHours()).padStart(2, "0")}:${String(reminderDate.getMinutes()).padStart(2, "0")}`;

                // ✅ 只在第一次匹配的时候提醒
                if (reminderStr === nowStr && !task.hasReminded) {
                    showSystemNotification(
                        "任务提醒",
                        `${task.taskname}\n⏰ ${task.parsed.reminder}`,
                    );
                    task.hasReminded = true; // 标记为已提醒
                }
            });
        };

        // 每秒检查一次提醒
        reminderCheckInterval = setInterval(
            checkReminders,
            1000,
        ) as unknown as number;
        checkReminders(); // 页面加载时立刻执行一次
    }

    async function handleCheck(event: Event, task: any) {
        const isChecked = (event.target as HTMLInputElement).checked;
        const checkChar = isChecked ? "X" : " ";

        try {
            const newMarkdown = task.initmarkdown.replace(
                /\[([xX ]?)\]/,
                `[${checkChar}]`,
            );

            await plugin.client.updateBlock({
                data: newMarkdown,
                dataType: "markdown",
                id: task.id,
            });

            task.taskCheck = checkChar;
            task.initmarkdown = newMarkdown;
        } catch (err) {
            console.error("更新任务状态失败:", err);
            task.taskCheck = isChecked ? " " : "X";
            event.preventDefault();
        }
    }

    function parseRecurrence(recurrence: string): {
        type: "daily" | "weekly" | "monthly" | "ndays" | "nweeks" | "nmonths";
        value?: number;
    } {
        recurrence = recurrence.trim();

        if (recurrence === "每天") return { type: "daily" };
        if (recurrence === "每周") return { type: "weekly" };
        if (recurrence === "每月") return { type: "monthly" };

        const dailyMatch = recurrence.match(/每(\d+)天/);
        if (dailyMatch)
            return { type: "ndays", value: parseInt(dailyMatch[1]) };

        const weeklyMatch = recurrence.match(/每(\d+)周/);
        if (weeklyMatch)
            return { type: "nweeks", value: parseInt(weeklyMatch[1]) };

        const monthlyMatch = recurrence.match(/每(\d+)月/);
        if (monthlyMatch)
            return { type: "nmonths", value: parseInt(monthlyMatch[1]) };

        return { type: null! };
    }

    async function updateTaskBasedOnRecurrence(task: any) {
        const { parsed } = task;
        if (!parsed.recurrence) return;

        const recurrenceInfo = parseRecurrence(parsed.recurrence);
        if (!recurrenceInfo.type) return;

        let baseDateStr = parsed.deadline || parsed.startDate;
        if (!baseDateStr) return;

        const [year, month, day] = baseDateStr.split("-").map(Number);
        let baseDate = new Date(year, month - 1, day);
        if (isNaN(baseDate.getTime())) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let intervalDays = 0;
        let shouldUpdate = false;

        switch (recurrenceInfo.type) {
            case "daily":
                intervalDays = 1;
                shouldUpdate = baseDate <= today;
                break;

            case "weekly":
                intervalDays = 7;
                shouldUpdate =
                    baseDate <= today && today.getDay() === baseDate.getDay();
                break;

            case "monthly":
                shouldUpdate = baseDate.getDate() === today.getDate();
                break;

            case "ndays":
                intervalDays = recurrenceInfo.value!;
                shouldUpdate =
                    Math.floor(
                        (today.getTime() - baseDate.getTime()) /
                            (1000 * 60 * 60 * 24),
                    ) %
                        intervalDays ===
                    0;
                break;

            case "nweeks":
                intervalDays = recurrenceInfo.value! * 7;
                shouldUpdate =
                    Math.floor(
                        (today.getTime() - baseDate.getTime()) /
                            (1000 * 60 * 60 * 24),
                    ) %
                        intervalDays ===
                    0;
                break;

            case "nmonths":
                const monthsDiff =
                    (today.getFullYear() - baseDate.getFullYear()) * 12 +
                    (today.getMonth() - baseDate.getMonth());
                shouldUpdate =
                    monthsDiff > 0 && today.getDate() === baseDate.getDate();
                break;
        }

        if (!shouldUpdate) return;

        const todayDate = new Date(today);

        let newBaseDate: Date;

        switch (recurrenceInfo.type) {
            case "daily":
            case "ndays":
            case "nweeks":
                newBaseDate = todayDate;
                break;

            case "weekly":
                newBaseDate = new Date(today);
                newBaseDate.setDate(newBaseDate.getDate() + 7);
                break;

            case "monthly":
                newBaseDate = new Date(today);
                newBaseDate.setMonth(newBaseDate.getMonth() + 1);
                break;

            case "nmonths":
                newBaseDate = new Date(today);
                newBaseDate.setMonth(
                    newBaseDate.getMonth() + recurrenceInfo.value!,
                );
                break;
        }

        const formattedNewDate = `${newBaseDate.getFullYear()}-${String(newBaseDate.getMonth() + 1).padStart(2, "0")}-${String(newBaseDate.getDate()).padStart(2, "0")}`;

        const lines = task.initmarkdown.split("\n");
        let firstLine = lines[0];

        firstLine = firstLine.replace(/\[([xX ])\]/, "[ ]");

        if (parsed.deadline) {
            firstLine = replaceDateField(firstLine, "📅", formattedNewDate);
        }

        const newMarkdown = updateFirstLineOnly(task.initmarkdown, firstLine);

        try {
            await plugin.client.updateBlock({
                id: task.id,
                data: newMarkdown,
                dataType: "markdown",
            });

            task.taskCheck = "- [ ]";
            task.parsed.deadline = formattedNewDate;
            task.initmarkdown = newMarkdown;
        } catch (err) {
            console.error("❌ 更新任务失败:", err);
        }
    }

    function replaceDateField(
        markdown: string,
        fieldSymbol: "📅" | "⌛",
        newDate: string,
    ): string {
        const regex = new RegExp(`(${fieldSymbol}[^📅📅⌛❗🔁⏰📍#]+)`, "g");
        return markdown.replace(regex, (match) => {
            const parts = match.trim().split(/[^\d-]/);
            if (parts.length === 1 && !parts[0]) return match;

            return fieldSymbol + newDate;
        });
    }

    function updateFirstLineOnly(
        markdown: string,
        newFirstLine: string,
    ): string {
        const lines = markdown.split("\n");
        lines[0] = newFirstLine;
        return lines.join("\n");
    }

    onMount(async () => {
        tasksList = await gettasksList();
        tasksListFormat = await formatTasksList(
            tasksList,
            internalFilter,
            isCustomFilter,
            customFilter,
            tasksSort,
        );

        tasksListFormat = tasksListFormat.map((task) => ({
            ...task,
            hasReminded: false,
        }));

        setupReminderChecker(tasksListFormat);

        for (const task of tasksListFormat) {
            await updateTaskBasedOnRecurrence(task);
        }
    });

    onDestroy(() => {
        if (reminderCheckInterval !== null) {
            clearInterval(reminderCheckInterval);
        }
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{TaskManPlusTitle}</h3>
    <div class="tasks-list-container">
        {#if Array.isArray(tasksListFormat) && tasksListFormat.length > 0}
            <ul class="task-list">
                {#each tasksListFormat as task}
                    <li class="task-item">
                        <label class="checkbox-label">
                            <input
                                type="checkbox"
                                checked={task.taskCheck?.includes("X") ||
                                    task.taskCheck?.includes("x")}
                                class="task-checkbox"
                                on:change={(e) => handleCheck(e, task)}
                            />
                            <button
                                type="button"
                                class="task-name"
                                on:click={() => openDocs(plugin, task.id)}
                            >
                                {task.taskname || "未命名任务"}
                            </button>
                        </label>
                        <div class="tasks-details">
                            <div class="meta-row">
                                {#if task.parsed.startDate || task.parsed.deadline}
                                    <div class="date-group">
                                        {#if task.parsed.startDate}
                                            <span class="date-item">
                                                ⌛
                                                {task.parsed.startDate}
                                            </span>
                                        {/if}
                                        {#if task.parsed.deadline}
                                            <span class="date-item">
                                                📅
                                                {task.parsed.deadline}
                                            </span>
                                        {/if}
                                    </div>
                                {/if}
                                {#if task.parsed.priority}
                                    <span class="priority">
                                        {task.parsed.priority}
                                    </span>
                                {/if}
                            </div>

                            <div class="meta-row">
                                {#if task.parsed.recurrence}
                                    <span class="meta-item">
                                        🔁
                                        {task.parsed.recurrence}
                                    </span>
                                {/if}
                                {#if task.parsed.reminder}
                                    <span class="meta-item">
                                        ⏰
                                        {task.parsed.reminder}
                                    </span>
                                {/if}
                                {#if task.parsed.location}
                                    <span class="meta-item">
                                        📍
                                        {task.parsed.location}
                                    </span>
                                {/if}
                            </div>

                            {#if task.parsed.tags?.length > 0}
                                <div class="tags">
                                    {#each task.parsed.tags as tag}
                                        <span class="tag">{tag}</span>
                                    {/each}
                                </div>
                            {/if}

                            <div class="hpath">
                                📄
                                {task.hpath}
                            </div>
                        </div>
                    </li>
                {/each}
            </ul>
        {:else}
            <div class="empty-tips">暂无待办事项</div>
        {/if}
    </div>
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 10px;
        box-sizing: border-box;

        .widget-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 0.5rem;
            padding-bottom: 0.3rem;
            border-bottom: 1px solid var(--b3-border-color);
            text-align: center;
            display: inline-block;
            line-height: 1.2;
        }

        .tasks-list-container {
            width: 100%;
            height: calc(100%);
            overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1rem;

            .task-list {
                list-style: none;
                margin: 1rem;
                display: contents;
            }

            .task-item {
                padding: 1rem;
                background-color: var(--b3-theme-surface);
                border-radius: 6px;
                transition: background-color 0.2s ease;
                min-width: max-content;
                height: auto;

                &:hover {
                    background-color: var(--b3-list-hover);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }

                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }

                .task-checkbox {
                    margin: 0;
                    accent-color: var(--b3-theme-primary);
                }

                .task-name {
                    background: none;
                    border: none;
                    padding: 0;
                    font: inherit;
                    color: var(--b3-theme-primary);
                    font-weight: bold;
                    text-align: left;
                    cursor: pointer;
                    flex-grow: 1;
                    max-width: 260px;

                    &:hover {
                        text-decoration: underline;
                    }
                }

                .empty-tips {
                    text-align: center;
                    color: var(--b3-theme-secondary);
                    padding: 1rem;
                }

                .tasks-details {
                    margin-top: 0.5rem;
                    font-size: 0.9em;

                    .meta-row {
                        display: flex;
                        gap: 1rem;
                        flex-wrap: wrap;
                        margin-bottom: 0.3rem;
                    }

                    .date-group {
                        display: flex;
                        gap: 1rem;
                    }

                    .tags {
                        margin-top: 0.5rem;
                        display: flex;
                        gap: 0.5rem;
                        flex-wrap: wrap;
                    }

                    .tag {
                        background: var(--b3-theme-surface-lighter);
                        padding: 0.2em 0.6em;
                        border-radius: 12px;
                        font-size: 0.85em;
                    }

                    .hpath {
                        margin-top: 0.8rem;
                        font-size: 0.85em;
                        opacity: 0.7;
                    }
                }
            }
        }
    }
</style>
