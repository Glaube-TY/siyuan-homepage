<script lang="ts">
    interface Props {
        title: string;
        description?: string;
        actionLabel?: string;
        onAction?: () => void;
        secondaryActionLabel?: string;
        onSecondaryAction?: () => void;
    }

    let {
        title, description, actionLabel, onAction, secondaryActionLabel, onSecondaryAction,
    }: Props = $props();
</script>

<div class="empty-state">
    <strong>{title}</strong>
    {#if description}<p>{description}</p>{/if}
    {#if (actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction)}
        <div class="actions">
            {#if actionLabel && onAction}
                <button type="button" class="wk-btn wk-btn-primary" onclick={onAction}>{actionLabel}</button>
            {/if}
            {#if secondaryActionLabel && onSecondaryAction}
                <button type="button" class="wk-btn wk-btn-ghost" onclick={onSecondaryAction}>{secondaryActionLabel}</button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .empty-state {
        display: grid;
        justify-items: center;
        gap: 6px;
        padding: 24px 16px;
        border: 1px solid var(--wk-border-light);
        border-radius: var(--wk-radius-sm);
        background: var(--wk-surface-3);
        text-align: center;
    }

    strong { color: var(--wk-ink); font-size: var(--wk-text-base); font-weight: 600; }
    p { margin: 0; color: var(--wk-ink-secondary); font-size: var(--wk-text-sm); line-height: 1.5; }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 6px; }
</style>
