import { cancelMobileLocalNotification, sendMobileLocalNotification } from "@/api";
import type { NotificationEvent } from "../types";

const CHANNEL = "siyuan-homepage";

export function sendMobileNotificationNow(event: NotificationEvent, timeoutType: "default" | "never"): Promise<number> {
  return sendMobileLocalNotification({ channel: CHANNEL, title: event.title, body: event.content, delayInSeconds: 0, timeoutType });
}

export function scheduleMobileNotification(event: NotificationEvent, scheduledAt: string, timeoutType: "default" | "never"): Promise<number> {
  return sendMobileLocalNotification({ channel: CHANNEL, title: event.title, body: event.content, scheduledAt, timeoutType });
}

export function cancelScheduledMobileNotification(notificationId: number): void {
  cancelMobileLocalNotification(notificationId);
}

