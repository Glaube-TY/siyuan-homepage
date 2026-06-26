import { isNotifyBridgePremiumAvailable, loadNotifyBridgeSettings } from "@/features/notify-bridge";
import { COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadCountdownNotifySettings } from "./countdown-notify-settings-store";
import { runCountdownNotifyScan } from "./countdown-notify-service";

let timer: number | null = null;
let started = false;
let running = false;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number }> {
  if (!isNotifyBridgePremiumAvailable()) return { ok: false, intervalMs: 60000 };
  const [notifySettings, countdownSettings] = await Promise.all([
    loadNotifyBridgeSettings(),
    loadCountdownNotifySettings(),
  ]);
  return {
    ok: notifySettings.enabled && countdownSettings.enabled && countdownSettings.rules.some((r) => r.enabled),
    intervalMs: countdownSettings.scanIntervalMs,
  };
}

async function scanOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const runState = await shouldRun();
    if (!runState.ok) {
      stopCountdownNotifyScheduler();
      return;
    }
    const settings = await loadCountdownNotifySettings();
    await runCountdownNotifyScan(settings);
  } finally {
    running = false;
  }
}

async function reconcileScheduler(): Promise<void> {
  const runState = await shouldRun();
  if (!runState.ok) {
    stopCountdownNotifyScheduler();
    return;
  }
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => { void scanOnce(); }, runState.intervalMs);
  void scanOnce();
}

function handleSchedulerSignal(): void {
  void reconcileScheduler();
}

export function startCountdownNotifyScheduler(): void {
  if (started) {
    void reconcileScheduler();
    return;
  }
  started = true;
  window.addEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.addEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.addEventListener("notify-bridge-settings-changed", handleSchedulerSignal);
  window.addEventListener(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  void reconcileScheduler();
}

export function stopCountdownNotifyScheduler(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function destroyCountdownNotifyScheduler(): void {
  stopCountdownNotifyScheduler();
  if (!started) return;
  started = false;
  window.removeEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.removeEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.removeEventListener("notify-bridge-settings-changed", handleSchedulerSignal);
  window.removeEventListener(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
}
