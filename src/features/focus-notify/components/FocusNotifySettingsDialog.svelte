<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import NotificationTargetSelector from "@/features/notification-center/components/NotificationTargetSelector.svelte";
  import { DEFAULT_FOCUS_NOTIFY_SETTINGS } from "../constants";
  import { loadFocusNotifySettings, saveFocusNotifySettings } from "../focus-notify-settings-store";
  import type { FocusNotifySettings } from "../types";

  interface Props { advancedEnabled: boolean; onClose?: () => void; }
  let { advancedEnabled, onClose }: Props = $props();
  let settings = $state<FocusNotifySettings>(structuredClone(DEFAULT_FOCUS_NOTIFY_SETTINGS));
  let loading = $state(true);
  let saving = $state(false);
  let loadError = $state<string | null>(null);
  const disabled = $derived(!advancedEnabled || loading || saving || loadError !== null);

  async function reload(): Promise<void> {
    loading = true;
    loadError = null;
    try {
      settings = await loadFocusNotifySettings();
    } catch (error) {
      loadError = error instanceof Error ? error.message : "番茄钟通知设置读取失败，请检查设置文件。";
    } finally {
      loading = false;
    }
  }

  async function save(): Promise<void> {
    if (loading || loadError) return;
    if (settings.rules.some((rule) => rule.enabled && rule.deliveryTargets.length === 0)) {
      showMessage("启用的番茄钟通知规则必须至少选择一种通知方式。", 5000, "error");
      return;
    }
    saving = true;
    try {
      settings = await saveFocusNotifySettings(settings);
      showMessage("番茄钟通知设置已保存。");
      onClose?.();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "番茄钟通知设置保存失败。", 5000, "error");
    } finally {
      saving = false;
    }
  }

  onMount(() => { void reload(); });
</script>

<div class="shp-focus-notification-settings-dialog">
  <div class="shp-focus-notification-dialog-header"><h3>番茄钟通知</h3><p>所有番茄钟组件共享同一套完成通知规则；计时、会话和统计仍使用原有本地数据。</p></div>
  <div class="shp-focus-notification-dialog-body">
    {#if loadError}<div class="shp-focus-notification-load-error"><span>番茄钟通知设置读取失败，未允许覆盖原设置。<br />{loadError}</span><button type="button" class="b3-button b3-button--text" disabled={loading} onclick={() => void reload()}>重新加载</button></div>{:else if loading}<div class="shp-focus-notification-loading">番茄钟通知设置加载中…</div>{/if}
    <SettingSection title="基础设置">
      <SettingRow title="启用番茄钟通知" description="控制专注结束和休息结束通知是否运行"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.enabled} {disabled} /></SettingRow>
    </SettingSection>
    <SettingSection title="专注结束">
      <SettingRow title="启用" description="专注会话成功保存后发送通知"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.rules[0].enabled} {disabled} /></SettingRow>
      <SettingRow title="通知标题" description="专注完成通知中显示的标题"><input class="b3-text-field control-lg" bind:value={settings.rules[0].title} {disabled} /></SettingRow>
      <NotificationTargetSelector bind:value={settings.rules[0].deliveryTargets} {disabled} />
    </SettingSection>
    <SettingSection title="休息结束">
      <SettingRow title="启用" description="自动休息完整结束后发送通知"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.rules[1].enabled} {disabled} /></SettingRow>
      <SettingRow title="通知标题" description="休息完成通知中显示的标题"><input class="b3-text-field control-lg" bind:value={settings.rules[1].title} {disabled} /></SettingRow>
      <NotificationTargetSelector bind:value={settings.rules[1].deliveryTargets} {disabled} />
    </SettingSection>
    {#if !advancedEnabled}<p class="shp-focus-notification-locked">当前会员状态不可用；已有设置会保留。</p>{/if}
  </div>
  <div class="shp-focus-notification-dialog-footer"><button type="button" class="b3-button b3-button--cancel" onclick={onClose}>取消</button><button type="button" class="b3-button b3-button--text" {disabled} onclick={save}>{saving ? "保存中…" : "保存番茄钟通知设置"}</button></div>
</div>

<style>
  .shp-focus-notification-settings-dialog { flex: 1 1 auto; width: 100%; min-width: 0; height: 100%; min-height: 0; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; }
  .shp-focus-notification-dialog-header { flex: 0 0 auto; padding: 16px 16px 12px; }
  .shp-focus-notification-dialog-body { flex: 1 1 auto; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 0 16px 16px; box-sizing: border-box; }
  .shp-focus-notification-dialog-header h3, .shp-focus-notification-dialog-header p, .shp-focus-notification-locked { margin: 0; }
  .shp-focus-notification-dialog-header p, .shp-focus-notification-locked { color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
  .shp-focus-notification-dialog-footer { flex: 0 0 auto; display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--b3-border-color); background: var(--b3-theme-background); }
  .shp-focus-notification-load-error { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; color: var(--b3-theme-error); background: var(--b3-theme-surface); font-size: 12px; line-height: 1.5; }
  .shp-focus-notification-loading { margin-bottom: 12px; color: var(--b3-theme-on-surface); font-size: 12px; }
  @media (max-width: 600px) { .shp-focus-notification-dialog-header { padding: 12px 12px 10px; } .shp-focus-notification-dialog-body { padding: 0 12px 12px; } .shp-focus-notification-dialog-footer { padding: 10px 12px; } .shp-focus-notification-load-error { align-items: stretch; flex-direction: column; } }
</style>
