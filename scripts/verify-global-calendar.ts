import assert from "node:assert/strict";
import {
  DEFAULT_GLOBAL_CALENDAR_CONFIG,
  formatCalendarDate,
  getCalendarMonthRange,
  normalizeGlobalCalendarConfig,
} from "../src/features/global-calendar/global-calendar-types";
import { getCalendarDateMetadata } from "../src/utils/calendar-metadata";

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
    sources: { tasks: true, diary: false, countdown: true },
    weekStartsOn: 0,
    showAdjacentDays: true,
    showEventCount: true,
    maxPreviewEvents: 8,
    defaultDetailView: "agenda",
  },
);
assert.equal(formatCalendarDate(new Date(2026, 7, 3)), "2026-08-03");
const range = getCalendarMonthRange(2026, 1);
assert.equal(formatCalendarDate(range.start), "2026-02-01");
assert.equal(formatCalendarDate(range.end), "2026-02-28");
assert.ok(getCalendarDateMetadata(new Date(2026, 7, 13)).lunarDayName);

console.log("global calendar verification passed");
