<script lang="ts">
    import { showMessage } from "siyuan";
    import type { EnhancedDiaryWorkspaceNotification } from "../enhancedDiaryWorkspaceNotifications";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import type { EnhancedDiaryWorkspaceReviewCard } from "../enhancedDiaryWorkspaceViewModel";
    import {
        loadSnoozedNotificationIds,
        saveSnoozedNotificationIds,
    } from "../enhancedDiaryWorkspaceNotificationState";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";

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
            case "migrate_task":          return "迁移";
            case "append_template":       return "补今日模板";
            case "create_or_open_review": return "创建/打开";
            case "append_review_template":return "补复盘模板";
            case "complete_review":       return "标记完成";
            default:                      return "打开";
        }
    }

    function typeLabel(type: EnhancedDiaryWorkspaceNotification["type"]): string {
        switch (type) {
            case "overdue_task":         return "逾期任务";
            case "migration_suggestion": return "迁移建议";
            case "template_missing":     return "模板缺失";
            case "review_due":           return "复盘提醒";
            default:                     return "通知";
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

    let searchText: string = $state("");
    let typeFilter: string = $state("all");
    let levelFilter: string = $state("all");
    let actionFilter: "all" | "actionable" | "readonly" | "snoozed" = $state("all");
    let selectedNotificationId: string | null = $state(null);
    let snoozedIds: string[] = $state(loadSnoozedNotificationIds());

    function getLevelWeight(level: EnhancedDiaryWorkspaceNotification["level"]): number {
        if (level === "danger") return 3;
        if (level === "warning") return 2;
        return 1;
    }

    const filteredNotifications = $derived.by(() => {
        let result = [...notifications];

        result.sort((a, b) => getLevelWeight(b.level) - getLevelWeight(a.level));

        if (actionFilter === "snoozed") {
            result = result.filter((item) => snoozedIds.includes(item.id));
        }

        if (searchText.trim()) {
            const kw = searchText.trim().toLowerCase();
            result = result.filter((item) =>
                item.title.toLowerCase().includes(kw) ||
                item.description.toLowerCase().includes(kw) ||
                typeLabel(item.type).toLowerCase().includes(kw) ||
                (item.action ? actionLabel(item.action).toLowerCase().includes(kw) : false)
            );
        }

        if (typeFilter !== "all") {
            result = result.filter((item) => item.type === typeFilter);
        }

        if (levelFilter !== "all") {
            result = result.filter((item) => item.level === levelFilter);
        }

        if (actionFilter === "actionable") {
            result = result.filter((item) => hasValidAction(item));
        } else if (actionFilter === "readonly") {
            result = result.filter((item) => !hasValidAction(item));
        }

        return result;
    });

    const dangerCount = $derived(notifications.filter((n) => n.level === "danger").length);
    const warningCount = $derived(notifications.filter((n) => n.level === "warning").length);
    const infoCount = $derived(notifications.filter((n) => n.level === "info").length);
    const actionableCount = $derived(notifications.filter((n) => hasValidAction(n)).length);
    const snoozedCount = $derived(notifications.filter((n) => snoozedIds.includes(n.id)).length);

    const selectedNotification = $derived(
        selectedNotificationId
            ? filteredNotifications.find((item) => item.id === selectedNotificationId) || null
            : null
    );
    const selectedRelatedTask = $derived(
        selectedNotification ? findTask(selectedNotification.relatedTaskId) : undefined
    );

    $effect(() => {
        if (filteredNotifications.length === 0) {
            selectedNotificationId = null;
            return;
        }
        const found = selectedNotificationId
            ? filteredNotifications.find((item) => item.id === selectedNotificationId)
            : null;
        if (!found) {
            selectedNotificationId = filteredNotifications[0].id;
        }
    });

    function clearFilters() {
        searchText = "";
        typeFilter = "all";
        levelFilter = "all";
        actionFilter = "all";
    }

    function saveSnoozedIds(nextIds: string[]): void {
        snoozedIds = nextIds;
        saveSnoozedNotificationIds(nextIds);
        onSnoozedChange?.();
    }

    function snoozeNotification(id: string): void {
        if (snoozedIds.includes(id)) return;
        saveSnoozedIds([...snoozedIds, id]);
        selectedNotificationId = null;
    }

    function restoreNotification(id: string): void {
        saveSnoozedIds(snoozedIds.filter((item) => item !== id));
        selectedNotificationId = null;
    }

    let lastNotifSelectVersion = $state(0);
    $effect(() => {
        if (selectVersion <= lastNotifSelectVersion) return;
        lastNotifSelectVersion = selectVersion;
        if (initialSelectedNotificationId) {
            const found = notifications.find((n) => n.id === initialSelectedNotificationId);
            if (found) {
                searchText = "";
                typeFilter = "all";
                levelFilter = "all";
                actionFilter = "all";
                selectedNotificationId = initialSelectedNotificationId;
            }
        }
    });
</script>

<section class="notification-panel">
    <div class="panel-header">
        <div>
            <h2>通知中心</h2>
            <p class="panel-subtitle">集中处理逾期任务、迁移建议、模板缺失和复盘提醒。</p>
        </div>
    </div>

    {#if notifications.length === 0}
        <WorkspaceEmptyState title="暂无提醒" description="逾期任务、迁移建议、模板缺失和复盘提醒会显示在这里。" />
    {:else}
        <div class="stats-cards">
            <div class="stat-card">
                <span class="stat-label">全部提醒</span>
                <strong class="stat-value">{notifications.length}</strong>
            </div>
            <div class="stat-card danger">
                <span class="stat-label">危险</span>
                <strong class="stat-value">{dangerCount}</strong>
            </div>
            <div class="stat-card warning">
                <span class="stat-label">警告</span>
                <strong class="stat-value">{warningCount}</strong>
            </div>
            <div class="stat-card info">
                <span class="stat-label">信息</span>
                <strong class="stat-value">{infoCount}</strong>
            </div>
            <div class="stat-card">
                <span class="stat-label">可操作</span>
                <strong class="stat-value">{actionableCount}</strong>
            </div>
            <div class="stat-card">
                <span class="stat-label">暂不处理</span>
                <strong class="stat-value">{snoozedCount}</strong>
            </div>
        </div>

        <div class="notification-filter-card">
            <div class="notification-filter-controls">
                <input
                    type="text"
                    class="notification-filter-input"
                    placeholder="搜索通知标题、描述..."
                    bind:value={searchText}
                />
                <button type="button" class="notification-filter-clear" onclick={clearFilters}>清空</button>
                <select class="notification-filter-select" bind:value={typeFilter}>
                    <option value="all">全部类型</option>
                    <option value="overdue_task">逾期任务</option>
                    <option value="migration_suggestion">迁移建议</option>
                    <option value="template_missing">模板缺失</option>
                    <option value="review_due">复盘提醒</option>
                </select>
                <select class="notification-filter-select" bind:value={levelFilter}>
                    <option value="all">全部级别</option>
                    <option value="danger">危险</option>
                    <option value="warning">警告</option>
                    <option value="info">信息</option>
                </select>
                <select class="notification-filter-select" bind:value={actionFilter}>
                    <option value="all">全部操作</option>
                    <option value="actionable">可操作</option>
                    <option value="readonly">仅查看</option>
                    <option value="snoozed">暂不处理</option>
                </select>
            </div>
            <div class="notification-filter-summary">
                当前显示 <strong>{filteredNotifications.length}</strong> / 总计 <strong>{notifications.length}</strong> 条
            </div>
        </div>

        {#if filteredNotifications.length === 0}
            <WorkspaceEmptyState title="暂无匹配通知" description="请调整筛选条件。" />
        {:else}
            <div class="notif-layout">
                <div class="notif-list-col">
                    <div class="list-label">通知列表 · {filteredNotifications.length} 条</div>
                    <div class="notif-list-scroll">
                        {#each filteredNotifications as item (item.id)}
                            <button
                                type="button"
                                class="notif-list-item level-{item.level}"
                                class:selected={selectedNotificationId === item.id}
                                onclick={() => (selectedNotificationId = item.id)}
                            >
                                <div class="notif-item-head">
                                    <span class="type-badge type-{item.type}">{typeLabel(item.type)}</span>
                                    <span class="level-badge level-{item.level}">{item.level === "danger" ? "危险" : item.level === "warning" ? "警告" : "信息"}</span>
                                </div>
                                <div class="notif-item-title">{item.title}</div>
                                <div class="notif-item-desc">{item.description.slice(0, 80)}</div>
                                {#if item.action}
                                    <span class="action-badge">{actionLabel(item.action)}</span>
                                {/if}
                                {#if snoozedIds.includes(item.id)}
                                    <span class="action-badge">暂不处理</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="notif-detail-col">
                    {#if selectedNotification}
                        <div class="detail-panel">
                            <div class="detail-head">
                                <h3 class="detail-title">{selectedNotification.title}</h3>
                                <div class="detail-badges">
                                    <span class="type-badge type-{selectedNotification.type}">{typeLabel(selectedNotification.type)}</span>
                                    <span class="level-badge level-{selectedNotification.level}">{selectedNotification.level === "danger" ? "危险" : selectedNotification.level === "warning" ? "警告" : "信息"}</span>
                                </div>
                            </div>

                            <p class="detail-desc">{selectedNotification.description}</p>

                            <div class="detail-meta-grid">
                                <div class="meta-item">
                                    <span class="meta-label">通知 ID</span>
                                    <span class="meta-value">{selectedNotification.id}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">类型</span>
                                    <span class="meta-value">{typeLabel(selectedNotification.type)}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">级别</span>
                                    <span class="meta-value">{selectedNotification.level === "danger" ? "危险" : selectedNotification.level === "warning" ? "警告" : "信息"}</span>
                                </div>
                                {#if selectedNotification.relatedTaskId}
                                    <div class="meta-item">
                                        <span class="meta-label">关联任务</span>
                                        <span class="meta-value">{selectedNotification.relatedTaskId}</span>
                                    </div>
                                {/if}
                                {#if selectedNotification.relatedDocId}
                                    <div class="meta-item">
                                        <span class="meta-label">关联文档</span>
                                        <span class="meta-value">{selectedNotification.relatedDocId}</span>
                                    </div>
                                {/if}
                                {#if selectedNotification.reviewPeriod}
                                    <div class="meta-item">
                                        <span class="meta-label">复盘周期</span>
                                        <span class="meta-value">{selectedNotification.reviewPeriod}</span>
                                    </div>
                                {/if}
                                {#if selectedNotification.action}
                                    <div class="meta-item">
                                        <span class="meta-label">操作类型</span>
                                        <span class="meta-value">{actionLabel(selectedNotification.action)}</span>
                                    </div>
                                {/if}
                            </div>

                            <div class="detail-actions">
                                {#if hasValidAction(selectedNotification)}
                                    <button
                                        type="button"
                                        class="btn-action btn-primary"
                                        onclick={() => runAction(selectedNotification)}
                                    >{actionLabel(selectedNotification.action)}</button>
                                {:else}
                                    <span class="hint-text">当前提醒缺少可执行对象，请刷新工作台后重试。</span>
                                {/if}
                                {#if selectedNotification.relatedDocId}
                                    <button
                                        type="button"
                                        class="btn-action"
                                        onclick={() => onOpenDoc(selectedNotification.relatedDocId)}
                                    >打开相关文档</button>
                                {/if}
                                {#if selectedRelatedTask}
                                    <button
                                        type="button"
                                        class="btn-action"
                                        onclick={() => onCompleteTask(selectedRelatedTask)}
                                    >{selectedRelatedTask.completed ? "取消完成" : "完成任务"}</button>
                                    <button
                                        type="button"
                                        class="btn-action"
                                        onclick={() => onPostponeTask(selectedRelatedTask, "tomorrow")}
                                    >推迟明天</button>
                                    <button
                                        type="button"
                                        class="btn-action"
                                        onclick={() => onPostponeTask(selectedRelatedTask, "nextWeek")}
                                    >推迟下周</button>
                                {/if}
                                {#if snoozedIds.includes(selectedNotification.id)}
                                    <button
                                        type="button"
                                        class="btn-action"
                                        onclick={() => restoreNotification(selectedNotification.id)}
                                    >恢复提醒</button>
                                {:else}
                                    <button
                                        type="button"
                                        class="btn-action"
                                        onclick={() => snoozeNotification(selectedNotification.id)}
                                    >暂不处理</button>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <WorkspaceEmptyState title="请选择一条通知" description="从左侧列表选择通知以查看详情。" />
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</section>

<style>
    .notification-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .panel-header h2 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .panel-subtitle {
        margin: 0;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
    }

    /* stats */
    .stats-cards {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 10px;
    }

    .stat-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 12px;
        text-align: center;
    }

    .stat-card.danger { border-left: 3px solid var(--b3-theme-error, #d32f2f); }
    .stat-card.warning { border-left: 3px solid #e6900a; }
    .stat-card.info { border-left: 3px solid var(--b3-theme-primary); }

    .stat-label {
        display: block;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        margin-bottom: 4px;
    }

    .stat-value {
        display: block;
        font-size: 22px;
        font-variant-numeric: tabular-nums;
        color: var(--b3-theme-on-surface);
    }

    .stat-card.danger .stat-value { color: var(--b3-theme-error, #d32f2f); }
    .stat-card.warning .stat-value { color: #e6a817; }
    .stat-card.info .stat-value { color: var(--b3-theme-primary); }

    /* filter card */
    .notification-filter-card {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 14px 16px;
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .notification-filter-controls {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) auto repeat(3, minmax(120px, 140px));
        gap: 10px;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
    }

    .notification-filter-input {
        min-width: 0;
    }

    .notification-filter-select {
        min-width: 0;
    }

    .notification-filter-clear {
        width: auto;
        min-width: 76px;
        white-space: nowrap;
    }

    .notification-filter-input,
    .notification-filter-select,
    .notification-filter-clear {
        width: 100%;
        min-width: 0;
        height: 36px;
        box-sizing: border-box;
        margin: 0;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 12px;
        line-height: 34px;
        vertical-align: middle;
    }

    .notification-filter-input {
        padding: 0 12px;
    }

    .notification-filter-input::placeholder {
        color: var(--b3-theme-on-background);
        opacity: 0.4;
    }

    .notification-filter-select {
        padding: 0 10px;
        cursor: pointer;
        line-height: normal;
    }

    .notification-filter-clear {
        padding: 0 12px;
        cursor: pointer;
        white-space: nowrap;
        text-align: center;
    }

    .notification-filter-clear:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .notification-filter-summary {
        width: 100%;
        box-sizing: border-box;
        font-size: 11px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
        padding-left: 2px;
    }

    .notification-filter-summary strong {
        font-weight: 600;
        opacity: 0.9;
    }

    /* layout */
    .notif-layout {
        display: grid;
        grid-template-columns: minmax(360px, 460px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
        min-height: 400px;
    }

    .notif-list-col {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 440px);
    }

    .list-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        opacity: 0.45;
        padding: 10px 14px 8px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .notif-list-scroll {
        overflow-y: auto;
        flex: 1;
        padding: 4px 8px 8px;
    }

    .notif-list-item {
        display: flex;
        flex-direction: column;
        gap: 3px;
        width: 100%;
        border: none;
        border-radius: 8px;
        background: transparent;
        padding: 10px 12px;
        cursor: pointer;
        text-align: left;
        transition: background 0.12s;
        border-left: 3px solid transparent;
    }

    .notif-list-item:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
    }

    .notif-list-item.selected {
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        border-left-color: var(--b3-theme-primary);
    }

    .notif-list-item.level-info { border-left-color: color-mix(in srgb, var(--b3-theme-primary) 40%, transparent); }
    .notif-list-item.level-warning { border-left-color: color-mix(in srgb, #e6900a 40%, transparent); }
    .notif-list-item.level-danger { border-left-color: color-mix(in srgb, var(--b3-theme-error, #d32f2f) 50%, transparent); }

    .notif-list-item.level-info.selected,
    .notif-list-item.level-warning.selected,
    .notif-list-item.level-danger.selected { border-left-color: var(--b3-theme-primary); }

    .notif-item-head {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .notif-item-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .notif-item-desc {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* badges */
    .type-badge {
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 999px;
        font-weight: 500;
        white-space: nowrap;
    }

    .type-overdue_task {
        background: rgba(211, 47, 47, 0.12);
        color: var(--b3-theme-error, #d32f2f);
        border: 1px solid rgba(211, 47, 47, 0.3);
    }

    .type-migration_suggestion {
        background: rgba(255, 165, 0, 0.12);
        color: #b87300;
        border: 1px solid rgba(255, 165, 0, 0.35);
    }

    .type-template_missing {
        background: rgba(255, 165, 0, 0.12);
        color: #b87300;
        border: 1px solid rgba(255, 165, 0, 0.35);
    }

    .type-review_due {
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
    }

    .level-badge {
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 999px;
        font-weight: 500;
        white-space: nowrap;
    }

    .level-badge.level-info {
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 25%, transparent);
    }

    .level-badge.level-warning {
        background: rgba(255, 165, 0, 0.1);
        color: #b87300;
        border: 1px solid rgba(255, 165, 0, 0.3);
    }

    .level-badge.level-danger {
        background: rgba(211, 47, 47, 0.1);
        color: var(--b3-theme-error, #d32f2f);
        border: 1px solid rgba(211, 47, 47, 0.3);
    }

    .action-badge {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 999px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
        align-self: flex-start;
    }

    /* detail */
    .notif-detail-col {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        min-height: 200px;
    }

    .detail-panel {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .detail-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
    }

    .detail-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        word-break: break-all;
    }

    .detail-badges {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        flex-shrink: 0;
    }

    .detail-desc {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
        opacity: 0.72;
    }

    .detail-meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    .meta-item {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        padding: 6px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .meta-label {
        font-size: 10px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
    }

    .meta-value {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        word-break: break-all;
    }

    .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        padding-top: 8px;
        border-top: 1px solid var(--b3-border-color);
    }

    .btn-action {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
    }

    .btn-action:hover:not(:disabled) {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .btn-action.btn-primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .btn-action.btn-primary:hover {
        opacity: 0.88;
        color: #fff;
    }

    .hint-text {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.45;
    }

    @media (max-width: 1180px) {
        .notification-filter-controls {
            grid-template-columns: minmax(0, 1fr) auto;
        }
    }

    @media (max-width: 520px) {
        .notification-filter-controls {
            grid-template-columns: 1fr;
        }

        .notification-filter-clear {
            width: 100%;
        }
    }

    @media (max-width: 900px) {
        .stats-cards {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .notif-layout {
            grid-template-columns: 1fr;
        }

        .notif-list-col {
            max-height: 300px;
        }
    }
</style>
