<script lang="ts">
    import { tick, onMount, onDestroy } from "svelte";
    import { showMessage } from "siyuan";
    import type { EnhancedDiaryWorkspaceNotification } from "../enhancedDiaryWorkspaceNotifications";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { EnhancedDiaryWorkspaceReviewCard } from "../enhancedDiaryWorkspaceViewModel";
    import {
        loadSnoozedNotificationIds,
        saveSnoozedNotificationIds,
    } from "../enhancedDiaryWorkspaceNotificationState";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        notifications: EnhancedDiaryWorkspaceNotification[];
        tasks: EnhancedDiaryWorkspaceTask[];
        reviewCards: EnhancedDiaryWorkspaceReviewCard[];
        onOpenDoc: (docId?: string) => void;
        onMigrate: (task: EnhancedDiaryWorkspaceTask) => void;
        onAppendTemplate: () => void | Promise<void>;
        onCreateOrOpenReview: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onAppendReviewTemplate: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onCompleteReview: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onCompleteTask: (task: EnhancedDiaryWorkspaceTask) => void | Promise<void>;
        onPostponeTask: (task: EnhancedDiaryWorkspaceTask, target: "tomorrow" | "nextWeek") => void | Promise<void>;
        onSnoozedChange?: () => void;
        initialSelectedNotificationId?: string;
        selectVersion?: number;
        taskManagementEnabled?: boolean;
    }

    let {
        notifications,
        tasks,
        reviewCards,
        onOpenDoc,
        onMigrate,
        onAppendTemplate,
        onCreateOrOpenReview,
        onAppendReviewTemplate,
        onCompleteReview,
        onCompleteTask,
        onPostponeTask,
        onSnoozedChange,
        initialSelectedNotificationId = "",
        selectVersion = 0,
        taskManagementEnabled = true,
    }: Props = $props();

    function findTask(id?: string): EnhancedDiaryWorkspaceTask | undefined {
        return tasks.find((task) => task.blockId === id);
    }

    function findReviewCard(item: EnhancedDiaryWorkspaceNotification): EnhancedDiaryWorkspaceReviewCard | undefined {
        if (!item.reviewPeriod) return undefined;
        return reviewCards.find((card) => card.period === item.reviewPeriod);
    }

    function runAction(item: EnhancedDiaryWorkspaceNotification): void {
        if (item.action === "migrate_task") {
            const task = findTask(item.relatedTaskId);
            if (task) {
                onMigrate(task);
            } else {
                showMessage("未找到对应任务", 3000);
            }
            return;
        }
        if (item.action === "append_template") {
            onAppendTemplate();
            return;
        }
        if (item.action === "create_or_open_review") {
            const card = findReviewCard(item);
            if (card) {
                onCreateOrOpenReview(card);
            } else if (item.relatedDocId) {
                onOpenDoc(item.relatedDocId);
            } else {
                showMessage("未找到对应复盘卡片", 3000);
            }
            return;
        }
        if (item.action === "append_review_template") {
            const card = findReviewCard(item);
            if (card) {
                onAppendReviewTemplate(card);
            } else {
                showMessage("未找到对应复盘卡片", 3000);
            }
            return;
        }
        if (item.action === "complete_review") {
            const card = findReviewCard(item);
            if (card) {
                onCompleteReview(card);
            } else {
                showMessage("未找到对应复盘卡片", 3000);
            }
            return;
        }
        if (item.relatedDocId) {
            onOpenDoc(item.relatedDocId);
        }
    }

    function actionLabel(action: EnhancedDiaryWorkspaceNotification["action"]): string {
        switch (action) {
            case "migrate_task":          return "迁移到今天";
            case "append_template":       return "补充模板";
            case "create_or_open_review": return "打开复盘";
            case "append_review_template":return "补复盘模板";
            case "complete_review":       return "标记完成";
            default:                      return "打开";
        }
    }

    function typeIcon(type: EnhancedDiaryWorkspaceNotification["type"]): string {
        switch (type) {
            case "overdue_task":         return "tasks";
            case "migration_suggestion": return "tasks";
            case "template_missing":     return "diary";
            case "review_due":           return "review";
            default:                     return "notifications";
        }
    }

    function typeDescription(item: EnhancedDiaryWorkspaceNotification): string {
        switch (item.type) {
            case "overdue_task": {
                const task = findTask(item.relatedTaskId);
                if (task?.deadline) return `截止日期：${task.deadline}`;
                return "";
            }
            case "migration_suggestion":
                return "这项任务长期未推进，建议迁移到今天重新跟进。";
            case "template_missing":
                return "日记模板结构不够完整，补充后可以正常记录和复盘。";
            case "review_due":
                return "复盘还没有完成，适合在今天收尾时处理。";
            default:
                return item.description || "";
        }
    }

    function hasValidAction(item: EnhancedDiaryWorkspaceNotification): boolean {
        if (!item.action) return !!item.relatedDocId;
        if (item.action === "migrate_task") return !!findTask(item.relatedTaskId);
        if (item.action === "create_or_open_review" || item.action === "append_review_template" || item.action === "complete_review") {
            return !!findReviewCard(item) || !!item.relatedDocId;
        }
        return true;
    }

    type NotifFilter = "all" | "actionable" | "task" | "template_missing" | "review_due" | "snoozed";

    let activeFilter: NotifFilter = $state("all");
    let snoozedIds: string[] = $state(loadSnoozedNotificationIds());

    // Controlled popover for "more actions" on each notification
    let openMoreActionsId: string | null = $state(null);
    let notifMoreActionsEl: HTMLElement | null = $state(null);

    function toggleNotifMoreActions(id: string): void {
        openMoreActionsId = openMoreActionsId === id ? null : id;
    }

    function runNotifAction(action: () => void): void {
        openMoreActionsId = null;
        action();
    }

    function handleNotifPopoverPointerdown(event: PointerEvent): void {
        if (openMoreActionsId && notifMoreActionsEl && !notifMoreActionsEl.contains(event.target as Node)) {
            openMoreActionsId = null;
        }
    }

    function handleNotifPopoverKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            openMoreActionsId = null;
        }
    }

    onMount(() => {
        document.addEventListener("pointerdown", handleNotifPopoverPointerdown);
        document.addEventListener("keydown", handleNotifPopoverKeydown);
    });

    onDestroy(() => {
        document.removeEventListener("pointerdown", handleNotifPopoverPointerdown);
        document.removeEventListener("keydown", handleNotifPopoverKeydown);
    });

    const actionableCount = $derived(notifications.filter((n) => hasValidAction(n) && !snoozedIds.includes(n.id)).length);

    const filteredNotifications = $derived.by(() => {
        let result = [...notifications];

        // Sort: overdue first, then by type weight
        result.sort((a, b) => {
            const aWeight = a.type === "overdue_task" ? 0 : a.type === "template_missing" ? 1 : a.type === "migration_suggestion" ? 2 : 3;
            const bWeight = b.type === "overdue_task" ? 0 : b.type === "template_missing" ? 1 : b.type === "migration_suggestion" ? 2 : 3;
            return aWeight - bWeight;
        });

        if (activeFilter === "snoozed") {
            result = result.filter((item) => snoozedIds.includes(item.id));
        } else if (activeFilter === "actionable") {
            result = result.filter((item) => hasValidAction(item) && !snoozedIds.includes(item.id));
        } else if (activeFilter === "task") {
            result = result.filter((item) =>
                (item.type === "overdue_task" || item.type === "migration_suggestion") && !snoozedIds.includes(item.id)
            );
        } else if (activeFilter === "template_missing") {
            result = result.filter((item) =>
                item.type === "template_missing" && !snoozedIds.includes(item.id)
            );
        } else if (activeFilter === "review_due") {
            result = result.filter((item) =>
                item.type === "review_due" && !snoozedIds.includes(item.id)
            );
        } else {
            // "all" — exclude snoozed
            result = result.filter((item) => !snoozedIds.includes(item.id));
        }

        return result;
    });

    const snoozedCount = $derived(snoozedIds.length);

    function saveSnoozedIds(nextIds: string[]): void {
        snoozedIds = nextIds;
        saveSnoozedNotificationIds(nextIds);
        onSnoozedChange?.();
    }

    function snoozeNotification(id: string): void {
        if (snoozedIds.includes(id)) return;
        saveSnoozedIds([...snoozedIds, id]);
    }

    function restoreNotification(id: string): void {
        saveSnoozedIds(snoozedIds.filter((item) => item !== id));
    }

    let lastSelectVersion = $state(0);
    let highlightNotificationId = $state<string | null>(null);
    let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
        if (selectVersion <= lastSelectVersion) return;
        lastSelectVersion = selectVersion;
        if (initialSelectedNotificationId) {
            const found = notifications.find((n) => n.id === initialSelectedNotificationId);
            if (found) {
                activeFilter = "all";
                highlightNotificationId = initialSelectedNotificationId;
                // Wait for DOM update, then scroll into view
                tick().then(() => {
                    const el = document.getElementById(`notif-${initialSelectedNotificationId}`);
                    if (el) {
                        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }
                });
                // Clear highlight after animation
                if (highlightTimeout) clearTimeout(highlightTimeout);
                highlightTimeout = setTimeout(() => { highlightNotificationId = null; }, 2000);
            }
        }
    });
