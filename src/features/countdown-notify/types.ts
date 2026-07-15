import type {
  CountdownEventKind,
  CountdownPriority,
} from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
import type { NotificationDeliveryTarget } from "@/features/notification-center/types";

export type CountdownNotifyRuleType =
  | "today_events"
  | "advance_events"
  | "upcoming_digest";
export interface CountdownNotifyRuleScope {
  categoryIds: string[];
  tags: string[];
  kinds: CountdownEventKind[];
  priorities: CountdownPriority[];
  eventIds: string[];
}
export interface CountdownNotifyRule {
  id: string;
  enabled: boolean;
  type: CountdownNotifyRuleType;
  title: string;
  time?: string;
  advanceDays?: number[];
  upcomingDays?: number;
  deliveryTargets: NotificationDeliveryTarget[];
  scope: CountdownNotifyRuleScope;
}
export interface CountdownEventNotifyOverride {
  eventId: string;
  mode: "inherit" | "mute" | "custom";
  remindOnDay: boolean;
  advanceDays: number[];
  time: string;
  deliveryTargets: NotificationDeliveryTarget[];
  includeInDigest: boolean;
}
export interface CountdownNotifySettings {
  version: 4;
  enabled: boolean;
  scanIntervalMs: number;
  catchUpWindowMinutes: number;
  maxEventsPerMessage: number;
  rules: CountdownNotifyRule[];
  eventOverrides: CountdownEventNotifyOverride[];
}
export interface CountdownNotifyHistory {
  version: 1;
  sentKeys: Record<string, string>;
}
export const EMPTY_COUNTDOWN_NOTIFY_SCOPE: CountdownNotifyRuleScope = {
  categoryIds: [],
  tags: [],
  kinds: [],
  priorities: [],
  eventIds: [],
};
export function createCountdownNotifyRule(
  type: CountdownNotifyRuleType,
): CountdownNotifyRule {
  const singletonIds: Record<string, string> = {
    today_events: "countdown-today-events",
  };
  const defaults = {
    today_events: { title: "今日事件提醒", time: "08:00" },
    advance_events: {
      title: "提前 N 天提醒",
      time: "08:00",
      advanceDays: [1, 3, 7],
    },
    upcoming_digest: { title: "未来 N 天摘要", time: "08:00", upcomingDays: 7 },
  } as const;
  const value = defaults[type];
  return {
    id:
      singletonIds[type] ??
      `countdown-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    type,
    title: value.title,
    time: value.time,
    advanceDays: "advanceDays" in value ? [...value.advanceDays] : undefined,
    upcomingDays: "upcomingDays" in value ? value.upcomingDays : undefined,
    deliveryTargets: [],
    scope: structuredClone(EMPTY_COUNTDOWN_NOTIFY_SCOPE),
  };
}
