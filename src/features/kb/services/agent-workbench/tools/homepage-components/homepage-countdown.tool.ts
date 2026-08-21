import { z } from "zod";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
import {
  CountdownEventConflictError,
  archiveCountdownCategory,
  archiveCountdownEvent,
  createCountdownCategory,
  createCountdownEventDraft,
  deleteCountdownCategory,
  deleteCountdownEventPermanently,
  loadCountdownCenterData,
  normalizeCountdownEvent,
  restoreCountdownEvent,
  saveCountdownEvent,
  updateCountdownCategory,
  type CountdownCategoryRecord,
  type CountdownEventRecord,
} from "@/components/utils/widgetBlock/widget/countdown/countdownData";
import { resolveCountdownOccurrence } from "@/components/utils/widgetBlock/widget/countdown/countdownDateEngine";
import { alwaysAvailable, homepageComponentFailure } from "./homepage-component-tool-utils";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kindSchema = z.enum(["birthday", "anniversary", "deadline", "expiration", "milestone", "subscription", "custom"]);
const prioritySchema = z.enum(["high", "normal", "low"]);
const iconSchema = z.enum(["calendar", "cake", "heart", "flag", "clock", "briefcase", "graduation", "file", "credit-card", "home", "star", "bell", "gift", "bookmark", "target"]);
const eventFields = {
  name: z.string().trim().min(1).max(200),
  kind: kindSchema.default("custom"),
  calendar: z.enum(["solar", "lunar"]).default("solar"),
  recurrence: z.enum(["none", "yearly"]).optional(),
  date: dateSchema.optional(),
  lunarDate: z.object({ year: z.number().int().min(1900).max(2200), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(30), isLeapMonth: z.boolean().default(false) }).strict().optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  priority: prioritySchema.default("normal"),
  note: z.string().max(2000).default(""),
  linkedBlockId: z.string().regex(/^\d{14}-[a-z0-9]{7}$/).optional(),
  pastBehavior: z.enum(["keep", "auto-archive"]).optional(),
};
const addSchema = z.object(eventFields).strict();
const updateSchema = z.object({ eventId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1), expectedRevision: z.number().int().nonnegative(), patch: z.object(eventFields).partial().strict() }).strict();
const eventMutationSchema = z.object({ eventId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1), expectedRevision: z.number().int().nonnegative() }).strict();
const eventIdSchema = z.object({ eventId: z.string().trim().min(1) }).strict();
const listSchema = z.object({ scope: z.enum(["upcoming", "archived", "all"]).default("upcoming"), categoryId: z.string().trim().optional(), tags: z.array(z.string().trim().min(1)).max(20).optional(), priority: prioritySchema.optional(), kind: kindSchema.optional(), search: z.string().trim().optional(), startDate: dateSchema.optional(), endDate: dateSchema.optional(), limit: z.number().int().min(1).max(200).default(50) }).strict();
const categoryFields = { name: z.string().trim().min(1).max(40), icon: iconSchema.optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() };
const categoryIdSchema = z.object({ categoryId: z.string().trim().min(1) }).strict();
const createCategorySchema = z.object(categoryFields).strict();
const updateCategorySchema = z.object({ categoryId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1), patch: z.object(categoryFields).partial().strict() }).strict();
const archiveCategorySchema = categoryIdSchema.extend({ expectedUpdatedAt: z.string().min(1) }).strict();
const deleteCategorySchema = z.object({ categoryId: z.string().trim().min(1), moveToCategoryId: z.string().trim().min(1).nullable().optional(), expectedRevision: z.number().int().nonnegative(), expectedEventCount: z.number().int().nonnegative() }).strict();

function safeCategory(category: CountdownCategoryRecord) {
  return { categoryId: category.id, name: category.name, icon: category.icon, color: category.color, archived: category.archived === true, updatedAt: category.updatedAt };
}

function safeEvent(event: CountdownEventRecord, categories: Map<string, CountdownCategoryRecord>, anchor = new Date()) {
  const occurrence = resolveCountdownOccurrence(event, anchor);
  return {
    eventId: event.id, name: event.name, kind: event.kind, calendar: event.calendar, recurrence: event.recurrence,
    date: event.date, lunarDate: event.lunarDate, nextOccurrence: occurrence?.localDate ?? null,
    daysRemaining: occurrence?.daysDelta ?? null, occurrenceStatus: occurrence?.status ?? null,
    categoryId: event.categoryId, category: event.categoryId ? categories.get(event.categoryId)?.name ?? null : null,
    priority: event.priority, tags: event.tags, note: event.note, linkedBlockId: event.linkedBlockId,
    archived: event.archived === true, updatedAt: event.updatedAt,
  };
}

