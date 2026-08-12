import { z } from "zod";

const timestamp = z.number().int().nonnegative();
const shortId = z.string().trim().min(1).max(100);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间必须为 HH:mm。");
const timeZone = z.string().trim().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); return true; }
  catch { return false; }
}, "IANA 时区无效。");

const scheduledTriggers = [
  z.object({ kind: z.literal("once"), at: timestamp, timeZone }).strict(),
  z.object({ kind: z.literal("daily"), time, timeZone }).strict(),
  z.object({ kind: z.literal("weekly"), time, weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((values) => new Set(values).size === values.length, "星期不能重复。"), timeZone }).strict(),
  z.object({ kind: z.literal("monthly"), time, daysOfMonth: z.array(z.number().int().min(1).max(31)).min(1).max(31).refine((values) => new Set(values).size === values.length, "日期不能重复。"), timeZone }).strict(),
  z.object({ kind: z.literal("interval"), intervalMinutes: z.number().int().min(1).max(43_200), anchorAt: timestamp, timeZone }).strict(),
] as const;

export const scheduledTriggerSchema = z.discriminatedUnion("kind", scheduledTriggers);
export const backgroundTriggerSchema = z.discriminatedUnion("kind", [
  ...scheduledTriggers,
  z.object({ kind: z.literal("sensor"), sensorId: shortId, intervalMinutes: z.number().int().min(1).max(10_080), timeZone }).strict(),
]);

export type ScheduledTrigger = z.infer<typeof scheduledTriggerSchema>;
export type BackgroundTrigger = z.infer<typeof backgroundTriggerSchema>;
