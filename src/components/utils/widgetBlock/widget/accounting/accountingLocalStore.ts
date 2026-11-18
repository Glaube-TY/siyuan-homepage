import { readPluginJsonFileChecked, writePluginJsonFileChecked, readSharedWidgetDirectoryChecked } from "../sharedLocalStorage/sharedLocalStorage";
import { signedAccountingBalance, inspectAccountingBalances, validateAccountingRecordCurrency, accountingCurrency, resolveAccountingAccount } from "./accountingBalances";
import type {
    AccountingAccount,
    AccountingAssetsFile,
    AccountingMonthSummary,
    AccountingRecord,
    AccountingRecordsFile,
    AccountingRecordsIndexFile,
    AccountingSummaryFile,
    AccountingYearSummary,
} from "./accountingTypes";
import {
    ACCOUNTING_DIR,
    ACCOUNTING_ASSETS_VERSION,
    ACCOUNTING_RECORDS_INDEX_VERSION,
    ACCOUNTING_RECORDS_VERSION,
    ACCOUNTING_SUMMARY_VERSION,
    ASSETS_FILE,
    ASSETS_SCHEMA,
    getRecordsFile,
    RECORDS_INDEX_FILE,
    RECORDS_INDEX_SCHEMA,
    RECORDS_SCHEMA,
    SUMMARY_FILE,
    SUMMARY_SCHEMA,
} from "./accountingStoragePaths";

