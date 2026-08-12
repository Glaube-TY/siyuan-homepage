import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { TASK_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadTaskNotifySettings } from "./task-notify-settings-store";
import { runTaskNotifyScan } from "./task-notify-service";

let timer: number | null = null;
let started = false;
let running = false;
type TaskNotifySettings = Awaited<ReturnType<typeof loadTaskNotifySettings>>;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number; settings: TaskNotifySettings | null }> {
  if (!isNotificationCenterFeatureAvailable()) return { ok: false, intervalMs: 60000, settings: null };
  let taskSettings: TaskNotifySettings;
  try {
    taskSettings = await loadTaskNotifySettings();
  } catch {
    return { ok: false, intervalMs: 60000, settings: null };
  }
  const enabledRules = taskSettings.rules.filter((rule) => rule.enabled && rule.deliveryTargets.length > 0);
  return {
    ok: taskSettings.enabled && enabledRules.length > 0 && await hasResolvableTargetsForCurrentRuntime(enabledRules.flatMap((rule) => rule.deliveryTargets)),
    intervalMs: taskSettings.scanIntervalMs,
    settings: taskSettings,
  };
}

async function scanOnce(settings?: TaskNotifySettings): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!settings) {
      const runState = await shouldRun();
      if (!runState.ok || !runState.settings) {
        stopTaskNotifyScheduler();
        return;
      }
      settings = runState.settings;
    }
    await runTaskNotifyScan(settings);
  } finally {
    running = false;
  }
}

async function reconcileScheduler(): Promise<void> {
  const runState = await shouldRun();
  if (!runState.ok || !runState.settings) {
    stopTaskNotifyScheduler();
    return;
  }
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => { void scanOnce(); }, runState.intervalMs);
  void scanOnce(runState.settings);
}

function handleSchedulerSignal(): void {
  reconcileScheduler().catch(() => {
    stopTaskNotifyScheduler();
  });
}

export function startTaskNotifyScheduler(): void {
  if (started) {
    handleSchedulerSignal();
    return;
  }
  started = true;
  window.addEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.addEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.addEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.addEventListener(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  handleSchedulerSignal();
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
  window.removeEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.removeEventListener(TASK_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
}
