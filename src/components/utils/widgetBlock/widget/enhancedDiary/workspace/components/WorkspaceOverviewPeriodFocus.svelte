<script lang="ts">
    import type { EnhancedDiaryCarryoverItem, EnhancedDiaryCarryoverPeriod } from "../enhancedDiaryWorkspaceCarryover";
    import WorkspaceOverviewIcon from "./WorkspaceOverviewIcon.svelte";

    interface Props {
        plans: EnhancedDiaryCarryoverItem[];
        onGoPlans: () => void;
    }

    const PERIOD_ORDER: EnhancedDiaryCarryoverPeriod[] = ["day", "week", "month", "year"];
    const PERIOD_TITLE: Record<EnhancedDiaryCarryoverPeriod, string> = {
        day: "今日重点",
        week: "本周重点",
        month: "本月重点",
        year: "年度方向",
    };
    const PERIOD_SHORT: Record<EnhancedDiaryCarryoverPeriod, string> = {
        day: "今日",
        week: "本周",
        month: "本月",
        year: "年度",
    };
    const PERIOD_ICON = {
        day: "target",
        week: "calendar",
        month: "calendar",
        year: "star",
    } as const;

    let { plans, onGoPlans }: Props = $props();

    function planMap(items: EnhancedDiaryCarryoverItem[]): Map<EnhancedDiaryCarryoverPeriod, EnhancedDiaryCarryoverItem> {
        const map = new Map<EnhancedDiaryCarryoverPeriod, EnhancedDiaryCarryoverItem>();
        for (const item of items) map.set(item.period, item);
        return map;
    }

    const mapped = $derived(planMap(plans));
    const primaryPeriod = $derived(PERIOD_ORDER.find((p) => mapped.has(p)));
    const counts = $derived({
        day: mapped.get("day")?.lines.length || 0,
        week: mapped.get("week")?.lines.length || 0,
        month: mapped.get("month")?.lines.length || 0,
        year: mapped.get("year")?.lines.length || 0,
    });
</script>

<section class="wk-card period-summary-card" aria-label="计划摘要">
    {#if primaryPeriod}
        {@const primary = mapped.get(primaryPeriod)!}
        <header>
            <div>
                <span class="eyebrow"><WorkspaceOverviewIcon name={PERIOD_ICON[primaryPeriod]} size={15} />计划摘要</span>
                <h2>{PERIOD_TITLE[primaryPeriod]}</h2>
            </div>
            <button type="button" class="view-btn" onclick={onGoPlans}>
                查看计划 <WorkspaceOverviewIcon name="arrow" size={14} />
            </button>
        </header>
        <ul class="line-list">
            {#each primary.lines.slice(0, 2) as line, index (index)}
                <li title={line}>{line}</li>
            {/each}
        </ul>
        {#if primary.lines.length > 2}
            <span class="more">还有 {primary.lines.length - 2} 项</span>
        {/if}
        <div class="period-counts">
            {#each PERIOD_ORDER as period (period)}
                {@const count = counts[period]}
                {#if count > 0 || period === primaryPeriod}
                    <span class="count-pill" class:primary={period === primaryPeriod}>
                        {PERIOD_SHORT[period]} {count}
                    </span>
                {/if}
            {/each}
        </div>
    {:else}
        <div class="empty">
            <WorkspaceOverviewIcon name="target" size={25} />
            <strong>还没有周期计划</strong>
            <button type="button" onclick={onGoPlans}>进入计划中心</button>
        </div>
    {/if}
</section>

<style>
    .period-summary-card { min-width: 0; padding: 16px 18px; }
    header { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 6px; color: var(--wk-primary); font-size: var(--wk-text-xs); font-weight: 650; }
    h2 { margin: 4px 0 0; color: var(--wk-ink); font-size: var(--wk-text-lg); }
    .view-btn { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; padding: 5px 10px; border: 1px solid var(--wk-border-light); border-radius: var(--wk-radius-pill); background: transparent; color: var(--wk-primary); font-size: var(--wk-text-xs); cursor: pointer; transition: background var(--wk-transition-fast), border-color var(--wk-transition-fast); }
    .view-btn:hover { border-color: var(--wk-primary-border); background: var(--wk-primary-subtle); }
    .line-list { margin: 0; padding: 0; list-style: none; min-width: 0; }
    .line-list li { overflow: hidden; padding: 4px 0; color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); text-overflow: ellipsis; white-space: nowrap; }
    .more { display: block; margin-top: 2px; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .period-counts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .count-pill { padding: 2px 8px; border-radius: var(--wk-radius-pill); background: var(--wk-surface-2); color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .count-pill.primary { background: var(--wk-primary-subtle); color: var(--wk-primary); font-weight: 600; }
    .empty { display: flex; align-items: center; gap: 10px; padding: 10px 0; color: var(--wk-ink-muted); }
    .empty strong { color: var(--wk-ink-secondary); font-weight: 500; }
    .empty button { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; padding: 4px 10px; border: 1px solid var(--wk-border-light); border-radius: var(--wk-radius-pill); background: transparent; color: var(--wk-primary); font-size: var(--wk-text-xs); cursor: pointer; transition: background var(--wk-transition-fast), border-color var(--wk-transition-fast); }
    .empty button:hover { border-color: var(--wk-primary-border); background: var(--wk-primary-subtle); }
    @media (prefers-reduced-motion: reduce) {
        .view-btn,
        .empty button { transition: none; }
    }
</style>
