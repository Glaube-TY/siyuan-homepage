<script lang="ts">
    import type { EnhancedDiaryWorkspaceRecord } from "../enhancedDiaryWorkspaceRecordService";

    interface Props {
        record: EnhancedDiaryWorkspaceRecord;
        onConfirm: () => void | Promise<void>;
        onClose: () => void;
    }

    let { record, onConfirm, onClose }: Props = $props();
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
        <h2>删除记录</h2>
        <p>将删除这条四级标题记录及其正文块。定位不可靠时系统会拒绝删除。</p>
        <div class="record-preview">
            <strong>{record.headingTitle}</strong>
            <span>{record.categoryTitle}</span>
            <p>{record.content}</p>
        </div>
        <footer>
            <button type="button" onclick={onClose}>取消</button>
            <button type="button" class="danger" onclick={onConfirm}>确认删除</button>
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

    .record-preview {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        padding: 12px;
        margin-bottom: 18px;
    }

    .record-preview strong,
    .record-preview span {
        display: block;
    }

    .record-preview strong {
        font-size: 13px;
        font-weight: 600;
    }

    .record-preview span {
        color: var(--b3-theme-primary);
        font-size: 11px;
        margin-top: 4px;
    }

    .record-preview p {
        white-space: pre-wrap;
        margin-top: 10px;
        margin-bottom: 0;
        opacity: 0.72;
        font-size: 12px;
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
