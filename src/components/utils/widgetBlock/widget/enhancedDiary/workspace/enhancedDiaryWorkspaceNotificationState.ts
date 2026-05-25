import type { EnhancedDiaryWorkspaceNotification } from "./enhancedDiaryWorkspaceNotifications";

let snoozedIds: string[] = [];

export function loadSnoozedNotificationIds(): string[] {
    return [...snoozedIds];
}

export function saveSnoozedNotificationIds(ids: string[]): void {
    snoozedIds = Array.from(new Set(ids));
}

export function getUnhandledNotificationCount(notifications: EnhancedDiaryWorkspaceNotification[]): number {
    const snoozedSet = new Set(snoozedIds);
    return notifications.filter((item) => !snoozedSet.has(item.id)).length;
}
