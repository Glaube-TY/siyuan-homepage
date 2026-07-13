<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { GoRecordsOptions } from "../enhancedDiaryWorkspaceNavigation";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        taskManagementEnabled?: boolean;
        onOpenTaskResult: (task: EnhancedDiaryWorkspaceTask) => void;
        onOpenRecordResult: (options: GoRecordsOptions) => void;
        onOpenProjectResult: (projectTargetId: string) => void;
        onOpenNotificationResult: (notificationId: string) => void;
        onGoReview: () => void;
        onOpenDoc: (docId?: string) => void;
    }

    interface SearchResult {
        key: string;
        type: "task" | "record" | "project" | "review" | "notification";
        typeLabel: string;
        title: string;
        description: string;
        actionLabel: string;
        action: () => void | Promise<void>;
    }

    let {
        state: workspaceState,
        taskManagementEnabled = true,
        onOpenTaskResult,
        onOpenRecordResult,
        onOpenProjectResult,
        onOpenNotificationResult,
        onGoReview,
        onOpenDoc,
    }: Props = $props();

    let query = $state("");
    let expanded = $state(false);

    function normalize(value: unknown): string {
        return String(value || "").toLowerCase();
    }

    function matches(keyword: string, ...values: unknown[]): boolean {
        return values.some((value) => normalize(value).includes(keyword));
    }

    const results = $derived.by((): SearchResult[] => {
        const keyword = query.trim().toLowerCase();
        if (keyword.length < 2) return [];

        const items: SearchResult[] = [];

        if (taskManagementEnabled) {
            workspaceState.tasks.forEach((task) => {
                if (!matches(keyword, task.taskname, task.tags.join(" "), task.projectPath?.join(" / "), task.sourceDate, task.sourceDocTitle, task.markdown)) return;
                items.push({
                    key: `task-${task.blockId}`,
                    type: "task",
                    typeLabel: "任务",
                    title: task.taskname,
                    description: [task.sourceDate, task.deadline ? `截止 ${task.deadline}` : "", task.tags.map((tag) => `#${tag}#`).join(" ")]
                        .filter(Boolean)
                        .join(" · "),
                    actionLabel: "查看任务",
                    action: () => onOpenTaskResult(task),
                });
            });
        }

        [...workspaceState.records, ...workspaceState.historyRecords].forEach((record) => {
            if (!matches(keyword, record.headingTitle, record.content, record.categoryTitle, record.date, record.docTitle)) return;
            const recordId = record.id || `${record.docId}-${record.headingTitle}`;
            items.push({
                key: `record-${recordId}`,
                type: "record",
                typeLabel: "记录",
                title: record.headingTitle,
                description: [record.date, record.categoryTitle, record.tags.map((tag) => `#${tag}#`).join(" "), record.projectPath?.join(" / "), record.content.slice(0, 60)].filter(Boolean).join(" · "),
                actionLabel: "查看记录",
                action: () => onOpenRecordResult(record.date === workspaceState.today ? { mode: "today", recordId } : { mode: "history", date: record.date || "", recordId }),
            });
        });

        if (taskManagementEnabled) {
            const targets = [
                ...Object.values(workspaceState.projectIndex.roots).map((root) => ({ id: root.id, title: root.title, path: [root.title] })),
                ...Object.values(workspaceState.projectIndex.nodes).map((node) => ({
                    id: node.id, title: node.title,
                    path: [...node.ancestorTargetIds.map((id) => workspaceState.projectIndex.roots[id]?.title || workspaceState.projectIndex.nodes[id]?.title).filter(Boolean), node.title],
                })),
            ];
            targets.forEach((project) => {
                if (!matches(keyword, project.title, project.path.join(" / "), "项目概览", "项目目标", "当前重点", "阶段总结", "最终总结")) return;
                items.push({
                    key: `project-${project.id}`,
                    type: "project",
                    typeLabel: "项目",
                    title: project.title,
                    description: project.path.join(" / "),
                    actionLabel: "查看项目",
                    action: () => onOpenProjectResult(project.id),
                });
            });
        }

        workspaceState.reviewCards.forEach((card) => {
            if (!matches(keyword, card.title, card.statusLabel, card.dateOrRange)) return;
            items.push({
                key: `review-${card.period}`,
                type: "review",
                typeLabel: "复盘",
                title: card.title,
                description: `${card.statusLabel} · ${card.dateOrRange}`,
                actionLabel: card.docId ? "打开复盘" : "查看复盘",
                action: () => (card.docId ? onOpenDoc(card.docId) : onGoReview()),
            });
        });

        workspaceState.notifications.forEach((notification) => {
            if (!matches(keyword, notification.title, notification.description, notification.type, notification.level)) return;
            items.push({
                key: `notification-${notification.id}`,
                type: "notification",
                typeLabel: "通知",
                title: notification.title,
                description: notification.description,
                actionLabel: "查看通知",
                action: () => onOpenNotificationResult(notification.id),
            });
        });

        const seen = new Set<string>();
        return items
            .filter((item) => {
                if (seen.has(item.key)) return false;
                seen.add(item.key);
                return true;
            })
            .slice(0, expanded ? 18 : 8);
    });

    const hasQuery = $derived(query.trim().length >= 2);

    async function runResult(item: SearchResult): Promise<void> {
        query = "";
        expanded = false;
        try {
            await item.action();
        } finally {
            query = "";
            expanded = false;
        }
    }
