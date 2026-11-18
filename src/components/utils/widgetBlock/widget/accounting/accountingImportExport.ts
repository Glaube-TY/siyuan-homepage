import { formatAccountingDate } from "./accountingAnalytics";
import { accountingCurrency, resolveAccountingAccount, validateAccountingRecordCurrency } from "./accountingBalances";
import {
    bulkMergeAccountingAssets,
    bulkMergeAccountingRecords,
    loadAccountingSummaryIndex,
} from "./accountingLocalStore";
import { ACCOUNTING_EXPORT_VERSION } from "./accountingStoragePaths";
import { loadAccountingAccounts, normalizeAccount } from "./accountingAccountData";
import { loadAccountingRecordsAll, normalizeRecord } from "./accountingData";
import type { AccountingAppSettings } from "./accountingSettings";
import type {
    AccountingAccount,
    AccountingAccountInput,
    AccountingRecord,
} from "./accountingTypes";

export type AccountingImportFormat =
    | "auto"
    | "qianji-csv"
    | "qianji-json"
    | "siyuan-homepage-json"
    | "generic-csv";

export interface AccountingImportRow {
    recordId: string;
    title: string;
    direction: "expense" | "income" | "transfer";
    amount: number;
    date: string;
    categoryPrimary: string;
    categorySecondary: string;
    account: string;
    counterAccount?: string;
    tags: string;
    note: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
    sourceFormat: AccountingImportFormat;
    rawType?: string;
    assetRef?: string;
    counterAssetRef?: string;
    reviewAction?: "confirmed" | "skip";
    rowId?: string;
    archived?: boolean;
}

export interface AccountingImportPreview {
    format: AccountingImportFormat;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    expenseCount: number;
    incomeCount: number;
    transferCount: number;
    duplicateCount: number;
    newAssetCount: number;
    sampleRows: AccountingImportRow[];
    errors: string[];
}

export interface AccountingImportResult {
    successCount: number;
    skippedCount: number;
    failedCount: number;
    newAssetCount: number;
    errors: Array<{ index: number; recordId: string; message: string }>;
}

export interface AccountingExportPayload {
    schema: "siyuan-homepage-accounting";
    version: number;
    exportedAt: string;
    settings: AccountingAppSettings;
    records: AccountingRecord[];
    assets: AccountingAccount[];
}

export interface AccountingImportOptions {
    plugin: any;
    appSettings: AccountingAppSettings;
    rows: AccountingImportRow[];
    existingRecordIds: Set<string>;
    existingAccounts?: AccountingAccount[];
    onProgress?: (progress: {
        current: number;
        total: number;
        success: number;
        skipped: number;
        failed: number;
    }) => void;
}

export interface AccountingExportOptions {
    plugin: any;
    appSettings: AccountingAppSettings;
}

// ── CSV parser ──

export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let insideQuotes = false;
    let i = 0;

    while (i < text.length) {
        const char = text[i];
        const next = text[i + 1];

        if (insideQuotes) {
            if (char === '"') {
                if (next === '"') {
                    cell += '"';
                    i += 2;
                } else {
                    insideQuotes = false;
                    i++;
                }
            } else {
                cell += char;
                i++;
            }
        } else {
            if (char === '"') {
                insideQuotes = true;
                i++;
            } else if (char === ",") {
                row.push(cell);
                cell = "";
                i++;
            } else if (char === "\r") {
                if (next === "\n") i++;
                row.push(cell);
                rows.push(row);
                row = [];
                cell = "";
                i++;
            } else if (char === "\n") {
                row.push(cell);
                rows.push(row);
                row = [];
                cell = "";
                i++;
            } else {
                cell += char;
                i++;
            }
        }
    }

    if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    // Drop a trailing empty row
    if (
        rows.length > 0 &&
        rows[rows.length - 1].length === 1 &&
        rows[rows.length - 1][0] === ""
    ) {
        rows.pop();
    }

    return rows;
}

function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function cleanCell(value: string): string {
    return value === undefined || value === null ? "" : String(value).trim();
}

