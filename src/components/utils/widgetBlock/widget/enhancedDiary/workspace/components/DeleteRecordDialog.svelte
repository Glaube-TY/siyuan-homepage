<script lang="ts">
    import type { EnhancedDiaryWorkspaceRecord } from "../enhancedDiaryWorkspaceRecordService";

    interface Props {
        record: EnhancedDiaryWorkspaceRecord;
        onConfirm: () => void | Promise<void>;
        onClose: () => void;
        message?: string;
    }

    let { record, onConfirm, onClose, message = "将删除这条四级标题记录及其正文块。定位不可靠时系统会拒绝删除。" }: Props = $props();
</script>

<div class="delete-record-content">
    <p>{message}</p>
    <div class="record-preview">
        <strong>{record.headingTitle}</strong>
        <span>{record.categoryTitle}</span>
        <p>{record.content}</p>
    </div>
    <footer>
        <button type="button" onclick={onClose}>取消</button>
        <button type="button" class="danger" onclick={onConfirm}>确认删除</button>
    </footer>
</div>

<style>
    .delete-record-content {
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

    .record-preview {
        border: 1px solid var(--wk-border);
        border-radius: 8px;
        background: var(--wk-surface);
        padding: 12px;
        margin-bottom: 18px;
        max-height: min(48vh, 420px);
        overflow: auto;
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
        color: var(--wk-primary);
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
