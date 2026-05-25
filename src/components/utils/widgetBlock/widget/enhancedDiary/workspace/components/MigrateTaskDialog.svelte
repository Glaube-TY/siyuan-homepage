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
    <p>任务会移动到 {today} 日记的「任务管理 > 迁移任务」区块，原任务实体不再保留在旧位置。</p>
    <dl>
        <div>
            <dt>任务</dt>
            <dd>{task.taskname}</dd>
        </div>
        <div>
            <dt>来源</dt>
            <dd>{task.sourceDocTitle || task.sourceDate || task.hpath || "未知来源"}</dd>
        </div>
        <div>
            <dt>目标</dt>
            <dd># 今日日记 → ## 任务管理 → ### 迁移任务</dd>
        </div>
    </dl>
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
        color: var(--b3-theme-on-background);
        opacity: 0.72;
    }

    dl {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        margin: 0 0 18px;
        overflow: hidden;
        max-height: min(48vh, 420px);
        overflow: auto;
    }

    dl > div {
        display: grid;
        grid-template-columns: 76px minmax(0, 1fr);
        border-top: 1px solid var(--b3-border-color);
    }

    dl > div:first-child {
        border-top: none;
    }

    dt,
    dd {
        margin: 0;
        padding: 9px 12px;
        font-size: 13px;
    }

    dt {
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        opacity: 0.65;
        font-weight: 500;
    }

    footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin: 16px -20px 0;
        padding: 14px 20px 16px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
        position: sticky;
        bottom: 0;
    }

    button {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        padding: 7px 14px;
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .primary:hover {
        opacity: 0.9;
    }
</style>
