import assert from "node:assert/strict";
import {
  DEFAULT_GLOBAL_CALENDAR_CONFIG,
  formatCalendarDate,
  getCalendarMonthRange,
  normalizeGlobalCalendarConfig,
} from "../src/features/global-calendar/global-calendar-types";
import { getCalendarDateMetadata } from "../src/utils/calendar-metadata";
import { getScheduleOccurrenceDates } from "../src/features/global-calendar/global-calendar-schedule-engine";
import type { GlobalCalendarSchedule } from "../src/features/global-calendar/global-calendar-types";

assert.deepEqual(
  normalizeGlobalCalendarConfig(null),
  DEFAULT_GLOBAL_CALENDAR_CONFIG,
);
assert.deepEqual(
  normalizeGlobalCalendarConfig({
    title: "  我的日历  ",
    weekStartsOn: 0,
    maxPreviewEvents: 99,
    defaultDetailView: "agenda",
    sources: { diary: false },
  }),
  {
    title: "我的日历",
    sources: { tasks: true, diary: false, countdown: true, schedule: true },
    weekStartsOn: 0,
    showAdjacentDays: true,
    showEventCount: true,
    maxPreviewEvents: 8,
    defaultDetailView: "agenda",
    workdayStart: 7,
    workdayEnd: 22,
  },
);
assert.equal(formatCalendarDate(new Date(2026, 7, 3)), "2026-08-03");
const range = getCalendarMonthRange(2026, 1);
assert.equal(formatCalendarDate(range.start), "2026-02-01");
assert.equal(formatCalendarDate(range.end), "2026-02-28");
assert.ok(getCalendarDateMetadata(new Date(2026, 7, 13)).lunarDayName);
const course: GlobalCalendarSchedule = { id: "course", title: "高等数学", kind: "course", date: "2026-08-10", startTime: "08:00", endTime: "09:30", allDay: false, color: "#4f7cff", recurrence: { kind: "weekly", weekdays: [1, 3], until: "2026-08-31" }, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
assert.deepEqual(getScheduleOccurrenceDates(course, new Date(2026, 7, 10), new Date(2026, 7, 16)), ["2026-08-10", "2026-08-12"]);

console.log("global calendar verification passed");
