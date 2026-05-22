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
        border: 1px dashed var(--b3-border-color);
        border-radius: 8px;
        padding: 20px 16px;
        background: transparent;
        color: var(--b3-theme-on-background);
        text-align: center;
    }

    strong {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
        margin-bottom: 5px;
    }

    p {
        margin: 0;
        font-size: 12px;
        opacity: 0.45;
        line-height: 1.5;
        color: var(--b3-theme-on-surface);
    }
</style>
