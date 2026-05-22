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

<div class="modal-backdrop" role="presentation" onclick={onClose}>
    <section
        class="modal"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(event) => event.stopPropagation()}
        onkeydown={(event) => event.stopPropagation()}
    >
        <h2>迁移到今日日记</h2>
        <p>任务会移动到 {today} 日记的「迁移任务」区块，原任务实体不再保留在旧位置。</p>
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
                <dd># 今日日记 → ## 迁移任务</dd>
            </div>
        </dl>
        <footer>
            <button type="button" onclick={onClose}>取消</button>
            <button type="button" class="primary" onclick={onConfirm}>确认迁移</button>
        </footer>
    </section>
</div>

<style>
    .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.32);
        padding: 20px;
        backdrop-filter: blur(2px);
    }

    .modal {
        width: min(520px, 100%);
        border: 1px solid var(--b3-border-color);
        border-radius: 14px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 22px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
    }

    h2 {
        margin: 0 0 10px;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0;
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
        opacity: 0.88;
        color: #fff;
    }
</style>
