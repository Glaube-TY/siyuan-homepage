<script lang="ts">
  import CountdownIcon from "./CountdownIcon.svelte";

  interface Props {
    name: string;
    label: string;
    size?: number;
    disabled?: boolean;
    active?: boolean;
    danger?: boolean;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    name,
    label,
    size = 18,
    disabled = false,
    active = false,
    danger = false,
    onclick,
  }: Props = $props();
</script>

<button
  type="button"
  class="shp-countdown-icon-button"
  class:active
  class:danger
  title={label}
  aria-label={label}
  aria-pressed={active || undefined}
  {disabled}
  {onclick}
>
  <CountdownIcon {name} {size} />
</button>

<style>
  .shp-countdown-icon-button {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
  }
  .shp-countdown-icon-button:hover:not(:disabled),
  .shp-countdown-icon-button:focus-visible {
    background: var(--b3-list-hover);
    color: var(--b3-theme-on-background);
    outline: 2px solid
      color-mix(in srgb, var(--b3-theme-primary) 30%, transparent);
    outline-offset: -2px;
  }
  .shp-countdown-icon-button.active {
    border-color: color-mix(
      in srgb,
      var(--b3-theme-primary) 55%,
      var(--b3-border-color)
    );
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    color: var(--b3-theme-primary);
  }
  .shp-countdown-icon-button.danger {
    color: var(--b3-theme-error);
  }
  .shp-countdown-icon-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
