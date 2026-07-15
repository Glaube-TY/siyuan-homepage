import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadEnhancedDiaryNotifySettings } from "./enhanced-diary-notify-settings-store";
import { runEnhancedDiaryNotifyScan } from "./enhanced-diary-notify-service";

let timer: number | null = null;
let started = false;
let running = false;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number }> {
  if (!isNotificationCenterFeatureAvailable()) return { ok: false, intervalMs: 60000 };
  let diarySettings: Awaited<ReturnType<typeof loadEnhancedDiaryNotifySettings>>;
  try {
    diarySettings = await loadEnhancedDiaryNotifySettings();
  } catch {
    return { ok: false, intervalMs: 60000 };
  }
  const enabledRules = diarySettings.rules.filter((rule) => rule.enabled && rule.deliveryTargets.length > 0);
  return {
    ok: diarySettings.enabled && enabledRules.length > 0 && await hasResolvableTargetsForCurrentRuntime(enabledRules.flatMap((rule) => rule.deliveryTargets)),
    intervalMs: diarySettings.scanIntervalMs,
  };
}

async function scanOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const runState = await shouldRun();
    if (!runState.ok) {
      stopEnhancedDiaryNotifyScheduler();
      return;
    }
    const settings = await loadEnhancedDiaryNotifySettings();
    await runEnhancedDiaryNotifyScan(settings);
  } finally {
    running = false;
  }
}

async function reconcileScheduler(): Promise<void> {
  const runState = await shouldRun();
  if (!runState.ok) {
    stopEnhancedDiaryNotifyScheduler();
    return;
  }
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => { void scanOnce().catch((error) => console.error("[enhanced-diary-notify] scan failed", error)); }, runState.intervalMs);
  void scanOnce().catch((error) => console.error("[enhanced-diary-notify] scan failed", error));
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
