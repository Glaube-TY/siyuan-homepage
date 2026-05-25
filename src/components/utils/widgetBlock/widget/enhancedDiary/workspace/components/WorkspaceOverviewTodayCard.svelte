<script lang="ts">
    import type { EnhancedDiaryWorkspaceState } from "../enhancedDiaryWorkspaceData";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        state: EnhancedDiaryWorkspaceState;
        onOpenToday: () => void | Promise<void>;
    }

    let { state, onOpenToday }: Props = $props();
</script>

<div class="card wide today-card">
    <div class="card-head">
        <div class="card-title-group">
            <h2>今日概览</h2>
            {#if state.todayDiaryExists}
                <span class="status-badge {state.templateValid ? 'ok' : 'warn'}">
                    {state.templateValid ? "模板完整" : "模板缺失"}
                </span>
            {/if}
        </div>
        <button type="button" class="btn-secondary" onclick={onOpenToday}>打开日记</button>
    </div>
    {#if state.todayDiaryExists}
        <div class="today-stats">
            <div class="stat-item">
                <span>新建任务</span>
                <strong>{state.summary.newTaskCount}</strong>
            </div>
            <div class="stat-item">
                <span>迁移任务</span>
                <strong>{state.summary.migratedTaskCount}</strong>
            </div>
            <div class="stat-item">
                <span>快速记录</span>
                <strong>{state.summary.quickRecordCount}</strong>
            </div>
            <div class="stat-item">
                <span>项目推进</span>
                <strong>{state.summary.projectCount}</strong>
            </div>
        </div>
        {#if !state.templateValid}
            <div class="warning-box">
                <WorkspaceIcon name="warning" size={14} />
                <span>模板结构缺失：{state.missingSections.slice(0, 4).join("、")}{state.missingSections.length > 4 ? " 等" : ""}，写入操作会被保护性拦截。</span>
            </div>
        {/if}
    {:else}
        <div class="no-diary-guide">
            <p>今日还没有日记，打开后可补充强化日记模板。</p>
            <button type="button" class="btn-primary" onclick={onOpenToday}>立即打开今日日记</button>
        </div>
    {/if}
</div>

<style>
    .card {
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-surface);
        padding: 18px;
    }

    .wide {
        grid-column: 1 / -1;
    }

    .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 14px;
    }

    .card-title-group {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: var(--b3-theme-on-surface);
    }

    .status-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        font-weight: 500;
    }

    .status-badge.ok {
        background: rgba(40, 167, 69, 0.12);
        color: #22863a;
        border: 1px solid rgba(40, 167, 69, 0.3);
    }

    .status-badge.warn {
        background: rgba(255, 165, 0, 0.12);
        color: #b87300;
        border: 1px solid rgba(255, 165, 0, 0.35);
    }

    .today-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 4px;
    }

    .stat-item {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        padding: 10px 12px;
        text-align: center;
    }

    .stat-item span {
        display: block;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
        margin-bottom: 4px;
    }

    .stat-item strong {
        display: block;
        font-size: 20px;
        color: var(--b3-theme-on-surface);
        font-variant-numeric: tabular-nums;
    }

    .warning-box {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(255, 165, 0, 0.08);
        border: 1px solid rgba(255, 165, 0, 0.35);
        color: #b87300;
        font-size: 13px;
        line-height: 1.5;
    }

    .no-diary-guide {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .no-diary-guide p {
        margin: 0;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        opacity: 0.72;
    }

    .btn-secondary {
        border: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        border-radius: 7px;
        padding: 6px 11px;
        font-size: 12px;
        cursor: pointer;
    }

    .btn-secondary:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .btn-primary {
        border: 1px solid var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
        border-radius: 7px;
        padding: 6px 11px;
        font-size: 12px;
        cursor: pointer;
    }
</style>
