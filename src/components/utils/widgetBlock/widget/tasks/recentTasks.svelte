<script lang="ts">
    import { onMount } from "svelte";
    import { getLatestTasks, type RecentTasksInfo } from "./recentTasks";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    // 原始数据
    let recentTasks: RecentTasksInfo[] = [];

    // 解析后的 payload（用于获取 limit）
    let payload: { type: string; data: any[] | string; limit?: number } | null =
        null;

    // 最终显示的任务列表
    let displayedTasks: Array<{
        id: string;
        markdown: string;
        checked: boolean;
        content: string;
        updated: string;
        created: string;
        hpath: string;
    }> = [];

    function parseCheckbox(markdown: string) {
        const trimmed = markdown.trimStart();
        const match = trimmed.match(/^-\s*\[\s*[Xx]\s*\]/);
        return { checked: !!match };
    }

    function formatDate(created: string): string {
        if (created.length !== 14) return "无效时间";

        const year = parseInt(created.slice(0, 4), 10);
        const month = parseInt(created.slice(4, 6), 10) - 1; // 月份从0开始
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
            /^(-\s*)\[\s*([xX]?)\s*\]/,
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

    onMount(async () => {
        recentTasks = await getLatestTasks();
    });

    $: {
        try {
            payload = JSON.parse(contentTypeJson);
        } catch (err) {
            console.error("Failed to parse contentTypeJson:", err);
            payload = null;
        }
    }

    $: {
        // 过滤条件避免无限循环
        if (recentTasks.length > 0 && displayedTasks.length === 0) {
            displayedTasks = recentTasks.map((task) => {
                const checked = parseCheckbox(task.markdown);
                return {
                    ...task,
                    checked: checked.checked,
                    content: task.content,
                };
            });
        }
    }
</script>

<div class="content-display">
    <h3 class="widget-title">最近任务</h3>
    <ul class="task-list">
        {#if displayedTasks.length > 0}
            {#each displayedTasks as task (task.id + "-" + task.updated)}
                <a
                    href={"siyuan://blocks/" + task.id}
                    target="_blank"
                    class="task-link"
                >
                    <li class="task-item">
                        <span class="checkbox-label">
                            <input
                                type="checkbox"
                                bind:checked={task.checked}
                                on:change={(e) => handleCheck(e, task)}
                            />
                            {task.content}
                        </span>
                        <span class="task-created-time"
                            >📅 {formatDate(task.created)}</span
                        >
                        <span class="task-source">
                            📃 <a
                                href={"siyuan://blocks/" + task.id}
                                target="_blank">{task.hpath}</a
                            >
                        </span>
                    </li>
                </a>
            {/each}
        {:else}
            <p>暂无任务记录</p>
        {/if}
    </ul>
</div>

<style>
    .widget-title {
        font-size: 18px;
        font-weight: 600;
        color: #1e293b; /* 深灰色 */
        margin-bottom: 0.5rem;
        padding-bottom: 0.3rem;
        border-bottom: 1px solid #e2e8f0; /* 淡灰色下边框 */
        text-align: center;
        display: inline-block;
        line-height: 1.2;
    }

    .content-display {
        width: 100%;
        height: calc(100%);
        display: flex;
        flex-direction: column;
        padding: 10px;
        box-sizing: border-box;
    }

    .task-list {
        list-style: none;
        padding-left: 0;
        margin: 0;
        overflow-y: auto;
    }

    .task-item {
        padding: 0.5rem 0.75rem;
        margin-bottom: 0.5rem;
        background-color: #f8fafc;
        border-radius: 6px;
        font-size: 14px;
        color: #475569;
        transition: background-color 0.2s ease;
    }

    .task-item:hover {
        background-color: #eff6ff;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem; /* 横向间距 */
    }

    .task-created-time,
    .task-source {
        display: block;
        margin-top: 0.3rem;
        font-size: 12px;
        color: #94a3b8;
        padding-left: 2rem;
    }
</style>