function actionTool<T>(name: string, schema: z.ZodType<T>, readOnly: boolean, execute: (input: T) => Promise<unknown>, riskLevel: "medium" | "high" = "medium"): ToolContract {
  return { name: `homepage_anniversary_${name}`, title: name, description: `homepage_anniversary.${name}`, inputSchema: schema, readOnly, safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw): Promise<ToolResult> {
      try { return { ok: true, data: await execute(schema.parse(raw)) }; }
      catch (error) {
        const errCode = (error as Record<string, unknown>)?.code;
        if (errCode === "countdown_event_conflict") {
          const latest = (error as Record<string, unknown>)?.latest as CountdownEventRecord | undefined;
          return { ok: false, data: null, error: { code: "countdown_event_conflict", message: error instanceof Error ? error.message : "纪念日操作冲突。", recoverable: true, details: latest ? { latest: safeEvent(latest, new Map()) } : undefined } };
        }
        return homepageComponentFailure(error, `countdown_${name}_failed`, `纪念日操作 ${name} 失败。`);
      }
    }, summarizeResult: (result) => result.ok ? `纪念日 ${name} 完成。` : result.error?.message ?? "纪念日操作失败。" };
}

export function createHomepageCountdownActionTools(): Array<{ action: string; tool: ToolContract }> {
  return [
    { action: "list", tool: actionTool("list", listSchema, true, async (input) => {
      const loaded = await loadCountdownCenterData({ includeArchived: input.scope !== "upcoming" });
      const categoryMap = new Map(loaded.categories.map((item) => [item.id, item]));
      const anchor = new Date();
      const keyword = input.search?.toLowerCase();
      const rows = loaded.events.map((event) => ({ event, occurrence: resolveCountdownOccurrence(event, anchor) })).filter(({ event, occurrence }) =>
        (input.scope === "all" || (input.scope === "archived" ? event.archived : !event.archived && occurrence?.status !== "expired"))
        && (!input.categoryId || event.categoryId === input.categoryId)
        && (!input.priority || event.priority === input.priority)
        && (!input.kind || event.kind === input.kind)
        && (!input.tags?.length || input.tags.every((tag) => event.tags.includes(tag)))
        && (!keyword || [event.name, event.note, ...event.tags].some((value) => value.toLowerCase().includes(keyword)))
        && (!input.startDate || (occurrence?.localDate ?? "") >= input.startDate)
        && (!input.endDate || (occurrence?.localDate ?? "") <= input.endDate));
      return { revision: loaded.revision, events: rows.sort((a, b) => String(a.occurrence?.localDate ?? "9999").localeCompare(String(b.occurrence?.localDate ?? "9999"))).slice(0, input.limit).map(({ event }) => safeEvent(event, categoryMap, anchor)) };
    }) },
    { action: "get", tool: actionTool("get", eventIdSchema, true, async ({ eventId }) => {
      const loaded = await loadCountdownCenterData({ includeArchived: true });
      const event = loaded.events.find((item) => item.id === eventId);
      if (!event) throw new Error("纪念日事件不存在。");
      return { revision: loaded.revision, event: safeEvent(event, new Map(loaded.categories.map((item) => [item.id, item]))) };
    }) },
    { action: "add", tool: actionTool("add", addSchema, false, async (input) => {
      const draft = normalizeCountdownEvent({ ...createCountdownEventDraft(input.kind), ...input, recurrence: input.recurrence ?? (input.kind === "birthday" || input.kind === "anniversary" ? "yearly" : "none"), categoryId: input.categoryId ?? undefined });
      const saved = await saveCountdownEvent(draft);
      const loaded = await loadCountdownCenterData({ includeArchived: true });
      const verified = loaded.events.find((item) => item.id === saved.id);
      if (!verified || verified.name !== input.name) throw new Error("纪念日事件写后验证失败。");
      return { revision: loaded.revision, event: safeEvent(verified, new Map(loaded.categories.map((item) => [item.id, item]))) };
    }) },
    { action: "update", tool: actionTool("update", updateSchema, false, async ({ eventId, expectedUpdatedAt, expectedRevision, patch }) => {
      const loaded = await loadCountdownCenterData({ includeArchived: true });
      const current = loaded.events.find((item) => item.id === eventId);
      if (!current) throw new Error("纪念日事件不存在。");
      if (loaded.revision !== expectedRevision || current.updatedAt !== expectedUpdatedAt) throw new CountdownEventConflictError(current);
      await saveCountdownEvent({ ...current, ...patch, id: eventId, name: patch.name ?? current.name, categoryId: patch.categoryId ?? undefined }, { baseRevision: expectedRevision, original: current });
      const verified = await loadCountdownCenterData({ includeArchived: true });
      const verifiedEvent = verified.events.find((item) => item.id === eventId);
      if (!verifiedEvent || verifiedEvent.updatedAt === expectedUpdatedAt || Object.entries(patch).some(([key, value]) => JSON.stringify(verifiedEvent[key as keyof CountdownEventRecord] ?? null) !== JSON.stringify(value ?? null))) throw new Error("纪念日事件更新后验证失败。");
      return { revision: verified.revision, event: safeEvent(verifiedEvent, new Map(verified.categories.map((item) => [item.id, item]))) };
    }) },
    ...(["archive", "restore", "delete_permanently"] as const).map((action) => ({ action, tool: actionTool(action, eventMutationSchema, false, async ({ eventId, expectedUpdatedAt, expectedRevision }) => {
      if (action === "archive") await archiveCountdownEvent(eventId, { expectedUpdatedAt, expectedRevision });
      else if (action === "restore") await restoreCountdownEvent(eventId, { expectedUpdatedAt, expectedRevision });
      else await deleteCountdownEventPermanently(eventId, { expectedUpdatedAt, expectedRevision });
      const loaded = await loadCountdownCenterData({ includeArchived: true });
      const current = loaded.events.find((item) => item.id === eventId);
      if (action === "delete_permanently" ? current : current?.archived !== (action === "archive")) throw new Error("纪念日事件写后验证失败。");
      return { eventId, action, revision: loaded.revision };
    }, action === "delete_permanently" ? "high" : "medium") })),
    { action: "list_categories", tool: actionTool("list_categories", z.object({ includeArchived: z.boolean().default(false) }).strict(), true, async ({ includeArchived }) => { const loaded = await loadCountdownCenterData({ includeArchived: true }); return { revision: loaded.revision, categories: loaded.categories.filter((item) => includeArchived || !item.archived).map((category) => ({ ...safeCategory(category), eventCount: loaded.events.filter((event) => event.categoryId === category.id).length })) }; }) },
    { action: "create_category", tool: actionTool("create_category", createCategorySchema, false, async (input) => { const created = await createCountdownCategory(input); const loaded = await loadCountdownCenterData({ includeArchived: true }); const verified = loaded.categories.find((item) => item.id === created.id); if (!verified || verified.name !== input.name) throw new Error("纪念日分类创建后验证失败。"); return { revision: loaded.revision, category: safeCategory(verified) }; }) },
    { action: "update_category", tool: actionTool("update_category", updateCategorySchema, false, async ({ categoryId, expectedUpdatedAt, patch }) => { await updateCountdownCategory(categoryId, patch, { expectedUpdatedAt }); const loaded = await loadCountdownCenterData({ includeArchived: true }); const verified = loaded.categories.find((item) => item.id === categoryId); if (!verified || verified.updatedAt === expectedUpdatedAt || Object.entries(patch).some(([key, value]) => verified[key as keyof CountdownCategoryRecord] !== value)) throw new Error("纪念日分类更新后验证失败。"); return { revision: loaded.revision, category: safeCategory(verified) }; }) },
    { action: "archive_category", tool: actionTool("archive_category", archiveCategorySchema, false, async ({ categoryId, expectedUpdatedAt }) => { await archiveCountdownCategory(categoryId, { expectedUpdatedAt }); const loaded = await loadCountdownCenterData({ includeArchived: true }); const verified = loaded.categories.find((item) => item.id === categoryId); if (!verified?.archived) throw new Error("纪念日分类归档后验证失败。"); return { categoryId, archived: true, revision: loaded.revision }; }) },
    { action: "delete_category", tool: actionTool("delete_category", deleteCategorySchema, false, async ({ categoryId, moveToCategoryId, expectedRevision, expectedEventCount }) => { await deleteCountdownCategory(categoryId, moveToCategoryId ?? undefined, { expectedRevision, expectedEventCount }); const loaded = await loadCountdownCenterData({ includeArchived: true }); if (loaded.categories.some((item) => item.id === categoryId) || loaded.events.some((item) => item.categoryId === categoryId)) throw new Error("纪念日分类删除后验证失败。"); return { categoryId, deleted: true, movedEventCount: expectedEventCount, moveToCategoryId: moveToCategoryId ?? null, revision: loaded.revision }; }, "high") },
  ];
}
