import { z } from "zod";
import {
  appendFocusSession,
  getLocalFocusDate,
  loadFocusDetailedStatistics,
  loadFocusSessionsForRange,
  loadFocusSessionsForYear,
  summarizeFocusSessions,
  toFocusSecondTimestamp,
  type FocusSessionRecord,
} from "@/components/utils/widgetBlock/widget/focus/focusData";
import type { ToolContract } from "../../contracts/tool-contract";
import { alwaysAvailable, homepageComponentFailure } from "./homepage-component-tool-utils";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const statsSchema = z.object({ startDate: date.optional(), endDate: date.optional() }).strict().refine((value) => Boolean(value.startDate) === Boolean(value.endDate), "startDate 与 endDate 必须同时提供");
const recordSchema = z.object({ startedAt: z.string().datetime({ offset: true }), endedAt: z.string().datetime({ offset: true }), plannedSeconds: z.number().int().min(0).max(86400), actualFocusSeconds: z.number().int().min(0).max(86400), status: z.enum(["completed", "cancelled"]) }).strict();

export function createHomepageFocusActionTools(): Array<{ action: "stats" | "record_session"; tool: ToolContract }> {
  const stats: ToolContract = {
    name: "homepage_focus_stats", title: "查看专注统计", description: "读取全部或日期范围内的真实专注统计。",
    inputSchema: statsSchema, readOnly: true, safety: { readOnly: true }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw) { try { const input = statsSchema.parse(raw); const data = input.startDate && input.endDate ? summarizeFocusSessions(await loadFocusSessionsForRange(input.startDate, input.endDate)) : await loadFocusDetailedStatistics(); return { ok: true, data: { ...data, startDate: input.startDate, endDate: input.endDate } }; } catch (error) { return homepageComponentFailure(error, "focus_stats_failed", "读取专注统计失败。"); } },
    summarizeResult: (result) => result.ok ? "专注统计读取完成。" : result.error?.message ?? "读取失败。",
  };
  const record: ToolContract = {
    name: "homepage_focus_record_session", title: "补记专注会话", description: "向正式专注历史追加一条已发生会话。",
    inputSchema: recordSchema, readOnly: false, safety: { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel: "medium" }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw) {
      try {
        const input = recordSchema.parse(raw); const started = new Date(input.startedAt); const ended = new Date(input.endedAt); const elapsedSeconds = Math.floor((ended.getTime() - started.getTime()) / 1000);
        if (elapsedSeconds < 0) throw new Error("endedAt 不能早于 startedAt");
        if (elapsedSeconds > 86400) throw new Error("单次专注会话不能超过 24 小时");
        if (input.actualFocusSeconds > elapsedSeconds + 60) throw new Error("实际专注时长不能明显超过起止时间范围");
        if (input.status === "cancelled" && input.actualFocusSeconds !== 0) throw new Error("cancelled 会话的 actualFocusSeconds 必须为 0");
        const id = `focus-agent-${globalThis.crypto.randomUUID()}`;
        const session: FocusSessionRecord = { id, startedAt: toFocusSecondTimestamp(started), endedAt: toFocusSecondTimestamp(ended), localDate: getLocalFocusDate(started), plannedSeconds: input.plannedSeconds, actualFocusSeconds: input.actualFocusSeconds, status: input.status };
        const totals = await appendFocusSession(session);
        const verified = (await loadFocusSessionsForYear(started.getFullYear())).find((item) => item.id === id);
        if (!verified) return { ok: false, data: null, error: { code: "focus_write_unverified", message: "专注会话写入后未能重新读取验证。", recoverable: false } };
        return { ok: true, data: { sessionId: id, actualFocusSeconds: verified.actualFocusSeconds, date: verified.localDate, status: verified.status, newTotals: totals } };
      } catch (error) { return homepageComponentFailure(error, "focus_record_failed", "补记专注会话失败。"); }
    },
    summarizeResult: (result) => result.ok ? "专注会话已记录。" : result.error?.message ?? "记录失败。",
  };
  return [{ action: "stats", tool: stats }, { action: "record_session", tool: record }];
}
