import type { CategoryItem } from "./accountingCategoryConfig";
import {
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
} from "./accountingCategoryConfig";
import type { AccountingPeriod } from "./accountingTypes";
import { SETTINGS_FILE } from "./accountingStoragePaths";

const SETTINGS_VERSION = 1;

export interface AccountingAppSettings {
    version: number;
    defaultCurrency: string;
    monthlyBudget: number;
    defaultPeriod: AccountingPeriod;
    defaultAccountId: string;
    categories: {
        expense: CategoryItem[];
        income: CategoryItem[];
    };
    updatedAt: string;
}

function createDefaultSettings(): AccountingAppSettings {
    return {
        version: SETTINGS_VERSION,
        defaultCurrency: "CNY",
        monthlyBudget: 0,
        defaultPeriod: "month",
        defaultAccountId: "",
        categories: {
            expense: EXPENSE_CATEGORIES.map((c) => ({ ...c, secondaries: [...c.secondaries] })),
            income: INCOME_CATEGORIES.map((c) => ({ ...c, secondaries: [...c.secondaries] })),
        },
        updatedAt: new Date().toISOString(),
    };
}

function normalizeSettings(raw: Record<string, unknown>): AccountingAppSettings {
    const def = createDefaultSettings();
    return {
        version: typeof raw.version === "number" ? raw.version : def.version,
        defaultCurrency: typeof raw.defaultCurrency === "string" ? raw.defaultCurrency.trim().toUpperCase() || def.defaultCurrency : def.defaultCurrency,
        monthlyBudget: Math.max(0, Number(raw.monthlyBudget) || 0),
        defaultPeriod: (raw.defaultPeriod === "recent30" || raw.defaultPeriod === "year" || raw.defaultPeriod === "month") ? raw.defaultPeriod : def.defaultPeriod,
        defaultAccountId: typeof raw.defaultAccountId === "string" ? raw.defaultAccountId.trim() : def.defaultAccountId,
        categories: normalizeCategories(raw.categories, def.categories),
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : def.updatedAt,
    };
}

function normalizeCategories(
    raw: unknown,
    fallback: AccountingAppSettings["categories"],
): AccountingAppSettings["categories"] {
    if (!raw || typeof raw !== "object") return fallback;
    const src = raw as Record<string, unknown>;
    return {
        expense: normalizeCategoryList(src.expense, fallback.expense),
        income: normalizeCategoryList(src.income, fallback.income),
    };
}

function normalizeCategoryList(raw: unknown, fallback: CategoryItem[]): CategoryItem[] {
    if (!Array.isArray(raw) || raw.length === 0) return fallback;
    const list: CategoryItem[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const cat: CategoryItem = {
            key: typeof obj.key === "string" && obj.key ? obj.key : `accounting-cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            label: typeof obj.label === "string" ? obj.label : "未命名",
            icon: (typeof obj.icon === "string" ? obj.icon : "moreHorizontal") as CategoryItem["icon"],
            secondaries: Array.isArray(obj.secondaries)
                ? obj.secondaries.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                : [],
        };
        list.push(cat);
    }
    return list.length > 0 ? list : fallback;
}

function migrateFromWidgetConfig(_widgetConfig: Record<string, unknown>): Partial<AccountingAppSettings> {
    // 系统设置不再从 widget 配置迁移，统一使用 accounting/accounting-settings.json
    return {};
}

export async function loadAccountingSettings(
    plugin: any,
    widgetConfig?: Record<string, unknown>,
): Promise<AccountingAppSettings> {
    try {
        const raw = await plugin.loadData(SETTINGS_FILE);
        if (raw && typeof raw === "object") {
            return normalizeSettings(raw as Record<string, unknown>);
        }
    } catch {
        // File doesn't exist yet
    }

    // First time: create defaults, optionally migrate from widget config
    const defaults = createDefaultSettings();
    if (widgetConfig) {
        const migrated = migrateFromWidgetConfig(widgetConfig);
        if (migrated.defaultCurrency) defaults.defaultCurrency = migrated.defaultCurrency;
        if (migrated.monthlyBudget !== undefined) defaults.monthlyBudget = migrated.monthlyBudget;
        if (migrated.defaultPeriod) defaults.defaultPeriod = migrated.defaultPeriod;
        defaults.updatedAt = new Date().toISOString();
    }

    // Save the initial settings
    try {
        await plugin.saveData(SETTINGS_FILE, defaults);
    } catch {
        // Non-fatal
    }

    return defaults;
}

export async function saveAccountingSettings(
    plugin: any,
    settings: AccountingAppSettings,
): Promise<void> {
    settings.updatedAt = new Date().toISOString();
    settings.version = SETTINGS_VERSION;
    await plugin.saveData(SETTINGS_FILE, settings);
}

export function getEffectiveCategories(
    settings: AccountingAppSettings,
    direction: "expense" | "income" | "transfer",
): CategoryItem[] {
    if (direction === "transfer") return [];
    const cats = settings.categories?.[direction];
    if (cats && cats.length > 0) return cats;
    // Fallback to hardcoded defaults
    if (direction === "income") return INCOME_CATEGORIES;
    return EXPENSE_CATEGORIES;
}

export function findCategoryByKeyInSettings(
    settings: AccountingAppSettings,
    direction: "expense" | "income" | "transfer",
    key: string,
): CategoryItem | undefined {
    return getEffectiveCategories(settings, direction).find((c) => c.key === key);
}

export function findCategoryByLabelInSettings(
    settings: AccountingAppSettings,
    direction: "expense" | "income" | "transfer",
    label: string,
): CategoryItem | undefined {
    return getEffectiveCategories(settings, direction).find((c) => c.label === label);
}

export function getCategoryIconFromSettings(
    settings: AccountingAppSettings,
    direction: string,
    categoryLabel: string,
): CategoryItem["icon"] {
    const dir = (direction === "income" ? "income" : direction === "transfer" ? "transfer" : "expense") as "expense" | "income" | "transfer";
    const cat = findCategoryByLabelInSettings(settings, dir, categoryLabel);
    return cat?.icon || "moreHorizontal";
}

export function generateCategoryKey(): string {
    return `accounting-cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
