import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadCountdownNotifySettings } from "./countdown-notify-settings-store";
import { runCountdownNotifyScan } from "./countdown-notify-service";

let timer: number | null = null;
let started = false;
let running = false;
type CountdownNotifySettings = Awaited<ReturnType<typeof loadCountdownNotifySettings>>;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number; settings: CountdownNotifySettings | null }> {
  if (!isNotificationCenterFeatureAvailable()) return { ok: false, intervalMs: 60000, settings: null };
  let countdownSettings: CountdownNotifySettings;
  try {
    countdownSettings = await loadCountdownNotifySettings();
  } catch {
    return { ok: false, intervalMs: 60000, settings: null };
  }
  const enabledRules = countdownSettings.rules.filter((rule) => rule.enabled && rule.deliveryTargets.length > 0);
  const activeCustomOverrides = countdownSettings.eventOverrides.filter(
    (override) =>
      override.mode === "custom" &&
      override.deliveryTargets.length > 0 &&
      (override.remindOnDay ||
        override.advanceDays.some(
          (day) => Number.isInteger(day) && day > 0,
        )),
  );
  const deliveryTargets = [
    ...enabledRules.flatMap((rule) => rule.deliveryTargets),
    ...activeCustomOverrides.flatMap(
      (override) => override.deliveryTargets,
    ),
  ];
  return {
    ok:
      countdownSettings.enabled &&
      deliveryTargets.length > 0 &&
      (await hasResolvableTargetsForCurrentRuntime(deliveryTargets)),
    intervalMs: countdownSettings.scanIntervalMs,
    settings: countdownSettings,
  };
}

async function scanOnce(settings?: CountdownNotifySettings): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!settings) {
      const runState = await shouldRun();
      if (!runState.ok || !runState.settings) {
        stopCountdownNotifyScheduler();
        return;
      }
      settings = runState.settings;
    }
    await runCountdownNotifyScan(settings);
  } finally {
    running = false;
  }
}

async function reconcileScheduler(): Promise<void> {
  const runState = await shouldRun();
  if (!runState.ok || !runState.settings) {
    stopCountdownNotifyScheduler();
    return;
  }
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => { void scanOnce(); }, runState.intervalMs);
  void scanOnce(runState.settings);
}

function handleSchedulerSignal(): void {
  reconcileScheduler().catch(() => {
    stopCountdownNotifyScheduler();
  });
}

export function startCountdownNotifyScheduler(): void {
  if (started) {
    handleSchedulerSignal();
    return;
  }
  started = true;
  window.addEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.addEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.addEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.addEventListener(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  handleSchedulerSignal();
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
  window.removeEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.removeEventListener(COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
}
