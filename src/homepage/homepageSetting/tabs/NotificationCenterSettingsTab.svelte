<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { showMessage } from "siyuan";
  import SettingRow from "@/libs/components/SettingRow.svelte";
  import SettingSection from "@/libs/components/SettingSection.svelte";
  import DesktopNotificationSettings from "@/features/notification-center/components/DesktopNotificationSettings.svelte";
  import MobileNotificationSettings from "@/features/notification-center/components/MobileNotificationSettings.svelte";
  import ExternalNotificationSettings from "@/features/notification-center/components/ExternalNotificationSettings.svelte";
  import NotificationDeliveryHistory from "@/features/notification-center/components/NotificationDeliveryHistory.svelte";
  import {
    DEFAULT_NOTIFICATION_CENTER_SETTINGS,
    NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT,
    NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT,
    getMobilePlanRuntimeStatus,
    getNotificationCenterMigrationError,
    isMobileNotificationRuntime,
    loadNotificationCenterSettings,
    loadCurrentDeviceMobilePlans,
    loadRecentNotificationDeliveries,
    notificationCenter,
    saveNotificationCenterSettings,
  } from "@/features/notification-center";
  import type { MobilePlanRuntimeStatus, NotificationCenterSettings, NotificationDeliveryHistoryRecord } from "@/features/notification-center/types";
  interface Props { plugin: any; advancedEnabled: boolean; }
  let { advancedEnabled }: Props = $props();
  let settings = $state<NotificationCenterSettings>(structuredClone(DEFAULT_NOTIFICATION_CENTER_SETTINGS));
  let history = $state<NotificationDeliveryHistoryRecord[]>([]);
  let mobileStatus = $state<MobilePlanRuntimeStatus>({ planCount: 0 });
  let loadingSettings = $state(false);
  let saving = $state(false);
  let settingsLoadError = $state<string | null>(null);
  let historyLoadError = $state<string | null>(null);
  let mobilePlanLoadError = $state<string | null>(null);
  let accessGeneration = 0;
  const disabled = $derived(!advancedEnabled || loadingSettings || saving || settingsLoadError !== null);
  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
  async function refreshHistory(): Promise<void> {
    if (!advancedEnabled) return;
    const generation = accessGeneration;
    try {
      const loaded = await loadRecentNotificationDeliveries(30);
      if (advancedEnabled && generation === accessGeneration) {
        history = loaded;
        historyLoadError = null;
      }
    } catch (error) {
      if (advancedEnabled && generation === accessGeneration) historyLoadError = errorMessage(error, "通知历史加载失败，请检查历史数据文件。");
    }
  }
  async function loadMobilePlans(): Promise<void> {
    if (!advancedEnabled) return;
    const generation = accessGeneration;
    if (!isMobileNotificationRuntime()) {
      if (generation === accessGeneration) {
        mobileStatus = { planCount: 0 };
        mobilePlanLoadError = null;
      }
      return;
    }
    try {
      const planFile = await loadCurrentDeviceMobilePlans();
      const runtime = getMobilePlanRuntimeStatus();
      const plans = Object.values(planFile.plans).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      if (advancedEnabled && generation === accessGeneration) {
        mobileStatus = { ...runtime, planCount: plans.length, nextScheduledAt: plans[0]?.scheduledAt ?? runtime.nextScheduledAt };
        mobilePlanLoadError = null;
      }
    } catch (error) {
      if (advancedEnabled && generation === accessGeneration) {
        mobileStatus = { planCount: 0 };
        mobilePlanLoadError = errorMessage(error, "移动计划加载失败，请检查当前设备计划文件。");
      }
    }
  }
  function clearPageDrafts(): void {
    accessGeneration += 1;
    settings = structuredClone(DEFAULT_NOTIFICATION_CENTER_SETTINGS);
    history = [];
    mobileStatus = { planCount: 0 };
    loadingSettings = false;
    saving = false;
    settingsLoadError = null;
    historyLoadError = null;
    mobilePlanLoadError = null;
  }
  async function reload(): Promise<void> {
    if (!advancedEnabled) return;
    const generation = ++accessGeneration;
    settingsLoadError = null;
    loadingSettings = true;
    try {
      const loaded = await loadNotificationCenterSettings();
      if (advancedEnabled && generation === accessGeneration) settings = loaded;
    } catch (error) {
      if (advancedEnabled && generation === accessGeneration) settingsLoadError = errorMessage(error, "通知中心设置加载失败，请检查设置数据文件。");
    } finally {
      if (generation === accessGeneration) loadingSettings = false;
    }
    if (!advancedEnabled || generation !== accessGeneration) return;
    await refreshHistory();
    if (!advancedEnabled || generation !== accessGeneration) return;
    await loadMobilePlans();
  }
  async function save(): Promise<boolean> { saving = true; try { const saved = await saveNotificationCenterSettings(settings); if (advancedEnabled) settings = saved; showMessage("通知中心设置已保存。"); return true; } catch (error) { showMessage(error instanceof Error ? error.message : "通知中心设置保存失败。", 5000, "error"); return false; } finally { saving = false; } }
  async function test(kind: "desktop" | "mobile" | "external", channelId?: string): Promise<void> { if (!await save()) return; const result = kind === "desktop" ? await notificationCenter.testDesktop() : kind === "mobile" ? await notificationCenter.testMobile() : await notificationCenter.testExternalChannel(channelId ?? ""); showMessage(result.ok ? "测试通知已发送。" : (result.errors[0]?.message ?? "测试通知失败。"), 5000, result.ok ? "info" : "error"); }
  async function reconcile(): Promise<void> { try { mobileStatus = await notificationCenter.reconcileMobilePlans(); mobilePlanLoadError = null; showMessage("移动通知计划已完成对账。"); } catch (error) { mobileStatus = getMobilePlanRuntimeStatus(); mobilePlanLoadError = errorMessage(error, "计划对账失败。"); showMessage(mobilePlanLoadError, 5000, "error"); } }
  async function clearPlans(): Promise<void> { try { mobileStatus = await notificationCenter.clearCurrentDeviceMobilePlans(); mobilePlanLoadError = null; showMessage("当前设备移动通知计划已清理。"); } catch (error) { mobilePlanLoadError = errorMessage(error, "计划清理失败。"); showMessage(mobilePlanLoadError, 5000, "error"); } }
  onMount(() => {
    const handleHistoryChanged = () => { if (advancedEnabled) void refreshHistory(); };
    const refreshMobile = () => { if (advancedEnabled && isMobileNotificationRuntime()) mobileStatus = getMobilePlanRuntimeStatus(); };
    window.addEventListener(NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT, handleHistoryChanged);
    window.addEventListener(NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT, refreshMobile);
    return () => {
      window.removeEventListener(NOTIFICATION_CENTER_HISTORY_CHANGED_EVENT, handleHistoryChanged);
      window.removeEventListener(NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT, refreshMobile);
    };
  });
  $effect(() => {
    if (advancedEnabled) untrack(() => void reload());
    else untrack(clearPageDrafts);
  });
