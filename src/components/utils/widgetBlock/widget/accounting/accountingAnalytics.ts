import type {
    AccountingAccount,
    AccountingCalendarDayItem,
    AccountingCategoryPieItem,
    AccountingCategoryReportItem,
    AccountingDailyReportItem,
    AccountingFilter,
    AccountingMonthlyReportItem,
    AccountingPeriod,
    AccountingRangeSummary,
    AccountingRecord,
    AccountingSummary,
    AccountingTrendChartData,
} from "./accountingTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatAccountingDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }
    const date = new Date(`${value}T00:00:00`);
    return Number.isFinite(date.getTime()) ? date : null;
}

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function getPeriodRange(
    period: AccountingPeriod,
    referenceDate: Date = new Date(),
): { start: string; end: string } {
    const today = startOfLocalDay(referenceDate);
    if (period === "recent30") {
        return {
            start: formatAccountingDate(addDays(today, -29)),
            end: formatAccountingDate(today),
        };
    }
    if (period === "year") {
        return {
            start: formatAccountingDate(new Date(today.getFullYear(), 0, 1)),
            end: formatAccountingDate(new Date(today.getFullYear(), 11, 31)),
        };
    }
    return {
        start: formatAccountingDate(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: formatAccountingDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
}

function isWithinRange(record: AccountingRecord, start: string, end: string): boolean {
    return record.date >= start && record.date <= end;
}

function getPositiveAmount(record: AccountingRecord): number {
    return Math.max(0, Number(record.amount) || 0);
}

function sortRecordsDesc(records: AccountingRecord[]): AccountingRecord[] {
    return [...records].sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export function summarizeAccounting(
    records: AccountingRecord[],
    options: {
        period?: AccountingPeriod;
        monthlyBudget?: number;
        recentLimit?: number;
        referenceDate?: Date;
        recentRecords?: AccountingRecord[];
    } = {},
): AccountingSummary {
    const period = options.period || "month";
    const { start, end } = getPeriodRange(period, options.referenceDate);
    const periodRecords = records.filter((record) => !record.archived && isWithinRange(record, start, end));
    const today = formatAccountingDate(options.referenceDate || new Date());
    const incomeTotal = periodRecords
        .filter((record) => record.direction === "income")
        .reduce((sum, record) => sum + getPositiveAmount(record), 0);
    const expenseTotal = periodRecords
        .filter((record) => record.direction === "expense")
        .reduce((sum, record) => sum + getPositiveAmount(record), 0);
    const todayExpense = records
        .filter((record) => !record.archived && record.direction === "expense" && record.date === today)
        .reduce((sum, record) => sum + getPositiveAmount(record), 0);
    const monthlyBudget = Math.max(0, Number(options.monthlyBudget) || 0);
    const recentLimit = Math.max(1, Number(options.recentLimit) || 5);
    const recentRecords = options.recentRecords
        ? sortRecordsDesc(options.recentRecords.filter((record) => !record.archived)).slice(0, recentLimit)
        : sortRecordsDesc(records.filter((record) => !record.archived)).slice(0, recentLimit);

    return {
        incomeTotal,
        expenseTotal,
        balance: incomeTotal - expenseTotal,
        todayExpense,
        budgetUsedRatio: monthlyBudget > 0 ? expenseTotal / monthlyBudget : 0,
        recentRecords,
    };
}

export function filterAccountingRecords(records: AccountingRecord[], filter: AccountingFilter): AccountingRecord[] {
    return sortRecordsDesc(records.filter((record) => {
        if (record.archived) return false;
        if (filter.month && !record.date.startsWith(`${filter.month}-`)) return false;
        if (filter.direction && filter.direction !== "all" && record.direction !== filter.direction) return false;
        if (filter.categoryPrimary && record.categoryPrimary !== filter.categoryPrimary) return false;
        return true;
    }));
}

export function getAvailableMonths(records: AccountingRecord[]): string[] {
    return Array.from(new Set(
        records
            .filter((record) => !record.archived && /^\d{4}-\d{2}-\d{2}$/.test(record.date))
            .map((record) => record.date.slice(0, 7)),
    )).sort((a, b) => b.localeCompare(a));
}

export function getAvailableCategories(records: AccountingRecord[]): string[] {
    return Array.from(new Set(
        records
            .filter((record) => !record.archived && record.categoryPrimary.trim())
            .map((record) => record.categoryPrimary.trim()),
    )).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function buildDailyLabels(start: string, end: string): string[] {
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    if (!startDate || !endDate) return [];

    const labels: string[] = [];
    for (let cursor = startDate; cursor.getTime() <= endDate.getTime(); cursor = new Date(cursor.getTime() + DAY_MS)) {
        labels.push(formatAccountingDate(cursor));
    }
    return labels;
}

function buildYearLabels(referenceDate: Date): string[] {
    const year = referenceDate.getFullYear();
    return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

export function buildTrendChartData(
    records: AccountingRecord[],
    period: AccountingPeriod,
    referenceDate: Date = new Date(),
): AccountingTrendChartData {
    const { start, end } = getPeriodRange(period, referenceDate);
    const labels = period === "year" ? buildYearLabels(referenceDate) : buildDailyLabels(start, end);
    const incomeMap = new Map(labels.map((label) => [label, 0]));
    const expenseMap = new Map(labels.map((label) => [label, 0]));

    records
        .filter((record) => !record.archived && isWithinRange(record, start, end))
        .forEach((record) => {
            const key = period === "year" ? record.date.slice(0, 7) : record.date;
            if (!incomeMap.has(key) || record.direction === "transfer") return;
            const amount = getPositiveAmount(record);
            if (record.direction === "income") {
                incomeMap.set(key, (incomeMap.get(key) || 0) + amount);
            } else if (record.direction === "expense") {
                expenseMap.set(key, (expenseMap.get(key) || 0) + amount);
            }
        });

    return {
        labels,
        income: labels.map((label) => Number((incomeMap.get(label) || 0).toFixed(2))),
        expense: labels.map((label) => Number((expenseMap.get(label) || 0).toFixed(2))),
    };
}

export function buildCategoryPieData(
    records: AccountingRecord[],
    period: AccountingPeriod = "month",
    referenceDate: Date = new Date(),
): AccountingCategoryPieItem[] {
    const { start, end } = getPeriodRange(period, referenceDate);
    const map = new Map<string, number>();

    records
        .filter((record) => (
            !record.archived &&
            record.direction === "expense" &&
            isWithinRange(record, start, end)
        ))
        .forEach((record) => {
            const category = record.categoryPrimary.trim() || "其他";
            map.set(category, (map.get(category) || 0) + getPositiveAmount(record));
        });

    return Array.from(map.entries())
        .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value);
}

export function formatAccountingCurrency(value: number, currency: string = "CNY"): string {
    return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: currency || "CNY",
        maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    }).format(Number.isFinite(value) ? value : 0);
}

// ── Asset Balance Calculation ──

/** Match a record.account / record.counterAccount value to an asset. */
export function resolveAssetRef(
    ref: string | undefined,
    accounts: AccountingAccount[],
): AccountingAccount | undefined {
    if (!ref) return undefined;
    return (
        accounts.find((a) => a.accountId === ref) ||
        accounts.find((a) => a.rowId === ref) ||
        accounts.find((a) => a.name.toLowerCase() === ref.toLowerCase())
    );
}

/** Get display name for a record account reference. */
export function getAssetDisplayName(ref: string | undefined, accounts: AccountingAccount[]): string {
    if (!ref) return "";
    const asset = resolveAssetRef(ref, accounts);
    return asset?.name || ref;
}

/** Calculate real-time asset balances from openingBalance + unarchived records. */
export function calculateAssetBalances(
    accounts: AccountingAccount[],
    records: AccountingRecord[],
): Map<string, number> {
    const balanceMap = new Map<string, number>();
    for (const acct of accounts) {
        balanceMap.set(acct.accountId, acct.openingBalance);
    }
    const unarchived = records.filter((r) => !r.archived);
    for (const record of unarchived) {
        const amount = Math.max(0, Number(record.amount) || 0);
        if (record.direction === "expense") {
            const asset = resolveAssetRef(record.account, accounts);
            if (asset) {
                balanceMap.set(asset.accountId, (balanceMap.get(asset.accountId) || 0) - amount);
            }
        } else if (record.direction === "income") {
            const asset = resolveAssetRef(record.account, accounts);
            if (asset) {
                balanceMap.set(asset.accountId, (balanceMap.get(asset.accountId) || 0) + amount);
            }
        } else if (record.direction === "transfer") {
            const from = resolveAssetRef(record.account, accounts);
            const to = resolveAssetRef(record.counterAccount, accounts);
            if (from) {
                balanceMap.set(from.accountId, (balanceMap.get(from.accountId) || 0) - amount);
            }
            if (to) {
                balanceMap.set(to.accountId, (balanceMap.get(to.accountId) || 0) + amount);
            }
        }
    }
    return balanceMap;
}

// ── Report Utilities ──

function safeDate(value: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    return value;
}

function getRecordDateKey(record: AccountingRecord): string | null {
    return safeDate(record.date);
}

export function summarizeRecordsForMonth(
    records: AccountingRecord[],
    yearMonth: string,
): AccountingRangeSummary {
    const prefix = `${yearMonth}-`;
    const filtered = records.filter(
        (r) => !r.archived && r.date.startsWith(prefix) && safeDate(r.date),
    );
    let income = 0;
    let expense = 0;
    let transfer = 0;
    for (const record of filtered) {
        const amount = getPositiveAmount(record);
        if (record.direction === "income") income += amount;
        else if (record.direction === "expense") expense += amount;
        else if (record.direction === "transfer") transfer += amount;
    }
    const days = new Date(Number(yearMonth.split("-")[0]), Number(yearMonth.split("-")[1]), 0).getDate();
    const count = filtered.length;
    return {
        income: Number(income.toFixed(2)),
        expense: Number(expense.toFixed(2)),
        transfer: Number(transfer.toFixed(2)),
        balance: Number((income - expense).toFixed(2)),
        count,
        averageExpense: Number((expense / Math.max(1, days)).toFixed(2)),
        averageIncome: Number((income / Math.max(1, days)).toFixed(2)),
        days,
    };
}

export function summarizeRecordsForRange(
    records: AccountingRecord[],
    start: string,
    end: string,
): AccountingRangeSummary {
    const filtered = records.filter(
        (r) => !r.archived && safeDate(r.date) && r.date >= start && r.date <= end,
    );
    let income = 0;
    let expense = 0;
    let transfer = 0;
    for (const record of filtered) {
        const amount = getPositiveAmount(record);
        if (record.direction === "income") income += amount;
        else if (record.direction === "expense") expense += amount;
        else if (record.direction === "transfer") transfer += amount;
    }
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    const days = startDate && endDate
        ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1)
        : 1;
    const count = filtered.length;
    return {
        income: Number(income.toFixed(2)),
        expense: Number(expense.toFixed(2)),
        transfer: Number(transfer.toFixed(2)),
        balance: Number((income - expense).toFixed(2)),
        count,
        averageExpense: Number((expense / days).toFixed(2)),
        averageIncome: Number((income / days).toFixed(2)),
        days,
    };
}

export function buildDailyReport(
    records: AccountingRecord[],
    yearMonth: string,
): AccountingDailyReportItem[] {
    const prefix = `${yearMonth}-`;
    const filtered = records.filter(
        (r) => !r.archived && r.date.startsWith(prefix) && safeDate(r.date),
    );
    const map = new Map<string, AccountingDailyReportItem>();
    for (const record of filtered) {
        const date = record.date;
        const existing = map.get(date);
        const amount = getPositiveAmount(record);
        if (existing) {
            existing.count++;
            if (record.direction === "income") existing.income += amount;
            else if (record.direction === "expense") existing.expense += amount;
            else if (record.direction === "transfer") existing.transfer += amount;
        } else {
            map.set(date, {
                date,
                income: record.direction === "income" ? amount : 0,
                expense: record.direction === "expense" ? amount : 0,
                transfer: record.direction === "transfer" ? amount : 0,
                balance: 0,
                count: 1,
            });
        }
    }
    const items = Array.from(map.values()).map((item) => ({
        ...item,
        income: Number(item.income.toFixed(2)),
        expense: Number(item.expense.toFixed(2)),
        transfer: Number(item.transfer.toFixed(2)),
        balance: Number((item.income - item.expense).toFixed(2)),
    }));
    return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function buildMonthlyReport(
    records: AccountingRecord[],
    year: number,
): AccountingMonthlyReportItem[] {
    const prefix = `${year}-`;
    const filtered = records.filter(
        (r) => !r.archived && r.date.startsWith(prefix) && safeDate(r.date),
    );
    const map = new Map<string, AccountingMonthlyReportItem>();
    for (const record of filtered) {
        const month = record.date.slice(0, 7);
        const existing = map.get(month);
        const amount = getPositiveAmount(record);
        if (existing) {
            existing.count++;
            if (record.direction === "income") existing.income += amount;
            else if (record.direction === "expense") existing.expense += amount;
            else if (record.direction === "transfer") existing.transfer += amount;
        } else {
            map.set(month, {
                month,
                income: record.direction === "income" ? amount : 0,
                expense: record.direction === "expense" ? amount : 0,
                transfer: record.direction === "transfer" ? amount : 0,
                balance: 0,
                count: 1,
            });
        }
    }
    const items = Array.from(map.values()).map((item) => ({
        ...item,
        income: Number(item.income.toFixed(2)),
        expense: Number(item.expense.toFixed(2)),
        transfer: Number(item.transfer.toFixed(2)),
        balance: Number((item.income - item.expense).toFixed(2)),
    }));
    return items.sort((a, b) => b.month.localeCompare(a.month));
}

export function buildCalendarReport(
    records: AccountingRecord[],
    yearMonth: string,
): AccountingCalendarDayItem[] {
    const [yearStr, monthStr] = yearMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const today = formatAccountingDate(new Date());

    const recordMap = new Map<string, { income: number; expense: number; transfer: number }>();
    const filtered = records.filter(
        (r) => !r.archived && r.date.startsWith(`${yearMonth}-`) && safeDate(r.date),
    );
    for (const record of filtered) {
        const amount = getPositiveAmount(record);
        const existing = recordMap.get(record.date);
        if (existing) {
            if (record.direction === "income") existing.income += amount;
            else if (record.direction === "expense") existing.expense += amount;
            else if (record.direction === "transfer") existing.transfer += amount;
        } else {
            recordMap.set(record.date, {
                income: record.direction === "income" ? amount : 0,
                expense: record.direction === "expense" ? amount : 0,
                transfer: record.direction === "transfer" ? amount : 0,
            });
        }
    }

    // Pad previous month cells to align with Sunday start
    const result: AccountingCalendarDayItem[] = [];
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    for (let i = 0; i < startDayOfWeek; i++) {
        const day = prevMonthLastDay - startDayOfWeek + 1 + i;
        result.push({
            date: "",
            day,
            income: 0,
            expense: 0,
            transfer: 0,
            balance: 0,
            hasData: false,
            isToday: false,
            isCurrentMonth: false,
        });
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${yearMonth}-${String(day).padStart(2, "0")}`;
        const data = recordMap.get(date);
        const income = data?.income || 0;
        const expense = data?.expense || 0;
        const transfer = data?.transfer || 0;
        result.push({
            date,
            day,
            income: Number(income.toFixed(2)),
            expense: Number(expense.toFixed(2)),
            transfer: Number(transfer.toFixed(2)),
            balance: Number((income - expense).toFixed(2)),
            hasData: !!data,
            isToday: date === today,
            isCurrentMonth: true,
        });
    }

    return result;
}

export function buildCategoryReport(
    records: AccountingRecord[],
    period: AccountingPeriod = "month",
    referenceDate: Date = new Date(),
    direction: "expense" | "income" = "expense",
): AccountingCategoryReportItem[] {
    const { start, end } = getPeriodRange(period, referenceDate);
    const filtered = records.filter(
        (r) => !r.archived && r.direction === direction && isWithinRange(r, start, end),
    );
    const total = filtered.reduce((sum, r) => sum + getPositiveAmount(r), 0);
    const map = new Map<string, { amount: number; count: number }>();
    for (const record of filtered) {
        const name = record.categoryPrimary.trim() || "其他";
        const existing = map.get(name);
        const amount = getPositiveAmount(record);
        if (existing) {
            existing.amount += amount;
            existing.count++;
        } else {
            map.set(name, { amount, count: 1 });
        }
    }
    return Array.from(map.entries())
        .map(([name, { amount, count }]) => ({
            name,
            amount: Number(amount.toFixed(2)),
            percent: total > 0 ? Number(((amount / total) * 100).toFixed(1)) : 0,
            count,
        }))
        .sort((a, b) => b.amount - a.amount);
}

export function getRecordsByDate(
    records: AccountingRecord[],
): Map<string, AccountingRecord[]> {
    const map = new Map<string, AccountingRecord[]>();
    for (const record of records) {
        if (record.archived) continue;
        const date = getRecordDateKey(record);
        if (!date) continue;
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push(record);
    }
    return map;
}

export function groupRecordsByMonth(
    records: AccountingRecord[],
): Map<string, AccountingRecord[]> {
    const map = new Map<string, AccountingRecord[]>();
    for (const record of records) {
        if (record.archived) continue;
        const date = getRecordDateKey(record);
        if (!date) continue;
        const month = date.slice(0, 7);
        if (!map.has(month)) map.set(month, []);
        map.get(month)!.push(record);
    }
    return map;
}

export function summarizeDay(records: AccountingRecord[]): { income: number; expense: number; transfer: number } {
    let income = 0;
    let expense = 0;
    let transfer = 0;
    for (const record of records) {
        const amount = getPositiveAmount(record);
        if (record.direction === "income") income += amount;
        else if (record.direction === "expense") expense += amount;
        else if (record.direction === "transfer") transfer += amount;
    }
    return {
        income: Number(income.toFixed(2)),
        expense: Number(expense.toFixed(2)),
        transfer: Number(transfer.toFixed(2)),
    };
}

export function relativeDateLabel(date: string, reference: Date = new Date()): string {
    const today = formatAccountingDate(reference);
    const yesterday = formatAccountingDate(new Date(reference.getTime() - DAY_MS));
    const beforeYesterday = formatAccountingDate(new Date(reference.getTime() - 2 * DAY_MS));
    if (date === today) return "今天";
    if (date === yesterday) return "昨天";
    if (date === beforeYesterday) return "前天";
    const d = parseLocalDate(date);
    if (!d) return date;
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${weekdays[d.getDay()]}`;
}

