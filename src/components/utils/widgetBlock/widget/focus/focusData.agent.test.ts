import assert from "node:assert/strict";
import test from "node:test";
import type { FocusSessionRecord } from "./focusData";
import { summarizeFocusSessions } from "./focusSessionAnalytics";

test("summarizeFocusSessions 分开统计完成和取消会话", () => {
  const base = { startedAt: "2026-08-08T00:00:00Z", endedAt: "2026-08-08T00:10:00Z", localDate: "2026-08-08", plannedSeconds: 600 };
  const sessions: FocusSessionRecord[] = [
    { ...base, id: "a", actualFocusSeconds: 600, status: "completed" },
    { ...base, id: "b", actualFocusSeconds: 0, status: "cancelled" },
  ];
  assert.deepEqual(summarizeFocusSessions(sessions), { totalFocusTime: 600, totalFocusTimes: 1, completedSessions: 1, cancelledSessions: 1 });
});
