import { z } from "zod";
import type { ToolContract } from "../../contracts/tool-contract";
import {
  clearReviewTarget,
  completeReviewOnce,
  finishReviewTarget,
  getReviewSummary,
  markReviewTarget,
  postponeReviewTarget,
  queryReviewItems,
  readCurrentReviewAttrs,
  updateReviewTarget,
} from "@/components/utils/widgetBlock/widget/reviewDocs/reviewDocs";
import type { ReviewItem } from "@/components/utils/widgetBlock/widget/reviewDocs/reviewDocsTypes";
import { alwaysAvailable, homepageComponentFailure } from "./homepage-component-tool-utils";

const targetSchema = { targetId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/i), targetType: z.enum(["doc", "block"]) };
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const planFields = { nextDate: dateSchema, note: z.string().max(2000).default(""), category: z.string().trim().max(100).default(""), priority: z.enum(["high", "medium", "low"]).default("medium"), plan: z.enum(["manual", "ebbinghaus", "custom"]).default("manual"), intervals: z.array(z.number().int().nonnegative()).max(50).default([]) };
const listSchema = z.object({ view: z.enum(["due", "today", "overdue", "future", "all"]).default("due"), category: z.string().trim().optional(), priority: z.enum(["high", "medium", "low"]).optional(), search: z.string().trim().optional(), limit: z.number().int().min(1).max(200).default(50) }).strict();
const scheduleSchema = z.object({ ...targetSchema, ...planFields }).strict();
const updateSchema = z.object({ ...targetSchema, expectedUpdatedAt: z.string().min(1), plan: z.object(planFields).strict() }).strict();
const completeSchema = z.object({ ...targetSchema, expectedUpdatedAt: z.string().min(1), manualNextDate: dateSchema.optional(), switchToManual: z.boolean().optional() }).strict();
const postponeSchema = z.object({ ...targetSchema, expectedUpdatedAt: z.string().min(1), nextDate: dateSchema }).strict();
const mutationSchema = z.object({ ...targetSchema, expectedUpdatedAt: z.string().min(1) }).strict();

function safeItem(item: ReviewItem) {
  return { targetId: item.id, targetType: item.type, title: item.title, path: item.hpath || item.path, nextDate: item.attrs.nextDate, note: item.attrs.note, category: item.attrs.category, priority: item.attrs.priority, plan: item.attrs.plan, intervals: item.attrs.intervals, intervalIndex: item.attrs.intervalIndex, reviewCount: item.attrs.reviewCount, lastReviewedAt: item.attrs.lastReviewedAt, updatedAt: item.attrs.updatedAt, dueStatus: item.dueStatus, overdueDays: item.overdueDays };
}

function actionTool<T>(name: string, schema: z.ZodType<T>, readOnly: boolean, execute: (input: T) => Promise<unknown>, high = false): ToolContract {
  return { name: `homepage_review_${name}`, title: name, description: `homepage_review.${name}`, inputSchema: schema, readOnly, safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: high ? "high" : "medium" }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw) { try { return { ok: true, data: await execute(schema.parse(raw)) }; } catch (error) { return homepageComponentFailure(error, `review_${name}_failed`, `复习计划操作 ${name} 失败。`); } }, summarizeResult: (result) => result.ok ? `复习计划 ${name} 完成。` : result.error?.message ?? "复习计划操作失败。" };
}

async function verifiedAttrs(targetId: string, expectedPresent: boolean) {
  const attrs = await readCurrentReviewAttrs(targetId);
  if (Boolean(attrs?.nextDate) !== expectedPresent) throw new Error("复习计划写后验证失败。");
  return attrs;
}

export function createHomepageReviewActionTools(): Array<{ action: string; tool: ToolContract }> {
  return [
    { action: "list", tool: actionTool("list", listSchema, true, async (input) => ({ items: (await queryReviewItems({ view: input.view, category: input.category, priority: input.priority, search: input.search, limit: input.limit })).map(safeItem) })) },
    { action: "summary", tool: actionTool("summary", z.object({ futureDays: z.number().int().min(1).max(365).default(7) }).strict(), true, async ({ futureDays }) => getReviewSummary(await queryReviewItems({ view: "all" }), futureDays)) },
    { action: "schedule", tool: actionTool("schedule", scheduleSchema, false, async ({ targetId, targetType, ...input }) => { const result = await markReviewTarget({ targetId, targetType, expectedUpdatedAt: "", input }); return { ...result, attrs: await verifiedAttrs(targetId, true) }; }) },
    { action: "update_plan", tool: actionTool("update_plan", updateSchema, false, async ({ targetId, targetType, expectedUpdatedAt, plan }) => { const result = await updateReviewTarget({ targetId, targetType, expectedUpdatedAt, input: plan }); return { ...result, attrs: await verifiedAttrs(targetId, true) }; }) },
    { action: "complete", tool: actionTool("complete", completeSchema, false, async (input) => { const result = await completeReviewOnce(input); return { ...result, attrs: await verifiedAttrs(input.targetId, true) }; }) },
    { action: "postpone", tool: actionTool("postpone", postponeSchema, false, async (input) => { const result = await postponeReviewTarget(input); return { ...result, attrs: await verifiedAttrs(input.targetId, true) }; }) },
    { action: "finish", tool: actionTool("finish", mutationSchema, false, async (input) => { const result = await finishReviewTarget(input); await verifiedAttrs(input.targetId, false); return result; }) },
    { action: "remove", tool: actionTool("remove", mutationSchema, false, async (input) => { const result = await clearReviewTarget(input); await verifiedAttrs(input.targetId, false); return result; }, true) },
  ];
}
