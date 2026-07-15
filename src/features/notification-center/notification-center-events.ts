export const NOTIFICATION_CENTER_BROADCAST_CHANNEL = "siyuan-homepage-notification-center";

export function broadcastNotificationCenterEvent(eventName: string, detail?: unknown): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(NOTIFICATION_CENTER_BROADCAST_CHANNEL);
  channel.postMessage({ eventName, detail });
  window.setTimeout(() => channel.close(), 0);
}

