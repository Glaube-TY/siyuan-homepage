<script lang="ts">
    import { onMount } from "svelte";
    import { getLatestTasks, type RecentTasksInfo } from "./recentTasks";

    export let plugin: any;
    export let contentTypeJson: string = "{}";

    // 原始数据
    let recentTasks: RecentTasksInfo[] = [];

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

    onMount(async () => {
        recentTasks = await getLatestTasks();
    });

    $: {
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
                const parsed = JSON.parse(contentTypeJson);
                if (parsed.type === "TaskMan") {
                    const showCompletedTasks =
                        parsed.data?.showCompletedTasks ?? true;
                    console.log("显示已完成任务:", showCompletedTasks);
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
    }

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
</script>

<div class="content-display">
    <h3 class="widget-title">📋任务管理</h3>
    <ul class="task-list">
        {#if displayedTasks.length > 0}
            {#each displayedTasks as task (task.id + "-" + task.updated)}
                <a
                    href={"siyuan://blocks/" + task.id}
                    target="_blank"
                    class="task-link"
                >
                    <li class="task-item" class:completed={task.checked}>
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

    .task-item.completed {
        text-decoration: line-through;
        color: #94a3b8;
        background-color: #f1f5f9;
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
