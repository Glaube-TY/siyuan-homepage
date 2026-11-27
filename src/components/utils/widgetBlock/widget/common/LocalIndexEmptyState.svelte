<script lang="ts">
    import { createOpenHomepageSetting } from "@/homepage/header/quick-button";

    interface Props {
        title: string;
        message?: string;
        state?: "empty" | "unindexed" | "error";
        plugin: any;
        indexFocusKey: "index-favorites" | "index-review" | "index-tasks" | "index-heatmap";
        onRetry?: () => Promise<void>;
        actionLabel?: string;
        onAction?: () => void;
    }

    let { title, message, state: viewState = "empty", plugin, indexFocusKey, onRetry, actionLabel, onAction }: Props = $props();
    let retrying = $state(false);

    function openIndex(): void {
        createOpenHomepageSetting(plugin, {
            initialMainTab: "homepage",
            initialSubTab: "indexing",
            initialFocus: indexFocusKey,
        })();
    }

    async function retry(): Promise<void> {
        if (!onRetry || retrying) return;
        retrying = true;
        try {
            await onRetry();
        } finally {
            retrying = false;
        }
    }
</script>

<div class="local-index-empty-state" data-widget-part={viewState === "error" ? "error" : "empty"} aria-busy={retrying}>
    <strong>{title}</strong>
    {#if message}<p>{message}</p>{/if}
    {#if viewState !== "empty" || (actionLabel && onAction)}
        <div class="actions">
            {#if viewState === "error" && onRetry}
                <button type="button" class="primary" disabled={retrying} onclick={retry}>{retrying ? "读取中…" : "重试"}</button>
            {/if}
            {#if viewState !== "empty"}
                <button type="button" class:primary={viewState === "unindexed"} onclick={openIndex}>前往该索引</button>
            {:else if actionLabel && onAction}
                <button type="button" onclick={onAction}>{actionLabel}</button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .local-index-empty-state {
        display: grid;
        justify-items: center;
        gap: 5px;
        min-width: 0;
        padding: 14px 12px;
        border: 1px solid var(--b3-border-color, color-mix(in srgb, CanvasText 20%, transparent));
        border-radius: var(--b3-border-radius, 8px);
        background: color-mix(in srgb, var(--b3-theme-surface, Canvas) 80%, var(--b3-theme-background, Canvas));
        color: var(--b3-theme-on-surface, CanvasText);
        text-align: center;
        overflow-wrap: anywhere;
    }

    strong { color: var(--b3-theme-on-background, CanvasText); font-size: 14px; font-weight: 600; }
    p { margin: 0; font-size: 12px; line-height: 1.5; }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 4px; }
    button {
        min-height: 32px;
        padding: 4px 9px;
        border: 0;
        border-radius: var(--b3-border-radius, 8px);
        background: transparent;
        color: var(--b3-theme-primary, LinkText);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
    }

    button:hover:not(:disabled) { background: var(--b3-list-hover, color-mix(in srgb, CanvasText 8%, transparent)); }
    button.primary {
        background: color-mix(in srgb, var(--b3-theme-primary, Highlight) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary, Highlight) 26%, transparent);
        color: var(--b3-theme-primary, LinkText);
    }
    button.primary:hover:not(:disabled) {
        background: color-mix(in srgb, var(--b3-theme-primary, Highlight) 16%, transparent);
    }
    button:focus-visible { outline: 2px solid var(--b3-theme-primary, Highlight); outline-offset: 2px; }
    button:disabled { opacity: .65; cursor: default; }
</style>
