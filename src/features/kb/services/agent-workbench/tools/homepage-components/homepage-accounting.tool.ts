import { z } from "zod";
import { getNotebrainPlugin } from "../../storage/notebrain-plugin-storage";
import type { ToolContract } from "../../contracts/tool-contract";
import {
  archiveAccountingRecord,
  findAccountingRecordById,
  loadAccountingRecordsForRange,
  loadRecentRecords,
  saveAccountingRecord,
} from "@/components/utils/widgetBlock/widget/accounting/accountingData";
import {
  archiveAccountingAccount,
  loadAccountingAccounts,
  saveAccountingAccount,
} from "@/components/utils/widgetBlock/widget/accounting/accountingAccountData";
import { loadAccountingSettings } from "@/components/utils/widgetBlock/widget/accounting/accountingSettings";
import {
  buildCategoryReport,
  formatAccountingDate,
  getPeriodRange,
  summarizeAccounting,
  summarizeRecordsForRange,
} from "@/components/utils/widgetBlock/widget/accounting/accountingAnalytics";
import type { AccountingAccount, AccountingRecord } from "@/components/utils/widgetBlock/widget/accounting/accountingTypes";
import { alwaysAvailable, homepageComponentFailure, HomepageComponentConflictError } from "./homepage-component-tool-utils";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const directionSchema = z.enum(["expense", "income", "transfer"]);
const tagsSchema = z.union([z.string(), z.array(z.string().trim().min(1)).max(30)]).optional();
const addRecordSchema = z.object({ title: z.string().trim().min(1).max(200), direction: directionSchema, amount: z.number().positive().finite(), date: dateSchema.optional(), categoryPrimary: z.string().trim().min(1).max(100).optional(), categorySecondary: z.string().trim().max(100).optional(), account: z.string().trim().min(1).max(200).optional(), counterAccount: z.string().trim().min(1).max(200).optional(), tags: tagsSchema, note: z.string().max(2000).optional(), currency: z.string().trim().min(3).max(8).optional() }).strict();
const recordPatchSchema = addRecordSchema.omit({ direction: true }).partial().strict();
const updateRecordSchema = z.object({ recordId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1), patch: recordPatchSchema }).strict();
const archiveRecordSchema = z.object({ recordId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1) }).strict();
const querySchema = z.object({ startDate: dateSchema.optional(), endDate: dateSchema.optional(), year: z.number().int().min(1970).max(9999).optional(), direction: directionSchema.optional(), category: z.string().trim().optional(), account: z.string().trim().optional(), keyword: z.string().trim().optional(), limit: z.number().int().min(1).max(200).default(50), includeArchived: z.boolean().default(false) }).strict();
const summarySchema = z.object({ period: z.enum(["today", "date", "month", "range", "year"]), date: dateSchema.optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), year: z.number().int().min(1970).max(9999).optional(), startDate: dateSchema.optional(), endDate: dateSchema.optional() }).strict();
const emptySchema = z.object({}).strict();
const listAccountsSchema = z.object({ includeArchived: z.boolean().default(false) }).strict();
const categorySchema = z.object({ period: z.enum(["month", "recent30", "year"]).default("month"), direction: z.enum(["expense", "income"]).default("expense"), referenceDate: dateSchema.optional() }).strict();
const accountFields = { name: z.string().trim().min(1).max(100), type: z.string().trim().min(1).max(50), currency: z.string().trim().min(3).max(8).optional(), openingBalance: z.number().min(0).finite().optional(), currentBalance: z.number().min(0).finite().optional(), sortOrder: z.number().finite().optional(), note: z.string().max(1000).optional() };
const addAccountSchema = z.object(accountFields).strict();
const updateAccountSchema = z.object({ accountId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1), patch: z.object(accountFields).partial().strict() }).strict();
const archiveAccountSchema = z.object({ accountId: z.string().trim().min(1), expectedUpdatedAt: z.string().min(1) }).strict();

