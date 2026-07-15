<script lang="ts">
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  }
  let { title, description, actionLabel, onAction }: Props = $props();
</script>

<div class="shp-countdown-center-empty">
  <span class="shp-countdown-center-empty-icon"
    ><CountdownIcon name="calendar" size={34} /></span
  ><strong>{title}</strong>
  <p>{description}</p>
  {#if actionLabel && onAction}<CountdownIconButton
      name="add"
      label={actionLabel}
      onclick={onAction}
    />{/if}
</div>

<style>
  .shp-countdown-center-empty {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
    padding: 24px;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-center-empty-icon {
    color: var(--b3-theme-primary);
  }
  .shp-countdown-center-empty strong {
    color: var(--b3-theme-on-background);
    font-size: 16px;
  }
  .shp-countdown-center-empty p {
    margin: 0;
    max-width: 420px;
    line-height: 1.6;
  }
</style>
