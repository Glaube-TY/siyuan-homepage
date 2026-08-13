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
import {
  buildCalendarRangeSegments,
  calendarEventColor,
  eventOccursOn,
  isCalendarDateMarker,
  isCalendarRangeEvent,
} from "../src/features/global-calendar/global-calendar-layout";
import type { GlobalCalendarEvent } from "../src/features/global-calendar/global-calendar-types";

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
    taskColorMode: "gradient",
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

const rangedTask: GlobalCalendarEvent = {
  id: "task:range",
  source: "tasks",
  date: "2026-08-03",
  title: "跨日任务",
  entityId: "range",
  startAt: "2026-08-03T00:00:00",
  endAt: "2026-08-09T23:59:00",
  allDay: true,
  priorityLevel: 4,
};
assert.equal(eventOccursOn(rangedTask, "2026-08-06"), true);
assert.deepEqual(
  buildCalendarRangeSegments(rangedTask ? [rangedTask] : [], [
    "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
    "2026-08-07", "2026-08-08", "2026-08-09",
  ]).map(({ startColumn, span, lane }) => ({ startColumn, span, lane })),
  [{ startColumn: 1, span: 7, lane: 0 }],
);
assert.equal(calendarEventColor(rangedTask, "priority"), "#d94b64");

const diaryMarker: GlobalCalendarEvent = {
  id: "diary:2026-08-13",
  source: "diary",
  date: "2026-08-13",
  title: "2026-08-13",
  entityId: "diary",
  allDay: true,
};
assert.equal(isCalendarDateMarker(diaryMarker), true);
assert.equal(isCalendarRangeEvent(diaryMarker), false);
assert.equal(isCalendarRangeEvent(rangedTask), true);

const calendarEventsSource = readFileSync(new URL("../src/features/global-calendar/global-calendar-events.ts", import.meta.url), "utf8");
const taskDataSource = readFileSync(new URL("../src/features/task-data/task-data-service.ts", import.meta.url), "utf8");
const eventEditorSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/globalCalendar/GlobalCalendarEventEditor.svelte", import.meta.url), "utf8");
const detailDialogSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/globalCalendar/GlobalCalendarDetailDialog.svelte", import.meta.url), "utf8");
const timeGridSource = readFileSync(new URL("../src/components/utils/widgetBlock/widget/globalCalendar/GlobalCalendarTimeGrid.svelte", import.meta.url), "utf8");
const scheduleStoreSource = readFileSync(new URL("../src/features/global-calendar/global-calendar-schedule-store.ts", import.meta.url), "utf8");
assert.match(calendarEventsSource, /loadOpenTasks\(plugin\)/, "日历任务必须传递插件上下文以触发底层索引刷新");
assert.match(taskDataSource, /ensureTaskIndexInitialized/, "统一任务服务必须自动初始化索引");
assert.match(taskDataSource, /refreshTaskIndexFromRecentDocuments/, "统一任务服务必须自动增量刷新索引");
assert.doesNotMatch(taskDataSource, /tasksPlus|enhancedDiary/, "统一任务服务不能依赖任务组件或强化日记");
assert.doesNotMatch(calendarEventsSource, /:start|:deadline/, "同一任务不能拆成开始和截止两条日历事件");
assert.match(eventEditorSource, /initial\.schedule\?\.recurrence \|\|/, "新建日程必须为重复规则提供安全默认值");
assert.match(eventEditorSource, /initialEndTime/, "框选时间段必须传入结束时间");
assert.match(timeGridSource, /onCreateRange/, "时间轴必须支持拖拽框选创建日程");
assert.match(detailDialogSource, /linkedTaskId: event\.entityId/, "任务执行时段必须保留原任务引用");
assert.match(detailDialogSource, /linkedTaskStartDate: taskRange\.startDate/, "任务执行时段必须保留允许排期范围");
assert.match(detailDialogSource, /eventOccursOn\(event, date\)/, "任务只能排入自身日期范围");
assert.match(scheduleStoreSource, /linkedTaskId: cleanText\(raw\.linkedTaskId\)/, "日程存储必须保留任务引用");
assert.match(scheduleStoreSource, /linkedTaskStartDate: parseCalendarDate/, "日程存储必须保留任务排期范围");

console.log("global calendar verification passed");
