<script lang="ts">
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";

    interface Props {
        task: EnhancedDiaryWorkspaceTask;
        onSelect: (mode: "log" | "delete") => void | Promise<void>;
        onClose: () => void;
    }

    let { task, onSelect, onClose }: Props = $props();
</script>

<div class="delete-task-content">
    <p>请选择删除方式。保留删除记录会先写入今日日记「任务动态」，写入成功后才删除原任务。</p>
    <div class="task-name">{task.taskname}</div>
    <footer>
        <button type="button" onclick={onClose}>取消</button>
        <button type="button" onclick={() => onSelect("log")}>保留删除记录</button>
        <button type="button" class="danger" onclick={() => onSelect("delete")}>直接删除任务块</button>
    </footer>
</div>

<style>
    .delete-task-content {
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

    .task-name {
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-surface);
        padding: 10px 12px;
        margin-bottom: 18px;
        font-weight: 600;
        font-size: 13px;
        max-height: min(48vh, 420px);
        overflow: auto;
    }

    footer {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
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

    .danger {
        border-color: rgba(211, 47, 47, 0.5);
        color: var(--wk-error);
        background: rgba(211, 47, 47, 0.05);
    }

    .danger:hover {
        border-color: var(--wk-error);
        background: rgba(211, 47, 47, 0.1);
        color: var(--wk-error);
    }
</style>
