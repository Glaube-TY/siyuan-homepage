<script lang="ts">
    import type { EnhancedDiaryCarryoverItem, EnhancedDiaryCarryoverPeriod } from "../enhancedDiaryWorkspaceCarryover";
    import WorkspaceOverviewIcon from "./WorkspaceOverviewIcon.svelte";

    interface Props {
        plans: EnhancedDiaryCarryoverItem[];
        taskManagementEnabled?: boolean;
        onOpenDoc: (docId?: string) => void;
        onConvertToTask: (content: string) => void;
    }

    const PERIOD_ORDER: EnhancedDiaryCarryoverPeriod[] = ["day", "week", "month", "year"];
    const PERIOD_LABEL: Record<EnhancedDiaryCarryoverPeriod, string> = {
        day: "日计划",
        week: "周计划",
        month: "月计划",
        year: "年计划",
    };
    const PERIOD_TITLE: Record<EnhancedDiaryCarryoverPeriod, string> = {
        day: "今日重点",
        week: "本周重点",
        month: "本月重点",
        year: "年度方向",
    };

    let { plans, taskManagementEnabled = true, onOpenDoc, onConvertToTask }: Props = $props();

    const planMap = $derived(new Map(plans.map((plan) => [plan.period, plan])));
    const initialPeriod = $derived(PERIOD_ORDER.find((period) => planMap.has(period)) || "day");
    let activePeriod = $state<EnhancedDiaryCarryoverPeriod>(PERIOD_ORDER[0]);

    $effect(() => {
        activePeriod = initialPeriod;
    });

    const currentPlan = $derived(planMap.get(activePeriod));
    const displayLines = $derived(currentPlan ? currentPlan.lines.slice(0, 8) : []);
</script>

<section class="wk-card plan-panel">
    <header>
        <h2>计划</h2>
        <p class="subtitle">把还没有具体化的未来方向，安排到合适的周期。</p>
    </header>

    <div class="period-tabs" role="tablist" aria-label="计划周期">
        {#each PERIOD_ORDER as period (period)}
            <button
                type="button"
                role="tab"
                class:active={activePeriod === period}
                aria-selected={activePeriod === period}
                onclick={() => (activePeriod = period)}
            >
                {PERIOD_LABEL[period]}
            </button>
        {/each}
    </div>

    <div class="plan-detail">
        {#if currentPlan}
            <div class="plan-header">
                <h3>{PERIOD_TITLE[activePeriod]}</h3>
                <div class="plan-meta">
                    <span class="source">{currentPlan.sourceLabel} · {currentPlan.fieldLabel}</span>
                    <span class="date">{currentPlan.sourceDateOrRange}</span>
                </div>
            </div>

            <ul class="plan-items">
                {#each displayLines as line, index (index)}
                    <li class="plan-item">
                        <span class="item-content" title={line}>{line}</span>
                        <div class="item-actions">
                            {#if taskManagementEnabled}
                                <button
                                    type="button"
                                    class="action-btn"
                                    title="转为任务"
                                    aria-label="将计划项转为任务"
                                    onclick={() => onConvertToTask(line)}
                                >
                                    <WorkspaceOverviewIcon name="taskAdd" size={14} />
                                </button>
                            {/if}
                            <button
                                type="button"
                                class="action-btn"
                                title="打开来源"
                                aria-label="打开来源文档"
                                onclick={() => onOpenDoc(currentPlan.docId)}
                            >
                                <WorkspaceOverviewIcon name="arrow" size={14} />
                            </button>
                        </div>
                    </li>
                {/each}
            </ul>

            {#if currentPlan.lines.length > 8}
                <div class="more-hint">共 {currentPlan.lines.length} 项计划，显示前 8 项</div>
            {/if}
        {:else}
            <div class="empty-state">
                <WorkspaceOverviewIcon name="target" size={24} />
                <strong>当前没有可承接的{PERIOD_LABEL[activePeriod]}</strong>
            </div>
        {/if}
    </div>
</section>

<style>
    .plan-panel { min-width: 0; padding: 20px; }
    header { margin-bottom: 14px; }
    h2 { margin: 0; color: var(--wk-ink); font-size: var(--wk-text-lg); }
    .subtitle { margin: 4px 0 0; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .period-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .period-tabs button {
        padding: 6px 12px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-pill);
        background: transparent;
        color: var(--wk-ink-secondary);
        font-size: var(--wk-text-sm);
        cursor: pointer;
        transition: border-color var(--wk-transition-fast), background var(--wk-transition-fast), color var(--wk-transition-fast);
    }
    .period-tabs button:hover { border-color: var(--wk-primary-border); background: var(--wk-surface-hover); }
    .period-tabs button.active { border-color: var(--wk-primary-border); background: var(--wk-primary-subtle); color: var(--wk-primary); font-weight: 600; }
    .plan-detail { min-width: 0; }
    .plan-header { margin-bottom: 12px; }
    .plan-header h3 { margin: 0 0 6px; color: var(--wk-ink); font-size: var(--wk-text-md); }
    .plan-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .plan-items { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; min-width: 0; }
    .plan-item {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 10px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-md);
        background: var(--wk-surface-1);
    }
    .item-content { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); text-overflow: ellipsis; white-space: nowrap; }
    .item-actions { display: flex; flex-shrink: 0; gap: 4px; }
    .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border: 0;
        border-radius: var(--wk-radius-sm);
        background: transparent;
        color: var(--wk-primary);
        cursor: pointer;
        transition: background var(--wk-transition-fast);
    }
    .action-btn:hover { background: var(--wk-surface-hover); }
    .more-hint { margin-top: 10px; color: var(--wk-ink-muted); font-size: var(--wk-text-xs); }
    .empty-state {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        border: 1px dashed var(--wk-border-light);
        border-radius: var(--wk-radius-md);
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
    }
    .empty-state strong { color: var(--wk-ink-secondary); font-weight: 500; }
    @media (prefers-reduced-motion: reduce) {
        .period-tabs button,
        .action-btn { transition: none; }
    }
</style>
