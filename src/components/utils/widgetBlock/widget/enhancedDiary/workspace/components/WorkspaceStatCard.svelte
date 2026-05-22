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
        class="stat-card tone-{tone} clickable"
        onclick={onclick}
    >
        <div class="accent-bar"></div>
        <div class="card-body">
            <span class="label">{label}</span>
            <strong class="value">{value}</strong>
            {#if description}
                <span class="desc">{description}</span>
            {/if}
        </div>
    </button>
{:else}
    <div class="stat-card tone-{tone}">
        <div class="accent-bar"></div>
        <div class="card-body">
            <span class="label">{label}</span>
            <strong class="value">{value}</strong>
            {#if description}
                <span class="desc">{description}</span>
            {/if}
        </div>
    </div>
{/if}

<style>
    .stat-card {
        position: relative;
        border: 1px solid var(--b3-border-color);
        border-radius: 10px;
        background: var(--b3-theme-surface);
        padding: 0;
        min-width: 0;
        overflow: hidden;
        transition: box-shadow 0.15s, transform 0.15s;
        text-align: left;
    }

    .stat-card.clickable {
        cursor: pointer;
    }

    button.stat-card {
        width: 100%;
        color: inherit;
        font: inherit;
    }

    .stat-card.clickable:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
    }

    .accent-bar {
        height: 3px;
        background: var(--b3-border-color);
    }

    .tone-primary .accent-bar { background: var(--b3-theme-primary); }
    .tone-warning .accent-bar { background: #e6900a; }
    .tone-danger  .accent-bar { background: var(--b3-theme-error, #d32f2f); }

    .card-body {
        padding: 12px 14px 14px;
    }

    .label {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--b3-theme-on-surface);
        opacity: 0.6;
        margin-bottom: 6px;
    }

    .value {
        display: block;
        font-size: 26px;
        line-height: 1;
        color: var(--b3-theme-on-surface);
        font-variant-numeric: tabular-nums;
    }

    .tone-primary .value { color: var(--b3-theme-primary); }
    .tone-warning .value { color: #b87300; }
    .tone-danger  .value { color: var(--b3-theme-error, #d32f2f); }

    .desc {
        display: block;
        margin-top: 6px;
        font-size: 11px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
    }
</style>
