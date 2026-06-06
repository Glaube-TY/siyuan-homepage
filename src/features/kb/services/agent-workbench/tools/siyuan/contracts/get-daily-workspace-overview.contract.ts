import { z } from "zod";
import {
  agendaCarryoverSchema,
  agendaDiaryRecordSchema,
  agendaIsoDateSchema,
  agendaNotificationSchema,
  agendaProjectSchema,
  agendaReviewSchema,
  agendaTaskSchema,
} from "./agenda-common.contract";

export const dailyWorkspaceIncludeSchema = z.enum([
  "summary",
  "tasks",
  "records",
  "projects",
  "notifications",
  "reviews",
  "carryover",
]);

export const getDailyWorkspaceOverviewInputSchema = z.object({
  date: agendaIsoDateSchema.optional(),
  include: z.array(dailyWorkspaceIncludeSchema).min(1).max(7).optional().default([
    "summary",
    "tasks",
    "records",
    "projects",
    "notifications",
    "reviews",
    "carryover",
  ]),
}).strict();

export type GetDailyWorkspaceOverviewInput = z.infer<typeof getDailyWorkspaceOverviewInputSchema>;

export const getDailyWorkspaceOverviewOutputSchema = z.object({
  date: z.string(),
  todayDiaryExists: z.boolean(),
  todayDiary: z.object({
    docId: z.string(),
    title: z.string().optional(),
    date: z.string(),
  }).strict().optional(),
  templateValid: z.boolean(),
  missingSections: z.array(z.string()),
  summary: z.object({
    templateValid: z.boolean(),
    missing: z.array(z.string()),
    newTaskCount: z.number().int().min(0),
    migratedTaskCount: z.number().int().min(0),
    quickRecordCount: z.number().int().min(0),
    projectCount: z.number().int().min(0),
  }).strict().optional(),
  tasks: z.array(agendaTaskSchema).optional(),
  records: z.array(agendaDiaryRecordSchema).optional(),
  projects: z.array(agendaProjectSchema).optional(),
  notifications: z.array(agendaNotificationSchema).optional(),
  reviews: z.array(agendaReviewSchema).optional(),
  carryoverPlans: z.array(agendaCarryoverSchema).optional(),
  limits: z.object({
    tasks: z.number().int().min(0),
    records: z.number().int().min(0),
    projects: z.number().int().min(0),
    notifications: z.number().int().min(0),
    reviews: z.number().int().min(0),
    carryoverPlans: z.number().int().min(0),
  }).strict(),
  counts: z.object({
    tasksTotal: z.number().int().min(0),
    tasksReturned: z.number().int().min(0),
    tasksTruncated: z.boolean(),
    recordsTotal: z.number().int().min(0),
    recordsReturned: z.number().int().min(0),
    recordsTruncated: z.boolean(),
    projectsTotal: z.number().int().min(0),
    projectsReturned: z.number().int().min(0),
    projectsTruncated: z.boolean(),
    notificationsTotal: z.number().int().min(0),
    notificationsReturned: z.number().int().min(0),
    notificationsTruncated: z.boolean(),
    reviewsTotal: z.number().int().min(0),
    reviewsReturned: z.number().int().min(0),
    reviewsTruncated: z.boolean(),
    carryoverPlansTotal: z.number().int().min(0),
    carryoverPlansReturned: z.number().int().min(0),
    carryoverPlansTruncated: z.boolean(),
  }).strict(),
  note: z.string(),
}).strict();

export type GetDailyWorkspaceOverviewOutput = z.infer<typeof getDailyWorkspaceOverviewOutputSchema>;
