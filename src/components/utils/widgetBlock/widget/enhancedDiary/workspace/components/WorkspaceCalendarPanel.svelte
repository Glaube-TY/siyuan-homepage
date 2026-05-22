<script lang="ts">
    import type { EnhancedDiaryCalendarDay } from "../enhancedDiaryWorkspaceCalendar";

    interface Props {
        days: EnhancedDiaryCalendarDay[];
        year: number;
        month: number;
        loading?: boolean;
        selectedDate?: string;
        onSelectDate: (day: EnhancedDiaryCalendarDay) => void;
        onOpenDoc?: (docId?: string) => void;
        onPrev: () => void | Promise<void>;
        onNext: () => void | Promise<void>;
        onToday?: () => void | Promise<void>;
    }

    let { days, year, month, loading = false, selectedDate, onSelectDate, onOpenDoc, onPrev, onNext, onToday }: Props = $props();
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    let viewMode: "month" | "list" | "heatmap" = $state("month");

    // 判断今天
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const currentMonthDays = $derived(days.filter((day) => day.inCurrentMonth));
    const activeMonthDays = $derived(
        currentMonthDays.filter((day) =>
            day.hasDiary ||
            day.newTaskCount > 0 ||
            day.migratedTaskCount > 0 ||
            day.quickRecordCount > 0 ||
            day.completedReviewCount > 0 ||
            day.pendingReviewCount > 0
        )
    );

    function getActivityScore(day: EnhancedDiaryCalendarDay): number {
        return Number(day.hasDiary) +
            day.newTaskCount +
            day.migratedTaskCount +
            day.quickRecordCount +
            day.completedReviewCount +
            day.pendingReviewCount;
    }

    function getActivityLevel(day: EnhancedDiaryCalendarDay): number {
        const score = getActivityScore(day);
        if (score <= 0) return 0;
        if (score <= 1) return 1;
        if (score <= 3) return 2;
        if (score <= 6) return 3;
        return 4;
    }
</script>

