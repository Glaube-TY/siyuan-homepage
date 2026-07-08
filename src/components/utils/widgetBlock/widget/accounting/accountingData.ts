import {
    archiveAccountingRecord as archiveRecord,
    bulkMergeAccountingRecords,
    findAccountingRecordById as findRecordById,
    loadAccountingRecordsByRange,
    loadAccountingRecordsByYear,
    loadAllAccountingRecords,
    loadAccountingRecordYears as loadRecordYears,
    loadRecentAccountingRecords,
    saveAccountingRecord as saveRecord,
} from "./accountingLocalStore";
import { normalizeAccountingCurrency } from "./accountingConstants";
import type {
    AccountingDirection,
    AccountingLoadResult,
    AccountingRecord,
    AccountingRecordInput,
    AccountingStoreStatus,
} from "./accountingTypes";
import { formatAccountingDate } from "./accountingAnalytics";

function createStatus(ok: boolean, message: string): AccountingStoreStatus {
    return { ok, missingFields: [], message };
}

function normalizeDirection(value: unknown): AccountingDirection {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "income" || normalized === "收入") return "income";
    if (normalized === "transfer" || normalized === "转账") return "transfer";
    return "expense";
}

function normalizeDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : formatAccountingDate(new Date());
}

function createRecordId(): string {
    return `accounting-record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeRecord(input: AccountingRecordInput): AccountingRecord {
    const now = new Date().toISOString();
    const direction = normalizeDirection(input.direction);
    return {
        recordId: input.recordId || createRecordId(),
        rowId: input.rowId || input.recordId || createRecordId(),
        title: input.title?.trim() || "未命名记录",
        direction,
        amount: Math.max(0, Number(input.amount) || 0),
        date: normalizeDate(input.date || ""),
        categoryPrimary: input.categoryPrimary?.trim() || (direction === "income" ? "其他" : "其他"),
        categorySecondary: input.categorySecondary?.trim() || "",
        account: input.account?.trim() || "其他",
        counterAccount: input.counterAccount?.trim() || undefined,
        tags: input.tags?.trim() || "",
        note: input.note?.trim() || "",
        currency: normalizeAccountingCurrency(input.currency),
        createdAt: input.createdAt || now,
        updatedAt: input.updatedAt || now,
        archived: input.archived ?? false,
    };
}

function sortRecordsDesc(records: AccountingRecord[]): AccountingRecord[] {
    return [...records].sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        if (dc !== 0) return dc;
        return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export async function loadAccountingRecords(plugin: any): Promise<AccountingLoadResult> {
    try {
        const currentYear = new Date().getFullYear();
        const records = await loadAccountingRecordsByYear(plugin, currentYear);
        return {
            records: sortRecordsDesc(records),
            status: createStatus(true, `${records.length} 条记录`),
        };
    } catch (error) {
        return {
            records: [],
            status: createStatus(false, error instanceof Error ? error.message : "本地记账数据加载失败"),
        };
    }
}

export async function loadAccountingRecordsForYear(plugin: any, year: number): Promise<AccountingLoadResult> {
    try {
        const records = await loadAccountingRecordsByYear(plugin, year);
        return {
            records: sortRecordsDesc(records),
            status: createStatus(true, `${records.length} 条记录`),
        };
    } catch (error) {
        return {
            records: [],
            status: createStatus(false, error instanceof Error ? error.message : "本地记账数据加载失败"),
        };
    }
}

export async function loadAccountingRecordsForRange(
    plugin: any,
    startDate: string,
    endDate: string,
): Promise<AccountingLoadResult> {
    try {
        const records = await loadAccountingRecordsByRange(plugin, startDate, endDate);
        return {
            records: sortRecordsDesc(records),
            status: createStatus(true, `${records.length} 条记录`),
        };
    } catch (error) {
        return {
            records: [],
            status: createStatus(false, error instanceof Error ? error.message : "本地记账数据加载失败"),
        };
    }
}

export async function loadRecentRecords(plugin: any, limit: number): Promise<AccountingLoadResult> {
    try {
        const records = await loadRecentAccountingRecords(plugin, limit);
        return {
            records: sortRecordsDesc(records),
            status: createStatus(true, `${records.length} 条记录`),
        };
    } catch (error) {
        return {
            records: [],
            status: createStatus(false, error instanceof Error ? error.message : "本地记账数据加载失败"),
        };
    }
}

export async function loadAccountingRecordsAll(plugin: any): Promise<AccountingLoadResult> {
    try {
        const records = await loadAllAccountingRecords(plugin);
        return {
            records: sortRecordsDesc(records),
            status: createStatus(true, `${records.length} 条记录`),
        };
    } catch (error) {
        return {
            records: [],
            status: createStatus(false, error instanceof Error ? error.message : "本地记账数据加载失败"),
        };
    }
}

export async function loadAccountingRecordYears(plugin: any): Promise<number[]> {
    try {
        return await loadRecordYears(plugin);
    } catch {
        return [];
    }
}

export async function findAccountingRecordById(plugin: any, recordId: string): Promise<AccountingRecord | null> {
    try {
        return await findRecordById(plugin, recordId);
    } catch {
        return null;
    }
}

export async function saveAccountingRecord(
    plugin: any,
    input: AccountingRecordInput,
): Promise<AccountingRecord> {
    const record = normalizeRecord(input);
    await saveRecord(plugin, record);
    return record;
}

export async function archiveAccountingRecord(plugin: any, recordId: string, date?: string): Promise<void> {
    await archiveRecord(plugin, recordId, date);
}

export async function bulkSaveAccountingRecords(plugin: any, inputs: AccountingRecordInput[]): Promise<AccountingRecord[]> {
    const records = inputs.map(normalizeRecord);
    await bulkMergeAccountingRecords(plugin, records);
    return records;
}
