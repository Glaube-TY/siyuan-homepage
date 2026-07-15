<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import CountdownNotifyRuleEditor from "./CountdownNotifyRuleEditor.svelte";
  import { DEFAULT_COUNTDOWN_NOTIFY_SETTINGS } from "../constants";
  import { loadCountdownNotifySettings, saveCountdownNotifySettings } from "../countdown-notify-settings-store";
  import { createCountdownNotifyRule, type CountdownNotifyRuleType, type CountdownNotifySettings } from "../types";
  interface Props { advancedEnabled: boolean; onClose?: () => void; }
  let { advancedEnabled, onClose }: Props = $props();
  let settings = $state<CountdownNotifySettings>(structuredClone(DEFAULT_COUNTDOWN_NOTIFY_SETTINGS));
  let selectedType = $state<CountdownNotifyRuleType>("today_events");
  let loading = $state(true);
  let saving = $state(false);
  let loadError = $state<string | null>(null);
  const disabled = $derived(!advancedEnabled || loading || saving || loadError !== null);
  async function reload(): Promise<void> {
    loading = true;
    loadError = null;
    try {
      settings = await loadCountdownNotifySettings();
    } catch (error) {
      loadError = error instanceof Error ? error.message : "纪念日通知设置读取失败，请检查设置文件。";
    } finally {
      loading = false;
    }
  }
  async function save(): Promise<void> { if (loading || loadError) return; if (settings.rules.some((rule) => rule.enabled && rule.deliveryTargets.length === 0)) { showMessage("启用的纪念日规则必须至少选择一种通知方式。", 5000, "error"); return; } saving = true; try { settings = await saveCountdownNotifySettings(settings); showMessage("纪念日通知设置已保存。"); onClose?.(); } catch (e) { showMessage(e instanceof Error ? e.message : "保存失败。", 5000, "error"); } finally { saving = false; } }
  onMount(() => { void reload(); });
</script>
<div class="shp-notification-settings-dialog">
  <div class="shp-notification-dialog-header"><h3>纪念日通知</h3><p>规则全局共享，所有纪念日组件和移动设备使用同一套设置。</p></div>
  <div class="shp-notification-dialog-body">
    {#if loadError}<div class="shp-notification-load-error"><span>纪念日通知设置读取失败，未允许覆盖原设置。<br />{loadError}</span><button type="button" class="b3-button b3-button--text" disabled={loading} onclick={() => void reload()}>重新加载</button></div>{:else if loading}<div class="shp-notification-loading">纪念日通知设置加载中…</div>{/if}
    <SettingSection title="基础设置">
      <SettingRow title="启用纪念日通知" description="控制全部纪念日通知规则是否运行"><input type="checkbox" class="b3-switch fn__flex-center" bind:checked={settings.enabled} {disabled} /></SettingRow>
      <SettingRow title="扫描间隔" description="检查纪念日状态的间隔，单位为毫秒"><input type="number" class="b3-text-field control-sm" min="10000" max="3600000" bind:value={settings.scanIntervalMs} {disabled} /></SettingRow>
      <SettingRow title="补发窗口" description="允许补发错过通知的时间范围，单位为分钟"><input type="number" class="b3-text-field control-sm" min="1" max="1440" bind:value={settings.catchUpWindowMinutes} {disabled} /></SettingRow>
      <SettingRow title="摘要最多事件数" description="单次摘要中包含的纪念日数量上限"><input type="number" class="b3-text-field control-sm" min="1" max="100" bind:value={settings.maxEventsPerMessage} {disabled} /></SettingRow>
    </SettingSection>
    <SettingSection title="通知规则">
      <SettingRow title="新增规则" description="选择纪念日通知规则类型后添加"><div class="shp-notification-add-rule"><select class="b3-text-field control-md shp-notification-rule-type" bind:value={selectedType} {disabled}><option value="today_events">今日事件</option><option value="advance_events">提前 N 天</option><option value="upcoming_digest">未来 N 天摘要</option></select><button type="button" class="b3-button b3-button--text shp-notification-add-button" {disabled} onclick={() => settings.rules = [...settings.rules, createCountdownNotifyRule(selectedType)]}>添加规则</button></div></SettingRow>
      <div class="shp-notification-rule-list">{#each settings.rules as rule, index (rule.id)}<CountdownNotifyRuleEditor bind:rule={settings.rules[index]} {disabled} onDelete={() => settings.rules = settings.rules.filter((_, i) => i !== index)} />{/each}</div>
    </SettingSection>
    {#if !advancedEnabled}<p class="shp-notification-locked">当前会员状态不可用；已有设置会保留。</p>{/if}
  </div>
  <div class="shp-notification-dialog-footer"><button type="button" class="b3-button b3-button--cancel" onclick={onClose}>取消</button><button type="button" class="b3-button b3-button--text" {disabled} onclick={save}>{saving ? "保存中…" : "保存纪念日通知设置"}</button></div>
</div>
<style>
  .shp-notification-settings-dialog { flex: 1 1 auto; width: 100%; min-width: 0; height: 100%; min-height: 0; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; }
  .shp-notification-dialog-header { flex: 0 0 auto; padding: 16px 16px 12px; }
  .shp-notification-dialog-body { flex: 1 1 auto; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 0 16px 16px; box-sizing: border-box; }
  .shp-notification-dialog-header h3, .shp-notification-dialog-header p, .shp-notification-locked { margin: 0; }
  .shp-notification-dialog-header p, .shp-notification-locked { color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-add-rule, .shp-notification-dialog-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
  .shp-notification-add-rule { min-width: 0; max-width: 100%; }
  .shp-notification-rule-type { max-width: 100%; box-sizing: border-box; }
  .shp-notification-rule-list { display: grid; gap: 10px; min-width: 0; }
  .shp-notification-dialog-footer { flex: 0 0 auto; padding: 12px 16px; border-top: 1px solid var(--b3-border-color); background: var(--b3-theme-background); }
  .shp-notification-load-error { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; color: var(--b3-theme-error); background: var(--b3-theme-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-loading { margin-bottom: 12px; color: var(--b3-theme-on-surface); font-size: 12px; }
  @media (max-width: 600px) { .shp-notification-dialog-header { padding: 12px 12px 10px; } .shp-notification-dialog-body { padding: 0 12px 12px; } .shp-notification-dialog-footer { padding: 10px 12px; } .shp-notification-add-rule, .shp-notification-load-error { align-items: stretch; flex-direction: column; } .shp-notification-rule-type, .shp-notification-add-button { width: 100%; min-width: 0; } }
</style>