</script>

<section class="notification-panel">
    <div class="notif-page-header">
        <div>
            <h2 class="wk-page-title">通知</h2>
            <p class="wk-page-description">需要你关注的事情。</p>
        </div>
        {#if actionableCount > 0}
            <span class="notif-badge">{actionableCount} 条待处理</span>
        {/if}
    </div>

    {#if notifications.length === 0}
        <WorkspaceEmptyState
            title="目前没有需要处理的通知"
            description="任务、日记和复盘需要关注时，会出现在这里。"
        />
    {:else}
        <div class="notif-filter-chips">
            <button type="button" class="wk-chip" class:selected={activeFilter === "all"} onclick={() => (activeFilter = "all")}>
                全部<span class="chip-count">{notifications.filter(n => !snoozedIds.includes(n.id)).length}</span>
            </button>
            <button type="button" class="wk-chip" class:selected={activeFilter === "actionable"} onclick={() => (activeFilter = "actionable")}>
                待处理<span class="chip-count">{actionableCount}</span>
            </button>
            {#if taskManagementEnabled}
                <button type="button" class="wk-chip" class:selected={activeFilter === "task"} onclick={() => (activeFilter = "task")}>
                    任务
                </button>
            {/if}
            <button type="button" class="wk-chip" class:selected={activeFilter === "template_missing"} onclick={() => (activeFilter = "template_missing")}>
                日记
            </button>
            <button type="button" class="wk-chip" class:selected={activeFilter === "review_due"} onclick={() => (activeFilter = "review_due")}>
                复盘
            </button>
            {#if snoozedCount > 0}
                <button type="button" class="wk-chip" class:selected={activeFilter === "snoozed"} onclick={() => (activeFilter = "snoozed")}>
                    稍后处理<span class="chip-count">{snoozedCount}</span>
                </button>
            {/if}
        </div>

        {#if filteredNotifications.length === 0}
            <div class="notif-empty-filtered">
                <p>这个分类暂时没有通知</p>
                <button type="button" class="wk-btn wk-btn-secondary" onclick={() => (activeFilter = "all")}>查看全部</button>
            </div>
        {:else}
            <div class="notif-message-stream">
                {#each filteredNotifications as item (item.id)}
                    {@const relatedTask = findTask(item.relatedTaskId)}
                    <article
                        class="notif-message"
                        class:notif-highlight={highlightNotificationId === item.id}
                        class:notif-overdue={item.type === "overdue_task"}
                        id="notif-{item.id}"
                    >
                        <span class="notif-type-icon">
                            <WorkspaceIcon name={typeIcon(item.type)} size={20} />
                            {#if item.type === "overdue_task"}
                                <span class="notif-dot-danger"></span>
                            {/if}
                        </span>

                        <div class="notif-body">
                            <div class="notif-title-row">
                                <strong class="notif-title">{item.title}</strong>
                                {#if item.type === "overdue_task"}
                                    <span class="notif-tag-overdue">逾期</span>
                                {/if}
                            </div>
                            <p class="notif-description">{typeDescription(item)}</p>
                            {#if item.description && typeDescription(item) !== item.description}
                                <p class="notif-context">{item.description.slice(0, 120)}</p>
                            {/if}
                        </div>

                        <div class="notif-actions">
                            {#if hasValidAction(item)}
                                <button
                                    type="button"
                                    class="wk-btn wk-btn-sm wk-btn-primary"
                                    onclick={() => runAction(item)}
                                >{actionLabel(item.action)}</button>
                            {/if}

                            {#if relatedTask}
                                <div class="notif-more-actions" bind:this={notifMoreActionsEl}>
                                    <button type="button" class="wk-btn wk-btn-sm wk-btn-ghost"
                                        onclick={() => toggleNotifMoreActions(item.id)}
                                        aria-expanded={openMoreActionsId === item.id}
                                        aria-haspopup="menu"
                                    >更多操作</button>
                                    {#if openMoreActionsId === item.id}
                                    <div class="notif-more-popover" role="menu">
                                        {#if item.relatedDocId}
                                            <button type="button" role="menuitem" class="wk-btn wk-btn-sm wk-btn-ghost"
                                                onclick={() => runNotifAction(() => onOpenDoc(item.relatedDocId))}>打开相关文档</button>
                                        {/if}
                                        <button type="button" role="menuitem" class="wk-btn wk-btn-sm wk-btn-ghost"
                                            onclick={() => runNotifAction(() => onCompleteTask(relatedTask))}>
                                            {relatedTask.completed ? "取消完成" : "完成任务"}
                                        </button>
                                        <button type="button" role="menuitem" class="wk-btn wk-btn-sm wk-btn-ghost"
                                            onclick={() => runNotifAction(() => onPostponeTask(relatedTask, "tomorrow"))}>推迟明天</button>
                                        <button type="button" role="menuitem" class="wk-btn wk-btn-sm wk-btn-ghost"
                                            onclick={() => runNotifAction(() => onPostponeTask(relatedTask, "nextWeek"))}>推迟下周</button>
                                    </div>
                                    {/if}
                                </div>
                            {:else if item.relatedDocId && item.action !== "append_template" && item.action !== "create_or_open_review" && item.action !== "complete_review" && item.action !== "append_review_template"}
                                <button type="button" class="wk-btn wk-btn-sm wk-btn-ghost" onclick={() => onOpenDoc(item.relatedDocId)}>打开文档</button>
                            {/if}

                            {#if snoozedIds.includes(item.id)}
                                <button type="button" class="wk-btn wk-btn-sm wk-btn-ghost" onclick={() => restoreNotification(item.id)}>恢复提醒</button>
                            {:else}
                                <button type="button" class="wk-btn wk-btn-sm wk-btn-ghost" onclick={() => snoozeNotification(item.id)}>稍后处理</button>
                            {/if}
                        </div>
                    </article>
                {/each}
            </div>
        {/if}
    {/if}
</section>

<style>
    .notification-panel {
        display: flex;
        flex-direction: column;
        gap: var(--wk-gap-md);
        max-width: 900px;
    }

    .notif-page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--wk-gap-md);
    }

    .notif-badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: var(--wk-radius-pill);
        background: var(--wk-error-bg);
        color: var(--wk-error);
        font-size: var(--wk-text-sm);
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .notif-filter-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--wk-gap-xs);
    }

    .notif-empty-filtered {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--wk-gap-sm);
        padding: var(--wk-gap-lg) var(--wk-gap-md);
        border: 1px dashed var(--wk-border);
        border-radius: var(--wk-radius-sm);
        background: transparent;
        color: var(--wk-ink-muted);
        text-align: center;
        font-size: var(--wk-text-sm);
    }

    .notif-empty-filtered p {
        margin: 0;
    }

    .chip-count {
        margin-left: 4px;
        font-size: var(--wk-text-xs);
        opacity: 0.72;
        font-variant-numeric: tabular-nums;
    }

    /* Message stream */
    .notif-message-stream {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .notif-message {
        display: flex;
        gap: 14px;
        padding: 18px 16px;
        border-bottom: 1px solid var(--wk-divider);
        transition: background var(--wk-transition-fast);
    }

    .notif-message:first-child {
        border-top: 1px solid var(--wk-divider);
    }

    .notif-message:hover {
        background: var(--wk-surface-hover);
    }

    .notif-highlight {
        background: var(--wk-primary-subtle);
        animation: notif-highlight-fade 2s ease-out;
    }

    @keyframes notif-highlight-fade {
        0% { background: var(--wk-primary-soft); }
        100% { background: transparent; }
    }

    .notif-overdue {
        background: color-mix(in srgb, var(--wk-error-bg) 50%, transparent);
    }

    .notif-overdue:hover {
        background: color-mix(in srgb, var(--wk-error-bg) 80%, transparent);
    }

    .notif-type-icon {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--wk-radius-sm);
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        color: var(--wk-primary);
        flex-shrink: 0;
        margin-top: 2px;
    }

    .notif-dot-danger {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--wk-error);
        border: 1.5px solid var(--wk-bg-card);
    }

    .notif-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .notif-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .notif-title {
        font-size: var(--wk-text-base);
        font-weight: 600;
        color: var(--wk-ink-secondary);
    }

    .notif-tag-overdue {
        font-size: var(--wk-text-xs);
        padding: 1px 6px;
        border-radius: var(--wk-radius-pill);
        background: var(--wk-error-bg);
        color: var(--wk-error);
        font-weight: 600;
    }

    .notif-description {
        margin: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        line-height: 1.5;
    }

    .notif-context {
        margin: 0;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
        line-height: 1.4;
    }

    .notif-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        flex-shrink: 0;
        align-self: flex-start;
    }

    /* More actions popover */
    .notif-more-actions {
        position: relative;
        display: inline-flex;
    }

    .notif-more-popover {
        position: absolute;
        z-index: 20;
        right: 0;
        top: calc(100% + 6px);
        display: grid;
        gap: 4px;
        min-width: 160px;
        padding: 8px;
        border: 1px solid var(--wk-border-subtle);
        border-radius: var(--wk-radius-md);
        background: var(--wk-bg-card);
        box-shadow: var(--wk-shadow-popover);
    }

    .notif-more-popover .wk-btn {
        justify-content: flex-start;
        text-align: left;
    }

    @container (max-width: 640px) {
        .notif-message {
            flex-direction: column;
            gap: 10px;
        }

        .notif-actions {
            align-self: stretch;
        }
    }
</style>
