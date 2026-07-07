<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { getLatestTasks, type RecentTasksInfo } from "./recentTasks";
    import { openDocs } from "@/components/tools/openDocs";
    import { updateTaskListItemMarker } from "@/api";
    import {
        ensureTaskBlockExists,
        ensureTaskIndexInitialized,
        refreshTaskIndexFromRecentDocuments,
        updateTaskIndexItem,
    } from "@/components/tools/siyuanComponentDataApi";
    import type { WidgetRuntimeContext } from "../../widgetMountRegistry";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
        placement?: string;
        runtimeContext?: WidgetRuntimeContext;
    }

    let { plugin, contentTypeJson = "{}", placement = "homepage", runtimeContext = {} }: Props = $props();

    const parsed = $derived(JSON.parse(contentTypeJson));
    const isMobilePlacement = $derived(placement === "mobile");

    // 原始数据
    let recentTasks: RecentTasksInfo[] = $state([]);
    let showTasksDetails: boolean = $state();
    let TaskManTitle: string = $state();
    let taskDataStatus = $state<"ok" | "empty" | "limited" | "unsupported" | "error">("empty");
    let taskStatusMessage = $state("任务索引为空，请到主页设置 > 检索管理中建立任务索引或刷新最近文档增量索引。");
    let isInitializing = $state(false);

    // 最终显示的任务列表
    let displayedTasks: Array<{
        id: string;
        markdown: string;
        checked: boolean;
        content: string;
        updated: string;
        created: string;
        hpath: string;
    }> = $state([]);

    const mobilePendingCount = $derived(displayedTasks.filter((task) => !task.checked).length);

    // 组件销毁后丢弃异步结果，避免更新已卸载状态
    let isDestroyed = false;

    async function loadTasks() {
        await refreshTaskIndexFromRecentDocuments(plugin, {
            force: runtimeContext.forceIndexRefresh === true,
        });
        const result = await getLatestTasks(parsed.data?.tasksNotebookId, plugin);
        if (isDestroyed) return;
        recentTasks = result.items;
        taskDataStatus = result.status === "disabled" ? "empty" : result.status;
        taskStatusMessage = result.message || "";
        showTasksDetails = parsed.data?.showTasksDetails ?? true;
        TaskManTitle = parsed.data?.TaskManTitle || "📋任务管理";
    }

    onMount(() => {
        isDestroyed = false;
        isInitializing = true;
        taskStatusMessage = "正在初始化任务索引...";
        ensureTaskIndexInitialized(plugin)
            .then((initResult) => {
                if (isDestroyed) return;
                if (initResult.initialized && initResult.status.lastStatus !== "success") {
                    taskDataStatus = "error";
                    taskStatusMessage = `${initResult.status.lastMessage || "任务索引初始化失败"}，请到主页设置 > 检索管理中手动重建索引。`;
                    isInitializing = false;
                    showTasksDetails = parsed.data?.showTasksDetails ?? true;
                    TaskManTitle = parsed.data?.TaskManTitle || "📋任务管理";
                    return;
                }
                return loadTasks().finally(() => {
                    if (!isDestroyed) isInitializing = false;
                });
            })
            .catch(() => {
                if (isDestroyed) return;
                taskDataStatus = "error";
                taskStatusMessage = "任务索引初始化失败，请到主页设置 > 检索管理中手动重建索引。";
                isInitializing = false;
                showTasksDetails = parsed.data?.showTasksDetails ?? true;
                TaskManTitle = parsed.data?.TaskManTitle || "📋任务管理";
            });

        return () => {
            isDestroyed = true;
        };
    });


    function parseCheckbox(markdown: string) {
        const trimmed = markdown.trimStart();
        const match = trimmed.match(/^[*-]\s*\[\s*[Xx]\s*\]/);
        return { checked: !!match };
    }

    function formatDate(created: string): string {
        if (created.length !== 14) return "无效时间";

        const year = parseInt(created.slice(0, 4), 10);
        const month = parseInt(created.slice(4, 6), 10) - 1;
        const day = parseInt(created.slice(6, 8), 10);

        const date = new Date(year, month, day);

        if (isNaN(date.getTime())) return "无效时间";

        const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
        const weekDay = weekDays[date.getDay()];

        const formattedDate = `${year}年${String(month + 1).padStart(2, "0")}月${String(day).padStart(2, "0")}日`;
        return `${formattedDate}（星期${weekDay}）`;
    }

    async function handleCheck(
        event: Event,
        task: (typeof displayedTasks)[number],
    ) {
        const isChecked = (event.target as HTMLInputElement).checked;
        const marker = isChecked ? "X" : " ";

        try {
            const exists = await ensureTaskBlockExists(task.id);
            if (!exists) {
                showMessage("任务块已删除，已清理索引", 3000);
                displayedTasks = displayedTasks.filter((item) => item.id !== task.id);
                event.preventDefault();
                return;
            }
            await updateTaskListItemMarker(task.id, marker);

            // 更新本地数据
            task.checked = isChecked;
            task.markdown = task.markdown.replace(
                /^([*-]\s*)\[\s*([xX]?)\s*\]/,
                (_, prefix) => `${prefix}[${marker}]`,
            );
            task.content = task.markdown
                .replace(/-\s*\[\s*[Xx]?\s*\]\s*/, "")
                .trim();
            await updateTaskIndexItem({
                ...task,
                markdown: task.markdown,
                content: task.content,
                checked: isChecked,
                source: "plugin",
            });
        } catch {
            // 回滚复选框状态
            task.checked = !isChecked;
            event.preventDefault();
            showMessage("更新任务失败", 3000);
        }
    }

    // 移除任务内容中可能存在的 HTML 标签
    function stripHTML(html: string): string {
        // 1. 先移除自闭合标签（如 <br/>）
        html = html.replace(/<[^>]+\/>/g, "");

        // 2. 循环移除最内层标签（无嵌套的标签）
        let lastLength;
        do {
            lastLength = html.length;
            html = html.replace(/<[^>]+>([^<]*)<\/[^>]+>/g, "");
        } while (html.length < lastLength); // 直到没有可移除的标签

        return html;
    }

    function extractMainTaskOnly(markdown: string): string {
        // 按行分割并过滤空行
        const lines = markdown.split("\n").filter((line) => line.trim() !== "");

        // 匹配标准的任务列表语法（支持空格和大小写）
        const mainLine = lines.find(
            (line) => /^[*-]\s*\[[xX ]?\]\s+.+/.test(line), // 修复正则表达式
        );

        if (mainLine) {
            // 精确移除复选框部分并保留内容
            return mainLine
                .replace(/^[*-]\s*\[[xX ]?\]\s*/, "") // 正确替换模式
                .trim();
        }

        // 添加备用匹配逻辑（处理可能的缩进）
        const fallbackLine = lines.find(
            (line) =>
                line.trim().startsWith("- [ ]") ||
                line.trim().startsWith("- [x]") ||
                line.trim().startsWith("* [ ]") ||
                line.trim().startsWith("* [x]"),
        );

        return fallbackLine
            ? fallbackLine.replace(/-\s*\[[xX ]?\]\s*/, "").trim()
            : "";
    }

    function handleOpenTask(task: (typeof displayedTasks)[number]) {
        openDocs(plugin, task.id, 1);
    }
    run(() => {
        if (recentTasks.length > 0 && displayedTasks.length === 0) {
            // 初始化处理数据
            const tasks = recentTasks.map((task) => {
                const checked = parseCheckbox(task.markdown);
                const cleanMarkdown = stripHTML(task.markdown);
                const mainTaskContent = extractMainTaskOnly(cleanMarkdown);

                return {
                    ...task,
                    markdown: cleanMarkdown,
                    checked: checked.checked,
                    content: mainTaskContent,
                };
            });

            // 按更新时间排序（最新在前）
            const sortedTasks = [...tasks].sort(
                (a, b) =>
                    new Date(b.updated).getTime() -
                    new Date(a.updated).getTime(),
            );

            // 拆分未完成与已完成
            const pendingTasks = sortedTasks.filter((task) => !task.checked);
            const completedTasks = sortedTasks.filter((task) => task.checked);

            // 最终顺序：未完成在前，已完成在后
            try {
                if (parsed.type === "TaskMan") {
                    const showCompletedTasks =
                        parsed.data?.showCompletedTasks ?? true;
                    displayedTasks = [
                        ...pendingTasks,
                        ...(showCompletedTasks ? completedTasks : []),
                    ];
                } else {
                    // 如果类型不是 TaskMan，默认仍然显示所有任务
                    displayedTasks = [...pendingTasks, ...completedTasks];
                }
            } catch {
                // 解析失败时也显示全部任务
                displayedTasks = [...pendingTasks, ...completedTasks];
            }
        }
    });
