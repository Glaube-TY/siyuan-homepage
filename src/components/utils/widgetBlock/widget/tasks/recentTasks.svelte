<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount } from "svelte";
    import { getLatestTasks, type RecentTasksInfo } from "./recentTasks";
    import { openDocs } from "@/components/tools/openDocs";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    const parsed = JSON.parse(contentTypeJson);

    // 原始数据
    let recentTasks: RecentTasksInfo[] = $state([]);
    let showTasksDetails: boolean = $state();
    let TaskManTitle: string = $state();

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

    onMount(async () => {
        recentTasks = await getLatestTasks(parsed.data?.tasksNotebookId);
        showTasksDetails = parsed.data?.showTasksDetails ?? true;
        TaskManTitle = parsed.data?.TaskManTitle || "📋任务管理";
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

        // 使用正则表达式精确匹配复选框语法
        const newMarkdown = task.markdown.replace(
            /^([*-]\s*)\[\s*([xX]?)\s*\]/,
            (_, prefix) => `${prefix}[${isChecked ? "X" : " "}]`,
        );

        try {
            await plugin.client.updateBlock({
                data: newMarkdown,
                dataType: "markdown",
                id: task.id,
            });

            // 更新本地数据
            task.markdown = newMarkdown;
            task.checked = isChecked;
            task.content = newMarkdown
                .replace(/-\s*\[\s*[Xx]?\s*\]\s*/, "")
                .trim();
        } catch (err) {
            console.error("更新任务失败:", err);
            // 回滚复选框状态
            task.checked = !isChecked;
            event.preventDefault();
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
        openDocs(plugin, task.id);
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
            } catch (e) {
                console.error("解析 contentTypeJson 出错", e);
                // 解析失败时也显示全部任务
                displayedTasks = [...pendingTasks, ...completedTasks];
            }
        }
    });
</script>

<div class="content-display">
    <h3 class="widget-title">{TaskManTitle}</h3>
    <ul class="task-list">
        {#if displayedTasks.length > 0}
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
            <p>暂无任务记录</p>
        {/if}
    </ul>
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
    }
</style>
