export type CountdownNotifyRuleType =
  | "today_events"
  | "advance_events"
  | "upcoming_digest";

export interface CountdownNotifyRule {
  id: string;
  enabled: boolean;
  type: CountdownNotifyRuleType;
  title: string;
  time?: string; // HH:mm
  advanceDays?: number[]; // [1, 3, 7] etc.
  upcomingDays?: number; // e.g. 7 or 30
  channelIds?: string[];
}

export interface CountdownNotifySettings {
  version: 1;
  enabled: boolean;
  databaseId: string;
  scanIntervalMs: number;
  catchUpWindowMinutes: number;
  maxEventsPerMessage: number;
  rules: CountdownNotifyRule[];
}

export interface CountdownNotifyHistory {
  version: 1;
  sentKeys: Record<string, string>;
}

export function createCountdownNotifyRule(type: CountdownNotifyRuleType): CountdownNotifyRule {
  const singletonIds: Record<string, string> = {
    today_events: "countdown-today-events",
  };
  const id = singletonIds[type] ?? `countdown-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const defaults: Record<CountdownNotifyRuleType, { title: string; time?: string; advanceDays?: number[]; upcomingDays?: number }> = {
    today_events: { title: "今日事件提醒", time: "08:00" },
    advance_events: { title: "提前 N 天提醒", time: "08:00", advanceDays: [1, 3, 7] },
    upcoming_digest: { title: "未来 N 天摘要", time: "08:00", upcomingDays: 7 },
  };
  const d = defaults[type];
  return {
    id,
    enabled: true,
    type,
    title: d.title,
    time: d.time,
    advanceDays: d.advanceDays,
    upcomingDays: d.upcomingDays,
    channelIds: undefined,
  };
}
