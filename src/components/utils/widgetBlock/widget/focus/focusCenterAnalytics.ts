import type { FocusBindingKind, FocusSessionRecord } from "./focusData";

export interface FocusBindingTotal {
  key: string;
  kind: FocusBindingKind | "unbound";
  title: string;
  seconds: number;
  sessions: number;
}

export function buildFocusCenterAnalytics(sessions: readonly FocusSessionRecord[]) {
  const completed = sessions.filter((session) => session.segmentType === "focus" && session.status === "completed");
  const daily = new Map<string, { seconds: number; sessions: number }>();
  const bindings = new Map<string, FocusBindingTotal>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0, sessions: 0 }));
  let focusSeconds = 0;
  let plannedSeconds = 0;
  for (const session of completed) {
    focusSeconds += session.actualSeconds;
    plannedSeconds += session.plannedSeconds;
    const day = daily.get(session.localDate) ?? { seconds: 0, sessions: 0 };
    day.seconds += session.actualSeconds;
    day.sessions += 1;
    daily.set(session.localDate, day);
    const binding = session.binding;
    const key = binding ? `${binding.kind}:${binding.id}` : "unbound";
    const total = bindings.get(key) ?? { key, kind: binding?.kind ?? "unbound", title: binding?.title ?? "未绑定", seconds: 0, sessions: 0 };
    total.seconds += session.actualSeconds;
    total.sessions += 1;
    bindings.set(key, total);
    const hour = new Date(session.startedAt).getHours();
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) {
      hours[hour].seconds += session.actualSeconds;
      hours[hour].sessions += 1;
    }
  }
  return {
    focusSeconds,
    sessions: completed.length,
    averageSeconds: completed.length ? Math.round(focusSeconds / completed.length) : 0,
    completionRate: plannedSeconds ? Math.min(1, focusSeconds / plannedSeconds) : 0,
    daily: Array.from(daily, ([date, value]) => ({ date, ...value })).sort((a, b) => a.date.localeCompare(b.date)),
    bindings: Array.from(bindings.values()).sort((a, b) => b.seconds - a.seconds),
    hours,
  };
}
