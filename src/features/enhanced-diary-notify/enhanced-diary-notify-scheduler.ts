import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadEnhancedDiaryNotifySettings } from "./enhanced-diary-notify-settings-store";
import { runEnhancedDiaryNotifyScan } from "./enhanced-diary-notify-service";

let timer: number | null = null;
let started = false;
let running = false;
type EnhancedDiaryNotifySettings = Awaited<ReturnType<typeof loadEnhancedDiaryNotifySettings>>;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number; settings: EnhancedDiaryNotifySettings | null }> {
  if (!isNotificationCenterFeatureAvailable()) return { ok: false, intervalMs: 60000, settings: null };
  let diarySettings: EnhancedDiaryNotifySettings;
  try {
    diarySettings = await loadEnhancedDiaryNotifySettings();
  } catch {
    return { ok: false, intervalMs: 60000, settings: null };
  }
  const enabledRules = diarySettings.rules.filter((rule) => rule.enabled && rule.deliveryTargets.length > 0);
  return {
    ok: diarySettings.enabled && enabledRules.length > 0 && await hasResolvableTargetsForCurrentRuntime(enabledRules.flatMap((rule) => rule.deliveryTargets)),
    intervalMs: diarySettings.scanIntervalMs,
    settings: diarySettings,
  };
}

async function scanOnce(settings?: EnhancedDiaryNotifySettings): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!settings) {
      const runState = await shouldRun();
      if (!runState.ok || !runState.settings) {
        stopEnhancedDiaryNotifyScheduler();
        return;
      }
      settings = runState.settings;
    }
    await runEnhancedDiaryNotifyScan(settings);
  } finally {
    running = false;
  }
}

async function reconcileScheduler(): Promise<void> {
  const runState = await shouldRun();
  if (!runState.ok || !runState.settings) {
    stopEnhancedDiaryNotifyScheduler();
    return;
  }
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => { void scanOnce().catch((error) => console.error("[enhanced-diary-notify] scan failed", error)); }, runState.intervalMs);
  void scanOnce(runState.settings).catch((error) => console.error("[enhanced-diary-notify] scan failed", error));
}

function handleSchedulerSignal(): void {
  reconcileScheduler().catch(() => {
    stopEnhancedDiaryNotifyScheduler();
  });
}

export function startEnhancedDiaryNotifyScheduler(): void {
  if (started) {
    handleSchedulerSignal();
    return;
  }
  started = true;
  window.addEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.addEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.addEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.addEventListener(ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  handleSchedulerSignal();
}

export function stopEnhancedDiaryNotifyScheduler(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function destroyEnhancedDiaryNotifyScheduler(): void {
  stopEnhancedDiaryNotifyScheduler();
  if (!started) return;
  started = false;
  window.removeEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.removeEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.removeEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.removeEventListener(ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
}
