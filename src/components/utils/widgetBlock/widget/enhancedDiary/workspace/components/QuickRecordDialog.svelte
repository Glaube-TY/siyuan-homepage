<script lang="ts">
    import { onMount } from "svelte";
    import {
        ENHANCED_DIARY_RECORD_CATEGORY_TITLES,
        type EnhancedDiaryRecordCategoryKey,
    } from "../../enhancedDiaryWorkspaceSections";

    interface Props {
        mode?: "create" | "edit";
        initialCategoryKey?: EnhancedDiaryRecordCategoryKey;
        initialContent?: string;
        onSubmit: (categoryKey: EnhancedDiaryRecordCategoryKey, content: string) => void | Promise<void>;
        onClose: () => void;
    }

    let {
        mode = "create",
        initialCategoryKey = "uncategorized",
        initialContent = "",
        onSubmit,
        onClose,
    }: Props = $props();
    let categoryKey: EnhancedDiaryRecordCategoryKey = $state("uncategorized");
    let content = $state("");

    const categories = Object.entries(ENHANCED_DIARY_RECORD_CATEGORY_TITLES) as Array<[
        EnhancedDiaryRecordCategoryKey,
        string,
    ]>;

    onMount(() => {
        categoryKey = initialCategoryKey;
        content = initialContent;
    });
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
        <header>
            <h2>{mode === "edit" ? "编辑记录" : "快速记录"}</h2>
            <button type="button" onclick={onClose} aria-label="关闭">×</button>
        </header>
        <div class="form">
            <label>分类
                <select bind:value={categoryKey}>
                    {#each categories as [key, label]}
                        <option value={key}>{label}</option>
                    {/each}
                </select>
            </label>
            <label>记录内容
                <textarea bind:value={content} placeholder="写下这条记录"></textarea>
            </label>
        </div>
        <footer>
            <button type="button" onclick={onClose}>取消</button>
            <button type="button" class="primary" onclick={() => onSubmit(categoryKey, content)}>
                {mode === "edit" ? "保存" : "添加"}
            </button>
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
        width: min(560px, 100%);
        border: 1px solid var(--b3-border-color);
        border-radius: 14px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
        overflow: hidden;
    }

    header,
    footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    footer {
        justify-content: flex-end;
        gap: 8px;
        border-top: 1px solid var(--b3-border-color);
        border-bottom: none;
        background: var(--b3-theme-surface);
    }

    h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0;
    }

    header button {
        border: none;
        background: transparent;
        color: var(--b3-theme-on-surface);
        opacity: 0.5;
        font-size: 18px;
        padding: 2px 6px;
        cursor: pointer;
        border-radius: 4px;
    }

    header button:hover {
        opacity: 1;
        background: var(--b3-theme-surface);
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
        opacity: 0.8;
    }

    select,
    textarea {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        padding: 8px 10px;
        font-size: 13px;
        transition: border-color 0.12s;
    }

    select:focus,
    textarea:focus {
        outline: none;
        border-color: var(--b3-theme-primary);
    }

    textarea {
        min-height: 150px;
        resize: vertical;
        line-height: 1.6;
    }

    footer button {
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 7px 16px;
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    footer button:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
    }

    .primary {
        border-color: var(--b3-theme-primary) !important;
        background: var(--b3-theme-primary) !important;
        color: #fff !important;
    }

    .primary:hover {
        opacity: 0.88;
        color: #fff !important;
    }
</style>
