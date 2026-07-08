export type AccountingDirection = "expense" | "income" | "transfer";

export type AccountingPeriod = "month" | "recent30" | "year";

export interface AccountingWidgetConfig {
    title: string;
    homeRecentLimit: number;
    showBudget: boolean;
    showRecentRecords: boolean;
}

export interface AccountingRecord {
    recordId: string;
    rowId: string;
    title: string;
    direction: AccountingDirection;
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
    archived: boolean;
}

export type AccountingRecordInput = Partial<AccountingRecord> & {
    title: string;
    direction: AccountingDirection;
    amount: number;
    date: string;
    categoryPrimary: string;
};

export interface AccountingFilter {
    month?: string;
    direction?: AccountingDirection | "all";
    categoryPrimary?: string;
}

export interface AccountingSummary {
    incomeTotal: number;
    expenseTotal: number;
    balance: number;
    todayExpense: number;
    budgetUsedRatio: number;
    recentRecords: AccountingRecord[];
}

export interface AccountingStoreStatus {
    ok: boolean;
    missingFields: string[];
    message: string;
}

export interface AccountingLoadResult {
    records: AccountingRecord[];
    status: AccountingStoreStatus;
}

export interface AccountingTrendChartData {
    labels: string[];
    income: number[];
    expense: number[];
}

export interface AccountingCategoryPieItem {
    name: string;
    value: number;
}

// ── Report Types ──

export interface AccountingDailyReportItem {
    date: string;
    income: number;
    expense: number;
    transfer: number;
    balance: number;
    count: number;
}

export interface AccountingMonthlyReportItem {
    month: string;
    income: number;
    expense: number;
    transfer: number;
    balance: number;
    count: number;
}

export interface AccountingCalendarDayItem {
    date: string;
    day: number;
    income: number;
    expense: number;
    transfer: number;
    balance: number;
    hasData: boolean;
    isToday: boolean;
    isCurrentMonth: boolean;
}

export interface AccountingCategoryReportItem {
    name: string;
    key?: string;
    amount: number;
    percent: number;
    count: number;
    icon?: string;
}

export interface AccountingRangeSummary {
    income: number;
    expense: number;
    transfer: number;
    balance: number;
    count: number;
    averageExpense: number;
    averageIncome: number;
    days: number;
}

// ── Account Types ──

export interface AccountingAccount {
    accountId: string;
    rowId: string;
    name: string;
    type: string;
    currency: string;
    openingBalance: number;
    currentBalance: number;
    sortOrder: number;
    note: string;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
}

export type AccountingAccountInput = Partial<AccountingAccount> & {
    name: string;
    type: string;
};

export interface AccountingAccountStoreStatus {
    ok: boolean;
    missingFields: string[];
    message: string;
}

export interface AccountingAccountLoadResult {
    accounts: AccountingAccount[];
    status: AccountingAccountStoreStatus;
}

// ── Local File Structures ──

export interface AccountingRecordsFile {
    schema: string;
    version: number;
    year: number;
    updatedAt: string;
    records: AccountingRecord[];
}

export interface AccountingAssetsFile {
    schema: string;
    version: number;
    updatedAt: string;
    assets: AccountingAccount[];
}

export interface AccountingRecordsIndexFile {
    schema: string;
    version: number;
    updatedAt: string;
    years: number[];
}

export interface AccountingYearSummary {
    income: number;
    expense: number;
    transfer: number;
    count: number;
}

export interface AccountingMonthSummary extends AccountingYearSummary {
    categoryExpense: Record<string, number>;
}

export interface AccountingSummaryFile {
    schema: string;
    version: number;
    updatedAt: string;
    years: Record<string, AccountingYearSummary>;
    months: Record<string, AccountingMonthSummary>;
}

// ── Asset Type Alias (UI unified as 资产) ──
/** UI 层统一使用"资产"，代码兼容旧类型 */
export type AccountingAsset = AccountingAccount;
export type AccountingAssetInput = AccountingAccountInput;

export const ASSET_TYPE_OPTIONS = [
    { value: "internet", label: "互联网账户" },
    { value: "debitCard", label: "借记卡" },
    { value: "savingsCard", label: "储蓄卡" },
    { value: "creditCard", label: "信用卡" },
    { value: "cash", label: "现金" },
    { value: "other", label: "其他" },
] as const;

export function getAssetTypeLabel(type: string): string {
    return ASSET_TYPE_OPTIONS.find((o) => o.value === type)?.label || type || "其他";
}