function createRecordId(): string {
    return `accounting-record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAccountId(): string {
    return `accounting-asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRecordYear(record: { date?: string }): number {
    const year = parseInt(String(record.date || "").slice(0, 4), 10);
    return Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
}

function nowIso(): string {
    return new Date().toISOString();
}

let accountingMutationTail: Promise<void> = Promise.resolve();

export const ACCOUNTING_MUTATION_RPC = "homepage.accounting.mutate";
export type AccountingMutationAction = "saveRecord" | "archiveRecord" | "mergeRecords" | "saveAsset" | "archiveAsset" | "mergeAssets" | "updateSummary" | "rebuildSummary";
type AccountingMutationDispatcher = (action: AccountingMutationAction, args: unknown[]) => Promise<unknown>;
let mutationDispatcher: AccountingMutationDispatcher | null = null;

export function setAccountingMutationDispatcher(dispatcher: AccountingMutationDispatcher): void {
    mutationDispatcher = dispatcher;
}

async function runAccountingMutation<T>(action: AccountingMutationAction, args: unknown[], task: () => Promise<T>): Promise<T> {
    if (mutationDispatcher) {
        try {
            return await mutationDispatcher(action, args) as T;
        } catch (error) {
            // SiYuan keeps the rejected Error message in RPC data.
            const data = (error as { data?: unknown } | null)?.data;
            const prefix = `error invoking method "${ACCOUNTING_MUTATION_RPC}": promise rejected: Error: `;
            if (typeof data === "string" && data.startsWith(prefix)) {
                const message = data.slice(prefix.length).split("\n", 1)[0].trim();
                if (message) throw new Error(message);
            }
            throw error;
        }
    }
    const result = accountingMutationTail.then(task, task);
    accountingMutationTail = result.then(() => undefined, () => undefined);
    return result;
}

async function loadJsonFile(plugin: any, path: string): Promise<unknown> {
    return readPluginJsonFileChecked(plugin, path);
}

async function saveJsonFile(plugin: any, path: string, data: unknown): Promise<void> {
    await writePluginJsonFileChecked(plugin, path, data);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertFile(raw: unknown, schema: string, version: number): asserts raw is Record<string, unknown> {
    if (!isObject(raw) || raw.schema !== schema || raw.version !== version) {
        throw new Error("记账文件结构或版本异常，请备份数据后检查，已停止写入");
    }
}

function filterRecords(records: unknown[]): AccountingRecord[] {
    return records.filter((r): r is AccountingRecord => {
        if (!r || typeof r !== "object") return false;
        const rec = r as Record<string, unknown>;
        return typeof rec.recordId === "string" && !!rec.recordId && typeof rec.date === "string"
            && typeof rec.amount === "number" && Number.isFinite(rec.amount) && rec.amount >= 0
            && ["expense", "income", "transfer"].includes(String(rec.direction))
            && typeof rec.account === "string" && typeof rec.currency === "string"
            && (rec.archived === undefined || typeof rec.archived === "boolean");
    });
}

function filterAssets(assets: unknown[]): AccountingAccount[] {
    return assets.filter((a): a is AccountingAccount => {
        if (!a || typeof a !== "object") return false;
        const acct = a as Record<string, unknown>;
        return typeof acct.accountId === "string" && !!acct.accountId.trim()
            && typeof acct.name === "string" && !!acct.name.trim()
            && typeof acct.type === "string" && typeof acct.currency === "string" && !!acct.currency.trim()
            && typeof acct.openingBalance === "number" && Number.isFinite(acct.openingBalance)
            && typeof acct.currentBalance === "number" && Number.isFinite(acct.currentBalance)
            && (acct.archived === undefined || typeof acct.archived === "boolean")
            && (acct.aliases === undefined || (Array.isArray(acct.aliases) && acct.aliases.every(name => typeof name === "string")))
            && (acct.balanceConvention === undefined || acct.balanceConvention === "signed");
    });
}

// ── Records file ──

function emptyRecordsFile(year: number): AccountingRecordsFile {
    return {
        schema: RECORDS_SCHEMA,
        version: ACCOUNTING_RECORDS_VERSION,
        year,
        updatedAt: nowIso(),
        records: [],
    };
}

function normalizeRecordsFile(raw: unknown, expectedYear: number): AccountingRecordsFile {
    const empty = emptyRecordsFile(expectedYear);
    if (raw === null) return empty;
    assertFile(raw, RECORDS_SCHEMA, ACCOUNTING_RECORDS_VERSION);
    if (raw.year !== expectedYear || !Array.isArray(raw.records) || filterRecords(raw.records).length !== raw.records.length) {
        throw new Error("记账年度明细异常，已保留原文件并停止写入");
    }
    return {
        ...raw,
        schema: typeof raw.schema === "string" ? raw.schema : empty.schema,
        version: typeof raw.version === "number" ? raw.version : empty.version,
        year: typeof raw.year === "number" ? raw.year : expectedYear,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : empty.updatedAt,
        records: Array.isArray(raw.records) ? filterRecords(raw.records) : empty.records,
    };
}

export async function loadAccountingRecordsFile(plugin: any, year: number): Promise<AccountingRecordsFile> {
    const raw = await loadJsonFile(plugin, getRecordsFile(year));
    if (raw === null && (await loadAccountingRecordsIndex(plugin)).years.includes(year)) {
        throw new Error(`记账年度明细缺失或尚未同步完成：${year}，已停止写入`);
    }
    return normalizeRecordsFile(raw, year);
}

async function saveAccountingRecordsFile(plugin: any, file: AccountingRecordsFile): Promise<void> {
    file.updatedAt = nowIso();
    file.schema = RECORDS_SCHEMA;
    file.version = ACCOUNTING_RECORDS_VERSION;
    await saveJsonFile(plugin, getRecordsFile(file.year), file);
}

// ── Records index ──

function emptyRecordsIndex(): AccountingRecordsIndexFile {
    return {
        schema: RECORDS_INDEX_SCHEMA,
        version: ACCOUNTING_RECORDS_INDEX_VERSION,
        updatedAt: nowIso(),
        years: [],
    };
}

function normalizeRecordsIndex(raw: unknown): AccountingRecordsIndexFile {
    const empty = emptyRecordsIndex();
    if (raw === null) return empty;
    assertFile(raw, RECORDS_INDEX_SCHEMA, ACCOUNTING_RECORDS_INDEX_VERSION);
    if (!Array.isArray(raw.years) || raw.years.some((year) => !Number.isInteger(year) || Number(year) <= 1900)) throw new Error("记账文件内容异常，已保留原文件并停止写入");
    return {
        schema: typeof raw.schema === "string" ? raw.schema : empty.schema,
        version: typeof raw.version === "number" ? raw.version : empty.version,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : empty.updatedAt,
        years: Array.isArray(raw.years)
            ? raw.years.map((y) => Number(y)).filter((y) => Number.isFinite(y) && y > 1900)
            : empty.years,
    };
}

export async function loadAccountingRecordsIndex(plugin: any): Promise<AccountingRecordsIndexFile> {
    const raw = await loadJsonFile(plugin, RECORDS_INDEX_FILE);
    if (raw === null) {
        const entries = await readSharedWidgetDirectoryChecked(ACCOUNTING_DIR, plugin);
        if (entries.some((entry) => /^accounting-records-\d+\.json$/.test(entry.name))) {
            throw new Error("记账年份索引缺失，但年度明细仍存在，已停止写入");
        }
    }
    return normalizeRecordsIndex(raw);
}

async function saveAccountingRecordsIndex(plugin: any, index: AccountingRecordsIndexFile): Promise<void> {
    index.updatedAt = nowIso();
    index.schema = RECORDS_INDEX_SCHEMA;
    index.version = ACCOUNTING_RECORDS_INDEX_VERSION;
    index.years = Array.from(new Set(index.years)).sort((a, b) => a - b);
    await saveJsonFile(plugin, RECORDS_INDEX_FILE, index);
}

async function ensureRecordsIndexYear(plugin: any, year: number, index: AccountingRecordsIndexFile): Promise<void> {
    if (!index.years.includes(year)) {
        index.years.push(year);
        await saveAccountingRecordsIndex(plugin, index);
    }
}

// ── Assets file ──

function emptyAssetsFile(): AccountingAssetsFile {
    return {
        schema: ASSETS_SCHEMA,
        version: ACCOUNTING_ASSETS_VERSION,
        updatedAt: nowIso(),
        assets: [],
    };
}

function normalizeAssetsFile(raw: unknown): AccountingAssetsFile {
    const empty = emptyAssetsFile();
    if (raw === null) return empty;
    if (!isObject(raw) || raw.schema !== ASSETS_SCHEMA || typeof raw.version !== "number" || ![1, ACCOUNTING_ASSETS_VERSION].includes(raw.version)) {
        throw new Error("账户文件结构或版本异常，原文件已保留");
    }
    if (!Array.isArray(raw.assets) || filterAssets(raw.assets).length !== raw.assets.length) throw new Error("记账文件内容异常，已保留原文件并停止写入");
    if (new Set((raw.assets as AccountingAccount[]).map(a => a.accountId)).size !== raw.assets.length) throw new Error("账户标识重复，原文件已保留");
    return {
        ...raw,
        schema: typeof raw.schema === "string" ? raw.schema : empty.schema,
        version: typeof raw.version === "number" ? raw.version : empty.version,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : empty.updatedAt,
        assets: Array.isArray(raw.assets) ? filterAssets(raw.assets) : empty.assets,
    };
}

export async function loadAccountingAssetsFile(plugin: any): Promise<AccountingAssetsFile> {
    const raw = await loadJsonFile(plugin, ASSETS_FILE);
    return normalizeAssetsFile(raw);
}

async function saveAccountingAssetsFile(plugin: any, file: AccountingAssetsFile): Promise<void> {
    const previous = await loadJsonFile(plugin, ASSETS_FILE);
    if (previous !== null) {
        const before = normalizeAssetsFile(previous);
        const changed = new Set(before.assets.filter(old => {
            const next = file.assets.find(a => a.accountId === old.accountId);
            return !next || ["openingBalance", "currentBalance", "currency", "type", "balanceConvention", "archived"]
                .some(key => (old as unknown as Record<string, unknown>)[key] !== (next as unknown as Record<string, unknown>)[key]);
        }).map(a => a.accountId));
        if (before.version === 1 || changed.size > 0) {
            const backup = ACCOUNTING_DIR + "/backups/accounting-assets-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + ".json";
            await saveJsonFile(plugin, backup, previous);
            file.assets = file.assets.map(a => changed.has(a.accountId) ? { ...a, balanceBackupPath: backup } : a);
        }
    }
    file.updatedAt = nowIso();
    file.schema = ASSETS_SCHEMA;
    file.version = ACCOUNTING_ASSETS_VERSION;
    await saveJsonFile(plugin, ASSETS_FILE, normalizeAssetsFile(file));
}

// ── Summary index ──

function emptySummaryFile(): AccountingSummaryFile {
    return {
        schema: SUMMARY_SCHEMA,
        version: ACCOUNTING_SUMMARY_VERSION,
        updatedAt: nowIso(),
        years: {},
        months: {},
    };
}

function normalizeSummaryFile(raw: unknown): AccountingSummaryFile {
    const empty = emptySummaryFile();
    if (raw === null) return empty;
    assertFile(raw, SUMMARY_SCHEMA, ACCOUNTING_SUMMARY_VERSION);
    if (!isObject(raw.years) || !isObject(raw.months)) throw new Error("记账文件内容异常，已保留原文件并停止写入");
    const years: Record<string, AccountingYearSummary> = {};
    const months: Record<string, AccountingMonthSummary> = {};
    if (isObject(raw.years)) {
        for (const [key, value] of Object.entries(raw.years)) {
            if (!isObject(value)) continue;
            years[key] = {
                income: Math.max(0, Number(value.income) || 0),
                expense: Math.max(0, Number(value.expense) || 0),
                transfer: Math.max(0, Number(value.transfer) || 0),
                count: Math.max(0, Number(value.count) || 0),
            };
        }
    }
    if (isObject(raw.months)) {
        for (const [key, value] of Object.entries(raw.months)) {
            if (!isObject(value)) continue;
            const categoryExpense: Record<string, number> = {};
            if (isObject(value.categoryExpense)) {
                for (const [cat, amount] of Object.entries(value.categoryExpense)) {
                    categoryExpense[cat] = Math.max(0, Number(amount) || 0);
                }
            }
            months[key] = {
                income: Math.max(0, Number(value.income) || 0),
                expense: Math.max(0, Number(value.expense) || 0),
                transfer: Math.max(0, Number(value.transfer) || 0),
                count: Math.max(0, Number(value.count) || 0),
                categoryExpense,
            };
        }
    }
    return {
        schema: typeof raw.schema === "string" ? raw.schema : empty.schema,
        version: typeof raw.version === "number" ? raw.version : empty.version,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : empty.updatedAt,
        years,
        months,
    };
}

export async function loadAccountingSummaryIndex(plugin: any): Promise<AccountingSummaryFile> {
    const raw = await loadJsonFile(plugin, SUMMARY_FILE);
    return normalizeSummaryFile(raw);
}

export async function saveAccountingSummaryIndex(plugin: any, summary: AccountingSummaryFile): Promise<void> {
    summary.updatedAt = nowIso();
    summary.schema = SUMMARY_SCHEMA;
    summary.version = ACCOUNTING_SUMMARY_VERSION;
    await saveJsonFile(plugin, SUMMARY_FILE, summary);
}

function buildYearSummary(records: AccountingRecord[]): AccountingYearSummary {
    let income = 0;
    let expense = 0;
    let transfer = 0;
    let count = 0;
    for (const record of records) {
        if (record.archived) continue;
        count++;
        const amount = Math.max(0, Number(record.amount) || 0);
        if (record.direction === "income") income += amount;
        else if (record.direction === "expense") expense += amount;
        else if (record.direction === "transfer") transfer += amount;
    }
    return {
        income: Number(income.toFixed(2)),
        expense: Number(expense.toFixed(2)),
        transfer: Number(transfer.toFixed(2)),
        count,
    };
}

function buildMonthSummary(records: AccountingRecord[]): AccountingMonthSummary {
    const summary = buildYearSummary(records);
    const categoryExpense: Record<string, number> = {};
    for (const record of records) {
        if (record.archived || record.direction !== "expense") continue;
        const amount = Math.max(0, Number(record.amount) || 0);
        const cat = record.categoryPrimary?.trim() || "其他";
        categoryExpense[cat] = Number(((categoryExpense[cat] || 0) + amount).toFixed(2));
    }
    return { ...summary, categoryExpense };
}

export async function rebuildAccountingSummaryIndex(plugin: any): Promise<void> {
    return runAccountingMutation("rebuildSummary", [], () => rebuildAccountingSummaryIndexUnlocked(plugin));
}

async function rebuildAccountingSummaryIndexUnlocked(plugin: any): Promise<void> {
    const index = await loadAccountingRecordsIndex(plugin);
    const allRecords: AccountingRecord[] = [];
    for (const year of index.years) {
        const file = await loadAccountingRecordsFile(plugin, year);
        allRecords.push(...file.records);
    }

    const years = new Map<number, AccountingRecord[]>();
    const months = new Map<string, AccountingRecord[]>();
    for (const record of allRecords) {
        if (record.archived) continue;
        const year = getRecordYear(record);
        const month = record.date.slice(0, 7);
        if (!years.has(year)) years.set(year, []);
        years.get(year)!.push(record);
        if (month) {
            if (!months.has(month)) months.set(month, []);
            months.get(month)!.push(record);
        }
    }

    const summary = emptySummaryFile();
    for (const [year, recs] of years.entries()) {
        summary.years[String(year)] = buildYearSummary(recs);
    }
    for (const [month, recs] of months.entries()) {
        summary.months[month] = buildMonthSummary(recs);
    }
    await saveAccountingSummaryIndex(plugin, summary);
}

export async function updateAccountingSummaryIndexForYears(plugin: any, years: number[]): Promise<void> {
    return runAccountingMutation("updateSummary", [years], () => updateAccountingSummaryIndexForYearsUnlocked(plugin, years));
}

async function updateAccountingSummaryIndexForYearsUnlocked(plugin: any, years: number[]): Promise<void> {
    if (years.length === 0) return;
    const summary = await loadAccountingSummaryIndex(plugin);
    for (const year of years) {
        const file = await loadAccountingRecordsFile(plugin, year);
        summary.years[String(year)] = buildYearSummary(file.records);

        // Rebuild all months for this year
        const months = new Map<string, AccountingRecord[]>();
        for (const record of file.records) {
            if (record.archived) continue;
            const month = record.date.slice(0, 7);
            if (!month) continue;
            if (!months.has(month)) months.set(month, []);
            months.get(month)!.push(record);
        }
        for (const [month, recs] of months.entries()) {
            summary.months[month] = buildMonthSummary(recs);
        }

        // Remove stale months that no longer belong to this year
        const yearPrefix = `${year}-`;
        for (const month of Object.keys(summary.months)) {
            if (month.startsWith(yearPrefix)) {
                const stillHas = file.records.some((r) => !r.archived && r.date.startsWith(month));
                if (!stillHas) {
                    delete summary.months[month];
                }
            }
        }
    }
    await saveAccountingSummaryIndex(plugin, summary);
}

// ── Record operations ──

export async function loadAccountingRecordsByYear(plugin: any, year: number, includeArchived = false): Promise<AccountingRecord[]> {
    const file = await loadAccountingRecordsFile(plugin, year);
    return includeArchived ? file.records : file.records.filter((r) => !r.archived);
}

export async function loadAccountingRecordsByRange(
    plugin: any,
    startDate: string,
    endDate: string,
    includeArchived = false,
): Promise<AccountingRecord[]> {
    const startYear = parseInt(startDate.slice(0, 4), 10);
    const endYear = parseInt(endDate.slice(0, 4), 10);
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return [];
    const records: AccountingRecord[] = [];
    for (let year = startYear; year <= endYear; year++) {
        const yearRecords = await loadAccountingRecordsByYear(plugin, year, includeArchived);
        records.push(...yearRecords.filter((r) => r.date >= startDate && r.date <= endDate));
    }
    return records;
}

export async function loadRecentAccountingRecords(plugin: any, limit: number): Promise<AccountingRecord[]> {
    const index = await loadAccountingRecordsIndex(plugin);
    const years = [...index.years].sort((a, b) => b - a);
    const records: AccountingRecord[] = [];
    for (const year of years) {
        const yearRecords = await loadAccountingRecordsByYear(plugin, year);
        records.push(...yearRecords);
        if (records.length >= limit) break;
    }
    return records
        .filter((r) => !r.archived)
        .sort((a, b) => {
            const dc = b.date.localeCompare(a.date);
            if (dc !== 0) return dc;
            return b.updatedAt.localeCompare(a.updatedAt);
        })
        .slice(0, limit);
}

export async function loadAllAccountingRecords(plugin: any, includeArchived = false): Promise<AccountingRecord[]> {
    const index = await loadAccountingRecordsIndex(plugin);
    const records: AccountingRecord[] = [];
    for (const year of index.years) {
        const file = await loadAccountingRecordsFile(plugin, year);
        records.push(...file.records.filter((r) => includeArchived || !r.archived));
    }
    return records.sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        if (dc !== 0) return dc;
        return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export async function loadAccountingRecordYears(plugin: any): Promise<number[]> {
    const index = await loadAccountingRecordsIndex(plugin);
    return [...index.years].sort((a, b) => b - a);
}

export async function findAccountingRecordById(plugin: any, recordId: string): Promise<AccountingRecord | null> {
    const index = await loadAccountingRecordsIndex(plugin);
    for (const year of index.years) {
        const file = await loadAccountingRecordsFile(plugin, year);
        const record = file.records.find((r) => r.recordId === recordId && !r.archived);
        if (record) return record;
    }
    return null;
}

async function findRecordLocation(plugin: any, recordId: string): Promise<{ year: number; index: number } | null> {
    const recordsIndex = await loadAccountingRecordsIndex(plugin);
    for (const year of recordsIndex.years) {
        const file = await loadAccountingRecordsFile(plugin, year);
        const idx = file.records.findIndex((r) => r.recordId === recordId);
        if (idx >= 0) return { year, index: idx };
    }
    return null;
}

export async function saveAccountingRecord(
    plugin: any,
    record: AccountingRecord,
    options: { expectedUpdatedAt?: string } = {},
): Promise<AccountingRecord> {
    return runAccountingMutation("saveRecord", [record, options], async () => {
    const now = nowIso();
    if (!Number.isFinite(record.amount) || record.amount < 0) throw new Error("流水金额无效");
    validateAccountingRecordCurrency(record, (await loadAccountingAssetsFile(plugin)).assets);
    let normalized: AccountingRecord = {
        ...record,
        recordId: record.recordId || createRecordId(),
        rowId: record.rowId || record.recordId || createRecordId(),
        amount: Math.max(0, Number(record.amount) || 0),
        updatedAt: now,
        createdAt: record.createdAt || now,
        archived: record.archived ?? false,
    };
    const newYear = getRecordYear(normalized);

    const oldLocation = await findRecordLocation(plugin, normalized.recordId);
    const oldFile = oldLocation ? await loadAccountingRecordsFile(plugin, oldLocation.year) : null;
    const current = oldLocation ? oldFile?.records[oldLocation.index] : null;
    if (options.expectedUpdatedAt !== undefined && current?.updatedAt !== options.expectedUpdatedAt) {
        throw new Error("记账记录已被其他操作修改，请重新读取");
    }
    if (current) normalized = { ...current, ...normalized, rowId: current.rowId, createdAt: current.createdAt };
    const affectedYears = new Set<number>([newYear]);
    const recordsIndex = await loadAccountingRecordsIndex(plugin);
    const newFile = await loadAccountingRecordsFile(plugin, newYear);
    const idx = newFile.records.findIndex((r) => r.recordId === normalized.recordId);
    if (idx >= 0) {
        newFile.records[idx] = normalized;
    } else {
        newFile.records.push(normalized);
    }
    await saveAccountingRecordsFile(plugin, newFile);
    await ensureRecordsIndexYear(plugin, newYear, recordsIndex);
    // Keep the source until both the destination file and its index are verified.
    if (oldFile && oldLocation && oldLocation.year !== newYear) {
        oldFile.records.splice(oldLocation.index, 1);
        try {
            await saveAccountingRecordsFile(plugin, oldFile);
        } catch {
            throw new Error("目标年度已保存，原年度清理结果未确认，请重新读取后处理，勿重复提交");
        }
        affectedYears.add(oldLocation.year);
    }
    await updateAccountingSummaryIndexForYearsUnlocked(plugin, Array.from(affectedYears));
    return normalized;
    });
}

export async function archiveAccountingRecord(
    plugin: any,
    recordId: string,
    date?: string,
    options: { expectedUpdatedAt?: string } = {},
): Promise<void> {
    return runAccountingMutation("archiveRecord", [recordId, date ?? null, options], async () => {
    if (date) {
        const year = parseInt(date.slice(0, 4), 10);
        if (Number.isFinite(year)) {
            const file = await loadAccountingRecordsFile(plugin, year);
            const record = file.records.find((r) => r.recordId === recordId);
            if (record) {
                if (options.expectedUpdatedAt !== undefined && record.updatedAt !== options.expectedUpdatedAt) throw new Error("记账记录已被其他操作修改，请重新读取");
                record.archived = true;
                record.updatedAt = nowIso();
                await saveAccountingRecordsFile(plugin, file);
                await updateAccountingSummaryIndexForYearsUnlocked(plugin, [year]);
                return;
            }
        }
    }

    const location = await findRecordLocation(plugin, recordId);
    if (!location) throw new Error("记账记录不存在");
    const file = await loadAccountingRecordsFile(plugin, location.year);
    const record = file.records[location.index];
    if (options.expectedUpdatedAt !== undefined && record.updatedAt !== options.expectedUpdatedAt) throw new Error("记账记录已被其他操作修改，请重新读取");
    record.archived = true;
    record.updatedAt = nowIso();
    await saveAccountingRecordsFile(plugin, file);
    await updateAccountingSummaryIndexForYearsUnlocked(plugin, [location.year]);
    });
}

export async function bulkMergeAccountingRecords(plugin: any, records: AccountingRecord[], mode?: "backup"): Promise<number> {
    if (records.length === 0) return 0;
    return runAccountingMutation("mergeRecords", mode ? [records, mode] : [records], async () => {

    const accounts = (await loadAccountingAssetsFile(plugin)).assets;
    for (const record of records) {
        if (!Number.isFinite(record.amount) || record.amount < 0) throw new Error("导入流水金额无效");
        // Backups can contain historical account links that no longer resolve.
        if (mode !== "backup") validateAccountingRecordCurrency(record, accounts);
    }
    const byYear = new Map<number, AccountingRecord[]>();
    for (const record of records) {
        const year = getRecordYear(record);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(record);
    }

    let added = 0;
    const affectedYears: number[] = [];
    const recordsIndex = await loadAccountingRecordsIndex(plugin);
    for (const [year, incoming] of byYear.entries()) {
        const file = await loadAccountingRecordsFile(plugin, year);
        const existingIds = new Set(file.records.map((r) => r.recordId));
        const now = nowIso();
        for (const record of incoming) {
            if (existingIds.has(record.recordId)) continue;
            existingIds.add(record.recordId);
            file.records.push({
                ...record,
                rowId: record.rowId || record.recordId,
                amount: Math.max(0, Number(record.amount) || 0),
                updatedAt: record.updatedAt || now,
                createdAt: record.createdAt || now,
                archived: record.archived ?? false,
            });
            added++;
        }
        if (incoming.length > 0) {
            await saveAccountingRecordsFile(plugin, file);
            await ensureRecordsIndexYear(plugin, year, recordsIndex);
            affectedYears.push(year);
        }
    }
    if (affectedYears.length > 0) {
        await updateAccountingSummaryIndexForYearsUnlocked(plugin, affectedYears);
    }
    return added;
    });
}

// ── Asset (account) operations ──

export async function readAccountingAssets(plugin: any, includeArchived = false): Promise<AccountingAccount[]> {
    const file = await loadAccountingAssetsFile(plugin);
    return includeArchived ? file.assets : file.assets.filter((a) => !a.archived);
}

export async function writeAccountingAsset(
    plugin: any,
    asset: AccountingAccount,
    options: { expectedUpdatedAt?: string } = {},
): Promise<AccountingAccount> {
    return runAccountingMutation("saveAsset", [asset, options], async () => {
    const now = nowIso();
    const normalized: AccountingAccount = {
        ...asset,
        accountId: asset.accountId || createAccountId(),
        rowId: asset.rowId || asset.accountId || createAccountId(),
        openingBalance: signedAccountingBalance(asset.openingBalance),
        currentBalance: signedAccountingBalance(asset.currentBalance),
        sortOrder: Number.isFinite(Number(asset.sortOrder)) ? Number(asset.sortOrder) : 0,
        updatedAt: now,
        createdAt: asset.createdAt || now,
        archived: asset.archived ?? false,
    };

    const file = await loadAccountingAssetsFile(plugin);
    const idx = file.assets.findIndex((a) => a.accountId === normalized.accountId);
    if (options.expectedUpdatedAt !== undefined && (idx < 0 || file.assets[idx].updatedAt !== options.expectedUpdatedAt)) {
        throw new Error("资产账户已被其他操作修改，请重新读取");
    }
    if (idx >= 0) {
        const records = await loadAllAccountingRecords(plugin, true);
        if (accountingCurrency(file.assets[idx].currency) !== accountingCurrency(normalized.currency)
            && records.some(r => [r.account, r.counterAccount].some(ref => resolveAccountingAccount(ref, file.assets, r.currency)?.accountId === normalized.accountId))) {
            throw new Error("账户已有流水，不能直接修改币种；请新建对应币种的账户");
        }
        if (!file.assets[idx].archived && normalized.archived) {
            const report = inspectAccountingBalances(file.assets, records);
            if (report.issues.has(normalized.accountId) || report.balances.get(normalized.accountId) !== 0) throw new Error("账户仍有余额、欠款或待核对项目，请先处理后关闭");
        }
        normalized.rowId = file.assets[idx].rowId;
        normalized.createdAt = file.assets[idx].createdAt;
        if (file.assets[idx].name !== normalized.name) {
            normalized.aliases = [...new Set([...(file.assets[idx].aliases || []), file.assets[idx].name, ...(normalized.aliases || [])])];
        }
        file.assets[idx] = { ...file.assets[idx], ...normalized };
    } else {
        file.assets.push(normalized);
    }
    await saveAccountingAssetsFile(plugin, file);
    return file.assets.find(a => a.accountId === normalized.accountId)!;
    });
}

export async function archiveAccountingAsset(plugin: any, accountId: string, options: { expectedUpdatedAt?: string } = {}): Promise<void> {
    return runAccountingMutation("archiveAsset", [accountId, options], async () => {
    const file = await loadAccountingAssetsFile(plugin);
    const asset = file.assets.find((a) => a.accountId === accountId);
    if (!asset) throw new Error("资产不存在");
    if (options.expectedUpdatedAt !== undefined && asset.updatedAt !== options.expectedUpdatedAt) throw new Error("资产账户已被其他操作修改，请重新读取");
    if (asset.archived) return;
    const report = inspectAccountingBalances(file.assets, await loadAllAccountingRecords(plugin));
    if (report.issues.has(asset.accountId)) throw new Error("请先核对该账户余额，再关闭账户");
    if (report.balances.get(asset.accountId) !== 0) throw new Error("账户尚有余额或欠款，请先转移余额或结清后再关闭");
    asset.archived = true;
    asset.updatedAt = nowIso();
    await saveAccountingAssetsFile(plugin, file);
    });
}

export async function bulkMergeAccountingAssets(plugin: any, assets: AccountingAccount[], mode?: "backup"): Promise<number> {
    if (assets.length === 0) return 0;
    return runAccountingMutation("mergeAssets", mode ? [assets, mode] : [assets], async () => {
    const file = await loadAccountingAssetsFile(plugin);
    const existingIds = new Set(file.assets.map((a) => a.accountId));
    const existingNames = new Set(file.assets.map((a) => accountingCurrency(a.currency) + ":" + a.name.toLowerCase()));
    const now = nowIso();
    let added = 0;
    for (const asset of assets) {
        if (existingIds.has(asset.accountId)) continue;
        if (mode !== "backup" && asset.name && existingNames.has(accountingCurrency(asset.currency) + ":" + asset.name.toLowerCase())) continue;
        const id = asset.accountId || createAccountId();
        existingIds.add(id);
        if (asset.name) existingNames.add(accountingCurrency(asset.currency) + ":" + asset.name.toLowerCase());
        file.assets.push({
            ...asset,
            accountId: id,
            rowId: asset.rowId || id,
            openingBalance: signedAccountingBalance(asset.openingBalance),
            currentBalance: signedAccountingBalance(asset.currentBalance),
            sortOrder: Number.isFinite(Number(asset.sortOrder)) ? Number(asset.sortOrder) : 0,
            updatedAt: now,
            createdAt: asset.createdAt || now,
            archived: asset.archived ?? false,
        });
        added++;
    }
    if (added > 0) {
        await saveAccountingAssetsFile(plugin, file);
    }
    return added;
    });
}
