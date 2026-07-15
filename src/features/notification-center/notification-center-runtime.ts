import {
  NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT,
} from "./constants";
import { isMobileNotificationRuntime } from "./notification-center-device";
import {
  cancelPendingMobilePlanRefresh,
  requestMobilePlanRefresh,
  revokeCurrentDeviceMobilePlansForPremiumLoss,
} from "./notification-center-mobile-plan-manager";
import { clearNotificationCenterMemoryCaches } from "./notification-center-service";
import { NOTIFICATION_CENTER_BROADCAST_CHANNEL } from "./notification-center-events";

let started = false;
let interval: number | null = null;
let broadcast: BroadcastChannel | null = null;
type NotificationMembershipState = "unknown" | "ready" | "unavailable";
let membershipState: NotificationMembershipState = "unknown";

function requestMobilePlanAction(reason: string): void {
  if (!isMobileNotificationRuntime()) return;
  if (membershipState === "ready") {
    requestMobilePlanRefresh(reason);
    return;
  }
  if (membershipState === "unavailable") {
    void revokeCurrentDeviceMobilePlansForPremiumLoss().catch((error) => {
      console.warn("[notification-center] 会员失效后的移动计划撤销失败，现有计划记录已保留", error);
    });
  }
}

function handleRefreshEvent(): void {
  requestMobilePlanAction("settings-or-data-changed");
}

function handlePremiumReady(): void {
  membershipState = "ready";
  requestMobilePlanAction("premium-ready");
}

function handlePremiumUnavailable(): void {
  membershipState = "unavailable";
  requestMobilePlanAction("premium-unavailable");
}

function handleVisibility(): void {
  if (document.visibilityState === "visible") requestMobilePlanAction("visible");
}

function handleSharedData(event: Event): void {
  const detail = (event as CustomEvent<{ store?: string }>).detail;
  if (detail?.store === "countdown") requestMobilePlanAction("countdown-data-changed");
}

function handleBroadcast(event: MessageEvent<{ eventName?: string; detail?: unknown }>): void {
  const eventName = event.data?.eventName;
  if (eventName) window.dispatchEvent(new CustomEvent(eventName, { detail: event.data.detail }));
}

export function startNotificationCenterRuntime(): void {
  if (started) return;
  started = true;
  membershipState = "unknown";
  window.addEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleRefreshEvent);
  window.addEventListener("task-notify-settings-changed", handleRefreshEvent);
  window.addEventListener("countdown-notify-settings-changed", handleRefreshEvent);
  window.addEventListener("enhanced-diary-notify-settings-changed", handleRefreshEvent);
  window.addEventListener("review-notify-settings-changed", handleRefreshEvent);
  window.addEventListener("homepage-advanced-ready", handlePremiumReady);
  window.addEventListener("homepage-advanced-unavailable", handlePremiumUnavailable);
  window.addEventListener("siyuan-homepage-shared-widget-data-updated", handleSharedData);
  document.addEventListener("visibilitychange", handleVisibility);
  if (typeof BroadcastChannel !== "undefined") {
    broadcast = new BroadcastChannel(NOTIFICATION_CENTER_BROADCAST_CHANNEL);
    broadcast.addEventListener("message", handleBroadcast);
  }
  if (isMobileNotificationRuntime()) {
    interval = window.setInterval(() => requestMobilePlanAction("periodic"), 5 * 60 * 1000);
  }
}

export function destroyNotificationCenterRuntime(): void {
  cancelPendingMobilePlanRefresh();
  if (interval !== null) window.clearInterval(interval);
  interval = null;
  window.removeEventListener(NOTIFICATION_CENTER_SETTINGS_CHANGED_EVENT, handleRefreshEvent);
  window.removeEventListener("task-notify-settings-changed", handleRefreshEvent);
  window.removeEventListener("countdown-notify-settings-changed", handleRefreshEvent);
  window.removeEventListener("enhanced-diary-notify-settings-changed", handleRefreshEvent);
  window.removeEventListener("review-notify-settings-changed", handleRefreshEvent);
  window.removeEventListener("homepage-advanced-ready", handlePremiumReady);
  window.removeEventListener("homepage-advanced-unavailable", handlePremiumUnavailable);
  window.removeEventListener("siyuan-homepage-shared-widget-data-updated", handleSharedData);
  document.removeEventListener("visibilitychange", handleVisibility);
  broadcast?.close();
  broadcast = null;
  membershipState = "unknown";
  clearNotificationCenterMemoryCaches();
  started = false;
}
