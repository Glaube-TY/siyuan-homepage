<script lang="ts">
    interface Props {
        label: string;
        value: string | number;
        tone?: "normal" | "primary" | "warning" | "danger";
        description?: string;
        onclick?: () => void;
    }

    let { label, value, tone = "normal", description = "", onclick }: Props = $props();

    const valueClass = $derived(tone === "primary" ? "primary" : tone === "warning" ? "warning" : tone === "danger" ? "danger" : "");
</script>

{#if onclick}
    <button
        type="button"
        class="wk-card clickable stat-card"
        onclick={onclick}
    >
        <div class="accent-bar tone-{tone}"></div>
        <div class="card-body">
            <span class="label">{label}</span>
            <strong class="wk-stat-value {valueClass}">{value}</strong>
            {#if description}
                <span class="desc">{description}</span>
            {/if}
        </div>
    </button>
{:else}
    <div class="wk-card stat-card">
        <div class="accent-bar tone-{tone}"></div>
        <div class="card-body">
            <span class="label">{label}</span>
            <strong class="wk-stat-value {valueClass}">{value}</strong>
            {#if description}
                <span class="desc">{description}</span>
            {/if}
        </div>
    </div>
{/if}

<style>
    .stat-card {
        position: relative;
        padding: 0;
        min-width: 0;
        overflow: hidden;
        text-align: left;
    }

    button.stat-card {
        width: 100%;
        color: inherit;
        font: inherit;
    }

    .accent-bar {
        height: 3px;
        background: var(--wk-border);
    }

    .accent-bar.tone-primary { background: var(--wk-primary); }
    .accent-bar.tone-warning { background: var(--wk-warning); }
    .accent-bar.tone-danger  { background: var(--wk-error); }

    .card-body {
        padding: 12px 14px 14px;
    }

    .label {
        display: block;
        font-size: var(--wk-text-xs);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--wk-ink-muted);
        margin-bottom: 6px;
    }

    .desc {
        display: block;
        margin-top: 6px;
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-faint);
    }
</style>
