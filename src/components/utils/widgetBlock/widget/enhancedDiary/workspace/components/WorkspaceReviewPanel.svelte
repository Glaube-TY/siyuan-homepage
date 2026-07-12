<script lang="ts">
    import type { EnhancedDiaryWorkspaceReviewCard } from "../enhancedDiaryWorkspaceViewModel";
    import type { EnhancedDiaryWorkspaceReviewHistoryItem } from "../enhancedDiaryWorkspaceReviewHistory";
    import type { EnhancedDiaryPeriod, EnhancedDiaryStatus } from "../../enhancedDiaryTypes";
    import type { EnhancedDiaryReviewField } from "../enhancedDiaryWorkspaceReviewContent";
    import type { EnhancedDiaryWorkspaceRecord } from "../enhancedDiaryWorkspaceRecordService";
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        cards: EnhancedDiaryWorkspaceReviewCard[];
        history?: EnhancedDiaryWorkspaceReviewHistoryItem[];
        onOpen: (card: EnhancedDiaryWorkspaceReviewCard) => void;
        onCreateOrOpen: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onAppendTemplate: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onComplete: (card: EnhancedDiaryWorkspaceReviewCard, completed: boolean) => void | Promise<void>;
        onSkip: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onRestoreSkip: (card: EnhancedDiaryWorkspaceReviewCard) => void | Promise<void>;
        onLoadContent?: (card: EnhancedDiaryWorkspaceReviewCard) => Promise<{ fields: EnhancedDiaryReviewField[]; reason?: string }>;
        onSaveContent?: (card: EnhancedDiaryWorkspaceReviewCard, fields: EnhancedDiaryReviewField[]) => Promise<boolean>;
        onRequestHistory?: () => void | Promise<void>;
        onOpenToday?: () => void | Promise<void>;
        onOpenRecords?: (date: string) => void;
        historyLoading?: boolean;
        initialViewMode?: "current" | "history";
        initialSelectedHistoryKey?: string;
        selectVersion?: number;
        todayRecords?: EnhancedDiaryWorkspaceRecord[];
        todayTasks?: EnhancedDiaryWorkspaceTask[];
        taskManagementEnabled?: boolean;
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
        onLoadContent,
        onSaveContent,
        onRequestHistory,
        onOpenToday,
        onOpenRecords,
        historyLoading = false,
        initialViewMode = "current",
        initialSelectedHistoryKey = "",
        selectVersion = 0,
        todayRecords = [],
        todayTasks = [],
        taskManagementEnabled = true,
    }: Props = $props();

    const effectiveTodayTasks = $derived(taskManagementEnabled ? todayTasks : []);

    let viewMode: "current" | "history" = $state("current");
    let selectedPeriod: EnhancedDiaryPeriod = $state("day");
    let periodFilter: "all" | EnhancedDiaryPeriod = $state("all");
    let statusFilter: "all" | EnhancedDiaryStatus = $state("all");
    let selectedHistoryKey: string | null = $state(null);
    let pendingHistoryKey: string | null = $state(null);
    let missingHistoryKey: string | null = $state(null);
    let lastReviewSelectVersion = $state(0);

    let contentLoading = $state(false);
    let contentSaving = $state(false);
    let contentFields = $state<EnhancedDiaryReviewField[]>([]);
    let contentReason = $state<string | undefined>(undefined);
    let loadedContentKey = $state<string | null>(null);
    let contentError = $state(false);
    let focusedFieldKey: string | null = $state(null);

    const todayStats = $derived.by(() => {
        const totalTasks = effectiveTodayTasks.length;
        const completedTasks = effectiveTodayTasks.filter(t => t.completed).length;
        const incompleteTasks = effectiveTodayTasks.filter(t => !t.completed).length;
        const overdueTasks = effectiveTodayTasks.filter(t => t.isOverdue).length;
        return {
            recordCount: todayRecords.length,
            totalTasks,
            completedTasks,
            incompleteTasks,
            overdueTasks,
        };
    });

    function insertMaterial(text: string) {
        if (!text.trim() || contentFields.length === 0) return;
        const target = contentFields.find((f) => f.key === focusedFieldKey) || contentFields[0];
        if (!target) return;
        const currentContent = target.content;
        const newValue = currentContent ? `${currentContent}\n\n${text}` : text;
        contentFields = contentFields.map((f) => f.key === target.key ? { ...f, content: newValue } : f);
    }

    const periodOrder: EnhancedDiaryPeriod[] = ["day", "week", "month", "year"];
    const periodTabLabels: Record<EnhancedDiaryPeriod, string> = {
        day: "日复盘",
        week: "周复盘",
        month: "月复盘",
        year: "年复盘",
    };

    const cardByPeriod = $derived(
        new Map(cards.map((card) => [card.period, card]))
    );
    const currentCard = $derived(cardByPeriod.get(selectedPeriod) || null);

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

    function isContentEditable(card: EnhancedDiaryWorkspaceReviewCard): boolean {
        return !!card.docId && !["not_due", "not_created", "missing_template"].includes(card.status);
    }

    function contentKeyFor(card: EnhancedDiaryWorkspaceReviewCard): string {
        return `${card.period}:${card.docId || ""}`;
    }

    async function loadContentForCard(card: EnhancedDiaryWorkspaceReviewCard): Promise<void> {
        if (!onLoadContent || !card.docId || !isContentEditable(card)) {
            contentFields = [];
            contentReason = undefined;
            contentError = false;
            loadedContentKey = contentKeyFor(card);
            return;
        }

        const key = contentKeyFor(card);
        if (loadedContentKey === key && contentFields.length > 0) return;

        contentLoading = true;
        contentError = false;
        contentReason = undefined;
        try {
            const result = await onLoadContent(card);
            contentFields = result.fields;
            contentReason = result.reason;
            loadedContentKey = key;
        } catch {
            contentError = true;
            contentFields = [];
            loadedContentKey = key;
        } finally {
            contentLoading = false;
        }
    }

    async function handleSave(): Promise<void> {
        if (!currentCard || !onSaveContent || contentSaving) return;
        if (contentReason === "read_failed") return;
        contentSaving = true;
        try {
            const ok = await onSaveContent(currentCard, contentFields);
            if (!ok) {
                // save failed, keep user input
            }
        } finally {
            contentSaving = false;
        }
    }

    $effect(() => {
        if (selectVersion <= lastReviewSelectVersion) return;
        lastReviewSelectVersion = selectVersion;
        if (initialViewMode === "history" && initialSelectedHistoryKey) {
            viewMode = "history";
            periodFilter = "day";
            statusFilter = "all";
            selectedHistoryKey = initialSelectedHistoryKey;
            pendingHistoryKey = initialSelectedHistoryKey;
            missingHistoryKey = null;
            void onRequestHistory?.();
        }
    });

    $effect(() => {
        if (viewMode !== "current") return;
        const card = currentCard;
        if (card && isContentEditable(card)) {
            void loadContentForCard(card);
        } else {
            contentFields = [];
            contentReason = undefined;
            contentError = false;
            loadedContentKey = card ? contentKeyFor(card) : null;
        }
    });

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
    const missingHistoryDate = $derived(
        missingHistoryKey?.startsWith("day-") ? missingHistoryKey.slice(4) : ""
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
                missingHistoryKey = null;
                return;
            }
            if (historyLoading) {
                return;
            }
            missingHistoryKey = pendingHistoryKey;
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
                onclick={() => {
                    viewMode = "current";
                    missingHistoryKey = null;
                }}
            >当前复盘</button>
            <button
                type="button"
                class:active={viewMode === "history"}
                onclick={() => {
                    viewMode = "history";
                    missingHistoryKey = null;
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
        <div class="period-tabs">
            {#each periodOrder as period}
                {@const card = cardByPeriod.get(period)}
                <button
                    type="button"
                    class="period-tab"
                    class:active={selectedPeriod === period}
                    onclick={() => (selectedPeriod = period)}
                >
                    <span class="period-tab-label">{periodTabLabels[period]}</span>
                    {#if card}
                        <span class="status-badge status-{card.status}">{card.statusLabel}</span>
                    {/if}
                </button>
            {/each}
        </div>

        {#if currentCard}
            <section class="setting-card">
                <div class="setting-card-title">
                    <strong>{currentCard.title}</strong>
                    <span class="status-badge status-{currentCard.status}">{currentCard.statusLabel}</span>
                </div>
                <p class="date-range">{currentCard.dateOrRange}</p>

                {#if currentCard.status === "not_due"}
                    <div class="not-due-hint">
                        <p>还没到复盘时间。当前周期：{currentCard.dateOrRange}</p>
                        {#if currentCard.docId}
                            <button type="button" class="btn-secondary" onclick={() => onOpen(currentCard)}>打开文档</button>
                        {/if}
                    </div>
                {:else}
                    <div class="card-actions">
                        {#if currentCard.docId}
                            <button type="button" class="btn-secondary" onclick={() => onOpen(currentCard)}>打开文档</button>
                        {/if}

                        {#if currentCard.status === "not_created"}
                            <button type="button" class="btn-primary" onclick={() => onCreateOrOpen(currentCard)}>创建/打开</button>
                        {:else if currentCard.status === "missing_template"}
                            <button type="button" class="btn-warning" onclick={() => onAppendTemplate(currentCard)}>补模板</button>
                        {:else if currentCard.status === "pending"}
                            <button type="button" class="btn-primary" onclick={() => onComplete(currentCard, true)}>标记完成</button>
                        {:else if currentCard.status === "completed"}
                            <button type="button" class="btn-secondary" onclick={() => onComplete(currentCard, false)}>取消完成</button>
                        {:else if currentCard.status === "overdue"}
                            <button type="button" class="btn-primary" onclick={() => onComplete(currentCard, true)}>标记完成</button>
                            <button type="button" class="btn-secondary" onclick={() => onSkip(currentCard)}>跳过本周期</button>
                        {:else if currentCard.status === "skipped"}
                            <button type="button" class="btn-secondary" onclick={() => onRestoreSkip(currentCard)}>取消跳过</button>
                        {/if}
                    </div>

                    {#if isContentEditable(currentCard) && onLoadContent}
                        <div class="content-editor">
                            <div class="content-editor-header">
                                <span>复盘内容</span>
                            </div>

                            {#if (todayRecords.length > 0 || effectiveTodayTasks.length > 0)}
                                <div class="today-materials">
                                    <div class="materials-header">今日素材</div>
                                    <div class="materials-stats">
                                        <div class="stat-item">记录: {todayStats.recordCount}</div>
                                        {#if taskManagementEnabled}
                                            <div class="stat-item">任务: {todayStats.totalTasks}</div>
                                            <div class="stat-item">已完成: {todayStats.completedTasks}</div>
                                            <div class="stat-item">未完成: {todayStats.incompleteTasks}</div>
                                            <div class="stat-item">逾期: {todayStats.overdueTasks}</div>
                                        {/if}
                                    </div>
                                    <div class="materials-actions">
                                        {#if taskManagementEnabled}
                                            <button
                                                type="button"
                                                class="btn-material"
                                                disabled={todayStats.totalTasks === 0}
                                                onclick={() => insertMaterial(
                                                    `今日任务：共 ${todayStats.totalTasks} 个，完成 ${todayStats.completedTasks} 个，未完成 ${todayStats.incompleteTasks} 个，逾期 ${todayStats.overdueTasks} 个。`
                                                )}
                                            >插入任务概览</button>
                                        {/if}
                                        <button
                                            type="button"
                                            class="btn-material"
                                            disabled={todayStats.recordCount === 0}
                                            onclick={() => insertMaterial(
                                                todayRecords.map(r => `- [${r.categoryTitle}] ${r.content.split('\n').find(line => line.trim()) || r.headingTitle}`).join('\n')
                                            )}
                                        >插入记录摘要</button>
                                        {#if taskManagementEnabled}
                                            <button
                                                type="button"
                                                class="btn-material"
                                                disabled={todayStats.completedTasks === 0}
                                                onclick={() => insertMaterial(
                                                    effectiveTodayTasks.filter(t => t.completed).map(t => `- [x] ${t.taskname}`).join('\n')
                                                )}
                                            >插入已完成任务</button>
                                            <button
                                                type="button"
                                                class="btn-material"
                                                disabled={todayStats.incompleteTasks === 0}
                                                onclick={() => insertMaterial(
                                                    effectiveTodayTasks.filter(t => !t.completed).map(t => `- [ ] ${t.taskname}`).join('\n')
                                                )}
                                            >插入未完成任务</button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}

                            {#if contentLoading}
                                <div class="content-loading">加载中...</div>
                            {:else if contentError}
                                <div class="content-error">复盘内容读取失败，请打开文档检查模板结构。</div>
                            {:else if contentReason === "missing_review_root"}
                                <div class="content-error">当前日记缺少复盘区块，请先补充模板。</div>
                            {:else if contentReason === "read_failed"}
                                <div class="content-error">日记正文暂时无法读取，为保护已有内容，本次禁止编辑和保存，请稍后重试。</div>
                            {:else if contentFields.length > 0}
                                <div class="field-list">
                                    {#each contentFields as field, i}
                                        <label class="field-item">
                                            <div class="field-header">
                                                <span class="field-label">{field.label}</span>
                                                {#if field.missing}
                                                    <span class="field-missing-hint">模板中缺少该小节，保存时会自动创建</span>
                                                {/if}
                                            </div>
                                            <textarea
                                                class="b3-text-field fn__block"
                                                rows={3}
                                                bind:value={contentFields[i].content}
                                                onfocus={() => (focusedFieldKey = field.key)}
                                                placeholder="输入 {field.label} 内容..."
                                            ></textarea>
                                        </label>
                                    {/each}
                                </div>
                                <div class="content-actions">
                                    <button
                                        type="button"
                                        class="btn-primary"
                                        onclick={handleSave}
                                        disabled={contentSaving}
                                    >{contentSaving ? "保存中..." : "保存"}</button>
                                </div>
                            {:else}
                                <div class="content-loading">暂无复盘字段。</div>
                            {/if}
                        </div>
                    {/if}
                {/if}
            </section>
        {:else}
            <WorkspaceEmptyState title="未找到当前复盘" description="请稍后重试。" />
        {/if}
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
        {:else if missingHistoryDate}
            <div class="history-empty-guide">
                <WorkspaceIcon name="review" size={28} />
                <div>
                    <h3>这一天还没有复盘记录</h3>
                    <p>{missingHistoryDate} 没有可读取的日复盘档案。可以查看当天记录，或回到今日复盘继续处理当前周期。</p>
                </div>
                <div class="history-empty-actions">
                    {#if onOpenRecords}
                        <button type="button" class="btn-action" onclick={() => onOpenRecords?.(missingHistoryDate)}>查看当天记录</button>
                    {/if}
                    {#if onOpenToday}
                        <button type="button" class="btn-action btn-primary" onclick={onOpenToday}>返回今日日记</button>
                    {/if}
                    <button
                        type="button"
                        class="btn-action"
                        onclick={() => {
                            missingHistoryKey = null;
                            periodFilter = "all";
                            statusFilter = "all";
                        }}
                    >查看历史列表</button>
                </div>
            </div>
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
                                    <span class="has-doc-mark">
                                        <WorkspaceIcon name="diary" size={12} />
                                    </span>
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
                                    <span class="history-safe-hint">历史复盘不存在时不会自动创建。</span>
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
        color: var(--wk-ink);
        letter-spacing: -0.01em;
    }

    .review-summary-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
    }

    .summary-card {
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        padding: 12px;
        text-align: center;
    }

    .summary-card span {
        display: block;
        font-size: 11px;
        color: var(--wk-ink-secondary);
        opacity: 0.55;
        margin-bottom: 4px;
    }

    .summary-card strong {
        display: block;
        font-size: 22px;
        color: var(--wk-ink-secondary);
        font-variant-numeric: tabular-nums;
    }

    .summary-card strong.warn {
        color: #e6900a;
    }

    .summary-card strong.danger {
        color: var(--wk-error);
    }

    .summary-card small {
        display: block;
        margin-top: 3px;
        font-size: 10px;
        color: var(--wk-ink-secondary);
        opacity: 0.45;
        font-variant-numeric: tabular-nums;
    }

    /* period tabs */
    .period-tabs {
        display: inline-flex;
        width: fit-content;
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        overflow: hidden;
        background: var(--wk-surface);
    }

    .period-tab {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 72px;
        border: none;
        border-right: 1px solid var(--wk-border);
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 7px 13px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s;
    }

    .period-tab:last-child {
        border-right: none;
    }

    .period-tab:hover {
        background: color-mix(in srgb, var(--wk-primary) 6%, var(--wk-background));
    }

    .period-tab.active {
        background: var(--wk-primary);
        color: #fff;
    }

    .period-tab.active .status-badge {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
        border-color: rgba(255, 255, 255, 0.3);
    }

    .period-tab-label {
        font-weight: 600;
    }

    /* setting-card style */
    .setting-card {
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .setting-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--wk-ink);
        font-size: 14px;
        font-weight: 700;
    }

    .date-range {
        margin: 0;
        color: var(--wk-ink-secondary);
        opacity: 0.6;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }

    .not-due-hint {
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-background);
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .not-due-hint p {
        margin: 0;
        font-size: 13px;
        color: var(--wk-ink-secondary);
        opacity: 0.65;
    }

    .card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .content-editor {
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-background);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .content-editor-header {
        font-size: 13px;
        font-weight: 600;
        color: var(--wk-ink-secondary);
    }

    .content-loading {
        padding: 16px 0;
        text-align: center;
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.5;
    }

    .content-error {
        padding: 12px 14px;
        border: 1px solid rgba(255, 165, 0, 0.35);
        border-radius: 7px;
        background: rgba(255, 165, 0, 0.06);
        font-size: 12px;
        color: #b87300;
    }

    .field-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: min(48vh, 460px);
        overflow: auto;
        padding: 2px 2px 6px;
    }

    .field-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .field-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .field-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--wk-ink-secondary);
    }

    .field-missing-hint {
        font-size: 11px;
        color: var(--wk-primary);
        opacity: 0.7;
    }

    .field-list textarea {
        resize: vertical;
        width: 100%;
        box-sizing: border-box;
        min-height: 80px;
        font-size: 13px;
        line-height: 1.5;
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        padding: 8px 10px;
    }

    .field-list textarea:focus {
        border-color: var(--wk-primary);
        outline: none;
    }

    .content-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 4px;
    }

    .today-materials {
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-surface);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .materials-header {
        font-size: 12px;
        font-weight: 600;
        color: var(--wk-ink-secondary);
    }

    .materials-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .stat-item {
        font-size: 11px;
        color: var(--wk-ink-secondary);
        opacity: 0.7;
        padding: 3px 8px;
        border-radius: 4px;
        background: var(--wk-background);
        border: 1px solid var(--wk-border);
    }

    .materials-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .btn-material {
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 5px 10px;
        font-size: 11px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    .btn-material:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
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

    .status-badge.status-not_created    { background: rgba(0,0,0,0.06); color: var(--wk-ink-secondary); border: 1px solid var(--wk-border); }
    .status-badge.status-missing_template { background: rgba(255,165,0,0.12); color: #b87300; border: 1px solid rgba(255,165,0,0.35); }
    .status-badge.status-pending        { background: color-mix(in srgb, var(--wk-primary) 12%, transparent); color: var(--wk-primary); border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent); }
    .status-badge.status-completed      { background: rgba(40,167,69,0.12); color: #22863a; border: 1px solid rgba(40,167,69,0.3); }
    .status-badge.status-overdue        { background: rgba(211,47,47,0.1); color: var(--wk-error); border: 1px solid rgba(211,47,47,0.3); }
    .status-badge.status-skipped        { background: rgba(0,0,0,0.06); color: var(--wk-ink-secondary); border: 1px solid var(--wk-border); opacity: 0.7; }
    .status-badge.status-not_due        { background: rgba(0,0,0,0.04); color: var(--wk-ink-secondary); border: 1px solid var(--wk-border); opacity: 0.55; }

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
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        overflow: hidden;
    }

    .mode-tabs button {
        border: none;
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 6px 14px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s;
    }

    .mode-tabs button:hover {
        background: color-mix(in srgb, var(--wk-primary) 6%, var(--wk-background));
    }

    .mode-tabs button.active {
        background: var(--wk-primary);
        color: #fff;
    }

    /* buttons */
    button {
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    button:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-primary {
        border-color: var(--wk-primary);
        background: var(--wk-primary);
        color: #fff;
    }

    .btn-primary:hover:not(:disabled) {
        opacity: 0.88;
        color: #fff;
    }

    .btn-secondary {
        border: 1px solid var(--wk-border);
        background: var(--wk-background);
        color: var(--wk-ink);
    }

    .btn-secondary:hover:not(:disabled) {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .btn-warning {
        border-color: rgba(255, 165, 0, 0.5);
        color: #b87300;
    }

    .btn-warning:hover:not(:disabled) {
        border-color: #e6900a;
        color: #e6900a;
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
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        color: var(--wk-ink);
        font-size: 12px;
        cursor: pointer;
    }

    .filter-count {
        font-size: 11px;
        color: var(--wk-ink-secondary);
        opacity: 0.5;
    }

    .history-empty-guide {
        border: 1px solid var(--wk-border);
        border-radius: 12px;
        background: var(--wk-surface);
        padding: 22px;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        color: var(--wk-ink-secondary);
    }

    .history-empty-guide h3 {
        margin: 0 0 6px;
        font-size: 15px;
        font-weight: 700;
    }

    .history-empty-guide p {
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        opacity: 0.66;
    }

    .history-empty-actions {
        margin-left: auto;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
        flex-shrink: 0;
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
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 380px);
    }

    .list-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--wk-ink-secondary);
        opacity: 0.45;
        padding: 10px 14px 8px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--wk-border);
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
        background: color-mix(in srgb, var(--wk-primary) 6%, transparent);
    }

    .history-list-item.selected {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        border-left-color: var(--wk-primary);
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
        color: var(--wk-ink-secondary);
        opacity: 0.55;
    }

    .history-item-date {
        font-size: 11px;
        color: var(--wk-ink-secondary);
        opacity: 0.5;
    }

    .history-item-title {
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.7;
    }

    .has-doc-mark {
        font-size: 10px;
        margin-top: 2px;
    }

    /* history list status accent */
    .history-list-item.status-overdue      { border-left-color: color-mix(in srgb, var(--wk-error) 50%, transparent); }
    .history-list-item.status-pending      { border-left-color: color-mix(in srgb, var(--wk-primary) 40%, transparent); }
    .history-list-item.status-missing_template { border-left-color: color-mix(in srgb, #e6900a 40%, transparent); }
    .history-list-item.status-overdue.selected      { border-left-color: var(--wk-primary); }
    .history-list-item.status-pending.selected      { border-left-color: var(--wk-primary); }
    .history-list-item.status-missing_template.selected { border-left-color: var(--wk-primary); }

    /* detail */
    .history-detail-col {
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
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
        color: var(--wk-ink-secondary);
    }

    .detail-meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    .meta-item {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        padding: 6px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .meta-label {
        font-size: 10px;
        color: var(--wk-ink-secondary);
        opacity: 0.5;
    }

    .meta-value {
        font-size: 12px;
        color: var(--wk-ink-secondary);
        word-break: break-all;
    }

    .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-top: 8px;
        border-top: 1px solid var(--wk-border);
    }

    .btn-action {
        border: 1px solid var(--wk-border);
        border-radius: 6px;
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
    }

    .btn-action:hover:not(:disabled) {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .btn-action.btn-primary {
        border-color: var(--wk-primary);
        background: var(--wk-primary);
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

    .history-safe-hint {
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.55;
        align-self: center;
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

        .history-empty-guide {
            flex-direction: column;
        }

        .history-empty-actions {
            margin-left: 0;
            justify-content: flex-start;
        }

        .period-tabs {
            flex-wrap: wrap;
        }
    }
</style>
