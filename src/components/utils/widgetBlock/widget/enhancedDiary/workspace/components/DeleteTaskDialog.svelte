<script lang="ts">
    import type { EnhancedDiaryWorkspaceTask } from "../enhancedDiaryWorkspaceTaskService";

    interface Props {
        task: EnhancedDiaryWorkspaceTask;
        onSelect: (mode: "log" | "delete") => void | Promise<void>;
        onClose: () => void;
    }

    let { task, onSelect, onClose }: Props = $props();
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
        <h2>删除任务</h2>
        <p>请选择删除方式。保留删除记录会先写入今日日记「任务动态」，写入成功后才删除原任务。</p>
        <div class="task-name">{task.taskname}</div>
        <footer>
            <button type="button" onclick={onClose}>取消</button>
            <button type="button" onclick={() => onSelect("log")}>保留删除记录</button>
            <button type="button" class="danger" onclick={() => onSelect("delete")}>直接删除任务块</button>
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

    .task-name {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        padding: 10px 12px;
        margin-bottom: 18px;
        font-weight: 600;
        font-size: 13px;
    }

    footer {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
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

    .danger {
        border-color: rgba(211, 47, 47, 0.5);
        color: var(--b3-theme-error, #d32f2f);
        background: rgba(211, 47, 47, 0.05);
    }

    .danger:hover {
        border-color: var(--b3-theme-error, #d32f2f);
        background: rgba(211, 47, 47, 0.1);
        color: var(--b3-theme-error, #d32f2f);
    }
</style>
