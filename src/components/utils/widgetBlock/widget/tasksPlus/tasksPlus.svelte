<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import { openDocs } from "@/components/tools/openDocs";
    import { gettasksList, formatTasksList } from "./tasksPlus";
    import { updateTaskListItemMarker, updateBlock } from "@/api";
    import {
        ensureTaskBlockExists,
        ensureTaskIndexInitialized,
        refreshTaskIndexFromRecentDocuments,
        updateTaskIndexItem,
    } from "@/components/tools/siyuanComponentDataApi";
    import LocalIndexEmptyState from "../common/LocalIndexEmptyState.svelte";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", runtimeContext = {} }: Props = $props();

    const parsed = $derived(JSON.parse(contentTypeJson));
    let TaskManPlusTitle = $derived(parsed.data?.TaskManPlusTitle || "📋任务管理Plus");
    let internalFilter = $derived(parsed.data?.internalFilter || "all");
    let isCustomFilter = $derived(parsed.data?.isCustomFilter || false);
    let customFilter = $derived(parsed.data?.customFilter || "");
    let tasksSort = $derived(parsed.data?.tasksSort || "startdate");
    let tasksPlusSelectedNotebookIds = $derived<{ label: string; value: string }[]>(
        parsed.data?.tasksPlusSelectedNotebookIds ?? []
    );
    let tasksList: any[] = [];
    let tasksListFormat: any = $state();
    let taskDataStatus = $state<"ok" | "empty" | "limited" | "disabled" | "unsupported" | "error">("empty");
    let taskStatusMessage = $state("任务索引为空，请到主页设置 > 检索管理中建立任务索引或刷新最近文档增量索引。");
    let isInitializing = $state(false);
    // 组件销毁后丢弃异步结果，避免更新已卸载状态
    let isDestroyed = false;

    async function handleCheck(event: Event, task: any) {
        const isChecked = (event.target as HTMLInputElement).checked;
        const marker = isChecked ? "X" : " ";

        try {
            const exists = await ensureTaskBlockExists(task.id);
            if (!exists) {
                showMessage("任务块已删除，已清理索引", 3000);
                tasksListFormat = Array.isArray(tasksListFormat)
                    ? tasksListFormat.filter((item) => item.id !== task.id)
                    : [];
                event.preventDefault();
                return;
            }
            await updateTaskListItemMarker(task.id, marker);

            task.taskCheck = marker;
            task.initmarkdown = task.initmarkdown.replace(
                /\[([xX ]?)\]/,
                `[${marker}]`,
            );
            await updateTaskIndexItem({
                id: task.id,
                markdown: task.initmarkdown,
                content: task.taskname,
                hpath: task.hpath,
                box: task.box,
                updated: task.updated,
                checked: isChecked,
                source: "plugin",
            });
        } catch {
            task.taskCheck = isChecked ? " " : "X";
            event.preventDefault();
            showMessage("更新任务状态失败", 3000);
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
            const exists = await ensureTaskBlockExists(task.id);
            if (!exists) {
                showMessage("任务块已删除，已清理索引", 3000);
                return;
            }
            await updateBlock("markdown", newMarkdown, task.id);

            task.taskCheck = "- [ ]";
            task.parsed.deadline = formattedNewDate;
            task.initmarkdown = newMarkdown;
            await updateTaskIndexItem({
                id: task.id,
                markdown: newMarkdown,
                content: task.taskname,
                hpath: task.hpath,
                box: task.box,
                updated: new Date().toISOString(),
                checked: false,
                source: "plugin",
            });
        } catch {
            showMessage("更新循环任务失败", 3000);
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

    async function loadTasks() {
        const notebookIds = tasksPlusSelectedNotebookIds.map((item) => item.value);
        await refreshTaskIndexFromRecentDocuments(plugin, {
            force: runtimeContext.forceIndexRefresh === true,
        });
        const taskResult = await gettasksList(plugin, notebookIds);
        if (isDestroyed) return;
        taskDataStatus = taskResult.status;
        taskStatusMessage = taskResult.message || "";
        tasksList = taskResult.items;
        tasksListFormat = await formatTasksList(
            tasksList,
            internalFilter,
            isCustomFilter,
            customFilter,
            tasksSort,
        );
        if (isDestroyed) return;

        for (const task of tasksListFormat) {
            if (isDestroyed) return;
            await updateTaskBasedOnRecurrence(task);
        }
    }

    onMount(async () => {
        isDestroyed = false;
        isInitializing = true;
        taskStatusMessage = "正在初始化任务索引...";
        try {
            const initResult = await ensureTaskIndexInitialized(plugin);
            if (isDestroyed) return;
            if (initResult.initialized && initResult.status.lastStatus !== "success") {
                taskDataStatus = "error";
                taskStatusMessage = `${initResult.status.lastMessage || "任务索引初始化失败"}，请到主页设置 > 检索管理中手动重建索引。`;
                isInitializing = false;
                return;
            }
            await loadTasks();
        } catch {
            if (isDestroyed) return;
            taskDataStatus = "error";
            taskStatusMessage = "任务索引初始化失败，请到主页设置 > 检索管理中手动重建索引。";
            tasksList = [];
            tasksListFormat = [];
        } finally {
            if (!isDestroyed) isInitializing = false;
        }
    });

    onDestroy(() => {
        isDestroyed = true;
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{TaskManPlusTitle}</h3>
    <div class="tasks-list-container">
        {#if Array.isArray(tasksListFormat) && tasksListFormat.length > 0}
            {#each tasksListFormat as task}
                <div class="task-item">
                    <label class="checkbox-label">
                        <input
                            type="checkbox"
                            checked={task.taskCheck?.includes("X") ||
                                task.taskCheck?.includes("x")}
                            class="task-checkbox"
                            onchange={(e) => handleCheck(e, task)}
                        />
                        <button
                            type="button"
                            class="task-name"
                            onclick={() => openDocs(plugin, task.id, 1)}
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
                </div>
            {/each}
        {:else if isInitializing}
            <div class="empty-tips">
                <strong>正在初始化任务索引...</strong>
            </div>
        {:else}
            {#if taskDataStatus === "disabled"}
                <LocalIndexEmptyState
                    title="本地索引为空"
                    message="任务本地索引为空，请迁移或重建索引。"
                    {plugin}
                    hint="请到主页设置 > 检索管理中刷新最近文档增量索引，或手动重建任务索引。"
                />
            {:else}
                <div class="empty-tips">
                    <strong>没有可显示的任务</strong>
                    <span>{taskStatusMessage || "请到主页设置 > 检索管理中维护任务索引。"}</span>
                </div>
            {/if}
        {/if}
    </div>
</div>

<style lang="scss">
    .content-display {
        width: 100%;
        height: 100%;
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
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            min-height: 0;

            .task-item {
                padding: 0.75rem;
                background-color: var(--b3-theme-surface);
                border-radius: 6px;
                transition: background-color 0.2s ease;
                width: 100%;
                box-sizing: border-box;
                min-height: fit-content;

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
                    word-break: break-word;
                    overflow-wrap: break-word;
                    white-space: normal;
                    line-height: 1.4;

                    &:hover {
                        text-decoration: underline;
                    }
                }

                .tasks-details {
                    margin-top: 0.75rem;
                    font-size: 0.9em;
                    width: 100%;

                    .meta-row {
                        display: flex;
                        gap: 0.8rem;
                        flex-wrap: wrap;
                        margin-bottom: 0.4rem;
                        align-items: flex-start;
                    }

                    .date-group {
                        display: flex;
                        gap: 1rem;
                    }

                    .tags {
                        margin-top: 0.6rem;
                        display: flex;
                        gap: 0.4rem;
                        flex-wrap: wrap;
                        align-items: flex-start;
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

            .empty-tips {
                text-align: center;
                color: var(--b3-theme-secondary);
                padding: 1rem;
                display: flex;
                min-height: 120px;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border: 1px dashed var(--b3-border-color);
                border-radius: 8px;

                strong {
                    color: var(--b3-theme-on-surface);
                }
            }
        }
    }
</style>
