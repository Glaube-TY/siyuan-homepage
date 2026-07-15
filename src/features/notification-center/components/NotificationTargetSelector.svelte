<script lang="ts">
  import { onMount } from "svelte";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import { getTargetOptions, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
  import type { NotificationDeliveryTarget, NotificationTargetOption } from "@/features/notification-center/types";

  interface Props {
    value?: NotificationDeliveryTarget[];
    disabled?: boolean;
    showMobileRuntimeHint?: boolean;
  }

  let { value = $bindable<NotificationDeliveryTarget[]>([]), disabled = false, showMobileRuntimeHint = false }: Props = $props();
  let options = $state<NotificationTargetOption[]>([]);
  let optionsLoading = $state(true);
  let optionsError = $state<string | null>(null);

  function targetFor(option: NotificationTargetOption): NotificationDeliveryTarget {
    return option.kind === "external"
      ? { kind: "external", channelId: option.channelId ?? "" }
      : { kind: option.kind } as NotificationDeliveryTarget;
  }

  function isSelected(option: NotificationTargetOption): boolean {
    return value.some((target) => target.kind === option.kind && (target.kind !== "external" || target.channelId === option.channelId));
  }

  function toggle(option: NotificationTargetOption, checked: boolean): void {
    if (checked) {
      if (!isSelected(option)) value = [...value, targetFor(option)];
      return;
    }
    value = value.filter((target) => !(target.kind === option.kind && (target.kind !== "external" || target.channelId === option.channelId)));
  }

  async function reload(): Promise<void> {
    optionsLoading = true;
    optionsError = null;
    try {
      const loadedOptions = await getTargetOptions(value);
      options = loadedOptions;
    } catch (error) {
      optionsError = error instanceof Error ? error.message : "通知方式读取失败。";
    } finally {
      optionsLoading = false;
    }
  }

  onMount(() => {
    const handleSettingsChanged = () => { void reload(); };
    void reload();
    window.addEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
  });
</script>

<div class="shp-notification-target-selector">
  <strong>通知方式</strong>
  {#if optionsError}
    <div class="shp-notification-target-error"><span>通知方式暂时无法读取。<br />{optionsError}</span><button type="button" class="b3-button b3-button--text" disabled={optionsLoading} onclick={() => void reload()}>重试</button></div>
  {:else if optionsLoading && options.length === 0}
    <p class="shp-notification-target-loading">通知方式正在读取…</p>
  {/if}
  <div class="shp-notification-target-list">
    {#each options as option (option.key)}
      <SettingRow title={option.title} description={option.reason ?? "选择此方式接收该规则的通知"}>
        <input type="checkbox" class="b3-switch fn__flex-center" checked={isSelected(option)} disabled={disabled || optionsLoading || optionsError !== null || !option.enabled} onchange={(event) => toggle(option, event.currentTarget.checked)} />
      </SettingRow>
    {/each}
  </div>
  {#if showMobileRuntimeHint && value.some((target) => target.kind === "mobile")}
    <p class="shp-notification-hint">动态摘要需要思源在通知时间附近运行；固定提醒会提前注册到当前移动设备。</p>
  {/if}
</div>

<style>
  .shp-notification-target-selector { width: 100%; min-width: 0; box-sizing: border-box; display: grid; gap: 8px; }
  .shp-notification-target-list { width: 100%; min-width: 0; display: grid; gap: 2px; }
  .shp-notification-hint { margin: 0; color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-target-error { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; color: var(--b3-theme-error); background: var(--b3-theme-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-target-loading { margin: 0; color: var(--b3-theme-on-surface); font-size: 12px; }
</style>
