import {
  formatCountdownOccurrenceDate,
  formatCountdownOriginalDate,
  resolveCountdownOccurrence,
} from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
import {
  DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
  type CountdownDisplayPreferences,
  type CountdownEventRecord,
} from "@/components/utils/widgetBlock/widget/countdown/countdownTypes";
import type {
  AdvanceEventMatch,
  UpcomingEventMatch,
} from "./countdown-notify-rules";

function suffix(event: CountdownEventRecord): string {
  return event.kind === "birthday"
    ? "（生日）"
    : event.kind === "anniversary"
      ? "（周年纪念）"
      : "";
}
export function renderTodayEventContent(
  event: CountdownEventRecord,
  now = new Date(),
  preferences: CountdownDisplayPreferences =
    DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
): string {
  const occurrence = resolveCountdownOccurrence(event, now);
  const date = occurrence
    ? formatCountdownOccurrenceDate(occurrence, preferences)
    : formatCountdownOriginalDate(event, preferences);
  return `${event.name} — ${date}${suffix(event)}`;
}
export function renderAdvanceEventContent(
  match: AdvanceEventMatch,
  preferences: CountdownDisplayPreferences =
    DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
): string {
  return `${match.event.name} — 还有 ${match.daysLeft} 天，日期 ${formatCountdownOccurrenceDate(match.occurrence, preferences)}${suffix(match.event)}`;
}
export function renderUpcomingDigestContent(
  matches: UpcomingEventMatch[],
  maxEvents: number,
  preferences: CountdownDisplayPreferences =
    DEFAULT_COUNTDOWN_DISPLAY_PREFERENCES,
): string {
  const shown = matches.slice(0, maxEvents);
  const lines = shown.map(
    (match) =>
      `• ${match.event.name}：${match.daysLeft === 0 ? "今天" : `还有 ${match.daysLeft} 天`}，日期 ${formatCountdownOccurrenceDate(match.occurrence, preferences)}${suffix(match.event)}`,
  );
  const remaining = matches.length - shown.length;
  if (remaining > 0)
    lines.push(`还有 ${remaining} 个事件未展示，请回到思源查看。`);
  return `共 ${matches.length} 个事件：\n${lines.join("\n")}`;
}
