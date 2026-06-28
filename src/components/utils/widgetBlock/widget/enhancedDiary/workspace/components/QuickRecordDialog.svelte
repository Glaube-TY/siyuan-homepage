<script lang="ts">
    import { onMount } from "svelte";

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
    let showSuggestions = $state(false);
    let inputFocused = $state(false);

    function getFilteredCategories(): string[] {
        const input = categoryTitle.trim().toLowerCase();
        if (!input) return suggestedCategories;
        return suggestedCategories.filter((cat) => cat.toLowerCase().includes(input));
    }

    function selectCategory(cat: string): void {
        categoryTitle = cat;
        showSuggestions = false;
    }

    function submit(): void {
        const title = categoryTitle.trim() || "未分类";
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

<div class="quick-record-form">
    <div class="form">
        <label>记录分类
            <div class="category-input-group">
                <input
                    type="text"
                    bind:value={categoryTitle}
                    placeholder="默认：未分类"
                    maxlength="30"
                    onfocus={() => { inputFocused = true; showSuggestions = true; }}
                    onblur={() => { inputFocused = false; setTimeout(() => { showSuggestions = false; }, 150); }}
                    oninput={() => { showSuggestions = true; }}
                />
                {#if showSuggestions && inputFocused}
                    {@const filtered = getFilteredCategories()}
                    {#if filtered.length > 0}
                        <div class="category-suggestions">
                            {#each filtered as category}
                                <button 
                                    type="button" 
                                    class="suggestion-item"
                                    onmousedown={(e) => e.preventDefault()}
                                    onclick={() => selectCategory(category)}
                                >
                                    {category}
                                </button>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </div>
        </label>
        <label>记录内容
            <textarea bind:value={content} placeholder="写下这条记录"></textarea>
        </label>
    </div>
    <footer>
        <button type="button" onclick={onClose}>取消</button>
        <button type="button" class="primary" onclick={submit}>
            {mode === "edit" ? "保存" : "添加"}
        </button>
    </footer>
</div>

<style>
    .quick-record-form {
        display: flex;
        flex-direction: column;
        min-height: 0;
        width: 100%;
        box-sizing: border-box;
        flex: 1;
        min-width: 0;
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px;
        width: 100%;
        box-sizing: border-box;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        color: var(--wk-ink-secondary);
        opacity: 0.8;
        min-width: 0;
    }

    .category-input-group {
        position: relative;
        display: flex;
        flex-direction: column;
    }

    input,
    textarea {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-surface);
        color: var(--wk-ink-secondary);
        padding: 8px 10px;
        font-size: 13px;
        transition: border-color 0.12s;
        width: 100%;
        box-sizing: border-box;
    }

    input:focus,
    textarea:focus {
        outline: none;
        border-color: var(--wk-primary);
    }

    textarea {
        min-height: 150px;
        resize: vertical;
        line-height: 1.6;
    }

    .category-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
    }

    .suggestion-item {
        border: 1px solid var(--wk-border);
        border-radius: 12px;
        background: var(--wk-background);
        color: var(--wk-ink-secondary);
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
        transition: border-color 0.1s, background 0.1s;
    }

    .suggestion-item:hover {
        border-color: var(--wk-primary);
        background: color-mix(in srgb, var(--wk-primary) 8%, var(--wk-background));
    }

    footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 18px;
        border-top: 1px solid var(--wk-border);
        background: var(--wk-surface);
        width: 100%;
        box-sizing: border-box;
    }

    footer button {
        border: 1px solid var(--wk-border);
        border-radius: 7px;
        background: var(--wk-background);
        color: var(--wk-ink);
        padding: 7px 16px;
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.1s, color 0.1s;
    }

    footer button:hover {
        border-color: var(--wk-primary);
        color: var(--wk-primary);
    }

    .primary {
        border-color: var(--wk-primary) !important;
        background: var(--wk-primary) !important;
        color: #fff !important;
    }

    .primary:hover {
        opacity: 0.88;
        color: #fff !important;
    }
</style>
