<script lang="ts">
    interface Props {
        label: string;
        value: string | number;
        tone?: "normal" | "primary" | "warning" | "danger";
        description?: string;
        onclick?: () => void;
    }

    let { label, value, tone = "normal", description = "", onclick }: Props = $props();
</script>

{#if onclick}
    <button
        type="button"
        class="stat-card clickable"
        class:tone-primary={tone === "primary"}
        class:tone-warning={tone === "warning"}
        class:tone-danger={tone === "danger"}
        onclick={onclick}
    >
        <span class="stat-dot"></span>
        <div class="stat-body">
            <strong class="stat-value">{value}</strong>
            <span class="stat-label">{label}</span>
        </div>
    </button>
{:else}
    <div
        class="stat-card"
        class:tone-primary={tone === "primary"}
        class:tone-warning={tone === "warning"}
        class:tone-danger={tone === "danger"}
    >
        <span class="stat-dot"></span>
        <div class="stat-body">
            <strong class="stat-value">{value}</strong>
            <span class="stat-label">{label}</span>
        </div>
    </div>
{/if}

<style>
    .stat-card {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: none;
        border-radius: var(--wk-radius-sm);
        background: transparent;
        text-align: left;
        cursor: default;
        transition: background var(--wk-transition-fast);
    }

    .stat-card.clickable {
        cursor: pointer;
        font: inherit;
        color: inherit;
        width: auto;
    }

    .stat-card.clickable:hover {
        background: var(--wk-primary-subtle);
    }

    .stat-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--wk-ink-muted);
        flex-shrink: 0;
        transition: background var(--wk-transition-fast);
    }

    .stat-card.tone-primary .stat-dot { background: var(--wk-primary); }
    .stat-card.tone-warning .stat-dot { background: var(--wk-warning); }
    .stat-card.tone-danger  .stat-dot { background: var(--wk-error); }

    .stat-body {
        display: flex;
        align-items: baseline;
        gap: 4px;
        min-width: 0;
    }

    .stat-value {
        font-size: var(--wk-text-base);
        font-weight: 700;
        color: var(--wk-ink-secondary);
        font-variant-numeric: tabular-nums;
        line-height: 1;
    }

    .stat-card.tone-primary .stat-value { color: var(--wk-primary); }
    .stat-card.tone-warning .stat-value { color: var(--wk-warning); }
    .stat-card.tone-danger  .stat-value { color: var(--wk-error); }

    .stat-label {
        font-size: var(--wk-text-xs);
        color: var(--wk-ink-muted);
        font-weight: 500;
        white-space: nowrap;
    }
</style>