function parseAmount(value: string): number {
    const num = Number(cleanCell(value).replace(/,/g, ""));
    return Number.isFinite(num) ? Math.abs(num) : 0;
}

function parseDate(value: string): string {
    const cleaned = cleanCell(value);
    const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const d = new Date(cleaned);
    return Number.isFinite(d.getTime()) ? formatAccountingDate(d) : "";
}

function createImportId(prefix: string, id: string): string {
    return `${prefix}:${cleanCell(id) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`}`;
}

function buildTitle(parts: (string | undefined)[]): string {
    for (const part of parts) {
        const v = cleanCell(part || "");
        if (v) return v;
    }
    return "钱迹账单";
}

// ── QianJi type mapping ──

function mapQianjiType(
    type: string,
): { direction: "expense" | "income" | "transfer"; noteSuffix?: string } {
    const t = cleanCell(type);
    switch (t) {
        case "支出":
            return { direction: "expense" };
        case "收入":
            return { direction: "income" };
        case "转账":
            return { direction: "transfer" };
        case "还款":
            return { direction: "transfer", noteSuffix: "原类型：还款" };
        case "报销":
            return { direction: "expense", noteSuffix: "报销" };
        case "报销记录":
            return { direction: "income", noteSuffix: "原类型：报销记录" };
        case "退款":
            return { direction: "income", noteSuffix: "原类型：退款" };
        case "债务-借入":
            return { direction: "transfer", noteSuffix: "原类型：债务-借入" };
        case "债务-还款":
            return { direction: "transfer", noteSuffix: "原类型：债务-还款" };
        default:
            return { direction: "expense", noteSuffix: `原类型：${t || "未识别"}` };
    }
}

function buildQianjiNote(
    baseNote: string,
    extra: {
        book?: string;
        bookkeeper?: string;
        flag?: string;
        related?: string;
        fee?: string;
        coupon?: string;
        reimbursed?: string;
        noteSuffix?: string;
    },
): string {
    const parts: string[] = [];
    const base = cleanCell(baseNote);
    if (base) parts.push(base);

    const tags: string[] = [];
    if (extra.noteSuffix) tags.push(extra.noteSuffix);
    if (cleanCell(extra.reimbursed)) tags.push(`已报销:${cleanCell(extra.reimbursed)}`);
    if (cleanCell(extra.fee)) tags.push(`手续费:${cleanCell(extra.fee)}`);
    if (cleanCell(extra.coupon)) tags.push(`优惠券:${cleanCell(extra.coupon)}`);

    const metas: string[] = [];
    if (cleanCell(extra.book) && cleanCell(extra.book) !== "默认账本") metas.push(`账本:${cleanCell(extra.book)}`);
    if (cleanCell(extra.bookkeeper)) metas.push(`记账者:${cleanCell(extra.bookkeeper)}`);
    if (cleanCell(extra.flag)) metas.push(`标记:${cleanCell(extra.flag)}`);
    if (cleanCell(extra.related)) metas.push(`关联:${cleanCell(extra.related)}`);

    const result = [...parts, ...tags, ...metas].join(" | ");
    return result;
}

function buildQianjiTags(tags: string): string {
    return tags
        .split(/[,，;；]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .join(", ");
}

// ── QianJi CSV parser ──

export function parseQianjiCsv(
    text: string,
    settings: AccountingAppSettings,
): { rows: AccountingImportRow[]; errors: string[] } {
    const cleaned = stripBom(text);
    const allRows = parseCsv(cleaned);
    if (allRows.length < 2) return { rows: [], errors: ["CSV 内容为空或缺少表头"] };

    const headers = allRows[0].map((h) => cleanCell(h));
    const findIndex = (aliases: string[]) => {
        for (const alias of aliases) {
            const idx = headers.indexOf(alias);
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const idx = {
        id: findIndex(["ID"]),
        time: findIndex(["时间"]),
        book: findIndex(["账本"]),
        category: findIndex(["分类"]),
        subCategory: findIndex(["二级分类"]),
        type: findIndex(["类型"]),
        amount: findIndex(["金额"]),
        currency: findIndex(["币种"]),
        account1: findIndex(["账户1"]),
        account2: findIndex(["账户2"]),
        note: findIndex(["备注"]),
        reimbursed: findIndex(["已报销"]),
        fee: findIndex(["手续费"]),
        coupon: findIndex(["优惠券"]),
        bookkeeper: findIndex(["记账者"]),
        flag: findIndex(["账单标记"]),
        tags: findIndex(["标签"]),
        related: findIndex(["关联账单"]),
    };

    const required = ["id", "time", "type", "amount"] as const;
    const errors: string[] = [];
    for (const key of required) {
        if (idx[key] < 0) errors.push(`缺少必要列：${key}`);
    }
    if (errors.length > 0) return { rows: [], errors };

    const rows: AccountingImportRow[] = [];
    for (let i = 1; i < allRows.length; i++) {
        const cells = allRows[i];
        const id = cleanCell(cells[idx.id]);
        if (!id) continue;

        const typeInfo = mapQianjiType(cells[idx.type]);
        const categoryPrimary = cleanCell(cells[idx.category]) || "其他";
        const categorySecondary = cleanCell(cells[idx.subCategory]);
        const title = buildTitle([categorySecondary, categoryPrimary, cells[idx.note]]);

        let account = "";
        let counterAccount: string | undefined;
        let assetRef: string | undefined;
        let counterAssetRef: string | undefined;

        if (typeInfo.direction === "transfer") {
            account = cleanCell(cells[idx.account1]) || "其他";
            counterAccount = cleanCell(cells[idx.account2]) || undefined;
            assetRef = account;
            counterAssetRef = counterAccount;
        } else {
            account = cleanCell(cells[idx.account1]) || "其他";
            assetRef = account;
        }

        const note = buildQianjiNote(cells[idx.note], {
            book: cells[idx.book],
            bookkeeper: cells[idx.bookkeeper],
            flag: cells[idx.flag],
            related: cells[idx.related],
            fee: cells[idx.fee],
            coupon: cells[idx.coupon],
            reimbursed: cells[idx.reimbursed],
            noteSuffix: typeInfo.noteSuffix,
        });

        const tags = buildQianjiTags(cells[idx.tags] || "");

        rows.push({
            recordId: createImportId("qianji", id),
            title,
            direction: typeInfo.direction,
            amount: parseAmount(cells[idx.amount]),
            date: parseDate(cells[idx.time]),
            categoryPrimary,
            categorySecondary,
            account,
            counterAccount,
            tags,
            note,
            currency: accountingCurrency(cleanCell(cells[idx.currency]) || settings.defaultCurrency),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceFormat: "qianji-csv",
            rawType: cleanCell(cells[idx.type]),
            assetRef,
            counterAssetRef,
        });
    }

    return { rows, errors };
}

// ── QianJi JSON parser ──

interface QianjiJsonRecord {
    key?: string;
    date?: string;
    category?: string;
    type?: string;
    money?: number;
    currency?: string;
    asset?: string | number;
    from?: string | number;
    target?: string | number;
    remark?: string;
    sourceid?: string;
    hasbx?: number;
    billflag?: string | null;
    username?: string | null;
}

function findPrimaryCategory(
    settings: AccountingAppSettings,
    direction: "expense" | "income" | "transfer",
    secondaryLabel: string,
): string {
    const cats = settings.categories?.[direction];
    if (!cats) return secondaryLabel || "其他";
    for (const cat of cats) {
        if (cat.label === secondaryLabel) return cat.label;
        if (cat.secondaries?.includes(secondaryLabel)) return cat.label;
    }
    return secondaryLabel || "其他";
}

export function parseQianjiJson(
    text: string,
    settings: AccountingAppSettings,
): { rows: AccountingImportRow[]; errors: string[] } {
    let data: unknown;
    try {
        data = JSON.parse(stripBom(text));
    } catch {
        return { rows: [], errors: ["JSON 解析失败"] };
    }
    if (!Array.isArray(data)) {
        return { rows: [], errors: ["钱迹 JSON 必须是数组"] };
    }

    const rows: AccountingImportRow[] = [];
    const errors: string[] = [];
    for (let i = 0; i < data.length; i++) {
        const raw = data[i] as QianjiJsonRecord;
        const id = cleanCell(raw.key);
        if (!id) {
            errors.push(`第 ${i + 1} 条记录缺少 key`);
            continue;
        }

        const typeInfo = mapQianjiType(raw.type || "");
        const secondary = cleanCell(raw.category) || "";
        const categoryPrimary = findPrimaryCategory(settings, typeInfo.direction, secondary) || secondary || "其他";
        const title = secondary || categoryPrimary || "钱迹账单";

        let account = "";
        let counterAccount: string | undefined;
        let assetRef: string | undefined;
        let counterAssetRef: string | undefined;

        if (typeInfo.direction === "transfer") {
            const fromId = raw.from !== undefined && raw.from !== null ? String(raw.from) : "";
            const targetId = raw.target !== undefined && raw.target !== null ? String(raw.target) : "";
            account = fromId ? `钱迹资产 ${fromId}` : "其他";
            counterAccount = targetId ? `钱迹资产 ${targetId}` : undefined;
            assetRef = fromId ? `qianji-asset:${fromId}` : undefined;
            counterAssetRef = targetId ? `qianji-asset:${targetId}` : undefined;
        } else {
            const assetId = raw.asset !== undefined && raw.asset !== null ? String(raw.asset) : "";
            account = assetId ? `钱迹资产 ${assetId}` : "其他";
            assetRef = assetId ? `qianji-asset:${assetId}` : undefined;
        }

        const noteParts: string[] = [];
        if (cleanCell(raw.remark)) noteParts.push(cleanCell(raw.remark));
        if (typeInfo.noteSuffix) noteParts.push(typeInfo.noteSuffix);
        if (raw.hasbx) noteParts.push(`已报销`);
        if (cleanCell(raw.billflag)) noteParts.push(`标记:${cleanCell(raw.billflag)}`);
        if (cleanCell(raw.sourceid)) noteParts.push(`来源:${cleanCell(raw.sourceid)}`);
        if (cleanCell(raw.username)) noteParts.push(`记账者:${cleanCell(raw.username)}`);

        rows.push({
            recordId: createImportId("qianji", id),
            title,
            direction: typeInfo.direction,
            amount: Math.abs(Number(raw.money) || 0),
            date: parseDate(raw.date || ""),
            categoryPrimary,
            categorySecondary: secondary,
            account,
            counterAccount,
            tags: "",
            note: noteParts.join(" | "),
            currency: accountingCurrency(raw.currency || settings.defaultCurrency),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceFormat: "qianji-json",
            rawType: cleanCell(raw.type),
            assetRef,
            counterAssetRef,
        });
    }

    return { rows, errors };
}

// ── Generic CSV parser ──

export function parseGenericCsv(
    text: string,
    settings: AccountingAppSettings,
): { rows: AccountingImportRow[]; errors: string[] } {
    const cleaned = stripBom(text);
    const allRows = parseCsv(cleaned);
    if (allRows.length < 2) return { rows: [], errors: ["CSV 内容为空或缺少表头"] };

    const headers = allRows[0].map((h) => cleanCell(h).toLowerCase());
    const findIndex = (aliases: string[]) => {
        for (const alias of aliases) {
            const idx = headers.indexOf(alias.toLowerCase());
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const idx = {
        date: findIndex(["date", "日期"]),
        type: findIndex(["type", "类型"]),
        amount: findIndex(["amount", "金额"]),
        currency: findIndex(["currency", "币种"]),
        categoryPrimary: findIndex(["categoryprimary", "一级分类"]),
        categorySecondary: findIndex(["categorysecondary", "二级分类"]),
        account: findIndex(["account", "资产"]),
        counterAccount: findIndex(["counteraccount", "转入资产"]),
        title: findIndex(["title", "标题"]),
        note: findIndex(["note", "备注"]),
        tags: findIndex(["tags", "标签"]),
    };

    const errors: string[] = [];
    if (idx.date < 0) errors.push("缺少日期列");
    if (idx.type < 0) errors.push("缺少类型列");
    if (idx.amount < 0) errors.push("缺少金额列");
    if (errors.length > 0) return { rows: [], errors };

    const rows: AccountingImportRow[] = [];
    for (let i = 1; i < allRows.length; i++) {
        const cells = allRows[i];
        const rawType = cleanCell(cells[idx.type]);
        const direction = normalizeGenericDirection(rawType);
        const categoryPrimary = cleanCell(cells[idx.categoryPrimary]) || "其他";
        const categorySecondary = cleanCell(cells[idx.categorySecondary]);
        const title = buildTitle([cells[idx.title], categorySecondary, categoryPrimary, cells[idx.note]]);
        const account = cleanCell(cells[idx.account]) || "其他";
        const counterAccount = cleanCell(cells[idx.counterAccount]) || undefined;

        rows.push({
            recordId: createImportId("generic-csv", `${i}`),
            title,
            direction,
            amount: parseAmount(cells[idx.amount]),
            date: parseDate(cells[idx.date]),
            categoryPrimary,
            categorySecondary,
            account,
            counterAccount,
            tags: buildQianjiTags(cells[idx.tags] || ""),
            note: cleanCell(cells[idx.note]),
            currency: accountingCurrency(cleanCell(cells[idx.currency]) || settings.defaultCurrency),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceFormat: "generic-csv",
            rawType,
            assetRef: account,
            counterAssetRef: counterAccount,
        });
    }

    return { rows, errors };
}

function normalizeGenericDirection(value: string): "expense" | "income" | "transfer" {
    const v = cleanCell(value).toLowerCase();
    if (v === "income" || v === "收入") return "income";
    if (v === "transfer" || v === "转账" || /借入|还款|还贷/.test(v)) return "transfer";
    return "expense";
}

// ── Siyuan Homepage JSON parser ──

export function parseSiyuanHomepageJson(
    text: string,
): { rows: AccountingImportRow[]; assets: AccountingAccountInput[]; errors: string[] } {
    let data: unknown;
    try {
        data = JSON.parse(stripBom(text));
    } catch {
        return { rows: [], assets: [], errors: ["JSON 解析失败"] };
    }

    const payload = data as Partial<AccountingExportPayload> | null;
    if (!payload || payload.schema !== "siyuan-homepage-accounting") {
        return { rows: [], assets: [], errors: ["不是本插件的记账备份文件"] };
    }

    if (![1, 2, 3, ACCOUNTING_EXPORT_VERSION].includes(payload.version as number) || !Array.isArray(payload.records) || (payload.assets !== undefined && !Array.isArray(payload.assets))) {
        return { rows: [], assets: [], errors: ["备份版本或结构异常，未读取为可导入的空数据"] };
    }
    const records = payload.records;
    const assets = payload.assets || [];
    if (assets.some(a => !a || typeof a.accountId !== "string" || !a.accountId || typeof a.name !== "string" || !a.name.trim() || typeof a.type !== "string" || typeof a.currency !== "string" || !Number.isFinite(a.openingBalance) || !Number.isFinite(a.currentBalance) || (a.balanceConvention !== undefined && a.balanceConvention !== "signed"))
        || new Set(assets.map(a => a.accountId)).size !== assets.length) {
        return { rows: [], assets: [], errors: ["备份账户数据异常，请保留原文件并核对"] };
    }
    if (records.some(r => !r || typeof r.recordId !== "string" || !r.recordId || !Number.isFinite(r.amount) || r.amount < 0 || !["expense", "income", "transfer"].includes(r.direction) || typeof r.date !== "string" || !r.date || typeof r.currency !== "string")) {
        return { rows: [], assets: [], errors: ["备份流水数据异常，请保留原文件并核对"] };
    }

    const rows: AccountingImportRow[] = records.map((record) => ({
        ...record,
        recordId: record.recordId,
        title: record.title,
        direction: record.direction,
        amount: record.amount,
        date: parseDate(record.date),
        categoryPrimary: record.categoryPrimary || "其他",
        categorySecondary: record.categorySecondary || "",
        account: record.account || "其他",
        counterAccount: record.counterAccount,
        tags: record.tags || "",
        note: record.note || "",
        currency: accountingCurrency(record.currency),
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || new Date().toISOString(),
        sourceFormat: "siyuan-homepage-json",
        assetRef: record.account,
        counterAssetRef: record.counterAccount,
    }));

    return { rows, assets, errors: [] };
}

// ── Format detection ──

export function detectImportFormat(
    fileName: string,
    text: string,
): Exclude<AccountingImportFormat, "auto"> {
    const lowerName = fileName.toLowerCase();
    const trimmed = stripBom(text).trim();

    if (lowerName.endsWith(".csv")) {
        try {
            const rows = parseCsv(trimmed);
            if (rows.length > 0) {
                const headers = rows[0].map((h) => cleanCell(h));
                const hasRequired = ["ID", "时间", "类型", "金额"].every((h) => headers.includes(h));
                const hasCategory = headers.includes("分类") || headers.includes("二级分类");
                if (hasRequired && hasCategory) {
                    return "qianji-csv";
                }
            }
        } catch {
            // Fallback to text heuristic
            if (
                trimmed.includes('"ID"') &&
                trimmed.includes('"时间"') &&
                trimmed.includes('"类型"')
            ) {
                return "qianji-csv";
            }
        }
        return "generic-csv";
    }

    if (lowerName.endsWith(".txt") || lowerName.endsWith(".json")) {
        if (trimmed.startsWith("[") && trimmed.includes('"key"') && trimmed.includes('"type"')) {
            return "qianji-json";
        }
        if (
            trimmed.startsWith("{") &&
            trimmed.includes('"schema"') &&
            trimmed.includes('"siyuan-homepage-accounting"')
        ) {
            return "siyuan-homepage-json";
        }
        if (trimmed.startsWith("[")) {
            return "siyuan-homepage-json";
        }
    }

    return "generic-csv";
}

// ── Preview builder ──

export function buildAccountingImportPreview(
    format: AccountingImportFormat,
    rows: AccountingImportRow[],
    existingRecordIds: Set<string>,
    existingAccounts: AccountingAccount[],
    parseErrors: string[],
): AccountingImportPreview {
    const validRows = rows.filter(isValidAccountingImportRow);
    const invalidRows = rows.length - validRows.length;

    const expenseCount = validRows.filter((r) => r.direction === "expense").length;
    const incomeCount = validRows.filter((r) => r.direction === "income").length;
    const transferCount = validRows.filter((r) => r.direction === "transfer").length;

    const existingAccountIds = new Set(existingAccounts.map((a) => a.accountId));
    const existingAccountNames = new Set(existingAccounts.map((a) => a.name));
    const newAssetRefs = new Set<string>();

    for (const row of validRows) {
        if (existingRecordIds.has(row.recordId)) continue;
        const refs = [row.assetRef, row.counterAssetRef].filter(Boolean) as string[];
        for (const ref of refs) {
            const accountId = ref.startsWith("qianji-asset:") ? ref : `qianji-asset:${ref}`;
            if (!existingAccountIds.has(accountId) && !existingAccountNames.has(ref.replace(/^qianji-asset:/, ""))) {
                newAssetRefs.add(accountId);
            }
        }
    }

    const seenRecordIds = new Set<string>();
    let duplicateCount = 0;
    const duplicateWarnings: string[] = [];
    for (const row of validRows) {
        if (existingRecordIds.has(row.recordId) || seenRecordIds.has(row.recordId)) {
            duplicateCount++;
        }
        if (seenRecordIds.has(row.recordId) && duplicateWarnings.length < 5) {
            duplicateWarnings.push(`文件内存在重复记录 ID：${row.recordId}`);
        }
        seenRecordIds.add(row.recordId);
    }

    return {
        format,
        totalRows: rows.length,
        validRows: validRows.length,
        invalidRows,
        expenseCount,
        incomeCount,
        transferCount,
        duplicateCount,
        newAssetCount: newAssetRefs.size,
        sampleRows: validRows.slice(0, 5),
        errors: [...parseErrors, ...duplicateWarnings],
    };
}

// ── Import execution ──

export function isValidAccountingImportRow(row: AccountingImportRow): boolean {
    if (!row || typeof row.recordId !== "string" || !row.recordId || !row.title || !Number.isFinite(row.amount)
        || (row.sourceFormat === "siyuan-homepage-json" ? row.amount < 0 : row.amount <= 0)
        || !["expense", "income", "transfer"].includes(row.direction) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return false;
    const [year, month, day] = row.date.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year > 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function accountingImportReviewMessage(row: AccountingImportRow): string {
    if (row.sourceFormat === "siyuan-homepage-json") return "";
    const type = row.rawType || "";
    if (type.includes("退款")) return "退款关联暂不自动恢复，请核对原账单并明确选择跳过本次导入";
    if (/借入|还款|还贷/.test(type)) return "核对借款 / 还款的转出与转入账户，本金按转账导入，利息请另记支出";
    if (row.direction === "transfer" && !(row.counterAssetRef || row.counterAccount)) return "转账缺少转入账户，请选择两边账户后确认";
    if (!["支出", "收入", "转账", "报销", "报销记录", "expense", "income", "transfer"].includes(type.toLowerCase())) return "原类型无法确定，请核对收支方向及账户后确认";
    return "";
}

function importAccountName(ref: string): string {
    const value = ref.replace(/^qianji-asset:/, "");
    return /^\d+$/.test(value) ? `钱迹资产 ${value}` : value;
}

function resolveImportAccount(ref: string | undefined, currency: string, accounts: AccountingAccount[], incoming: AccountingAccountInput[]): AccountingAccount | undefined {
    if (!ref) return undefined;
    const direct = resolveAccountingAccount(ref, accounts, currency) || resolveAccountingAccount(importAccountName(ref), accounts, currency);
    if (direct) return direct;
    const source = incoming.find(a => a.accountId === ref);
    return source ? resolveAccountingAccount(source.name, accounts, currency) : undefined;
}

export function prepareAccountingImportAccounts(rows: AccountingImportRow[], existing: AccountingAccount[], incoming: AccountingAccountInput[] = []): AccountingAccountInput[] {
    const result = incoming.map(a => ({ ...a }));
    for (const row of rows) {
        if (row.sourceFormat === "siyuan-homepage-json" || row.reviewAction === "skip") continue;
        for (const ref of [row.assetRef || row.account, row.counterAssetRef || row.counterAccount]) {
            if (!ref) continue;
            const known = [...existing, ...result.map(normalizeAccount)];
            if (resolveImportAccount(ref, row.currency, known, incoming)) continue;
            const name = importAccountName(ref);
            const currency = accountingCurrency(row.currency);
            const accountId = ref.startsWith("qianji-asset:") ? ref : `import-asset:${currency}:${ref}`;
            if (known.some(a => a.accountId === accountId)) throw new Error(`账户 ${name} 的币种冲突，请先核对`);
            result.push({ accountId, rowId: accountId, name, currency, openingBalance: 0 });
        }
    }
    return result;
}

export async function importAccountingData(
    options: AccountingImportOptions & { assets?: AccountingAccountInput[] },
): Promise<AccountingImportResult> {
    const { plugin, rows, assets: incomingAssets = [], onProgress } = options;
    const [recordsResult, accountsResult] = await Promise.all([loadAccountingRecordsAll(plugin, true), loadAccountingAccounts(plugin, true)]);
    if (!recordsResult.status.ok) throw new Error(recordsResult.status.message);
    if (!accountsResult.status.ok) throw new Error(accountsResult.status.message);
    await loadAccountingSummaryIndex(plugin);
    const existingIds = new Set([...options.existingRecordIds, ...recordsResult.records.map(r => r.recordId)]);
    const existing = accountsResult.accounts;
    const result: AccountingImportResult = { successCount: 0, skippedCount: 0, failedCount: 0, newAssetCount: 0, errors: [] };
    const toImport: AccountingImportRow[] = [];
    for (const row of rows) {
        if (existingIds.has(row.recordId) || row.reviewAction === "skip") { result.skippedCount++; continue; }
        if (!isValidAccountingImportRow(row)) throw new Error(`流水 ${row.recordId || "未标识"} 的日期、方向或金额无效，尚未写入`);
        const review = accountingImportReviewMessage(row);
        if (review && (row.reviewAction !== "confirmed" || row.rawType?.includes("退款"))) throw new Error(`${row.recordId}：${review}`);
        if (/借入|还款|还贷/.test(row.rawType || "") && row.sourceFormat !== "siyuan-homepage-json" && row.direction !== "transfer") throw new Error("借款和偿还本金必须按转账导入");
        existingIds.add(row.recordId);
        toImport.push(row);
    }
    const mode = rows.every(row => row.sourceFormat === "siyuan-homepage-json") ? "backup" : undefined;
    const incoming = prepareAccountingImportAccounts(toImport, existing, incomingAssets);
    const toCreate: AccountingAccount[] = [];
    for (const input of incoming) {
        const asset = normalizeAccount(input);
        const known = [...existing, ...toCreate];
        const sameId = known.find(a => a.accountId === asset.accountId);
        if (sameId && accountingCurrency(sameId.currency) !== accountingCurrency(asset.currency)) throw new Error(`账户 ${asset.name} 的币种与已有账户不一致`);
        if (sameId || (mode !== "backup" && resolveAccountingAccount(asset.name, known, asset.currency))) continue;
        toCreate.push(asset);
    }
    const plannedAccounts = [...existing, ...toCreate];
    const records = toImport.map(row => {
        const { sourceFormat: _format, rawType: _type, assetRef: _ref, counterAssetRef: _counterRef, reviewAction: _review, ...original } = row;
        if (mode === "backup") return normalizeRecord(original);
        const account = resolveImportAccount(row.assetRef || row.account, row.currency, plannedAccounts, incoming);
        const counter = resolveImportAccount(row.counterAssetRef || row.counterAccount, row.currency, plannedAccounts, incoming);
        if (!account || (row.direction === "transfer" && !counter)) throw new Error(`${row.recordId}：请先明确关联账户`);
        const record = normalizeRecord({ ...original, account: account.accountId, counterAccount: counter?.accountId });
        validateAccountingRecordCurrency(record, plannedAccounts);
        return record;
    });
    // All rows and existing files are checked before the first write; Kernel rechecks each mutation.
    try {
        if (toCreate.length) result.newAssetCount = await bulkMergeAccountingAssets(plugin, toCreate, mode);
        if (records.length) result.successCount = await bulkMergeAccountingRecords(plugin, records, mode);
    } catch (error) {
        throw new Error(`导入未完整确认，请重新读取后核对；再次导入会按记录 ID 跳过已保存内容。${error instanceof Error ? error.message : ""}`);
    }
    onProgress?.({ current: rows.length, total: rows.length, success: result.successCount, skipped: result.skippedCount, failed: 0 });
    return result;
}

// ── Export execution ──

export async function exportAccountingData(
    options: AccountingExportOptions,
): Promise<{ blob: Blob; fileName: string }> {
    const { plugin, appSettings } = options;

    if (!appSettings) {
        throw new Error("请先完成记账设置");
    }

    const [recordsResult, assetsResult] = await Promise.all([
        loadAccountingRecordsAll(plugin, true),
        loadAccountingAccounts(plugin, true),
    ]);
    if (!recordsResult.status.ok) throw new Error(recordsResult.status.message);
    if (!assetsResult.status.ok) throw new Error(assetsResult.status.message);

    const payload: AccountingExportPayload = {
        schema: "siyuan-homepage-accounting",
        version: ACCOUNTING_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        settings: appSettings,
        records: recordsResult.records,
        assets: assetsResult.accounts,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
    });

    const now = new Date();
    const dateSuffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const fileName = `siyuan-homepage-accounting-${dateSuffix}.json`;

    return { blob, fileName };
}

// ── Helpers exposed for UI ──

export function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取文件失败"));
        reader.readAsText(file, "UTF-8");
    });
}

export function isPcEnvironment(): boolean {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const mobileUa = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
    return !coarse && !mobileUa;
}
