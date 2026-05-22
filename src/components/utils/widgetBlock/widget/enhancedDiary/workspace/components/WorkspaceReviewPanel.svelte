<script lang="ts">
    import type { EnhancedDiaryWorkspaceReviewCard } from "../enhancedDiaryWorkspaceViewModel";
    import type { EnhancedDiaryWorkspaceReviewHistoryItem } from "../enhancedDiaryWorkspaceReviewHistory";
    import type { EnhancedDiaryPeriod, EnhancedDiaryStatus } from "../../enhancedDiaryTypes";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";

    interface Props {
        cards: EnhancedDiaryWorkspaceReviewCard[];
        history?: EnhancedDiaryWorkspaceReviewHistoryItem[];
        onOpen: (card: EnhancedDiaryWorkspaceReviewCard) => void;
        onCreateOrOpen: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onAppendTemplate: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onComplete: (card: EnhancedDiaryWorkspaceReviewCard, completed: boolean) => void | Promise<void>;
        onSkip: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onRestoreSkip: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onRequestHistory?: () => void | Promise<void>;
        historyLoading?: boolean;
        initialViewMode?: "current" | "history";
        initialSelectedHistoryKey?: string;
        selectVersion?: number;
    }

    let {
        cards,
        history = [],
        onOpen,
        onCreateOrOpen,
        onAppendTemplate,
        onComplete,
        onSkip,
        onRestoreSkip,
        onRequestHistory,
        historyLoading = false,
        initialViewMode = "current",
        initialSelectedHistoryKey = "",
        selectVersion = 0,
    }: Props = $props();

    let viewMode: "current" | "history" = $state("current");
    let periodFilter: "all" | EnhancedDiaryPeriod = $state("all");
    let statusFilter: "all" | EnhancedDiaryStatus = $state("all");
    let selectedHistoryKey: string | null = $state(null);
    let pendingHistoryKey: string | null = $state(null);
    let lastReviewSelectVersion = $state(0);

    $effect(() => {
        if (selectVersion <= lastReviewSelectVersion) return;
        lastReviewSelectVersion = selectVersion;
        if (initialViewMode === "history" && initialSelectedHistoryKey) {
            viewMode = "history";
            periodFilter = "day";
            statusFilter = "all";
            selectedHistoryKey = initialSelectedHistoryKey;
            pendingHistoryKey = initialSelectedHistoryKey;
            void onRequestHistory?.();
        }
    });

    const periodOrder: EnhancedDiaryPeriod[] = ["day", "week", "month", "year"];
    const sortedCards = $derived(
        periodOrder
            .map((period) => cards.find((card) => card.period === period))
            .filter((card): card is EnhancedDiaryWorkspaceReviewCard => !!card)
    );
    const currentCompletedCount = $derived(cards.filter((card) => card.status === "completed").length);
    const currentPendingCount = $derived(
        cards.filter((card) => ["not_created", "missing_template", "pending", "overdue"].includes(card.status)).length
    );
    const currentReviewScore = $derived(
        cards.length === 0 ? 0 : Math.round((currentCompletedCount / cards.length) * 100)
    );
    const last30DayItems = $derived(history.filter((item) => item.period === "day").slice(0, 30));
    const last12WeekItems = $derived(history.filter((item) => item.period === "week").slice(0, 12));
    const last30DayCompletionRate = $derived(
        last30DayItems.length === 0
            ? 0
            : Math.round((last30DayItems.filter((item) => item.status === "completed").length / last30DayItems.length) * 100)
    );
    const last12WeekCompletionRate = $derived(
        last12WeekItems.length === 0
            ? 0
            : Math.round((last12WeekItems.filter((item) => item.status === "completed").length / last12WeekItems.length) * 100)
    );
    const overdueHistoryCount = $derived(history.filter((item) => item.status === "overdue").length);

    const filteredHistory = $derived.by(() => {
        let result = history;

        if (periodFilter !== "all") {
            result = result.filter((item) => item.period === periodFilter);
        }

        if (statusFilter !== "all") {
            result = result.filter((item) => item.status === statusFilter);
        }

        return result;
    });

    const selectedHistoryItem = $derived(
        selectedHistoryKey
            ? filteredHistory.find((item) => item.key === selectedHistoryKey) || null
            : null
    );

    $effect(() => {
        if (filteredHistory.length === 0) {
            if (!pendingHistoryKey || !historyLoading) {
                selectedHistoryKey = null;
            }
            return;
        }
        if (pendingHistoryKey) {
            const found = filteredHistory.find((item) => item.key === pendingHistoryKey);
            if (found) {
                selectedHistoryKey = pendingHistoryKey;
                pendingHistoryKey = null;
                return;
            }
            if (historyLoading) {
                return;
            }
            pendingHistoryKey = null;
        }
        const found = selectedHistoryKey
            ? filteredHistory.find((item) => item.key === selectedHistoryKey)
            : null;
        if (!found) {
            selectedHistoryKey = filteredHistory[0].key;
        }
    });
