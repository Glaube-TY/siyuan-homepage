<script lang="ts">
    import { onMount } from "svelte";
    import WorkspaceIcon from "./WorkspaceIcon.svelte";

    interface Props {
        mode?: "create" | "edit";
        initialCategoryTitle?: string;
        initialContent?: string;
        suggestedCategories?: string[];
        onSubmit: (categoryTitle: string, content: string) => void | Promise<void>;
        onClose: () => void;
    }

    let {
        mode = "create",
        initialCategoryTitle = "",
        initialContent = "",
        suggestedCategories = ["未分类", "想法", "问题", "决策", "日志"],
        onSubmit,
        onClose,
    }: Props = $props();

    let categoryTitle = $state("");
    let content = $state("");
    let customCategory = $state("");

    const showCustomInput = $derived(!suggestedCategories.includes(categoryTitle) && categoryTitle !== "");

    function selectCategory(cat: string): void {
        if (categoryTitle === cat) {
            categoryTitle = "";
        } else {
            categoryTitle = cat;
            customCategory = "";
        }
    }

    function submit(): void {
        const title = showCustomInput ? (customCategory.trim() || categoryTitle.trim() || "未分类") : (categoryTitle.trim() || "未分类");
        onSubmit(title, content);
    }

    onMount(() => {
        if (mode === "edit") {
            categoryTitle = initialCategoryTitle || "未分类";
        } else {
            categoryTitle = initialCategoryTitle || "";
        }
        content = initialContent;
    });
</script>

<div class="quick-record-panel">
    <div class="panel-section">
        <div class="section-label">分类</div>
        <div class="wk-chip-group">
            {#each suggestedCategories as cat}
                <button
                    type="button"
                    class="wk-chip"
                    class:selected={categoryTitle === cat}
                    onclick={() => selectCategory(cat)}
                >
                    {cat}
                </button>
            {/each}
        </div>
        {#if showCustomInput}
            <input
                type="text"
                class="custom-category-input"
                bind:value={customCategory}
                placeholder="自定义分类名称"
                maxlength="30"
            />
        {/if}
    </div>

    <div class="panel-section panel-content">
        <textarea
            bind:value={content}
            placeholder="写下这条记录..."
            class="record-textarea"
        ></textarea>
    </div>

    <div class="panel-footer">
        <button type="button" class="wk-btn wk-btn-ghost" onclick={onClose}>取消</button>
        <button type="button" class="wk-btn wk-btn-primary" onclick={submit}>
            {mode === "edit" ? "保存更改" : "添加记录"}
        </button>
    </div>
</div>

<style>
    .quick-record-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        width: 100%;
        box-sizing: border-box;
    }

    .panel-section {
        padding: 16px 20px;
    }

    .panel-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding-top: 0;
    }

    .section-label {
        font-size: var(--wk-text-xs);
        font-weight: 600;
        color: var(--wk-ink-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 10px;
    }

    .custom-category-input {
        margin-top: 8px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-bg-card);
        color: var(--wk-ink-secondary);
        padding: 7px 10px;
        font-size: var(--wk-text-base);
        width: 100%;
        box-sizing: border-box;
        transition: border-color var(--wk-transition-fast);
    }

    .custom-category-input:focus {
        outline: none;
        border-color: var(--wk-primary);
    }

    .record-textarea {
        flex: 1;
        min-height: 140px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-md);
        background: var(--wk-bg-card);
        color: var(--wk-ink-secondary);
        padding: 14px;
        font-size: var(--wk-text-md);
        line-height: 1.7;
        resize: vertical;
        width: 100%;
        box-sizing: border-box;
        transition: border-color var(--wk-transition-fast);
        font-family: inherit;
    }

    .record-textarea:focus {
        outline: none;
        border-color: var(--wk-primary);
    }

    .record-textarea::placeholder {
        color: var(--wk-ink-faint);
    }

    .panel-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 14px 20px;
        border-top: 1px solid var(--wk-border-light);
    }
</style>
