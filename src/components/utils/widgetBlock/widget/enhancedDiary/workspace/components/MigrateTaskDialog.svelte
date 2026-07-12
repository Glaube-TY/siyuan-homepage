<script lang="ts">
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";

    interface Props {
        task: EnhancedDiaryWorkspaceTask;
        today: string;
        onConfirm: () => void | Promise<void>;
        onClose: () => void;
    }

    let { task, today, onConfirm, onClose }: Props = $props();
</script>

<div class="migrate-task-content">
    <p class="intro">把这个行动带到今天，原位置将不再保留任务实体。</p>
    <strong class="task-title">{task.taskname}</strong>
    <div class="migration-path" aria-label="迁移路径">
        <div><span>原日期</span><strong>{task.sourceDocTitle || task.sourceDate || task.hpath || "未知来源"}</strong></div>
        <span class="path-arrow" aria-hidden="true">↓</span>
        <div class="target"><span>今天</span><strong>{today} · 迁移任务</strong></div>
    </div>
    <footer>
        <button type="button" onclick={onClose}>取消</button>
        <button type="button" class="primary" onclick={onConfirm}>确认迁移</button>
    </footer>
</div>

<style>
    .migrate-task-content {
        width: 100%;
        box-sizing: border-box;
        padding: 18px 20px 0;
        max-height: min(72vh, 620px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    p {
        margin: 0 0 14px;
        line-height: 1.6;
        font-size: 13px;
        color: var(--wk-ink);
        opacity: 0.72;
    }

    .task-title {
        display: block;
        margin-bottom: 14px;
        font-size: 17px;
        line-height: 1.45;
        color: var(--wk-text-1, var(--wk-ink));
    }

    .migration-path {
        border: 1px solid var(--wk-border);
        border-radius: var(--wk-radius-lg, 12px);
        margin: 0 0 18px;
        padding: 14px;
        background: var(--wk-surface-2, var(--wk-surface));
    }

    .migration-path > div {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 9px;
        background: var(--wk-surface-1, var(--wk-background));
    }

    .migration-path .target {
        color: var(--wk-primary);
        background: var(--wk-primary-soft, color-mix(in srgb, var(--wk-primary) 10%, transparent));
    }

    .migration-path span {
        color: var(--wk-text-3, var(--wk-ink-secondary));
        font-size: 12px;
    }

    .path-arrow {
        display: block;
        padding: 5px 14px;
        font-size: 18px !important;
    }

    footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin: 16px -20px 0;
        padding: 14px 20px 16px;
        border-top: 1px solid var(--wk-border);
        background: var(--wk-surface);
        position: sticky;
        bottom: 0;
    }

    button {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        padding: 7px 14px;
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    button:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .primary {
        border-color: var(--wk-primary);
        background: var(--wk-primary);
        color: var(--b3-theme-on-primary);
    }

    .primary:hover {
        opacity: 0.9;
    }
</style>