</script>

<section class="review-panel">
    <div class="panel-head">
        <h2>复盘中心</h2>
        <div class="mode-tabs">
            <button
                type="button"
                class:active={viewMode === "current"}
                onclick={() => (viewMode = "current")}
            >当前复盘</button>
            <button
                type="button"
                class:active={viewMode === "history"}
                onclick={() => {
                    viewMode = "history";
                    void onRequestHistory?.();
                }}
            >历史档案</button>
        </div>
    </div>

    <div class="review-summary-grid">
        <div class="summary-card">
            <span>当前完成度</span>
            <strong>{currentCompletedCount}/{cards.length}</strong>
            <small>{currentReviewScore} 分</small>
        </div>
        <div class="summary-card">
            <span>待处理复盘</span>
            <strong class:warn={currentPendingCount > 0}>{currentPendingCount}</strong>
            <small>当前周期</small>
        </div>
        <div class="summary-card">
            <span>近 30 天日记</span>
            <strong>{last30DayCompletionRate}%</strong>
            <small>{last30DayItems.filter((item) => item.status === "completed").length}/{last30DayItems.length} 完成</small>
        </div>
        <div class="summary-card">
            <span>近 12 周周记</span>
            <strong>{last12WeekCompletionRate}%</strong>
            <small>{last12WeekItems.filter((item) => item.status === "completed").length}/{last12WeekItems.length} 完成</small>
        </div>
        <div class="summary-card">
            <span>历史逾期</span>
            <strong class:danger={overdueHistoryCount > 0}>{overdueHistoryCount}</strong>
            <small>历史档案</small>
        </div>
    </div>

    {#if viewMode === "current"}
        <div class="review-grid">
            {#each sortedCards as card}
                <article class="status-{card.status}">
                    <header>
                        <strong>{card.title}</strong>
                        <span class="status-badge status-{card.status}">{card.statusLabel}</span>
                    </header>
                    <p class="date-range">{card.dateOrRange}</p>
                    <footer>
                        {#if card.docId}
                            <button type="button" onclick={() => onOpen(card)}>打开</button>
                        {/if}

                        {#if card.status === "not_created"}
                            <button type="button" class="btn-primary" onclick={() => onCreateOrOpen(card)}>创建/打开</button>
                        {:else if card.status === "missing_template"}
                            <button type="button" class="btn-warning" onclick={() => onAppendTemplate(card)}>补模板</button>
                        {:else if card.status === "pending"}
                            <button type="button" class="btn-primary" onclick={() => onComplete(card, true)}>标记完成</button>
                        {:else if card.status === "completed"}
                            <button type="button" onclick={() => onComplete(card, false)}>取消完成</button>
                        {:else if card.status === "overdue"}
                            <button type="button" class="btn-primary" onclick={() => onComplete(card, true)}>标记完成</button>
                            <button type="button" onclick={() => onSkip(card)}>跳过本周期</button>
                        {:else if card.status === "skipped"}
                            <button type="button" onclick={() => onRestoreSkip(card)}>取消跳过</button>
                        {/if}
                    </footer>
                </article>
            {/each}
        </div>
    {:else}
        <div class="history-toolbar">
            <select class="filter-select" bind:value={periodFilter}>
                <option value="all">全部周期</option>
                <option value="day">日记</option>
                <option value="week">周记</option>
                <option value="month">月记</option>
                <option value="year">年记</option>
            </select>
            <select class="filter-select" bind:value={statusFilter}>
                <option value="all">全部状态</option>
                <option value="not_created">未创建</option>
                <option value="missing_template">缺少模板</option>
                <option value="pending">待完成</option>
                <option value="completed">已完成</option>
                <option value="overdue">已逾期</option>
                <option value="skipped">已跳过</option>
                <option value="not_due">未到期</option>
            </select>
            <span class="filter-count">当前 {filteredHistory.length} / 总计 {history.length} 条</span>
        </div>

        {#if historyLoading}
            <WorkspaceEmptyState title="历史复盘加载中" description="正在生成近 30 天、12 周、12 月和 5 年复盘档案。" />
        {:else if filteredHistory.length === 0}
            <WorkspaceEmptyState title="暂无匹配历史复盘" description="请调整筛选条件。" />
        {:else}
            <div class="history-layout">
                <div class="history-list-col">
                    <div class="list-label">历史记录 · {filteredHistory.length} 条</div>
                    <div class="history-list-scroll">
                        {#each filteredHistory as item (item.key)}
                            <button
                                type="button"
                                class="history-list-item status-{item.status}"
                                class:selected={selectedHistoryKey === item.key}
                                onclick={() => (selectedHistoryKey = item.key)}
                            >
                                <div class="history-item-head">
                                    <span class="history-item-period">{item.periodLabel}</span>
                                    <span class="status-badge status-{item.status}">{item.statusLabel}</span>
                                </div>
                                <div class="history-item-date">{item.dateOrRange}</div>
                                <div class="history-item-title">{item.title}</div>
                                {#if item.docId}
                                    <span class="has-doc-mark">📄</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="history-detail-col">
                    {#if selectedHistoryItem}
                        <div class="detail-panel">
                            <div class="detail-head">
                                <h3 class="detail-title">{selectedHistoryItem.title}</h3>
                                <span class="status-badge status-{selectedHistoryItem.status}">{selectedHistoryItem.statusLabel}</span>
                            </div>

                            <div class="detail-meta-grid">
                                <div class="meta-item">
                                    <span class="meta-label">周期类型</span>
                                    <span class="meta-value">{selectedHistoryItem.periodLabel}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">{selectedHistoryItem.period === "day" ? "日期" : "周期范围"}</span>
                                    <span class="meta-value">{selectedHistoryItem.dateOrRange}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">目标日期</span>
                                    <span class="meta-value">{selectedHistoryItem.sortDate}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">文档状态</span>
                                    <span class="meta-value">{selectedHistoryItem.docId ? "有文档" : "无文档"}</span>
                                </div>
                            </div>

                            <div class="detail-actions">
                                {#if selectedHistoryItem.docId}
                                    <button type="button" class="btn-action" onclick={() => onOpen(selectedHistoryItem)}>打开</button>
                                {/if}

                                {#if selectedHistoryItem.status === "not_created"}
                                    <button type="button" class="btn-action btn-primary" onclick={() => onCreateOrOpen(selectedHistoryItem)}>创建/打开</button>
                                {:else if selectedHistoryItem.status === "missing_template"}
                                    <button type="button" class="btn-action btn-warning" onclick={() => onAppendTemplate(selectedHistoryItem)}>补模板</button>
                                {:else if selectedHistoryItem.status === "pending"}
                                    <button type="button" class="btn-action btn-primary" onclick={() => onComplete(selectedHistoryItem, true)}>标记完成</button>
                                {:else if selectedHistoryItem.status === "completed"}
                                    <button type="button" class="btn-action" onclick={() => onComplete(selectedHistoryItem, false)}>取消完成</button>
                                {:else if selectedHistoryItem.status === "overdue"}
                                    <button type="button" class="btn-action btn-primary" onclick={() => onComplete(selectedHistoryItem, true)}>标记完成</button>
                                    <button type="button" class="btn-action" onclick={() => onSkip(selectedHistoryItem)}>跳过本周期</button>
                                {:else if selectedHistoryItem.status === "skipped"}
                                    <button type="button" class="btn-action" onclick={() => onRestoreSkip(selectedHistoryItem)}>取消跳过</button>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <WorkspaceEmptyState title="请选择一条记录" description="从左侧列表选择历史复盘以查看详情。" />
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</section>

<style>
    .review-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
        letter-spacing: -0.01em;
    }

    .review-summary-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
    }

    .summary-card {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 12px;
        text-align: center;
    }

    .summary-card span {
        display: block;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        margin-bottom: 4px;
    }

    .summary-card strong {
        display: block;
        font-size: 22px;
        color: var(--b3-theme-on-surface);
        font-variant-numeric: tabular-nums;
    }

    .summary-card strong.warn {
        color: #e6900a;
    }

    .summary-card strong.danger {
        color: var(--b3-theme-error, #d32f2f);
    }

    .summary-card small {
        display: block;
        margin-top: 3px;
        font-size: 10px;
        color: var(--b3-theme-on-surface);
        opacity: 0.45;
        font-variant-numeric: tabular-nums;
    }

    .review-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 14px;
    }

    article {
        border: 1px solid var(--b3-border-color);
        border-top-width: 3px;
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 0;
        transition: box-shadow 0.12s;
    }

    article:hover {
        box-shadow: 0 3px 12px rgba(0, 0, 0, 0.08);
    }

    /* 顶部色条 */
    .status-not_created   { border-top-color: var(--b3-border-color); }
    .status-missing_template { border-top-color: #e6900a; }
    .status-pending       { border-top-color: var(--b3-theme-primary); }
    .status-completed     { border-top-color: #22863a; }
    .status-overdue       { border-top-color: var(--b3-theme-error, #d32f2f); }
    .status-skipped       { border-top-color: var(--b3-border-color); opacity: 0.7; }
    .status-not_due       { border-top-color: var(--b3-border-color); opacity: 0.6; }

    header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 10px;
    }

    strong {
        color: var(--b3-theme-on-surface);
        font-size: 14px;
        font-weight: 600;
    }

    /* status badge */
    .status-badge {
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 999px;
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .status-badge.status-not_created    { background: rgba(0,0,0,0.06); color: var(--b3-theme-on-surface); border: 1px solid var(--b3-border-color); }
    .status-badge.status-missing_template { background: rgba(255,165,0,0.12); color: #b87300; border: 1px solid rgba(255,165,0,0.35); }
    .status-badge.status-pending        { background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); color: var(--b3-theme-primary); border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, transparent); }
    .status-badge.status-completed      { background: rgba(40,167,69,0.12); color: #22863a; border: 1px solid rgba(40,167,69,0.3); }
    .status-badge.status-overdue        { background: rgba(211,47,47,0.1); color: var(--b3-theme-error, #d32f2f); border: 1px solid rgba(211,47,47,0.3); }
    .status-badge.status-skipped        { background: rgba(0,0,0,0.06); color: var(--b3-theme-on-surface); border: 1px solid var(--b3-border-color); opacity: 0.7; }
    .status-badge.status-not_due        { background: rgba(0,0,0,0.04); color: var(--b3-theme-on-surface); border: 1px solid var(--b3-border-color); opacity: 0.55; }

    .date-range {
        margin: 0 0 14px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }

    footer {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: auto;
    }

    button {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .btn-primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .btn-primary:hover {
        opacity: 0.88;
        color: #fff;
    }

    .btn-warning {
        border-color: rgba(255, 165, 0, 0.5);
        color: #b87300;
    }

    .btn-warning:hover {
        border-color: #e6900a;
        color: #e6900a;
    }

    /* panel head + mode tabs */
    .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .mode-tabs {
        display: flex;
        gap: 0;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        overflow: hidden;
    }

    .mode-tabs button {
        border: none;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        padding: 6px 14px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s;
    }

    .mode-tabs button:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-background));
    }

    .mode-tabs button.active {
        background: var(--b3-theme-primary);
        color: #fff;
    }

    /* history toolbar */
    .history-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
    }

    .filter-select {
        padding: 6px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 12px;
        cursor: pointer;
    }

    .filter-count {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
    }

    /* history layout */
    .history-layout {
        display: grid;
        grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
        min-height: 400px;
    }

    .history-list-col {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 380px);
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

    .history-list-scroll {
        overflow-y: auto;
        flex: 1;
        padding: 4px 8px 8px;
    }

    .history-list-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
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

    .history-list-item:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 6%, transparent);
    }

    .history-list-item.selected {
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        border-left-color: var(--b3-theme-primary);
    }

    .history-item-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .history-item-period {
        font-size: 11px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
    }

    .history-item-date {
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
    }

    .history-item-title {
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.7;
    }

    .has-doc-mark {
        font-size: 10px;
        margin-top: 2px;
    }

    /* history list status accent */
    .history-list-item.status-overdue      { border-left-color: color-mix(in srgb, var(--b3-theme-error, #d32f2f) 50%, transparent); }
    .history-list-item.status-pending      { border-left-color: color-mix(in srgb, var(--b3-theme-primary) 40%, transparent); }
    .history-list-item.status-missing_template { border-left-color: color-mix(in srgb, #e6900a 40%, transparent); }
    .history-list-item.status-overdue.selected      { border-left-color: var(--b3-theme-primary); }
    .history-list-item.status-pending.selected      { border-left-color: var(--b3-theme-primary); }
    .history-list-item.status-missing_template.selected { border-left-color: var(--b3-theme-primary); }

    /* detail */
    .history-detail-col {
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
        gap: 6px;
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

    .btn-action.btn-warning {
        border-color: rgba(255, 165, 0, 0.5);
        color: #b87300;
    }

    .btn-action.btn-warning:hover {
        border-color: #e6900a;
        color: #e6900a;
    }

    @media (max-width: 760px) {
        .review-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .history-layout {
            grid-template-columns: 1fr;
        }

        .history-list-col {
            max-height: 300px;
        }
    }
</style>
