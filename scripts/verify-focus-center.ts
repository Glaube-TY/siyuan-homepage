import assert from "node:assert/strict";
import { buildFocusCenterAnalytics } from "../src/components/utils/widgetBlock/widget/focus/focusCenterAnalytics";

const sessions = [
  { id: "1", startedAt: "2026-08-13T01:00:00Z", endedAt: "2026-08-13T01:25:00Z", localDate: "2026-08-13", segmentType: "focus", plannedSeconds: 1500, actualSeconds: 1500, status: "completed", binding: { kind: "task", id: "t1", title: "写报告", projectId: "p1", projectTitle: "主页插件" } },
  { id: "2", startedAt: "2026-08-13T01:25:00Z", endedAt: "2026-08-13T01:30:00Z", localDate: "2026-08-13", segmentType: "short_break", plannedSeconds: 300, actualSeconds: 300, status: "completed" },
] as const;
const result = buildFocusCenterAnalytics(sessions);
assert.equal(result.focusSeconds, 1500);
assert.equal(result.sessions, 1);
assert.equal(result.bindings[0]?.title, "写报告");
assert.equal(result.daily[0]?.sessions, 1);
assert.equal(result.hours[9]?.seconds, 1500);
console.log("focus center verification passed");
