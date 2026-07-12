<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        onOpenAndAppendTemplate: () => void | Promise<void>;
        taskManagementEnabled?: boolean;
    }

    let { state, onOpenAndAppendTemplate, taskManagementEnabled = true }: Props = $props();

    const reviewCompleted = $derived(state.reviewCards.filter((card) => card.status === "completed").length);
</script>

<div class="today-card">
    <div class="today-hero">
        <div class="today-status">
            {#if state.todayDiaryExists}
                <span class="today-status-icon {state.templateValid ? 'ok' : 'warn'}">
                    <WorkspaceIcon name={state.templateValid ? "diary" : "warning"} size={28} />
                </span>
                <div class="today-status-text">
                    <strong>今天已经开始</strong>
                    <span>
                        {state.templateValid ? "日记结构完整" : "结构需要补充"}
                        {#if !state.templateValid} — 打开日记后自动补全{/if}
                    </span>
                </div>
            {:else}
                <span class="today-status-icon empty">
                    <WorkspaceIcon name="diary" size={28} />
                </span>
                <div class="today-status-text">
                    <strong>今天还没有留下记录</strong>
                    <span>创建今日日记，开始记录今天的任务、过程和复盘。</span>
                </div>
            {/if}
        </div>
        <button type="button" class="wk-btn wk-btn-primary" onclick={onOpenAndAppendTemplate}>
            {state.todayDiaryExists ? "打开今日日记" : "开始今天"}
        </button>
    </div>

    {#if state.todayDiaryExists}
        <div class="today-summary-strip">
            {state.summary.quickRecordCount} 条记录
            {#if taskManagementEnabled} · {state.summary.newTaskCount + state.summary.migratedTaskCount} 个任务{/if}
            · 复盘 {reviewCompleted}/{state.reviewCards.length}
        </div>
    {/if}
</div>

<style>
    .today-card {
        position: relative;
        border-radius: var(--wk-radius-lg);
        background: var(--b3-theme-surface);
        border: 1px solid var(--wk-border-subtle);
        box-shadow: none;
        padding: clamp(18px, 2.2vw, 26px);
    }

    .today-hero {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        position: relative;
        z-index: 1;
    }

    .today-status {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1;
    }

    .today-status-icon {
        width: 52px;
        height: 52px;
        border-radius: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .today-status-icon.ok {
        background: var(--wk-success-bg);
        color: var(--wk-success);
    }

    .today-status-icon.warn {
        background: var(--wk-warning-bg);
        color: var(--wk-warning);
    }

    .today-status-icon.empty {
        background: var(--wk-primary-soft);
        color: var(--wk-primary);
    }

    .today-status-text strong {
        display: block;
        font-size: clamp(16px, 1.4vw, 20px);
        color: var(--wk-ink-secondary);
        margin-bottom: 4px;
        letter-spacing: -.02em;
    }

    .today-status-text span {
        font-size: var(--wk-text-sm);
        color: var(--wk-ink-muted);
    }

    .today-summary-strip {
        display: block;
        margin-top: 16px;
        padding: 12px 0 0;
        border-top: 1px solid var(--wk-divider);
        position: relative;
        z-index: 1;
        color: var(--wk-ink-muted);
        font-size: var(--wk-text-sm);
        line-height: 1.5;
    }

    @container (max-width: 620px) {
        .today-hero {
            flex-direction: column;
            align-items: flex-start;
        }
    }
</style>
