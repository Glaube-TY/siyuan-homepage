import type { AdvanceEventMatch, UpcomingEventMatch } from "./countdown-notify-rules";
import type { CountdownEventRecord } from "@/components/utils/widgetBlock/widget/countdown/countdownData";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function renderTodayEventContent(event: CountdownEventRecord): string {
  const dateStr = formatDate(event.date);
  if (event.anniversary) {
    return `${event.name} — ${dateStr}（周年纪念）`;
  }
  return `${event.name} — ${dateStr}`;
}

export function renderAdvanceEventContent(match: AdvanceEventMatch): string {
  const dateStr = formatDate(match.event.date);
  const suffix = match.event.anniversary ? "（周年纪念）" : "";
  return `${match.event.name} — 还有 ${match.daysLeft} 天，日期 ${dateStr}${suffix}`;
}

export function renderUpcomingDigestContent(
  matches: UpcomingEventMatch[],
  maxEvents: number,
): string {
  const lines: string[] = [];
  const show = matches.slice(0, maxEvents);
  for (const m of show) {
    const label = m.daysLeft === 0 ? "今天" : `还有 ${m.daysLeft} 天`;
    const suffix = m.event.anniversary ? "（周年）" : "";
    lines.push(`• ${m.event.name}：${label}，日期 ${formatDate(m.event.date)}${suffix}`);
  }
  const remaining = matches.length - show.length;
  if (remaining > 0) {
    lines.push(`还有 ${remaining} 个事件未展示，请回到思源查看。`);
  }
  return `共 ${matches.length} 个事件：\n${lines.join("\n")}`;
}
