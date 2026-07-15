import { hasResolvableTargetsForCurrentRuntime, isNotificationCenterFeatureAvailable, NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT } from "@/features/notification-center";
import { REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT } from "./constants";
import { runReviewNotifyScan } from "./review-notify-service";
import { loadReviewNotifySettings } from "./review-notify-settings-store";

let timer: number | null = null;
let started = false;
let running = false;

async function shouldRun(): Promise<{ ok: boolean; intervalMs: number }> {
  if (!isNotificationCenterFeatureAvailable()) return { ok: false, intervalMs: 60000 };
  let settings: Awaited<ReturnType<typeof loadReviewNotifySettings>>;
  try {
    settings = await loadReviewNotifySettings();
  } catch {
    return { ok: false, intervalMs: 60000 };
  }
  const enabledRules = settings.rules.filter((rule) => rule.enabled && rule.deliveryTargets.length > 0);
  return {
    ok: settings.enabled && enabledRules.length > 0 && await hasResolvableTargetsForCurrentRuntime(enabledRules.flatMap((rule) => rule.deliveryTargets)),
    intervalMs: settings.scanIntervalMs,
  };
}

async function scanOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const runState = await shouldRun();
    if (!runState.ok) {
      stopReviewNotifyScheduler();
      return;
    }
    await runReviewNotifyScan(await loadReviewNotifySettings());
  } finally {
    running = false;
  }
}

async function reconcileScheduler(): Promise<void> {
  const runState = await shouldRun();
  if (!runState.ok) {
    stopReviewNotifyScheduler();
    return;
  }
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => { void scanOnce().catch(() => undefined); }, runState.intervalMs);
  void scanOnce().catch(() => undefined);
}

function handleSchedulerSignal(): void {
  void reconcileScheduler().catch(() => stopReviewNotifyScheduler());
}

export function startReviewNotifyScheduler(): void {
  if (started) {
    handleSchedulerSignal();
    return;
  }
  started = true;
  window.addEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.addEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.addEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.addEventListener(REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  handleSchedulerSignal();
}

export function stopReviewNotifyScheduler(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

export function destroyReviewNotifyScheduler(): void {
  stopReviewNotifyScheduler();
  if (!started) return;
  started = false;
  window.removeEventListener("homepage-advanced-ready", handleSchedulerSignal);
  window.removeEventListener("homepage-advanced-unavailable", handleSchedulerSignal);
  window.removeEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
  window.removeEventListener(REVIEW_NOTIFY_SETTINGS_CHANGED_EVENT, handleSchedulerSignal);
}