function tags(value: string | string[] | undefined): string { return Array.isArray(value) ? value.join(",") : value ?? ""; }
function safeRecord(record: AccountingRecord) { return { recordId: record.recordId, title: record.title, direction: record.direction, amount: record.amount, date: record.date, categoryPrimary: record.categoryPrimary, categorySecondary: record.categorySecondary, account: record.account, counterAccount: record.counterAccount, tags: record.tags, note: record.note, currency: record.currency, archived: record.archived === true, updatedAt: record.updatedAt }; }
// 流水写入边界：来源/转入账户必须解析为真实存在的未归档账户。
function findActiveAccount(accounts: AccountingAccount[], ref: string): AccountingAccount | null {
  const byId = accounts.find((a) => a.accountId === ref);
  if (byId) return byId;
  const byName = accounts.filter((a) => a.name === ref);
  return byName.length === 1 ? byName[0] : null;
}
function resolveAccountRef(accounts: AccountingAccount[], ref: string | undefined): string | undefined {
  if (ref === undefined || ref === "") return ref;
  const match = findActiveAccount(accounts, ref);
  if (match) return match.accountId;
  if (accounts.some((a) => a.name === ref)) throw new Error(`账户名称不唯一，请改用 accountId：${ref}`);
  throw new Error(`账户不存在或已归档：${ref}`);
}
function validateTransferAccounts(from?: string, to?: string): void { if (!from || !to || from === to) throw new Error("转账必须提供不同的来源账户和目标账户"); }
function validateRecordSemantics(input: z.infer<typeof addRecordSchema>): void { if (input.direction === "transfer") validateTransferAccounts(input.account, input.counterAccount); }
function rangeForSummary(input: z.infer<typeof summarySchema>): { start: string; end: string } {
  const today = formatAccountingDate(new Date());
  if (input.period === "today") return { start: today, end: today };
  if (input.period === "date") { const value = input.date ?? today; return { start: value, end: value }; }
  if (input.period === "range") { if (!input.startDate || !input.endDate || input.startDate > input.endDate) throw new Error("range 必须提供合法的 startDate 和 endDate"); return { start: input.startDate, end: input.endDate }; }
  if (input.period === "year") { const year = input.year ?? new Date().getFullYear(); return { start: `${year}-01-01`, end: `${year}-12-31` }; }
  const month = input.month ?? today.slice(0, 7); const [year, m] = month.split("-").map(Number); const last = new Date(year, m, 0).getDate(); return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

function actionTool(name: string, schema: z.ZodType, readOnly: boolean, execute: (input: never) => Promise<unknown>, riskLevel: "low" | "medium" | "high" = "medium"): ToolContract {
  return { name: `homepage_accounting_${name}`, title: name, description: `homepage_accounting.${name}`, inputSchema: schema, readOnly, safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw) { try { return { ok: true, data: await execute(schema.parse(raw) as never) }; } catch (error) { return homepageComponentFailure(error, `accounting_${name}_failed`, `记账操作 ${name} 失败。`); } }, summarizeResult: (result) => result.ok ? `记账 ${name} 完成。` : result.error?.message ?? "记账操作失败。" };
}

