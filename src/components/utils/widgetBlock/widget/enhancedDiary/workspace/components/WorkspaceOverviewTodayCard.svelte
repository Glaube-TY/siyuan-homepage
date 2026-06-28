<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        onOpenAndAppendTemplate: () => void | Promise<void>;
        taskManagementEnabled?: boolean;
    }

    let { state, onOpenAndAppendTemplate, taskManagementEnabled = true }: Props = $props();

    const statsColumns = $derived(
        taskManagementEnabled ? 4 : 2
    );
</script>

<div class="wk-card today-card">
    <div class="wk-card-head">
        <div class="card-title-group">
            <h2 class="wk-card-title">今日概览</h2>
            {#if state.todayDiaryExists}
                <span class="wk-badge {state.templateValid ? 'wk-badge-ok' : 'wk-badge-warn'}">
                    {state.templateValid ? "模板完整" : "模板缺失"}
                </span>
            {/if}
        </div>
        <button type="button" class="wk-btn wk-btn-secondary wk-btn-sm" onclick={onOpenAndAppendTemplate}>打开并补模板</button>
    </div>
    {#if state.todayDiaryExists}
        <div class="today-stats" style="grid-template-columns: repeat({statsColumns}, minmax(0, 1fr));">
            {#if taskManagementEnabled}
                <div class="wk-stat">
                    <span class="wk-stat-label">新建任务</span>
                    <strong>{state.summary.newTaskCount}</strong>
                </div>
                <div class="wk-stat">
                    <span class="wk-stat-label">迁移任务</span>
                    <strong>{state.summary.migratedTaskCount}</strong>
                </div>
            {/if}
            <div class="wk-stat">
                <span class="wk-stat-label">快速记录</span>
                <strong>{state.summary.quickRecordCount}</strong>
            </div>
            {#if taskManagementEnabled}
                <div class="wk-stat">
                    <span class="wk-stat-label">项目推进</span>
                    <strong>{state.summary.projectCount}</strong>
                </div>
            {/if}
        </div>
        {#if !state.templateValid}
            <div class="wk-warning-box">
                <WorkspaceIcon name="warning" size={14} />
                <span>模板结构缺失：{state.missingSections.slice(0, 4).join("、")}{state.missingSections.length > 4 ? " 等" : ""}，写入操作会被保护性拦截。</span>
            </div>
        {/if}
    {:else}
        <div class="no-diary-guide">
            <p>今日还没有日记，打开后会自动补充模板。</p>
            <button type="button" class="wk-btn wk-btn-primary wk-btn-sm" onclick={onOpenAndAppendTemplate}>立即打开今日日记</button>
        </div>
    {/if}
</div>

<style>
    .today-card {
        grid-column: 1 / -1;
    }

    .card-title-group {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .today-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 4px;
    }

    .wk-stat strong {
        display: block;
        font-size: var(--wk-text-xl);
        font-weight: 700;
        color: var(--wk-ink-secondary);
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
    }

    .no-diary-guide {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .no-diary-guide p {
        margin: 0;
        font-size: var(--wk-text-base);
        color: var(--wk-ink-muted);
    }
</style>
