<script lang="ts">
  import { onMount } from "svelte";
  import { showMessage } from "siyuan";
  import { confirmDialogBoolean, safeConfirmContent } from "@/libs/dialog";
  import {
    DEFAULT_NOTIFICATION_CENTER_SETTINGS,
    NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT,
    NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT,
    getMobilePlanRuntimeStatus,
    loadCurrentDeviceMobilePlans,
    loadNotificationCenterSettings,
    notificationCenter,
    updateNotificationCenterMobileSettings,
  } from "@/features/notification-center";
  import type { MobilePlanRuntimeStatus, NotificationCenterSettings } from "../types";
  import MobileNotificationSettingsMobile from "./MobileNotificationSettingsMobile.svelte";

  let mobile = $state<NotificationCenterSettings["mobile"]>(structuredClone(DEFAULT_NOTIFICATION_CENTER_SETTINGS.mobile));
  let lastSavedMobile = $state<NotificationCenterSettings["mobile"] | null>(null);
  let mobileStatus = $state<MobilePlanRuntimeStatus>({ planCount: 0 });
  let notificationLoading = $state(true);
  let notificationSaving = $state(false);
  let notificationLoadError = $state<string | null>(null);
  let notificationSaveError = $state<string | null>(null);
  let mobilePlanFileError = $state<string | null>(null);
  let mobileReconcileError = $state<string | null>(null);
  let pendingMobileSettings: NotificationCenterSettings["mobile"] | null = null;
  let mobileSavePromise: Promise<void> | null = null;
  let settingsReloadRequested = false;

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function statusFromPlans(plans: Awaited<ReturnType<typeof loadCurrentDeviceMobilePlans>>): MobilePlanRuntimeStatus {
    const runtime = getMobilePlanRuntimeStatus();
    const records = Object.values(plans.plans).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return {
      ...runtime,
      planCount: records.length,
      nextScheduledAt: records[0]?.scheduledAt,
    };
  }

  function hasUnsavedMobileDraft(): boolean {
    return lastSavedMobile !== null && JSON.stringify(mobile) !== JSON.stringify(lastSavedMobile);
  }

  async function reloadMobileSettings(protectDraft = false): Promise<boolean> {
    try {
      const settings = await loadNotificationCenterSettings();
      if (protectDraft && (notificationSaving || pendingMobileSettings || hasUnsavedMobileDraft())) {
        settingsReloadRequested = true;
        return false;
      }
      mobile = structuredClone(settings.mobile);
      lastSavedMobile = structuredClone(settings.mobile);
      notificationLoadError = null;
      return true;
    } catch (error) {
      notificationLoadError = errorMessage(error, "移动通知设置加载失败，请检查通知中心设置文件。");
      return false;
    }
  }

  async function reloadMobilePlans(): Promise<void> {
    try {
      mobileStatus = statusFromPlans(await loadCurrentDeviceMobilePlans());
      mobilePlanFileError = null;
    } catch (error) {
      mobileStatus = { planCount: 0 };
      mobilePlanFileError = errorMessage(error, "当前设备移动计划加载失败。");
    }
  }

  async function handleMobileRuntimeFailure(error: unknown, fallback: string): Promise<string> {
    const message = errorMessage(error, fallback);
    await reloadMobilePlans();
    mobileReconcileError = mobilePlanFileError ? null : message;
    return message;
  }

  async function loadNotificationPage(): Promise<void> {
    notificationLoading = true;
    await reloadMobileSettings();
    await reloadMobilePlans();
    notificationLoading = false;
  }

  async function drainMobileSettingsSaves(): Promise<void> {
    notificationSaving = true;
    notificationSaveError = null;
    while (true) {
      while (pendingMobileSettings) {
        const next = pendingMobileSettings;
        pendingMobileSettings = null;
        try {
          const saved = await updateNotificationCenterMobileSettings(next);
          lastSavedMobile = structuredClone(saved);
          if (!pendingMobileSettings) mobile = structuredClone(saved);
        } catch (error) {
          pendingMobileSettings = null;
          if (lastSavedMobile) mobile = structuredClone(lastSavedMobile);
          notificationSaveError = errorMessage(error, "移动通知设置保存失败，已恢复上次成功保存的设置。");
          showMessage(notificationSaveError, 5000, "error");
          return;
        }
      }

      try {
        mobileStatus = await notificationCenter.reconcileMobilePlans();
        mobileReconcileError = mobileStatus.lastError ?? null;
      } catch (error) {
        showMessage(await handleMobileRuntimeFailure(error, "移动通知计划对账失败。"), 5000, "error");
      }
      if (!pendingMobileSettings) return;
    }
  }

  function saveMobile(next: NotificationCenterSettings["mobile"]): void {
    if (notificationLoadError || !lastSavedMobile) return;
    pendingMobileSettings = structuredClone(next);
    if (mobileSavePromise) return;
    mobileSavePromise = drainMobileSettingsSaves().finally(() => {
      notificationSaving = false;
      mobileSavePromise = null;
      if (settingsReloadRequested) {
        settingsReloadRequested = false;
        void reloadMobileSettings(true);
      }
    });
  }

  function handleSettingsChanged(): void {
    if (notificationSaving || pendingMobileSettings || hasUnsavedMobileDraft()) {
      settingsReloadRequested = true;
      return;
    }
    void reloadMobileSettings(true);
  }

  async function testMobile(): Promise<void> {
    if (!lastSavedMobile?.enabled) {
      showMessage("请先开启并保存移动通知。", 3000, "error");
      return;
    }
    const result = await notificationCenter.testMobile();
    if (result.ok) {
      showMessage("测试移动通知已发送。");
      return;
    }
    showMessage(result.errors[0]?.message ?? "测试移动通知失败。", 5000, "error");
  }

  async function rebuildPlans(): Promise<void> {
    try {
      mobileStatus = await notificationCenter.rebuildCurrentDeviceMobilePlans();
      mobileReconcileError = mobileStatus.lastError ?? null;
      const nextText = mobileStatus.nextScheduledAt
        ? new Date(mobileStatus.nextScheduledAt).toLocaleString()
        : "无";
      showMessage(`已重新生成 ${mobileStatus.planCount} 条计划，下一条：${nextText}`);
    } catch (error) {
      showMessage(await handleMobileRuntimeFailure(error, "移动通知计划重新生成失败。"), 5000, "error");
    }
  }

  async function clearPlans(): Promise<void> {
    const confirmed = await confirmDialogBoolean({
      title: "清理移动通知计划",
      content: safeConfirmContent("清理当前设备已登记的通知计划；移动通知保持开启时，后续自动对账可能重新生成。"),
      width: "min(420px, calc(100vw - 32px))",
    });
    if (!confirmed) return;
    try {
      mobileStatus = await notificationCenter.clearCurrentDeviceMobilePlans();
      mobilePlanFileError = null;
      mobileReconcileError = mobileStatus.lastError ?? null;
      const result = mobileStatus.lastClearResult;
      showMessage(result
        ? `已清理 ${result.clearedCount} 条计划，失败保留 ${result.retainedFailureCount} 条。`
        : "当前设备移动通知计划已清理。");
    } catch (error) {
      showMessage(await handleMobileRuntimeFailure(error, "当前设备移动通知计划清理失败。"), 5000, "error");
    }
  }

  onMount(() => {
    const handlePlansChanged = () => { void reloadMobilePlans(); };
    window.addEventListener(NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT, handlePlansChanged);
    window.addEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    void loadNotificationPage();
    return () => {
      window.removeEventListener(NOTIFICATION_CENTER_MOBILE_PLANS_CHANGED_EVENT, handlePlansChanged);
      window.removeEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    };
  });