</script>

{#if isMobilePlacement}
    <div class="mobile-task-widget">
        <header class="mobile-task-header">
            <div>
                <h3>{TaskManTitle}</h3>
            </div>
            <span class="mobile-task-count">{mobilePendingCount} 待办</span>
        </header>

        <div class="mobile-task-list">
            {#if isInitializing}
                <div class="mobile-task-empty">正在初始化任务索引...</div>
            {:else if displayedTasks.length > 0}
                {#each displayedTasks as task (task.id + "-" + task.updated)}
                    <div class="mobile-task-row" class:completed={task.checked}>
                        <label class="mobile-task-check" aria-label="切换任务完成状态">
                            <input
                                type="checkbox"
                                bind:checked={task.checked}
                                onchange={(e) => {
                                    e.stopPropagation();
                                    handleCheck(e, task);
                                }}
                            />
                        </label>
                        <button type="button" class="mobile-task-main" onclick={() => handleOpenTask(task)}>
                            <span>{task.content || "未命名任务"}</span>
                            {#if showTasksDetails}
                                <small>{formatDate(task.created).replace("（星期", " 周").replace("）", "")}</small>
                            {/if}
                        </button>
                    </div>
                {/each}
            {:else}
                <div class="mobile-task-empty">{taskStatusMessage}</div>
            {/if}
        </div>
    </div>
{:else}
    <div class="content-display">
        <h3 class="widget-title">{TaskManTitle}</h3>
        <ul class="task-list">
            {#if isInitializing}
                <div class="task-empty-state">
                    <strong>正在初始化任务索引...</strong>
                </div>
            {:else if displayedTasks.length > 0}
                {#each displayedTasks as task (task.id + "-" + task.updated)}
                    <li class="task-item" class:completed={task.checked}>
                        <div class="task-header">
                            <span class="checkbox-label">
                                <input
                                    type="checkbox"
                                    bind:checked={task.checked}
                                    onchange={(e) => {
                                        e.stopPropagation();
                                        handleCheck(e, task);
                                    }}
                                />
                            </span>

                            <div
                                class="task-content"
                                onclick={(e) => {
                                    e.preventDefault();
                                    handleOpenTask(task);
                                }}
                                onkeydown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        handleOpenTask(task);
                                    }
                                }}
                                tabindex="0"
                                role="button"
                                aria-label={task.content}
                            >
                                {task.content}
                            </div>
                        </div>

                        {#if showTasksDetails}
                            <span class="task-created-time"
                                >📅 {formatDate(task.created)}</span
                            >
                            <span class="task-source">📃 {task.hpath}</span>
                        {/if}
                    </li>
                {/each}
            {:else}
                <div class="task-empty-state">
                    <strong>{taskDataStatus === "empty" ? "任务索引为空" : "没有可显示的任务"}</strong>
                    <span>{taskStatusMessage || "请到主页设置 > 检索管理中维护任务索引。"}</span>
                </div>
            {/if}
        </ul>
    </div>
{/if}

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

        .task-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            grid-gap: 1rem;
            list-style: none;
            padding-left: 0;
            margin: 0;
            overflow-y: auto;
        }

        .task-item {
            padding: 0.5rem 0.75rem;
            background-color: var(--b3-theme-surface);
            border-radius: 6px;
            font-size: 14px;
            transition: background-color 0.2s ease;
            break-inside: avoid;
            display: flex;
            flex-direction: column;
        }

        .task-item:hover {
            background-color: var(--b3-list-hover);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .task-created-time,
        .task-source {
            display: block;
            margin-top: 0.3rem;
            font-size: 12px;
            padding-left: 2rem;
        }

        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: default;
        }

        .task-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
        }

        .task-content {
            flex-grow: 1;
            margin-left: 0.5rem;
            color: var(--b3-theme-primary);
            cursor: pointer;
            font-weight: bold;
        }

        .task-content:hover {
            text-decoration: underline;
        }

        .task-empty-state {
            grid-column: 1 / -1;
            min-height: 120px;
            padding: 16px;
            border: 1px dashed var(--b3-border-color);
            border-radius: 8px;
            color: var(--b3-theme-secondary);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-align: center;

            strong {
                color: var(--b3-theme-on-surface);
            }
        }
    }

    .mobile-task-widget {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        box-sizing: border-box;
        background: linear-gradient(180deg, rgba(99, 102, 241, 0.08), rgba(99, 102, 241, 0.02));
    }

    .mobile-task-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        min-height: 24px;

        h3 {
            margin: 0;
            font-size: 14px;
            line-height: 1.15;
            color: var(--b3-theme-on-background);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .mobile-task-count {
        flex: 0 0 auto;
        padding: 3px 7px;
        border-radius: 999px;
        background: rgba(99, 102, 241, 0.12);
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 700;
    }

    .mobile-task-list {
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .mobile-task-row {
        min-height: 42px;
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        align-items: center;
        gap: 5px;
        padding: 5px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--b3-theme-surface) 78%, transparent);

        &.completed {
            opacity: 0.62;
        }
    }

    .mobile-task-check {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;

        input {
            width: 20px;
            height: 20px;
            margin: 0;
        }
    }

    .mobile-task-main {
        min-width: 0;
        border: none;
        background: transparent;
        color: inherit;
        padding: 0;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 2px;

        span {
            min-width: 0;
            color: var(--b3-theme-on-background);
            font-size: 14px;
            font-weight: 700;
            line-height: 1.3;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        small {
            color: var(--b3-theme-secondary);
            font-size: 11px;
            line-height: 1.2;
        }
    }

    .mobile-task-empty {
        padding: 6px 8px;
        color: var(--b3-theme-secondary);
        font-size: 12px;
        text-align: center;
    }
</style>
