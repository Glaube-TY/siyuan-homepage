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
import { readFileSync } from "node:fs";
import { parseTaskLine } from "../src/features/task-data/task-parser";

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
assert.deepEqual(
  (({ startDate, deadline }) => ({ startDate, deadline }))(
    parseTaskLine("- [ ] 验证日历任务 ⌛2026-08-15 📅2026-08-16").parsed,
  ),
  { startDate: "2026-08-15", deadline: "2026-08-16" },
);

const calendarEventsSource = readFileSync(new URL("../src/features/global-calendar/global-calendar-events.ts", import.meta.url), "utf8");
const taskDataSource = readFileSync(new URL("../src/features/task-data/task-data-service.ts", import.meta.url), "utf8");
assert.match(calendarEventsSource, /loadOpenTasks\(plugin\)/, "日历任务必须传递插件上下文以触发底层索引刷新");
assert.match(taskDataSource, /ensureTaskIndexInitialized/, "统一任务服务必须自动初始化索引");
assert.match(taskDataSource, /refreshTaskIndexFromRecentDocuments/, "统一任务服务必须自动增量刷新索引");
assert.doesNotMatch(taskDataSource, /tasksPlus|enhancedDiary/, "统一任务服务不能依赖任务组件或强化日记");

console.log("global calendar verification passed");
