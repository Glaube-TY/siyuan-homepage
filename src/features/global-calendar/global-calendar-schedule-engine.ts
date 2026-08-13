import {
  addCalendarDays,
  formatCalendarDate,
  parseCalendarDate,
  type GlobalCalendarSchedule,
} from "./global-calendar-types";

export function getScheduleOccurrenceDates(
  schedule: GlobalCalendarSchedule,
  start: Date,
  end: Date,
): string[] {
  const dates: string[] = [];
  for (
    let date = formatCalendarDate(start), last = formatCalendarDate(end);
    date <= last;
    date = addCalendarDays(date, 1)
  ) {
    if (date < schedule.date) continue;
    if (schedule.recurrence.kind !== "none" && schedule.recurrence.until && date > schedule.recurrence.until) continue;
    if (schedule.recurrence.kind === "none") {
      if (date <= (schedule.endDate || schedule.date)) dates.push(date);
    } else if (schedule.recurrence.kind === "daily") {
      dates.push(date);
    } else {
      const parsed = parseCalendarDate(date);
      if (parsed && schedule.recurrence.weekdays.includes(parsed.getDay())) dates.push(date);
    }
  }
  return dates;
}
