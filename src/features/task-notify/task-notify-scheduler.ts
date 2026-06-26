import { isNotifyBridgePremiumAvailable, loadNotifyBridgeSettings } from "@/features/notify-bridge";
import { TASK_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadTaskNotifySettings } from "./task-notify-settings-store";
import { runTaskNotifyScan } from "./task-notify-service";

let timer: number | null = null;
let started = false;
let running = false;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number }> {
  if (!isNotifyBridgePremiumAvailable()) return { ok: false, intervalMs: 60000 };
  const [notifySettings, taskSettings] = await Promise.all([
    loadNotifyBridgeSettings(),
    loadTaskNotifySettings(),
  ]);
  return {
    ok: notifySettings.enabled && taskSettings.enabled && taskSettings.rules.some((r) => r.enabled),
    intervalMs: taskSettings.scanIntervalMs,
  };
}

async function scanOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const runState = await shouldRun();
    if (!runState.ok) {
      stopTaskNotifyScheduler();
      return;
    }
    const settings = await loadTaskNotifySettings();
    await runTaskNotifyScan(settings);
  } finally {
    running = false;
  }
}

async function reconcileScheduler(): Promise<void> {
  const runState = await shouldRun();
  if (!runState.ok) {
    stopTaskNotifyScheduler();
    return;
  }
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => { void scanOnce(); }, runState.intervalMs);
  void scanOnce();
}

function handleSchedulerSignal(): void {
  void reconcileScheduler();
}

export function startTaskNotifyScheduler(): void {
  if (started) {
    void reconcileScheduler();
    return;
  }
  started = true;
  window.addEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.addEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.addEventListener("notify-bridge-settings-changed", handleSchedulerSignal);
  window.addEventListener(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  void reconcileScheduler();
}

export function stopTaskNotifyScheduler(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function destroyTaskNotifyScheduler(): void {
  stopTaskNotifyScheduler();
  if (!started) return;
  started = false;
  window.removeEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.removeEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.removeEventListener("notify-bridge-settings-changed", handleSchedulerSignal);
  window.removeEventListener(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
}
