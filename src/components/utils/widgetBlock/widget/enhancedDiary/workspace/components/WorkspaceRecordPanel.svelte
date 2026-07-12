<script lang="ts">
    import type { EnhancedDiaryWorkspaceRecord } from "../enhancedDiaryWorkspaceRecordService";
    import WorkspaceEmptyState from "./WorkspaceEmptyState.svelte";
    import type { WorkspaceRecordViewMode, WorkspaceRecordCategoryFilter } from "../enhancedDiaryWorkspaceNavigation";
    import { addDays, formatLocalDate } from "../enhancedDiaryWorkspaceDate";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        records: EnhancedDiaryWorkspaceRecord[];
        historyRecords?: EnhancedDiaryWorkspaceRecord[];
        onCreate: () => void;
        onOpenDoc: (docId?: string) => void;
        onEdit: (record: EnhancedDiaryWorkspaceRecord) => void;
        onDelete: (record: EnhancedDiaryWorkspaceRecord) => void;
        onConvertToTask: (record: EnhancedDiaryWorkspaceRecord) => void;
        onRequestHistory?: () => void | Promise<void>;
        historyLoading?: boolean;
        taskManagementEnabled?: boolean;
        initialViewMode?: WorkspaceRecordViewMode;
        initialDateFilter?: string;
        initialCategoryFilter?: WorkspaceRecordCategoryFilter;
        initialSelectedRecordId?: string;
        filterVersion?: number;
        selectVersion?: number;
    }

    let {
        records,
        historyRecords = [],
        onCreate,
        onOpenDoc,
        onEdit,
        onDelete,
        onConvertToTask,
        onRequestHistory,
        historyLoading = false,
        taskManagementEnabled = true,
        initialViewMode = "today",
        initialDateFilter = "",
        initialCategoryFilter = "all",
        initialSelectedRecordId = "",
        filterVersion = 0,
        selectVersion = 0,
    }: Props = $props();

    type RecordCategoryFilter = "all" | string;

    let viewMode: "today" | "history" = $state("today");
    let searchText: string = $state("");
    let rangeFilter: string = $state("30");
    let activeCategory: RecordCategoryFilter = $state("all");
    let selectedRecordId: string | null = $state(null);
    let dateFilter: string = $state("");
    let lastFilterVersion: number = $state(0);

    $effect(() => {
        if (filterVersion > lastFilterVersion) {
            viewMode = initialViewMode;
            activeCategory = initialCategoryFilter;
            dateFilter = initialDateFilter;
            searchText = "";
            selectedRecordId = null;
            if (initialViewMode === "history") {
                void onRequestHistory?.();
            }
            if (initialViewMode === "history" && initialDateFilter) {
                rangeFilter = "90";
            } else if (initialViewMode === "history") {
                rangeFilter = "30";
            } else {
                dateFilter = "";
                rangeFilter = "30";
            }
            lastFilterVersion = filterVersion;
        }
    });

    const todayStr: string = $derived(formatLocalDate(new Date()));
    const isHistoryMode = $derived((viewMode as string) === "history");

    const sourceRecords: EnhancedDiaryWorkspaceRecord[] = $derived(
        isHistoryMode ? historyRecords : records
    );

    const categories = $derived.by((): Array<[string, string]> => {
        const map = new Map<string, string>();
        for (const record of sourceRecords) {
            const key = record.categoryKey || record.categoryTitle || "unknown";
            if (!map.has(key)) {
                map.set(key, record.categoryTitle || key);
            }
        }
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    });

    const filteredRecords = $derived.by(() => {
        let result = sourceRecords;

        if (activeCategory !== "all") {
            result = result.filter((r) => r.categoryKey === activeCategory);
        }

        if (searchText.trim()) {
            const kw = searchText.trim().toLowerCase();
            result = result.filter(
                (r) =>
                    r.headingTitle.toLowerCase().includes(kw) ||
                    r.content.toLowerCase().includes(kw) ||
                    (r.date || "").toLowerCase().includes(kw) ||
                    r.categoryTitle.toLowerCase().includes(kw) ||
                    (r.docTitle || "").toLowerCase().includes(kw)
            );
        }

        if (isHistoryMode && dateFilter) {
            result = result.filter((r) => (r.date || "") === dateFilter);
        } else if (isHistoryMode) {
            const rangeDays = Number(rangeFilter) || 30;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - (rangeDays - 1));
            const cutoffStr = formatLocalDate(cutoff);
            result = result.filter((r) => (r.date || "") >= cutoffStr);
        }

        return result;
    });

    const recordInsights = $derived.by(() => {
        const categoryMap = new Map<string, { label: string; count: number }>();
        const today = new Date();
        const recentDays = Array.from({ length: 7 }, (_, index) => formatLocalDate(addDays(today, index - 6)));
        const dateCountMap = new Map(recentDays.map((date) => [date, 0]));
        let projectRelatedCount = 0;

        for (const record of filteredRecords) {
            if (!taskManagementEnabled) continue;
            const key = record.categoryKey || "unknown";
            const current = categoryMap.get(key) || {
                label: record.categoryTitle || key,
                count: 0,
            };
            current.count += 1;
            categoryMap.set(key, current);

            const recordDate = record.date || todayStr;
            if (dateCountMap.has(recordDate)) {
                dateCountMap.set(recordDate, (dateCountMap.get(recordDate) || 0) + 1);
            }

            if (
                record.categoryTitle.includes("项目") ||
                record.headingTitle.includes("项目") ||
                /#[^#\s]+#/.test(record.content)
            ) {
                projectRelatedCount += 1;
            }
        }

        const categoryCounts = Array.from(categoryMap.values()).sort((a, b) => b.count - a.count);
        const dailyCounts = recentDays.map((date) => ({
            date,
            count: dateCountMap.get(date) || 0,
        }));
        return {
            total: filteredRecords.length,
            categoryCounts,
            dailyCounts,
            activeDays: dailyCounts.filter((item) => item.count > 0).length,
            projectRelatedCount,
            topCategory: categoryCounts[0],
        };
    });

    const selectedRecord = $derived(
        selectedRecordId
            ? filteredRecords.find((r) => (r.id || `${r.docId}-${r.headingTitle}`) === selectedRecordId) || null
            : null
    );

    const isRecordFromToday = $derived(
        selectedRecord ? (selectedRecord.date || "") === todayStr : false
    );

    function getRecordDisplayKey(record: EnhancedDiaryWorkspaceRecord): string {
        return record.id || `${record.docId}-${record.headingTitle}`;
    }

    function selectRecord(record: EnhancedDiaryWorkspaceRecord) {
        selectedRecordId = getRecordDisplayKey(record);
    }

    function categoryCount(key: string): number {
        return sourceRecords.filter((r) => r.categoryKey === key).length;
    }

    function switchToTodayMode(): void {
        viewMode = "today";
        dateFilter = "";
        selectedRecordId = null;
    }

    function switchToHistoryMode(): void {
        viewMode = "history";
        dateFilter = "";
        selectedRecordId = null;
        void onRequestHistory?.();
    }

    $effect(() => {
        if (filteredRecords.length === 0) {
            selectedRecordId = null;
            return;
        }
        const found = selectedRecordId
            ? filteredRecords.find((r) => getRecordDisplayKey(r) === selectedRecordId)
            : null;
        if (!found) {
            selectedRecordId = getRecordDisplayKey(filteredRecords[0]);
        }
    });

    let lastRecordSelectVersion = $state(0);
    $effect(() => {
        if (selectVersion <= lastRecordSelectVersion) return;
        lastRecordSelectVersion = selectVersion;
        if (initialSelectedRecordId) {
            const found = filteredRecords.find((r) => getRecordDisplayKey(r) === initialSelectedRecordId);
            if (found) {
                selectedRecordId = initialSelectedRecordId;
            }
        }
    });
