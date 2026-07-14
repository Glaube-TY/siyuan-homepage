<script lang="ts">
    interface Props {
        title: string;
        description?: string;
        actionLabel?: string;
        onAction?: () => void;
    }

    let { title, description = "", actionLabel = "", onAction }: Props = $props();
</script>

<div class="empty-state">
    <strong>{title}</strong>
    {#if description}
        <p>{description}</p>
    {/if}
    {#if actionLabel && onAction}<button type="button" onclick={onAction}>{actionLabel}</button>{/if}
</div>

<style>
    .empty-state {
        border: 1px dashed var(--wk-border);
        border-radius: var(--wk-radius-sm);
        padding: 20px 16px;
        background: transparent;
        color: var(--wk-ink);
        text-align: center;
    }

    strong {
        display: block;
        font-size: var(--wk-text-base);
        font-weight: 500;
        color: var(--wk-ink-muted);
        margin-bottom: 5px;
    }

    p {
        margin: 0;
        font-size: var(--wk-text-sm);
        line-height: 1.5;
        color: var(--wk-ink-faint);
    }

    button { margin-top: 10px; padding: 5px 10px; border: 1px solid var(--wk-border); border-radius: 7px; background: var(--wk-surface); color: var(--wk-primary); cursor: pointer; }
</style>
