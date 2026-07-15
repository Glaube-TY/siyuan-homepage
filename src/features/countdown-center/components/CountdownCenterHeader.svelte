<script lang="ts">
  import CountdownIcon from "./CountdownIcon.svelte";
  import CountdownIconButton from "./CountdownIconButton.svelte";
  interface Props {
    mobile: boolean;
    onAdd: () => void;
    onClose: () => void;
  }
  let { mobile, onAdd, onClose }: Props = $props();
</script>

<header
  class="shp-countdown-center-header"
  class:shp-countdown-center-header-mobile={mobile}
>
  <div class="shp-countdown-center-title">
    <CountdownIcon name="calendar" size={24} />
    <div>
      <strong>纪念日中心</strong>{#if !mobile}<small
          >统一管理所有重要日期、展示和提醒</small
        >{/if}
    </div>
  </div>
  <div class="shp-countdown-center-header-actions">
    <CountdownIconButton name="add" label="新增纪念日" onclick={onAdd} />
    <CountdownIconButton name="close" label="关闭纪念日中心" onclick={onClose} />
  </div>
</header>

<style>
  .shp-countdown-center-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--b3-border-color);
    background: var(--b3-theme-background);
  }
  .shp-countdown-center-title,
  .shp-countdown-center-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .shp-countdown-center-title > div {
    display: grid;
    gap: 2px;
  }
  .shp-countdown-center-title strong {
    font-size: 18px;
  }
  .shp-countdown-center-title small {
    font-size: 12px;
    color: var(--b3-theme-on-surface);
  }
  .shp-countdown-center-header-mobile {
    min-height: 56px;
    padding: max(8px, env(safe-area-inset-top)) 10px 8px;
  }
  .shp-countdown-center-header-mobile .shp-countdown-center-title strong {
    font-size: 16px;
  }
</style>