</script>

<section class="record-panel">
    <div class="panel-toolbar wk-page-header">
        <div class="wk-page-header-main">
            <h2 class="wk-page-title">记录</h2>
            <p class="wk-page-description">记录今天的进展、想法和问题。</p>
        </div>
        <div>
            {#if !isHistoryMode}
                <button type="button" class="btn-primary" onclick={onCreate}>快速记录</button>
            {/if}
        </div>
    </div>

    <div class="mode-bar">
        <div class="mode-tabs">
            <button
                type="button"
                class:active={viewMode === "today"}
                onclick={switchToTodayMode}
            >今日记录</button>
            <button
                type="button"
                class:active={viewMode === "history"}
                onclick={switchToHistoryMode}
            >历史记录</button>
        </div>
        <div class="search-area">
            <input
                type="text"
                class="search-input"
                placeholder="搜索记录内容、标题、日期..."
                bind:value={searchText}
            />
            {#if isHistoryMode && dateFilter}
                <span class="date-filter-badge">
                    当前日期：{dateFilter}
                    <button
                        type="button"
                        class="clear-date-btn"
                        onclick={() => { dateFilter = ""; selectedRecordId = null; }}
                        aria-label="清除日期"
                    >
                        <WorkspaceIcon name="close" size={11} />
                    </button>
                </span>
            {:else if isHistoryMode}
                <select class="range-select" bind:value={rangeFilter}>
                    <option value="7">最近 7 天</option>
                    <option value="30">最近 30 天</option>
                    <option value="90">最近 90 天</option>
                </select>
            {/if}
        </div>
    </div>

    <div class="category-tabs">
        <button
            type="button"
            class:active={activeCategory === "all"}
            onclick={() => (activeCategory = "all")}
        >
            全部
            <span>{sourceRecords.length}</span>
        </button>
        {#each categories as [key, label]}
            <button
                type="button"
                class:active={activeCategory === key}
                onclick={() => (activeCategory = key)}
            >
                {label}
                <span>{categoryCount(key)}</span>
            </button>
        {/each}
    </div>

    <p class="record-summary">
        {isHistoryMode ? "当前范围" : "今天"} {recordInsights.total} 条记录
        {#if recordInsights.topCategory} · 主要分类：{recordInsights.topCategory.label}{/if}
    </p>

    <div class="record-insights" aria-label="记录摘要">
        <div class="insight-card">
            <span class="insight-label">当前记录</span>
            <strong>{recordInsights.total}</strong>
        </div>
        <div class="insight-card">
            <span class="insight-label">主要类型</span>
            <strong>{recordInsights.topCategory?.label || "-"}</strong>
            {#if recordInsights.topCategory}
                <small>{recordInsights.topCategory.count} 条</small>
            {/if}
        </div>
        <div class="insight-card">
            <span class="insight-label">近 7 天活跃</span>
            <strong>{recordInsights.activeDays}</strong>
            <small>天有记录</small>
        </div>
        {#if taskManagementEnabled}
            <div class="insight-card">
                <span class="insight-label">项目相关</span>
                <strong>{recordInsights.projectRelatedCount}</strong>
            </div>
        {/if}
        <div class="insight-card insight-wide">
            <div class="trend-head">
                <span class="insight-label">近 7 天趋势</span>
                <small>{isHistoryMode ? "历史范围" : "今日视图"}</small>
            </div>
            <div class="trend-bars">
                {#each recordInsights.dailyCounts as item}
                    <span
                        class:active={item.count > 0}
                        style={`height:${Math.max(4, Math.min(28, item.count * 6))}px`}
                        title={`${item.date}：${item.count} 条`}
                    ></span>
                {/each}
            </div>
        </div>
    </div>

    {#if isHistoryMode && historyLoading}
        <WorkspaceEmptyState title="历史记录加载中" description="正在扫描最近 90 天快速记录。" />
    {:else if filteredRecords.length === 0}
        <WorkspaceEmptyState title="暂无匹配记录" description="请调整筛选条件或切换模式。" />
    {:else}
        <div class="record-layout">
            <div class="record-list-col">
                <div class="list-label">{isHistoryMode ? "往日记录" : "今天的记录"} · {filteredRecords.length} 条</div>
                <div class="record-list-scroll">
                    {#each filteredRecords as record, index (getRecordDisplayKey(record))}
                        {#if isHistoryMode && record.date && record.date !== filteredRecords[index - 1]?.date}
                            <div class="record-date-group">{record.date}</div>
                        {/if}
                        <button
                            type="button"
                            class="record-list-item"
                            class:selected={getRecordDisplayKey(record) === selectedRecordId}
                            class:history-item={isHistoryMode}
                            onclick={() => selectRecord(record)}
                        >
                            <div class="list-item-head">
                                <p class="list-item-excerpt">{record.content.split('\n').find(line => line.trim()) || record.headingTitle}</p>
                                <span class="category-tag">{record.categoryTitle}</span>
                            </div>
                            <div class="list-item-meta">
                                {record.timeText} · {record.categoryTitle}
                                {#if isHistoryMode && record.date}
                                    <span class="list-item-date">{record.date}</span>
                                {/if}
                            </div>
                        </button>
                    {/each}
                </div>
            </div>

            <div class="record-detail-col">
                {#if selectedRecord}
                    <div class="detail-panel">
                        <div class="detail-head">
                            <h3 class="detail-title">{selectedRecord.content.split('\n').find(line => line.trim()) || selectedRecord.headingTitle || "记录详情"}</h3>
                        </div>

                        <div class="detail-content">
                            <pre class="content-text">{selectedRecord.content}</pre>
                        </div>

                        <div class="detail-meta">
                            {#if selectedRecord.date}
                                <div class="meta-item">
                                    <span class="meta-label">日期</span>
                                    <span class="meta-value">{selectedRecord.date}</span>
                                </div>
                            {/if}
                            {#if selectedRecord.docTitle}
                                <div class="meta-item">
                                    <span class="meta-label">来源日记</span>
                                    <span class="meta-value">{selectedRecord.docTitle}</span>
                                </div>
                            {/if}
                            {#if selectedRecord.timeText}
                                <div class="meta-item">
                                    <span class="meta-label">时间</span>
                                    <span class="meta-value">{selectedRecord.timeText}</span>
                                </div>
                            {/if}
                            <div class="meta-item">
                                <span class="meta-label">分类</span>
                                <span class="meta-value">{selectedRecord.categoryTitle}</span>
                            </div>
                        </div>

                        <div class="detail-actions">
                            <button
                                type="button"
                                class="btn-secondary"
                                onclick={() => onOpenDoc(selectedRecord.docId)}
                            >打开原始日记</button>
                            {#if taskManagementEnabled}
                                <button
                                    type="button"
                                    class="btn-secondary"
                                    onclick={() => onConvertToTask(selectedRecord)}
                                >转为任务</button>
                            {/if}

                            {#if !isHistoryMode || isRecordFromToday}
                                <button
                                    type="button"
                                    class="btn-secondary"
                                    onclick={() => onEdit(selectedRecord)}
                                    disabled={(selectedRecord.contentBlockIds?.length || 0) !== 1}
                                    title={(selectedRecord.contentBlockIds?.length || 0) === 1 ? "编辑记录" : "多块记录请在日记中手动编辑"}
                                >编辑</button>
                                <button
                                    type="button"
                                    class="btn-danger"
                                    onclick={() => onDelete(selectedRecord)}
                                    disabled={!selectedRecord.headingBlockId}
                                    title={selectedRecord.headingBlockId ? "删除记录" : "未能定位记录块，暂不支持删除"}
                                >删除</button>
                            {:else}
                                <button
                                    type="button"
                                    class="btn-secondary"
                                    disabled
                                    title="历史记录请先打开日记编辑"
                                >编辑</button>
                                <button
                                    type="button"
                                    class="btn-secondary"
                                    disabled
                                    title="历史记录请先打开日记编辑"
                                >删除</button>
                                <span class="hint-text">历史记录请先打开日记编辑</span>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <WorkspaceEmptyState title="请选择一条记录" description="从左侧列表选择记录以查看详情。" />
                {/if}
            </div>
        </div>
    {/if}
</section>

<style>
    .record-summary {
        margin: -4px 0 2px;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
        line-height: 1.6;
    }
    .record-date-group {
        position: sticky;
        top: 0;
        z-index: 2;
        padding: 12px 10px 7px;
        background: color-mix(in srgb, var(--wk-bg-card) 92%, transparent);
        backdrop-filter: blur(12px);
        color: var(--wk-ink-muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .04em;
    }
    .record-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .panel-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .panel-toolbar > div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--wk-ink-secondary);
    }

    .mode-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
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
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: background 0.12s;
    }

    .mode-tabs button:hover {
        background: color-mix(in srgb, var(--wk-primary) 6%, var(--wk-background));
    }

    .mode-tabs button.active {
        background: var(--wk-primary);
        color: var(--b3-theme-on-primary);
    }

    .search-area {
        display: flex;
        gap: 8px;
        align-items: center;
        flex: 1;
        max-width: 420px;
    }

    .search-input {
        flex: 1;
        min-width: 140px;
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 6px 10px;
        font-size: var(--wk-text-sm);
    }

    .search-input::placeholder {
        color: var(--wk-ink);
        opacity: 0.4;
    }

    .range-select {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 6px 8px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
    }

    .date-filter-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 7px;
        background: color-mix(in srgb, var(--wk-primary) 10%, var(--wk-background));
        border: 1px solid color-mix(in srgb, var(--wk-primary) 25%, transparent);
        font-size: 12px;
        color: var(--wk-ink-secondary);
        white-space: nowrap;
    }

    .clear-date-btn {
        border: none;
        background: transparent;
        color: var(--wk-ink-secondary);
        font-size: 12px;
        cursor: pointer;
        padding: 0 2px;
        line-height: 1;
        opacity: 0.6;
        transition: opacity 0.12s;
    }

    .clear-date-btn:hover {
        opacity: 1;
    }

    .category-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px 12px;
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
    }

    .category-tabs button {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 5px 10px;
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: all 0.12s;
    }

    .category-tabs button:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .category-tabs button.active {
        border-color: var(--wk-primary);
        background: var(--wk-primary);
        color: var(--b3-theme-on-primary);
    }

    .category-tabs button span {
        margin-left: 5px;
        opacity: 0.7;
        font-size: var(--wk-text-sm);
    }

    .record-insights {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(220px, 1.4fr);
        gap: 10px;
    }

    .insight-card {
        min-width: 0;
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        padding: 11px 12px;
    }

    .insight-label {
        display: block;
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.55;
        margin-bottom: 5px;
    }

    .insight-card strong {
        display: block;
        font-size: 19px;
        line-height: 1.15;
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }

    .insight-card small {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.55;
    }

    .insight-wide {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 8px;
    }

    .trend-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .trend-head .insight-label {
        margin-bottom: 0;
    }

    .trend-bars {
        display: flex;
        align-items: flex-end;
        gap: 5px;
        height: 32px;
    }

    .trend-bars span {
        flex: 1;
        min-width: 8px;
        border-radius: 999px 999px 2px 2px;
        background: color-mix(in srgb, var(--wk-ink-secondary) 14%, transparent);
        transition: all 0.12s;
    }

    .trend-bars span.active {
        background: var(--wk-primary);
    }

    .btn-primary {
        border: 1px solid var(--wk-primary);
        border-radius: 7px;
        background: var(--wk-primary);
        color: var(--b3-theme-on-primary);
        padding: 7px 14px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-primary:hover {
        opacity: 0.88;
    }

    /* layout */
    .record-layout {
        display: grid;
        grid-template-columns: minmax(320px, 35%) 1fr;
        gap: 16px;
        align-items: start;
        min-height: 400px;
    }

    .record-list-col {
        border: 1px solid var(--wk-border);
        border-radius: 10px;
        background: var(--wk-surface);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: 520px;
    }

    .list-label {
        font-size: var(--wk-text-sm);
        font-weight: 600;
        color: var(--wk-ink-muted);
        padding: 10px 14px 8px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--wk-border);
    }

    .record-list-scroll {
        overflow-y: auto;
        flex: 1;
        padding: 4px 8px 8px;
    }

    .record-list-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
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

    .record-list-item:hover {
        background: color-mix(in srgb, var(--wk-primary) 6%, transparent);
    }

    .record-list-item.selected {
        background: color-mix(in srgb, var(--wk-primary) 10%, transparent);
        border-left-color: var(--wk-primary);
    }

    .list-item-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .list-item-excerpt {
        margin: 0;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }

    .list-item-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .list-item-date {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .category-tag {
        font-size: var(--wk-text-xs);
        padding: 1px 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--wk-primary) 12%, transparent);
        color: var(--wk-primary);
        border: 1px solid color-mix(in srgb, var(--wk-primary) 30%, transparent);
        flex-shrink: 0;
        white-space: nowrap;
    }

    /* detail */
    .record-detail-col {
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
        word-break: break-all;
    }

    .detail-meta {
        display: flex;
        flex-wrap: wrap;
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
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .meta-value {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-secondary);
    }

    .detail-content {
        border-top: 1px solid var(--wk-border);
        padding-top: 12px;
    }

    .content-text {
        margin: 0;
        font-size: var(--wk-text-base);
        line-height: 1.7;
        color: var(--wk-ink-secondary);
        white-space: pre-wrap;
        word-break: break-all;
        font-family: inherit;
        background: var(--wk-background);
        padding: 12px;
        border-radius: 8px;
        border: 1px solid var(--wk-border);
    }

    .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        padding-top: 8px;
        border-top: 1px solid var(--wk-border);
    }

    .btn-secondary {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 6px 11px;
        font-size: 12px;
        cursor: pointer;
    }

    .btn-secondary:hover:not(:disabled) {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .btn-danger {
        border: 1px solid var(--wk-error);
        border-radius: 7px;
        background: transparent;
        color: var(--wk-error);
        padding: 6px 11px;
        font-size: 12px;
        cursor: pointer;
    }

    .btn-danger:hover:not(:disabled) {
        background: color-mix(in srgb, var(--wk-error) 8%, transparent);
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.35;
    }

    .hint-text {
        font-size: 12px;
        color: var(--wk-ink-secondary);
        opacity: 0.45;
    }

    @container (max-width: 900px) {
        .mode-bar {
            flex-direction: column;
            align-items: stretch;
        }

        .search-area {
            max-width: none;
        }

        .record-insights {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .insight-wide {
            grid-column: 1 / -1;
        }

        .record-layout {
            grid-template-columns: 1fr;
        }

        .record-list-col {
            max-height: 300px;
        }
    }
</style>
