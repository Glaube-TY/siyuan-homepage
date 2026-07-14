<script lang="ts">
    import { mount, onMount } from "svelte";
    import { showMessage } from "siyuan";
    import { svelteDialog, confirmDialogBoolean, inputDialogSync } from "@/libs/dialog";
    import { openDocs } from "@/components/tools/openDocs";
    import {
        createFloatingDocPopup,
        hideImmediately,
        setMouseOnTrigger,
    } from "@/components/tools/floatingDoc";
    import AdvancedFeatureLock from "../common/AdvancedFeatureLock.svelte";
    import LocalIndexEmptyState from "../common/LocalIndexEmptyState.svelte";
    import { subscribeSharedWidgetDataUpdated } from "../sharedLocalStorage/sharedWidgetDataEvents";
    import ReviewDocsDialog from "./reviewDocsDialog.svelte";
    import ReviewDatePickerDialog from "./ReviewDatePickerDialog.svelte";
    import ReviewForgettingCurveDialog from "./ReviewForgettingCurveDialog.svelte";
    import {
        clearReviewTarget,
        completeReviewOnce,
        filterAndSortReviewItems,
        finishReviewTarget,
        getDefaultManualNextDate,
        getReviewSummary,
        loadAllReviewItemsResult,
        postponeReviewTarget,
        updateReviewTarget,
        type ReviewOperationResult,
    } from "./reviewDocs";
    import { loadReviewLogStats } from "./reviewDocsData";
    import {
        addDaysFromToday,
        getNextIntervalReviewDate,
        parseIntervalsText,
        shouldUseIntervalSchedule,
    } from "./reviewDocsSchedule";
    import { ensureReviewIndexInitialized } from "@/components/tools/siyuanComponentDataApi";
    import {
        DEFAULT_REVIEW_DOCS_CONFIG,
        type ReviewDocsConfig,
        type ReviewItem,
        type ReviewPriority,
        type ReviewSortBy,
        type ReviewView,
    } from "./reviewDocsTypes";

    interface Props {
        plugin: any;
        contentTypeJson?: string;
    }

    let { plugin, contentTypeJson = "{}" }: Props = $props();

    let advancedEnabled = $state(false);
    let isLoading = $state(true);
    let actionTargetId = $state("");
    let allItems = $state<ReviewItem[]>([]);
    let logStatusMessage = $state("");
    let todayReviewed = $state<number | null>(null);
    let reviewIndexStatus = $state<"ok" | "empty" | "limited" | "disabled" | "unsupported" | "error">("empty");
    let reviewIndexMessage = $state("复习索引为空；可新增复习计划，或到主页设置 > 检索管理中迁移旧属性。");
    let currentView = $state<ReviewView>("due");
    let currentSortBy = $state<ReviewSortBy>("dueAsc");
    let selectedCategory = $state("");
    let selectedPriority = $state<ReviewPriority | "all">("all");
    let searchText = $state("");
    let floatDocTimeout: number | null = $state(null);
    let mouseLeaveTimeout: number | null = $state(null);
    // 组件销毁后丢弃异步 SQL 结果，避免更新已卸载状态
    let isDestroyed = false;
    let unsubscribeDataUpdated: (() => void) | null = null;

    onMount(() => {
        isDestroyed = false;
        advancedEnabled = Boolean(plugin?.ADVANCED);
        currentView = config.reviewDocsDefaultView;
        currentSortBy = config.reviewDocsSortBy;

        if (!advancedEnabled) {
            isLoading = false;
            return undefined;
        }

        void initialize();
        unsubscribeDataUpdated = subscribeSharedWidgetDataUpdated("review-docs", () => void refreshAll());

        return () => {
            isDestroyed = true;
            unsubscribeDataUpdated?.();
            unsubscribeDataUpdated = null;
            clearFloatDocTimeouts();
        };
    });

    async function initialize() {
        await refreshAll();
    }

    function parseContent(value: string): any {
        try {
            return JSON.parse(value || "{}");
        } catch {
            return {};
        }
    }

    function normalizeConfig(data: Record<string, any>): ReviewDocsConfig {
        return {
            ...DEFAULT_REVIEW_DOCS_CONFIG,
            ...data,
            reviewDocsLimit: Math.max(1, Number(data.reviewDocsLimit) || DEFAULT_REVIEW_DOCS_CONFIG.reviewDocsLimit),
            reviewDocsFutureDays: Math.max(1, Number(data.reviewDocsFutureDays) || DEFAULT_REVIEW_DOCS_CONFIG.reviewDocsFutureDays),
            reviewDocsFloatDocShowTime: Number(data.reviewDocsFloatDocShowTime) || DEFAULT_REVIEW_DOCS_CONFIG.reviewDocsFloatDocShowTime,
        };
    }

    async function refreshAll() {
        if (!advancedEnabled || isDestroyed) return;
        try {
            await ensureReviewIndexInitialized(plugin);
            if (isDestroyed) return;
            const result = await loadAllReviewItemsResult(plugin, reviewDocsSelectedNotebookIds);
            if (isDestroyed) return;
            allItems = result.items;
            reviewIndexStatus = result.status;
            reviewIndexMessage = result.message || reviewIndexMessage;
            const stats = await loadReviewLogStats();
            if (isDestroyed) return;
            todayReviewed = stats.todayReviewed;
            logStatusMessage = stats.statusMessage;
        } catch (error) {
            if (isDestroyed) return;
            showMessage(error instanceof Error ? error.message : "复习文档加载失败", 4000);
        } finally {
            if (!isDestroyed) {
                isLoading = false;
            }
        }
    }

    function clearFloatDocTimeouts() {
        if (floatDocTimeout) {
            clearTimeout(floatDocTimeout);
            floatDocTimeout = null;
        }
        if (mouseLeaveTimeout) {
            clearTimeout(mouseLeaveTimeout);
            mouseLeaveTimeout = null;
        }
    }

    const parsedContent = $derived(parseContent(contentTypeJson));
    const config = $derived(normalizeConfig(parsedContent.data || {}));
    const reviewDocsSelectedNotebookIds = $derived<string[]>(
        (parsedContent.data?.reviewDocsSelectedNotebookIds ?? []).map((item: { value?: string }) => item.value).filter(Boolean)
    );
    const summary = $derived(getReviewSummary(allItems, config.reviewDocsFutureDays));
    const categories = $derived(
        Object.keys(summary.categories).sort((a, b) => a.localeCompare(b, "zh-CN"))
    );
    const visibleItems = $derived(filterAndSortReviewItems(allItems, {
        view: currentView,
        sortBy: currentSortBy,
        showDocs: config.reviewDocsShowDocs,
        showBlocks: config.reviewDocsShowBlocks,
        showFuture: config.reviewDocsShowFuture,
        futureDays: config.reviewDocsFutureDays,
        category: selectedCategory,
        priority: selectedPriority,
        search: searchText,
        limit: config.reviewDocsLimit,
    }));

    function openReviewItem(item: ReviewItem) {
        if (config.reviewDocsShowFloatDoc && !plugin.isMobile) {
            hideImmediately();
        }
        if (item.type === "doc") {
            openDocs(plugin, item.id, 0);
        } else {
            // 块项目：优先定位到具体块，失败则回退到所属文档
            try {
                openDocs(plugin, item.id, 1);
            } catch {
                openDocs(plugin, item.rootId, 0);
            }
        }
    }

    function showOperationResult(result: ReviewOperationResult) {
        showMessage(
            result.logWarning ? `${result.message}；复习计划已完成，但本地操作日志写入失败：${result.logWarning}` : result.message,
            4000
        );
    }

    async function runItemAction(item: ReviewItem, action: () => Promise<ReviewOperationResult>) {
        actionTargetId = item.id;
        try {
            const result = await action();
            showOperationResult(result);
            await refreshAll();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : "操作失败", 4000);
        } finally {
            actionTargetId = "";
        }
    }

    function askNextDate(defaultDate = getDefaultManualNextDate(), dialogTitle = "选择下次复习日期"): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            let settled = false;
            const settle = (value: string | null) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            const dialog = svelteDialog({
                title: dialogTitle,
                width: "min(520px, calc(100vw - 32px))",
                constructor: (containerEl: HTMLElement) => {
                    return mount(ReviewDatePickerDialog as any, {
                        target: containerEl,
                        props: {
                            defaultDate,
                            title: dialogTitle,
                            onConfirm: (date: string) => {
                                settle(date);
                                dialog.close();
                            },
                            onCancel: () => {
                                settle(null);
                                dialog.close();
                            },
                        },
                    });
                },
                callback: () => settle(null),
            });
        });
    }

    async function handleComplete(item: ReviewItem) {
        if (shouldUseIntervalSchedule(item.attrs)) {
            const next = getNextIntervalReviewDate(item.attrs);
            if (next.hasNext) {
                await runItemAction(item, () => completeReviewOnce({
                    targetId: item.id,
                    targetType: item.type,
                }));
                return;
            }

            const shouldFinish = await confirmDialogBoolean({
                title: "复习间隔已完成",
                content: "已完成全部复习间隔，是否移除复习计划？取消后可以选择下一次复习日期。",
                width: "440px",
            });
            if (shouldFinish) {
                await handleFinish(item);
                return;
            }

            const manualDate = await askNextDate();
            if (!manualDate) return;
            await runItemAction(item, () => completeReviewOnce({
                targetId: item.id,
                targetType: item.type,
                manualNextDate: manualDate,
                switchToManual: true,
            }));
            return;
        }

        const manualDate = await askNextDate();
        if (!manualDate) return;
        await runItemAction(item, () => completeReviewOnce({
            targetId: item.id,
            targetType: item.type,
            manualNextDate: manualDate,
        }));
    }

    async function handleFinish(item: ReviewItem) {
        await runItemAction(item, () => finishReviewTarget({
            targetId: item.id,
            targetType: item.type,
        }));
    }

    async function handleSelectNext(item: ReviewItem) {
        const manualDate = await askNextDate(item.attrs.nextDate || getDefaultManualNextDate());
        if (!manualDate) return;
        let intervals: number[] = [];
        try {
            intervals = item.attrs.plan === "manual" ? [] : parseIntervalsText(item.attrs.intervals.join(","));
        } catch {
            intervals = item.attrs.intervals;
        }

        await runItemAction(item, () => updateReviewTarget({
            targetId: item.id,
            targetType: item.type,
            input: {
                nextDate: manualDate,
                note: item.attrs.note,
                category: item.attrs.category,
                priority: item.attrs.priority || "medium",
                plan: item.attrs.plan || "manual",
                intervals,
            },
        }));
    }

    async function handleClear(item: ReviewItem) {
        const confirmed = await confirmDialogBoolean({
            title: "删除复习计划",
            content: "确定要删除这个复习计划吗？这会清空目标文档或块上的复习属性。",
            width: "420px",
        });
        if (!confirmed) return;

        await runItemAction(item, () => clearReviewTarget({
            targetId: item.id,
            targetType: item.type,
        }));
    }

    async function handlePostponeSelect(item: ReviewItem, event: Event) {
        const select = event.currentTarget as HTMLSelectElement;
        const value = select.value;
        select.value = "";
        if (!value) return;

        let nextDate = "";
        if (value === "tomorrow") nextDate = addDaysFromToday(1);
        if (value === "three") nextDate = addDaysFromToday(3);
        if (value === "week") nextDate = addDaysFromToday(7);
        if (value === "custom") {
            const customDate = await askNextDate(item.attrs.nextDate || getDefaultManualNextDate());
            if (!customDate) return;
            nextDate = customDate;
        }
        if (!nextDate) return;

        await runItemAction(item, () => postponeReviewTarget({
            targetId: item.id,
            targetType: item.type,
            nextDate,
        }));
    }

    function openEditDialog(item: ReviewItem) {
        const dialog = svelteDialog({
            title: "编辑复习计划",
            width: "min(860px, calc(100vw - 32px))",
            constructor: (containerEl: HTMLElement) => {
                return mount(ReviewDocsDialog as any, {
                    target: containerEl,
                    props: {
                        plugin,
                        targetId: item.id,
                        targetType: item.type,
                        mode: "edit",
                        defaultIntervalsText: config.reviewDocsDefaultIntervals,
                        close: () => dialog.close(),
                        onSaved: () => void refreshAll(),
                    },
                });
            },
        });
    }

    function openForgettingCurveDialog(item: ReviewItem) {
        svelteDialog({
            title: "遗忘曲线",
            width: "min(960px, calc(100vw - 32px))",
            constructor: (containerEl: HTMLElement) => {
                return mount(ReviewForgettingCurveDialog as any, {
                    target: containerEl,
                    props: {
                        item,
                    },
                });
            },
        });
    }

    async function handleInlineNoteEdit(item: ReviewItem) {
        const nextNote = await inputDialogSync({
            title: "编辑复习备注",
            placeholder: "备注",
            defaultText: item.attrs.note,
            width: "460px",
        });
        if (nextNote === null) return;

        let intervals: number[] = [];
        try {
            intervals = item.attrs.plan === "manual" ? [] : parseIntervalsText(item.attrs.intervals.join(","));
        } catch {
            intervals = item.attrs.intervals;
        }

        await runItemAction(item, () => updateReviewTarget({
            targetId: item.id,
            targetType: item.type,
            input: {
                nextDate: item.attrs.nextDate,
                note: nextNote,
                category: item.attrs.category,
                priority: item.attrs.priority || "medium",
                plan: item.attrs.plan || "manual",
                intervals,
            },
        }));
    }

    function statusLabel(item: ReviewItem): string {
        if (item.dueStatus === "today") return "今日到期";
        if (item.dueStatus === "overdue") return `逾期 ${item.overdueDays} 天`;
        return "未来复习";
    }

    function priorityLabel(priority: ReviewPriority): string {
        if (priority === "high") return "高";
        if (priority === "medium") return "中";
        if (priority === "low") return "低";
        return "未设";
    }

    function planLabel(plan: string): string {
        if (plan === "ebbinghaus") return "艾宾浩斯";
        if (plan === "custom") return "自定义";
        return "手动";
    }