</script>

<div class="shp-notification-page">
  {#if !advancedEnabled}
    <SettingSection title="通知中心状态">
      <SettingRow title="VIP 专属功能" description="通知设置、规则、历史和移动计划数据均会原样保留">
        <span class="shp-notification-status">通知中心为 VIP 专属功能，请在会员服务中开通后使用。</span>
      </SettingRow>
    </SettingSection>
  {:else}
  <div class="shp-notification-page-header"><div><h2>通知中心</h2><p>统一管理桌面端、移动端和外联通知链路。具体内容、时间和规则在任务、纪念日、强化日记等对应功能中设置。</p></div><button type="button" class="b3-button b3-button--text" {disabled} onclick={save}>{saving ? "保存中…" : "保存设置"}</button></div>
  {#if settingsLoadError || getNotificationCenterMigrationError()}
    <SettingSection title="通知中心状态">
      {#if settingsLoadError}<SettingRow title="设置加载失败" description="通知中心设置未被覆盖"><span class="shp-notification-error">{settingsLoadError}</span></SettingRow>{/if}
      {#if getNotificationCenterMigrationError()}<SettingRow title="迁移失败" description="旧设置未被自动覆盖"><span class="shp-notification-error">{getNotificationCenterMigrationError()}</span></SettingRow>{/if}
    </SettingSection>
  {/if}
  <DesktopNotificationSettings value={settings.desktop} {disabled} onChange={(desktop) => settings = { ...settings, desktop }} onTest={() => test("desktop")} />
  <MobileNotificationSettings value={settings.mobile} status={mobileStatus} error={mobilePlanLoadError} {disabled} onChange={(mobile) => settings = { ...settings, mobile }} onTest={() => void test("mobile")} onReconcile={() => void reconcile()} onClear={() => void clearPlans()} />
  <ExternalNotificationSettings value={settings.external} {disabled} onChange={(external) => settings = { ...settings, external }} onTest={(id) => void test("external", id)} />
  <NotificationDeliveryHistory records={history} error={historyLoadError} />
  {/if}
</div>

<style>
  .shp-notification-page { display: grid; gap: 16px; padding: 4px; }
  .shp-notification-page-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .shp-notification-page-header h2, .shp-notification-page-header p { margin: 0; }
  .shp-notification-page-header p, .shp-notification-status { color: var(--b3-theme-on-surface); font-size: 12px; line-height: 1.5; }
  .shp-notification-error { color: var(--b3-theme-error); font-size: 12px; line-height: 1.5; }
  @media (max-width: 700px) { .shp-notification-page-header { align-items: flex-start; flex-direction: column; } }
</style>
