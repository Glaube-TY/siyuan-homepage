import type { AccountingPeriod, AccountingWidgetConfig } from "./accountingTypes";

export const DEFAULT_EXPENSE_CATEGORIES = [
    "餐饮", "交通", "购物", "住房", "通讯", "医疗", "娱乐", "学习", "人情", "其他",
];

export const DEFAULT_INCOME_CATEGORIES = [
    "工资", "奖金", "兼职", "投资", "报销", "其他",
];

export const DEFAULT_ACCOUNTS = ["微信", "支付宝", "银行卡", "现金", "其他"];

export const ACCOUNTING_PERIOD_OPTIONS: Array<{ value: AccountingPeriod; label: string }> = [
    { value: "month", label: "本月" },
    { value: "recent30", label: "近 30 天" },
    { value: "year", label: "本年" },
];

export const DEFAULT_ACCOUNTING_CONFIG: AccountingWidgetConfig = {
    title: "记账",
    homeRecentLimit: 5,
    showBudget: true,
    showRecentRecords: true,
};

// Re-export category config for convenience
export type { CategoryItem } from "./accountingCategoryConfig";
export {
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    getCategoriesByDirection,
    findCategoryByKey,
    findCategoryByLabel,
    getCategoryIcon,
} from "./accountingCategoryConfig";

function normalizePositiveInteger(value: unknown, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return Math.floor(num);
}

export function normalizeAccountingWidgetConfig(data: Record<string, unknown> | undefined): AccountingWidgetConfig {
    return {
        title: typeof data?.accountingTitle === "string" && data.accountingTitle.trim()
            ? data.accountingTitle.trim()
            : DEFAULT_ACCOUNTING_CONFIG.title,
        homeRecentLimit: normalizePositiveInteger(
            data?.accountingHomeRecentLimit ?? data?.homeRecentLimit,
            DEFAULT_ACCOUNTING_CONFIG.homeRecentLimit,
        ),
        showBudget: data?.accountingShowBudget ?? data?.showBudget ?? DEFAULT_ACCOUNTING_CONFIG.showBudget ? true : false,
        showRecentRecords: data?.accountingShowRecentRecords ?? data?.showRecentRecords ?? DEFAULT_ACCOUNTING_CONFIG.showRecentRecords ? true : false,
    };
}

// ── Currency Options ──
export const CURRENCY_OPTIONS = [
    { value: "CNY", label: "人民币 (CNY)" },
    { value: "USD", label: "美元 (USD)" },
    { value: "HKD", label: "港币 (HKD)" },
    { value: "TWD", label: "新台币 (TWD)" },
    { value: "JPY", label: "日元 (JPY)" },
    { value: "EUR", label: "欧元 (EUR)" },
    { value: "GBP", label: "英镑 (GBP)" },
    { value: "KRW", label: "韩元 (KRW)" },
    { value: "SGD", label: "新加坡元 (SGD)" },
    { value: "AUD", label: "澳元 (AUD)" },
    { value: "CAD", label: "加元 (CAD)" },
] as const;

export function normalizeAccountingCurrency(value: unknown, fallback: string = "CNY"): string {
    const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (CURRENCY_OPTIONS.some((c) => c.value === raw)) return raw;
    return fallback;
}