</script>

<div class="review-docs-widget">
    {#if !advancedEnabled}
        <AdvancedFeatureLock
            title="复习文档"
            subtitle="手动标记文档和块的复习日期，在主页集中提醒。"
            icon="review"
            features={["文档和块复习计划", "到期提醒", "操作日志"]}
            highlights={["高级会员专属"]}
            compact
        />
    {:else}
        <div class="review-docs-header">
            <h3 class="widget-title">{config.reviewDocsTitle}</h3>
        </div>

        {#if config.reviewDocsShowStats}
            <div class="stats-grid">
                <div class="stat-card">
                    <span>今日</span>
                    <strong>{summary.today}</strong>
                </div>
                <div class="stat-card danger">
                    <span>逾期</span>
                    <strong>{summary.overdue}</strong>
                </div>
                <div class="stat-card">
                    <span>未来 {config.reviewDocsFutureDays} 天</span>
                    <strong>{summary.future}</strong>
                </div>
                <div class="stat-card">
                    <span>今日已复习</span>
                    <strong>{todayReviewed === null ? "--" : todayReviewed}</strong>
                </div>
                <div class="stat-card">
                    <span>总计划</span>
                    <strong>{summary.total}</strong>
                </div>
            </div>
            {#if logStatusMessage}
                <div class="status-hint">{logStatusMessage}</div>
            {/if}
        {/if}

        <div class="toolbar">
            <select bind:value={currentView} aria-label="复习视图">
                <option value="due">待复习</option>
                <option value="today">今日</option>
                <option value="overdue">逾期</option>
                <option value="future">未来</option>
                <option value="all">全部</option>
            </select>

            <select bind:value={selectedCategory} aria-label="分类筛选">
                <option value="">全部分类</option>
                {#each categories as category}
                    <option value={category}>{category}</option>
                {/each}
            </select>

            <select bind:value={selectedPriority} aria-label="优先级筛选">
                <option value="all">全部优先级</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
            </select>

            <select bind:value={currentSortBy} aria-label="排序">
                <option value="dueAsc">到期优先</option>
                <option value="priorityDesc">优先级</option>
                <option value="updatedDesc">更新</option>
                <option value="createdDesc">标记</option>
                <option value="reviewCountAsc">次数少</option>
            </select>

            <input type="search" bind:value={searchText} placeholder="搜索标题、路径、备注" />
        </div>

        <div class="review-list" aria-busy={isLoading}>
            {#if isLoading}
                <div class="empty-state">加载复习计划...</div>
            {:else if visibleItems.length === 0}
                {#if reviewIndexStatus === "disabled"}
                    <LocalIndexEmptyState
                        title="本地索引为空"
                        message="复习本地索引为空，请迁移或重建索引。"
                        {plugin}
                        hint="新增复习计划会进入本地索引；旧复习属性请到主页设置 > 检索管理中迁移。"
                    />
                {:else}
                    <div class="empty-state">
                        <strong>暂无可显示的复习计划</strong>
                        <span>{reviewIndexMessage}</span>
                    </div>
                {/if}
            {:else}
                {#each visibleItems as item}
                    <article
                        class={`review-card status-${item.dueStatus}`}
                    >
                        <div class="card-main">
                            <button
                                type="button"
                                class="title-button"
                                onclick={() => openReviewItem(item)}
                                onmouseenter={(event) => {
                                    if (config.reviewDocsShowFloatDoc && !plugin.isMobile) {
                                        clearFloatDocTimeouts();
                                        floatDocTimeout = window.setTimeout(() => {
                                            createFloatingDocPopup({ ...item, content: item.title }, event, plugin);
                                            floatDocTimeout = null;
                                        }, config.reviewDocsFloatDocShowTime * 1000);
                                    }
                                }}
                                onmouseleave={() => {
                                    if (config.reviewDocsShowFloatDoc && !plugin.isMobile) {
                                        clearFloatDocTimeouts();
                                        mouseLeaveTimeout = window.setTimeout(() => {
                                            setMouseOnTrigger(false);
                                            mouseLeaveTimeout = null;
                                        }, 150);
                                    }
                                }}
                            >
                                <span class="type-icon">{item.type === "doc" ? "📄" : "▣"}</span>
                                <span class="title-text">{item.title}</span>
                            </button>
                            {#if config.reviewDocsShowPath && (item.hpath || item.path)}
                                <div class="path-text">{item.hpath || item.path}</div>
                            {/if}
                        </div>

                        <div class="meta-row">
                            <span class="date-pill">{item.attrs.nextDate}</span>
                            <span class={`status-pill ${item.dueStatus}`}>{statusLabel(item)}</span>
                            <span>分类：{item.attrs.category || "未分类"}</span>
                            <span>优先级：{priorityLabel(item.attrs.priority)}</span>
                            <span>次数：{item.attrs.reviewCount}</span>
                            <span>计划：{planLabel(item.attrs.plan)}</span>
                        </div>

                        {#if config.reviewDocsShowNote && item.attrs.note}
                            <div class="note-row">{item.attrs.note}</div>
                        {/if}

                        <div class="action-row">
                            <button type="button" onclick={() => openReviewItem(item)}>打开</button>
                            <button
                                type="button"
                                disabled={actionTargetId === item.id}
                                onclick={() => void handleComplete(item)}
                            >
                                完成本次
                            </button>
                            {#if item.attrs.plan === "ebbinghaus"}
                                <button
                                    type="button"
                                    class="curve-button"
                                    onclick={() => openForgettingCurveDialog(item)}
                                >
                                    遗忘曲线
                                </button>
                            {/if}
                            <button
                                type="button"
                                disabled={actionTargetId === item.id}
                                onclick={() => void handleFinish(item)}
                            >
                                结束复习
                            </button>
                            <select
                                class="postpone-select"
                                disabled={actionTargetId === item.id}
                                onchange={(event) => void handlePostponeSelect(item, event)}
                            >
                                <option value="">推迟</option>
                                <option value="tomorrow">明天</option>
                                <option value="three">三天后</option>
                                <option value="week">一周后</option>
                                <option value="custom">自定义日期</option>
                            </select>
                            <button
                                type="button"
                                disabled={actionTargetId === item.id}
                                onclick={() => void handleSelectNext(item)}
                            >
                                选择下次
                            </button>
                            <button type="button" onclick={() => openEditDialog(item)}>编辑</button>
                            <button type="button" onclick={() => void handleInlineNoteEdit(item)}>备注</button>
                            <button
                                type="button"
                                disabled={actionTargetId === item.id}
                                onclick={() => void handleClear(item)}
                            >
                                删除计划
                            </button>
                        </div>
                    </article>
                {/each}
            {/if}
        </div>
    {/if}
</div>

<style lang="scss">
    .review-docs-widget {
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        box-sizing: border-box;
        color: var(--b3-theme-on-surface, #222);
        overflow-x: hidden;
        overflow-y: auto;
        scrollbar-gutter: stable;

        .review-docs-header {
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding-inline: 3rem;
            text-align: center;
        }

        .widget-title {
            width: 100%;
            margin: 0 0 0.12rem;
            padding-bottom: 0.3rem;
            border-bottom: 1px solid var(--b3-border-color);
            font-size: 18px;
            font-weight: 600;
            line-height: 1.2;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .action-row button,
        .title-button,
        select,
        input {
            font: inherit;
        }

        .action-row button,
        .title-button {
            border: 1px solid var(--b3-border-color, #d1d5db);
            border-radius: 6px;
            background: var(--b3-theme-surface, #fff);
            color: var(--b3-theme-on-surface, #222);
            cursor: pointer;
        }

        button:disabled,
        select:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .stats-grid {
            flex: 0 0 auto;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }

        .stat-card {
            border: 1px solid var(--b3-border-color, #e5e7eb);
            border-radius: 8px;
            background: var(--b3-theme-surface, #fff);
            padding: 8px;
            min-width: 0;
            flex: 1 1 120px;
            box-sizing: border-box;
        }

        .stat-card span {
            display: block;
            font-size: 11px;
            opacity: 0.68;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .stat-card strong {
            display: block;
            margin-top: 3px;
            font-size: 18px;
            line-height: 1.1;
        }

        .stat-card.danger strong {
            color: #d14343;
        }

        .status-hint {
            flex: 0 0 auto;
            font-size: 12px;
            color: var(--b3-theme-on-surface-light, #666);
            line-height: 1.45;
        }

        .toolbar {
            flex: 0 0 auto;
            display: flex;
            flex-wrap: wrap;
            align-items: stretch;
            gap: 8px;
            width: 100%;
            height: auto;
            min-height: 0;
            min-width: 0;
            box-sizing: border-box;
            padding: 8px;
            border-radius: 8px;
            background: var(--b3-theme-surface, rgba(255, 255, 255, 0.45));
            overflow: visible;
        }

        .toolbar select {
            flex: 1 1 92px;
            width: auto;
            min-width: 0;
            max-width: none;
        }

        .toolbar input[type="search"] {
            flex: 2 1 150px;
            width: auto;
            min-width: min(100%, 132px);
            max-width: none;
        }

        .toolbar select,
        .toolbar input,
        .postpone-select {
            height: 32px;
            min-width: 0;
            box-sizing: border-box;
            border: 1px solid var(--b3-border-color, #d1d5db);
            border-radius: 6px;
            background: var(--b3-theme-background, #fff);
            color: var(--b3-theme-on-surface, #222);
            font-size: 12px;
            padding: 0 8px;
            line-height: 30px;
            overflow: visible;
        }

        .review-list {
            flex: 0 0 auto;
            min-height: auto;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
            overflow: visible;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            gap: 6px;
            align-items: center;
            justify-content: center;
            min-height: 120px;
            border: 1px dashed var(--b3-border-color, #d1d5db);
            border-radius: 8px;
            background: var(--b3-theme-surface, #fff);
            text-align: center;
            font-size: 13px;
            line-height: 1.6;
            padding: 16px;
        }

        .review-card {
            border: 1px solid var(--b3-border-color, #e5e7eb);
            border-left: 4px solid var(--b3-theme-primary, #3578e5);
            border-radius: 8px;
            background: var(--b3-theme-surface, #fff);
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
        }

        .review-card.status-overdue {
            border-left-color: #d14343;
        }

        .review-card.status-future {
            border-left-color: #6b7280;
        }

        .card-main {
            min-width: 0;
        }

        .title-button {
            width: 100%;
            min-width: 0;
            padding: 0;
            border: none;
            background: transparent;
            display: flex;
            align-items: center;
            gap: 6px;
            text-align: left;
            font-weight: 700;
        }

        .type-icon {
            flex: 0 0 auto;
        }

        .title-text {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .path-text,
        .note-row {
            margin-top: 4px;
            font-size: 12px;
            color: var(--b3-theme-on-surface-light, #666);
            line-height: 1.45;
            overflow-wrap: anywhere;
        }

        .meta-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            font-size: 12px;
            color: var(--b3-theme-on-surface-light, #666);
        }

        .meta-row span,
        .date-pill,
        .status-pill {
            border-radius: 999px;
            background: var(--b3-theme-background, #f9fafb);
            border: 1px solid var(--b3-border-color, #e5e7eb);
            padding: 2px 7px;
            line-height: 1.35;
        }

        .status-pill.today {
            color: var(--b3-theme-primary, #3578e5);
        }

        .status-pill.overdue {
            color: #d14343;
        }

        .status-pill.future {
            color: #4b5563;
        }

        .action-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }

        .action-row button {
            height: 28px;
            padding: 0 9px;
            font-size: 12px;
            min-width: 0;
            box-sizing: border-box;
        }

        .action-row button:hover:not(:disabled) {
            background: var(--b3-list-hover, #f3f4f6);
        }

        .action-row .curve-button {
            color: var(--b3-theme-primary, #3578e5);
            border-color: rgba(53, 120, 229, 0.35);
            background: rgba(53, 120, 229, 0.08);
        }

        .postpone-select {
            max-width: 100%;
        }
    }
</style>