</script>

<section class="global-search">
    <div class="search-box">
        <input
            type="search"
            placeholder={taskManagementEnabled ? "全局搜索任务、记录、项目、复盘、通知..." : "全局搜索记录、复盘、通知..."}
            bind:value={query}
        />
        {#if query}
            <button type="button" class="clear-btn" onclick={() => { query = ""; expanded = false; }}>清空</button>
        {/if}
    </div>

    {#if hasQuery}
        <div class="search-results">
            {#if results.length === 0}
                <div class="empty-result">没有匹配结果</div>
            {:else}
                {#each results as item (item.key)}
                    <button type="button" class="result-item type-{item.type}" onclick={() => runResult(item)}>
                        <span class="result-type">{item.typeLabel}</span>
                        <span class="result-main">
                            <strong>{item.title}</strong>
                            <small>{item.description}</small>
                        </span>
                        <span class="result-action">{item.actionLabel}</span>
                    </button>
                {/each}
                {#if results.length >= 8}
                    <button type="button" class="expand-btn" onclick={() => (expanded = !expanded)}>
                        {expanded ? "收起结果" : "展开更多"}
                    </button>
                {/if}
            {/if}
        </div>
    {/if}
</section>

<style>
    .global-search {
        padding: 12px 20px;
        border-bottom: 1px solid var(--wk-border);
        background: var(--wk-background);
    }

    .search-box {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    input {
        width: 100%;
        min-width: 0;
        height: 34px;
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        padding: 0 12px;
        font-size: 13px;
        outline: none;
    }

    input:focus {
        border-color: var(--wk-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--wk-primary) 18%, transparent);
    }

    .clear-btn,
    .expand-btn {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
    }

    .clear-btn:hover,
    .expand-btn:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .search-results {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 10px;
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        padding: 8px;
    }

    .empty-result {
        padding: 12px;
        text-align: center;
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.5;
    }

    .result-item {
        display: grid;
        grid-template-columns: 54px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        width: 100%;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--wk-ink-secondary);
        padding: 8px 10px;
        text-align: left;
        cursor: pointer;
    }

    .result-item:hover {
        background: color-mix(in srgb, var(--wk-primary) 6%, transparent);
        border-color: color-mix(in srgb, var(--wk-primary) 20%, transparent);
    }

    .result-type {
        width: fit-content;
        min-width: 40px;
        text-align: center;
        border-radius: 999px;
        padding: 2px 7px;
        font-size: 12px;
        color: var(--wk-primary);
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 24%, transparent);
    }

    .result-main {
        min-width: 0;
    }

    .result-main strong {
        display: block;
        font-size: 13px;
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-main small {
        display: block;
        margin-top: 2px;
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.55;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .result-action {
        font-size: 12px;
        color: var(--wk-primary);
        white-space: nowrap;
    }

    .expand-btn {
        align-self: center;
        margin-top: 2px;
    }

    @container (max-width: 760px) {
        .global-search {
            padding: 10px 12px;
        }

        .result-item {
            grid-template-columns: 1fr;
            gap: 5px;
        }

        .result-action {
            justify-self: start;
        }
    }
</style>
