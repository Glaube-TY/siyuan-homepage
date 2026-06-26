import { isNotifyBridgePremiumAvailable, loadNotifyBridgeSettings } from "@/features/notify-bridge";
import { ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadEnhancedDiaryNotifySettings } from "./enhanced-diary-notify-settings-store";
import { runEnhancedDiaryNotifyScan } from "./enhanced-diary-notify-service";

let timer: number | null = null;
let started = false;
let running = false;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number }> {
  if (!isNotifyBridgePremiumAvailable()) return { ok: false, intervalMs: 60000 };
  const [notifySettings, diarySettings] = await Promise.all([
    loadNotifyBridgeSettings(),
    loadEnhancedDiaryNotifySettings(),
  ]);
  return {
    ok: notifySettings.enabled && diarySettings.enabled && diarySettings.rules.some((r) => r.enabled),
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
  timer = window.setInterval(() => { void scanOnce(); }, runState.intervalMs);
  void scanOnce();
}

function handleSchedulerSignal(): void {
  void reconcileScheduler();
}

export function startEnhancedDiaryNotifyScheduler(): void {
  if (started) {
    void reconcileScheduler();
    return;
  }
  started = true;
  window.addEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.addEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.addEventListener("notify-bridge-settings-changed", handleSchedulerSignal);
  window.addEventListener(ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  void reconcileScheduler();
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
  window.removeEventListener("notify-bridge-settings-changed", handleSchedulerSignal);
  window.removeEventListener(ENHANCED_DIARY_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
}