</script>

<div class="shp-mobile-notification-page">
  {#if notificationLoading}
    <div class="shp-mobile-notification-state">通知设置加载中...</div>
  {:else if notificationLoadError}
    <div class="shp-mobile-notification-state shp-mobile-notification-state--error">
      <p>{notificationLoadError}</p>
      <button type="button" class="b3-button b3-button--text" onclick={() => void loadNotificationPage()}>重新加载</button>
    </div>
  {:else}
    {#if notificationSaveError}
      <div class="shp-mobile-notification-error">{notificationSaveError}</div>
    {/if}
    <MobileNotificationSettingsMobile
      value={mobile}
      status={mobileStatus}
      error={mobilePlanFileError}
      reconcileError={mobileReconcileError}
      disabled={notificationSaving}
      planActionsDisabled={mobilePlanFileError !== null}
      onChange={(value) => mobile = value}
      onCommit={saveMobile}
      onTest={() => void testMobile()}
      onReconcile={() => void rebuildPlans()}
      onClear={() => void clearPlans()}
    />
  {/if}
</div>

<style>
  .shp-mobile-notification-page {
    min-width: 0;
    min-height: 100%;
    padding: 14px max(14px, env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
    box-sizing: border-box;
    overflow: auto;
    color: var(--b3-theme-on-background);
    background: var(--b3-theme-background);
  }

  .shp-mobile-notification-state {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--b3-theme-on-surface-light);
    text-align: center;
  }

  .shp-mobile-notification-state p {
    margin: 0;
    line-height: 1.6;
  }

  .shp-mobile-notification-state--error,
  .shp-mobile-notification-error {
    color: var(--b3-theme-error);
  }

  .shp-mobile-notification-error {
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--b3-theme-surface);
    line-height: 1.5;
  }

  .shp-mobile-notification-state .b3-button { min-height: 44px; }
</style>