<section class="calendar-panel">
    <div class="panel-toolbar">
        <h2>日历视图</h2>
        <div class="month-nav">
            <button type="button" onclick={onPrev} aria-label="上个月">‹</button>
            <strong class="month-label">{year} 年 {month + 1} 月</strong>
            <button type="button" onclick={onNext} aria-label="下个月">›</button>
            {#if onToday}
                <button type="button" class="today-btn" onclick={onToday} aria-label="回到今天">今天</button>
            {/if}
        </div>
    </div>

    <div class="calendar-view-tabs" aria-label="日历视图">
        <button
            type="button"
            class:active={viewMode === "month"}
            onclick={() => (viewMode = "month")}
        >月视图</button>
        <button
            type="button"
            class:active={viewMode === "list"}
            onclick={() => (viewMode = "list")}
        >列表</button>
        <button
            type="button"
            class:active={viewMode === "heatmap"}
            onclick={() => (viewMode = "heatmap")}
        >热力</button>
    </div>

    {#if loading}
        <div class="loading">
            <span class="loading-spinner"></span>
            日历加载中...
        </div>
    {:else if viewMode === "month"}
        <div class="calendar-wrapper">
            <div class="calendar-grid weekdays">
                {#each weekdays as day}
                    <div>{day}</div>
                {/each}
            </div>
            <div class="calendar-grid">
                {#each days as day}
                    <div
                        class="day-cell"
                        class:outside={!day.inCurrentMonth}
                        class:has-diary={day.hasDiary}
                        class:is-today={day.date === todayStr}
                        class:is-selected={day.date === selectedDate}
                        role="button"
                        tabindex="0"
                        onclick={() => onSelectDate(day)}
                        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectDate(day); } }}
                    >
                        <span class="date">{Number(day.date.slice(8, 10))}</span>
                        <div class="badges">
                            {#if day.hasDiary}
                                <span class="dot diary-dot" title="有日记"></span>
                            {/if}
                            {#if day.newTaskCount + day.migratedTaskCount > 0}
                                <span class="dot task-dot" title="任务 {day.newTaskCount + day.migratedTaskCount}"></span>
                            {/if}
                            {#if day.quickRecordCount > 0}
                                <span class="dot record-dot" title="记录 {day.quickRecordCount}"></span>
                            {/if}
                            {#if day.completedReviewCount > 0}
                                <span class="dot review-dot" title="复盘 {day.completedReviewCount}"></span>
                            {/if}
                        </div>
                        {#if day.hasDiary && onOpenDoc}
                            <button
                                type="button"
                                class="open-diary-btn"
                                onclick={(e) => { e.stopPropagation(); onOpenDoc(day.docId); }}
                                title="打开日记"
                            >
                                ↗
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {:else if viewMode === "list"}
        <div class="calendar-list-wrapper">
            {#if activeMonthDays.length === 0}
                <div class="calendar-empty">本月暂无日记、任务、记录或复盘动态。</div>
            {:else}
                {#each activeMonthDays as day}
                    <button
                        type="button"
                        class="calendar-list-item"
                        class:selected={day.date === selectedDate}
                        onclick={() => onSelectDate(day)}
                    >
                        <span class="list-date">{day.date}</span>
                        <span class="list-summary">
                            {#if day.hasDiary}<small>日记</small>{/if}
                            {#if day.newTaskCount + day.migratedTaskCount > 0}<small>任务 {day.newTaskCount + day.migratedTaskCount}</small>{/if}
                            {#if day.quickRecordCount > 0}<small>记录 {day.quickRecordCount}</small>{/if}
                            {#if day.completedReviewCount > 0}<small>复盘 {day.completedReviewCount}</small>{/if}
                            {#if day.pendingReviewCount > 0}<small>待复盘 {day.pendingReviewCount}</small>{/if}
                        </span>
                        {#if day.hasDiary && onOpenDoc}
                            <span
                                role="button"
                                tabindex="0"
                                class="list-open"
                                title="打开日记"
                                onclick={(e) => { e.stopPropagation(); onOpenDoc(day.docId); }}
                                onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenDoc(day.docId); } }}
                            >打开</span>
                        {/if}
                    </button>
                {/each}
            {/if}
        </div>
    {:else}
        <div class="calendar-heatmap-wrapper">
            <div class="heatmap-grid">
                {#each currentMonthDays as day}
                    <button
                        type="button"
                        class="heatmap-cell level-{getActivityLevel(day)}"
                        class:selected={day.date === selectedDate}
                        title={`${day.date} · 活跃度 ${getActivityScore(day)}`}
                        onclick={() => onSelectDate(day)}
                    >
                        <span>{Number(day.date.slice(8, 10))}</span>
                    </button>
                {/each}
            </div>
            <div class="heatmap-legend">
                <span>少</span>
                <i class="level-0"></i>
                <i class="level-1"></i>
                <i class="level-2"></i>
                <i class="level-3"></i>
                <i class="level-4"></i>
                <span>多</span>
            </div>
        </div>
    {/if}
</section>

<style>
    .calendar-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .panel-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--b3-theme-on-background);
        letter-spacing: -0.01em;
    }

    .month-nav {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .month-nav button {
        width: 32px;
        height: 32px;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s;
    }

    .month-nav button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .month-nav .today-btn {
        width: auto;
        padding: 0 10px;
        font-size: 13px;
        font-weight: 600;
    }

    .month-label {
        font-size: 14px;
        color: var(--b3-theme-on-background);
        min-width: 110px;
        text-align: center;
        font-variant-numeric: tabular-nums;
    }

    .calendar-view-tabs {
        display: inline-flex;
        width: fit-content;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        overflow: hidden;
        background: var(--b3-theme-surface);
    }

    .calendar-view-tabs button {
        min-width: 60px;
        border: none;
        border-right: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
    }

    .calendar-view-tabs button:last-child {
        border-right: none;
    }

    .calendar-view-tabs button:hover {
        background: color-mix(in srgb, var(--b3-theme-primary) 7%, var(--b3-theme-background));
    }

    .calendar-view-tabs button.active {
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .calendar-wrapper {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 14px;
    }

    .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
    }

    .weekdays {
        margin-bottom: 8px;
        gap: 6px;
    }

    .weekdays div {
        text-align: center;
        color: var(--b3-theme-on-background);
        opacity: 0.55;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 6px 4px;
    }

    .calendar-grid .day-cell {
        min-height: 88px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        padding: 8px 6px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        cursor: pointer;
        transition: all 0.12s;
        position: relative;
    }

    .calendar-grid .day-cell:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
    }

    .calendar-grid .day-cell.outside {
        opacity: 0.3;
    }

    .calendar-grid .day-cell.outside:hover {
        opacity: 0.6;
    }

    .calendar-grid .day-cell.has-diary {
        border-color: var(--b3-theme-primary);
        border-width: 2px;
    }

    .calendar-grid .day-cell.is-today {
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
    }

    .calendar-grid .day-cell.is-today .date {
        color: var(--b3-theme-primary);
        font-weight: 700;
    }

    .calendar-grid .day-cell.is-selected {
        border-color: var(--b3-theme-primary);
        border-width: 2px;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 25%, transparent);
    }

    .calendar-grid .day-cell.is-selected.is-today {
        background: color-mix(in srgb, var(--b3-theme-primary) 15%, var(--b3-theme-background));
    }

    .date {
        font-weight: 600;
        font-size: 15px;
        color: var(--b3-theme-on-background);
        line-height: 1;
    }

    .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        justify-content: center;
    }

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .diary-dot  { background: var(--b3-theme-primary); }
    .task-dot   { background: #e6900a; }
    .record-dot { background: #0969da; }
    .review-dot { background: #22863a; }

    .calendar-list-wrapper,
    .calendar-heatmap-wrapper {
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 12px;
    }

    .calendar-empty {
        padding: 28px 16px;
        text-align: center;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
        font-size: 13px;
    }

    .calendar-list-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 440px;
        overflow-y: auto;
    }

    .calendar-list-item {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        width: 100%;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 9px 10px;
        text-align: left;
        cursor: pointer;
    }

    .calendar-list-item:hover {
        border-color: var(--b3-theme-primary);
    }

    .calendar-list-item.selected {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
    }

    .list-date {
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }

    .list-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        min-width: 0;
    }

    .list-summary small {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
        color: var(--b3-theme-primary);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 24%, transparent);
    }

    .list-open {
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        padding: 3px 8px;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
    }

    .list-open:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .heatmap-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 7px;
    }

    .heatmap-cell {
        aspect-ratio: 1;
        min-height: 40px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
    }

    .heatmap-cell:hover {
        border-color: var(--b3-theme-primary);
        transform: translateY(-1px);
    }

    .heatmap-cell.selected {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 28%, transparent);
        border-color: var(--b3-theme-primary);
    }

    .heatmap-cell.level-0,
    .heatmap-legend .level-0 {
        background: var(--b3-theme-background);
    }

    .heatmap-cell.level-1,
    .heatmap-legend .level-1 {
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-background));
    }

    .heatmap-cell.level-2,
    .heatmap-legend .level-2 {
        background: color-mix(in srgb, var(--b3-theme-primary) 24%, var(--b3-theme-background));
    }

    .heatmap-cell.level-3,
    .heatmap-legend .level-3 {
        background: color-mix(in srgb, var(--b3-theme-primary) 38%, var(--b3-theme-background));
    }

    .heatmap-cell.level-4,
    .heatmap-legend .level-4 {
        background: color-mix(in srgb, var(--b3-theme-primary) 55%, var(--b3-theme-background));
    }

    .heatmap-legend {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 5px;
        margin-top: 12px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
        font-size: 11px;
    }

    .heatmap-legend i {
        width: 12px;
        height: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 3px;
    }

    .open-diary-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: all 0.12s;
    }

    .day-cell:hover .open-diary-btn {
        opacity: 1;
    }

    .open-diary-btn:hover {
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        padding: 32px 20px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
    }

    .loading-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--b3-border-color);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @media (max-width: 760px) {
        .calendar-grid {
            gap: 3px;
        }

        .panel-toolbar {
            flex-direction: column;
            align-items: stretch;
        }

        .month-nav {
            justify-content: space-between;
        }

        .calendar-view-tabs {
            width: 100%;
        }

        .calendar-view-tabs button {
            flex: 1;
        }

        .calendar-grid .day-cell {
            min-height: 64px;
            padding: 6px 4px;
        }

        .date {
            font-size: 13px;
        }

        .dot {
            width: 5px;
            height: 5px;
        }

        .calendar-list-item {
            grid-template-columns: 1fr;
            gap: 6px;
        }

        .list-open {
            width: fit-content;
        }

        .heatmap-grid {
            gap: 4px;
        }

        .heatmap-cell {
            min-height: 32px;
            font-size: 11px;
        }
    }
</style>