export function createHomepageAccountingActionTools(): Array<{ action: string; tool: ToolContract }> {
  const plugin = () => getNotebrainPlugin();
  return [
    { action: "overview", tool: actionTool("overview", emptySchema, true, async () => { const settings = await loadAccountingSettings(plugin()); const { start, end } = getPeriodRange("month"); const [month, recent, accountResult] = await Promise.all([loadAccountingRecordsForRange(plugin(), start, end), loadRecentRecords(plugin(), 5), loadAccountingAccounts(plugin())]); if (!month.status.ok || !recent.status.ok || !accountResult.status.ok) throw new Error([month.status.message, recent.status.message, accountResult.status.message].join("；")); const summary = summarizeAccounting(month.records, { monthlyBudget: settings.monthlyBudget, recentRecords: recent.records, recentLimit: 5 }); return { ...summary, recentRecords: summary.recentRecords.map(safeRecord), accountCount: accountResult.accounts.length, dataStatus: "ready" }; }) },
    { action: "query_records", tool: actionTool("query_records", querySchema, true, async (input: z.infer<typeof querySchema>) => { let start = input.startDate; let end = input.endDate; if (input.year) { start = `${input.year}-01-01`; end = `${input.year}-12-31`; } if (!start || !end || start > end) throw new Error("必须提供合法日期范围或 year"); const loaded = await loadAccountingRecordsForRange(plugin(), start, end, input.includeArchived); if (!loaded.status.ok) throw new Error(loaded.status.message); const keyword = input.keyword?.toLowerCase(); return { startDate: start, endDate: end, records: loaded.records.filter((r) => (!input.direction || r.direction === input.direction) && (!input.category || r.categoryPrimary === input.category || r.categorySecondary === input.category) && (!input.account || r.account === input.account || r.counterAccount === input.account) && (!keyword || [r.title, r.note, r.tags].some((v) => v.toLowerCase().includes(keyword)))).slice(0, input.limit).map(safeRecord) }; }) },
    { action: "summary", tool: actionTool("summary", summarySchema, true, async (input: z.infer<typeof summarySchema>) => { const range = rangeForSummary(input); const loaded = await loadAccountingRecordsForRange(plugin(), range.start, range.end); if (!loaded.status.ok) throw new Error(loaded.status.message); return { ...range, ...summarizeRecordsForRange(loaded.records, range.start, range.end) }; }) },
    { action: "add_record", tool: actionTool("add_record", addRecordSchema, false, async (input: z.infer<typeof addRecordSchema>) => { const settings = await loadAccountingSettings(plugin()); const accounts = await loadAccountingAccounts(plugin()); if (!accounts.status.ok) throw new Error(accounts.status.message); const account = resolveAccountRef(accounts.accounts, input.account || settings.defaultAccountId || "其他"); const counterAccount = resolveAccountRef(accounts.accounts, input.counterAccount); validateRecordSemantics({ ...input, account, counterAccount }); const record = await saveAccountingRecord(plugin(), { ...input, date: input.date ?? formatAccountingDate(new Date()), categoryPrimary: input.categoryPrimary ?? "其他", account, counterAccount, currency: input.currency ?? settings.defaultCurrency, tags: tags(input.tags) }); const verified = await findAccountingRecordById(plugin(), record.recordId); if (!verified || verified.amount !== input.amount || verified.direction !== input.direction || verified.date !== record.date) throw new Error("记账记录写后验证失败"); return safeRecord(verified); }) },
    { action: "update_record", tool: actionTool("update_record", updateRecordSchema, false, async (input: z.infer<typeof updateRecordSchema>) => { const current = await findAccountingRecordById(plugin(), input.recordId); if (!current) throw new Error("记账记录不存在"); if (current.updatedAt !== input.expectedUpdatedAt) throw new HomepageComponentConflictError("记账记录已变化，请重新读取"); const accounts = await loadAccountingAccounts(plugin()); if (!accounts.status.ok) throw new Error(accounts.status.message); const patch = { ...input.patch }; if (patch.account) patch.account = resolveAccountRef(accounts.accounts, patch.account); if (patch.counterAccount) patch.counterAccount = resolveAccountRef(accounts.accounts, patch.counterAccount); const candidate = { ...current, ...patch, tags: input.patch.tags === undefined ? current.tags : tags(input.patch.tags) }; if (candidate.direction === "transfer") { const fromId = candidate.account ? resolveAccountRef(accounts.accounts, candidate.account) : undefined; const toId = candidate.counterAccount ? resolveAccountRef(accounts.accounts, candidate.counterAccount) : undefined; validateTransferAccounts(fromId, toId); } const saved = await saveAccountingRecord(plugin(), candidate, { expectedUpdatedAt: input.expectedUpdatedAt }); const verified = await findAccountingRecordById(plugin(), saved.recordId); if (!verified || verified.updatedAt !== saved.updatedAt || Object.entries(patch).some(([key, value]) => key !== "tags" && ((verified as unknown as Record<string, unknown>)[key] ?? "") !== ((value as unknown) ?? "")) || (patch.tags !== undefined && verified.tags !== tags(patch.tags))) throw new Error("记账记录更新后验证失败"); return safeRecord(verified); }) },
    { action: "archive_record", tool: actionTool("archive_record", archiveRecordSchema, false, async (input: z.infer<typeof archiveRecordSchema>) => { const current = await findAccountingRecordById(plugin(), input.recordId); if (!current || current.updatedAt !== input.expectedUpdatedAt) throw new HomepageComponentConflictError("记账记录不存在或已变化"); await archiveAccountingRecord(plugin(), input.recordId, current.date, { expectedUpdatedAt: input.expectedUpdatedAt }); if (await findAccountingRecordById(plugin(), input.recordId)) throw new Error("记账记录归档后仍为活动状态"); return { recordId: input.recordId, archived: true }; }, "high") },
    { action: "list_accounts", tool: actionTool("list_accounts", listAccountsSchema, true, async (input: z.infer<typeof listAccountsSchema>) => { const result = await loadAccountingAccounts(plugin(), input.includeArchived); if (!result.status.ok) throw new Error(result.status.message); return { accounts: result.accounts }; }) },
    { action: "add_account", tool: actionTool("add_account", addAccountSchema, false, async (input: z.infer<typeof addAccountSchema>) => { const saved = await saveAccountingAccount(plugin(), input); const result = await loadAccountingAccounts(plugin()); if (!result.status.ok) throw new Error(result.status.message); const verified = result.accounts.find((a) => a.accountId === saved.accountId); if (!verified || verified.name !== input.name || verified.type !== input.type) throw new Error("资产账户写后验证失败"); return verified; }) },
    { action: "update_account", tool: actionTool("update_account", updateAccountSchema, false, async (input: z.infer<typeof updateAccountSchema>) => { const result = await loadAccountingAccounts(plugin()); if (!result.status.ok) throw new Error(result.status.message); const current = result.accounts.find((a) => a.accountId === input.accountId); if (!current || current.updatedAt !== input.expectedUpdatedAt) throw new HomepageComponentConflictError("资产账户不存在或已变化"); await saveAccountingAccount(plugin(), { ...current, ...input.patch }, { expectedUpdatedAt: input.expectedUpdatedAt }); const after = await loadAccountingAccounts(plugin()); if (!after.status.ok) throw new Error(after.status.message); const verified = after.accounts.find((a) => a.accountId === input.accountId); if (!verified || verified.updatedAt === input.expectedUpdatedAt || Object.entries(input.patch).some(([key, value]) => verified[key as keyof typeof verified] !== value)) throw new Error("资产账户更新后验证失败"); return verified; }) },
    { action: "archive_account", tool: actionTool("archive_account", archiveAccountSchema, false, async (input: z.infer<typeof archiveAccountSchema>) => { const result = await loadAccountingAccounts(plugin()); if (!result.status.ok) throw new Error(result.status.message); const current = result.accounts.find((a) => a.accountId === input.accountId); if (!current || current.updatedAt !== input.expectedUpdatedAt) throw new HomepageComponentConflictError("资产账户不存在或已变化"); await archiveAccountingAccount(plugin(), input.accountId, { expectedUpdatedAt: input.expectedUpdatedAt }); const after = await loadAccountingAccounts(plugin()); if (!after.status.ok) throw new Error(after.status.message); if (after.accounts.some((a) => a.accountId === input.accountId)) throw new Error("资产账户归档后仍为活动状态"); return { accountId: input.accountId, archived: true }; }, "high") },
    { action: "category_report", tool: actionTool("category_report", categorySchema, true, async (input: z.infer<typeof categorySchema>) => { const reference = input.referenceDate ? new Date(`${input.referenceDate}T00:00:00`) : new Date(); const range = getPeriodRange(input.period, reference); const loaded = await loadAccountingRecordsForRange(plugin(), range.start, range.end); if (!loaded.status.ok) throw new Error(loaded.status.message); return { ...range, direction: input.direction, categories: buildCategoryReport(loaded.records, input.period, reference, input.direction) }; }) },
  ];
}
