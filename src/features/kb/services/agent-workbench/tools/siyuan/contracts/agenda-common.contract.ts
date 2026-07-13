import { z } from "zod";

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export const agendaIsoDateSchema = z.string().trim().refine(isValidIsoDate, {
  message: "日期必须是有效的 YYYY-MM-DD。",
});

export const agendaTaskSchema = z.object({
  taskId: z.string(),
  blockId: z.string(),
  rootId: z.string().optional(),
  box: z.string().optional(),
  hpath: z.string().optional(),
  markdown: z.string(),
  taskname: z.string(),
  completed: z.boolean(),
  priority: z.string(),
  startDate: z.string(),
  deadline: z.string(),
  recurrence: z.string(),
  reminder: z.string(),
  location: z.string(),
  tags: z.array(z.string()),
  sourceKind: z.enum(["new", "migrated", "normal"]),
  sourceDate: z.string().optional(),
  sourceDocId: z.string().optional(),
  sourceDocTitle: z.string().optional(),
  isTodayTask: z.boolean(),
  isOverdue: z.boolean(),
  shouldMigrate: z.boolean(),
}).strict();

export type AgendaTask = z.infer<typeof agendaTaskSchema>;

export const agendaDiaryRecordSchema = z.object({
  recordId: z.string(),
  date: z.string(),
  docId: z.string(),
  docTitle: z.string().optional(),
  categoryTitle: z.string(),
  categoryKey: z.string().optional(),
  headingTitle: z.string(),
  timeText: z.string(),
  content: z.string(),
  headingBlockId: z.string().optional(),
}).strict();

export type AgendaDiaryRecord = z.infer<typeof agendaDiaryRecordSchema>;

export const agendaProjectSchema = z.object({
  name: z.string(),
  taskCount: z.number().int().min(0),
  openTaskCount: z.number().int().min(0),
  todayTaskCount: z.number().int().min(0),
  overdueTaskCount: z.number().int().min(0),
  lastActivityDate: z.string(),
  inactiveDays: z.number().int().min(0).nullable(),
  healthStatus: z.enum(["healthy", "stale", "pileup", "overdue", "idle", "done"]),
  healthLabel: z.string(),
  healthTone: z.enum(["success", "warning", "danger", "normal"]),
  hasTodayProgress: z.boolean(),
  progressPreview: z.string().optional(),
}).strict();

export const agendaNotificationSchema = z.object({
  id: z.string(),
  type: z.enum(["overdue_task", "migration_suggestion", "review_due", "template_missing", "project_relation", "project_index"]),
  level: z.enum(["info", "warning", "danger"]),
  title: z.string(),
  description: z.string(),
  relatedTaskId: z.string().optional(),
  relatedDocId: z.string().optional(),
  reviewPeriod: z.enum(["day", "week", "month", "year"]).optional(),
  action: z.string().optional(),
}).strict();

export const agendaReviewSchema = z.object({
  period: z.enum(["day", "week", "month", "year"]),
  title: z.string(),
  status: z.enum(["not_due", "not_created", "missing_template", "pending", "completed", "overdue", "skipped"]),
  statusLabel: z.string(),
  dateOrRange: z.string(),
  docId: z.string().optional(),
  targetDate: z.string(),
}).strict();

export const agendaCarryoverSchema = z.object({
  period: z.enum(["day", "week", "month", "year"]),
  periodLabel: z.string(),
  sourceLabel: z.string(),
  sourceDateOrRange: z.string(),
  fieldLabel: z.string(),
  content: z.string(),
  lines: z.array(z.string()),
  docId: z.string().optional(),
}).strict();

export const agendaDiaryDocSchema = z.object({
  period: z.enum(["day", "week", "month", "year"]),
  date: z.string(),
  docId: z.string().optional(),
  title: z.string().optional(),
  exists: z.boolean(),
  range: z.object({
    start: z.string(),
    end: z.string(),
  }).strict(),
  status: z.enum(["not_due", "not_created", "missing_template", "pending", "completed", "overdue", "skipped"]),
  markdownPreview: z.string().optional(),
  truncated: z.boolean().optional(),
}).strict();

export type AgendaDiaryDoc = z.infer<typeof agendaDiaryDocSchema>;
