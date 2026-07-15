import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { COUNTDOWN_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { loadCountdownNotifySettings } from "./countdown-notify-settings-store";
import { runCountdownNotifyScan } from "./countdown-notify-service";

let timer: number | null = null;
let started = false;
let running = false;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number }> {
  if (!isNotificationCenterFeatureAvailable()) return { ok: false, intervalMs: 60000 };
  let countdownSettings: Awaited<ReturnType<typeof loadCountdownNotifySettings>>;
  try {
    countdownSettings = await loadCountdownNotifySettings();
  } catch {
    return { ok: false, intervalMs: 60000 };
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
