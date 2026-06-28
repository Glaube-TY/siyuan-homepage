<script lang="ts">
    interface Props {
        title: string;
        description?: string;
    }

    let { title, description = "" }: Props = $props();
</script>

<div class="empty-state">
    <strong>{title}</strong>
    {#if description}
        <p>{description}</p>
    {/if}
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
</style>
