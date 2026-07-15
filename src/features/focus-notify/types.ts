import type { NotificationDeliveryTarget } from "@/features/notification-center/types";

export type FocusNotifyRuleType = "focus_completed" | "break_completed";

export interface FocusNotifyRule {
  id: string;
  type: FocusNotifyRuleType;
  enabled: boolean;
  title: string;
  deliveryTargets: NotificationDeliveryTarget[];
}

export interface FocusNotifySettings {
  version: 1;
  enabled: boolean;
  rules: FocusNotifyRule[];
}

export interface FocusCompletedNotificationInput {
  sessionId: string;
  plannedSeconds: number;
  actualFocusSeconds: number;
}

export interface BreakCompletedNotificationInput {
  cycleId: string;
  breakSeconds: number;
}
