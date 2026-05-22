import {
    DEFAULT_ENHANCED_DIARY_CONFIG,
    ENHANCED_DIARY_CONFIG_FILE,
    ENHANCED_DIARY_PERIODS,
    type EnhancedDiaryConfig,
    type EnhancedDiaryTemplateMap,
} from "./enhancedDiaryTypes";

const COMPLETION_MARKER = "{{完成标记}}";

const VALID_WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6]);
const VALID_MONTH_RULES = new Set(["monthEnd", "nextMonthFirst"]);
const VALID_YEAR_RULES = new Set(["dec31", "nextJan1"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWeekReviewDay(raw: unknown): number {
    if (typeof raw === "number" && VALID_WEEKDAYS.has(raw)) {
        return raw;
    }
    return 0;
}

function normalizeMonthReviewRule(raw: unknown): string {
    if (typeof raw === "string" && VALID_MONTH_RULES.has(raw)) {
        return raw;
    }
    return "monthEnd";
}

function normalizeYearReviewRule(raw: unknown): string {
    if (typeof raw === "string" && VALID_YEAR_RULES.has(raw)) {
        return raw;
    }
    return "dec31";
}

function normalizeSingleTemplate(raw: unknown): string {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        return "";
    }
    return raw;
}

function ensureCompletionMarker(template: string): string {
    if (template.includes(COMPLETION_MARKER)) {
        return template;
    }
    return COMPLETION_MARKER + "\n\n" + template;
}

function normalizeTemplates(raw: unknown): EnhancedDiaryTemplateMap {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.templates;
    if (!isRecord(raw)) {
        return { ...defaults };
    }

    const result: Partial<EnhancedDiaryTemplateMap> = {};

    for (const period of ENHANCED_DIARY_PERIODS) {
        const normalized = normalizeSingleTemplate((raw as Record<string, unknown>)[period]);
        if (normalized) {
            result[period] = ensureCompletionMarker(normalized);
        }
    }

    const merged: EnhancedDiaryTemplateMap = {
        day: result.day ?? defaults.day,
        week: result.week ?? defaults.week,
        month: result.month ?? defaults.month,
        year: result.year ?? defaults.year,
    };

    return merged;
}

function normalizeTaskMigrationReminderDays(raw: unknown): number {
    if (typeof raw === "number" && raw >= 1 && raw <= 3650) {
        return Math.floor(raw);
    }
    return 30;
}

export function normalizeEnhancedDiaryConfig(input: unknown): EnhancedDiaryConfig {
    if (!isRecord(input)) {
        return {
            weekReviewDay: DEFAULT_ENHANCED_DIARY_CONFIG.weekReviewDay,
            monthReviewRule: DEFAULT_ENHANCED_DIARY_CONFIG.monthReviewRule,
            yearReviewRule: DEFAULT_ENHANCED_DIARY_CONFIG.yearReviewRule,
            templates: { ...DEFAULT_ENHANCED_DIARY_CONFIG.templates },
            dailyNotebookId: DEFAULT_ENHANCED_DIARY_CONFIG.dailyNotebookId,
            taskMigrationReminderDays: DEFAULT_ENHANCED_DIARY_CONFIG.taskMigrationReminderDays,
        };
    }

    const rawDailyNotebookId = (input as Record<string, unknown>).dailyNotebookId;
    const dailyNotebookId = typeof rawDailyNotebookId === "string" && rawDailyNotebookId.trim() !== ""
        ? rawDailyNotebookId.trim()
        : "";

    return {
        weekReviewDay: normalizeWeekReviewDay(
            (input as Record<string, unknown>).weekReviewDay
        ) as EnhancedDiaryConfig["weekReviewDay"],
        monthReviewRule: normalizeMonthReviewRule(
            (input as Record<string, unknown>).monthReviewRule
        ) as EnhancedDiaryConfig["monthReviewRule"],
        yearReviewRule: normalizeYearReviewRule(
            (input as Record<string, unknown>).yearReviewRule
        ) as EnhancedDiaryConfig["yearReviewRule"],
        templates: normalizeTemplates(
            (input as Record<string, unknown>).templates
        ),
        dailyNotebookId,
        taskMigrationReminderDays: normalizeTaskMigrationReminderDays(
            (input as Record<string, unknown>).taskMigrationReminderDays
        ),
    };
}

export async function loadEnhancedDiaryConfig(plugin: {
    loadData: (file: string) => Promise<unknown>;
}): Promise<EnhancedDiaryConfig> {
    try {
        const data = await plugin.loadData(ENHANCED_DIARY_CONFIG_FILE);
        if (data != null) {
            return normalizeEnhancedDiaryConfig(data);
        }
    } catch {
        // ignore
    }
    return normalizeEnhancedDiaryConfig(null);
}

export async function saveEnhancedDiaryConfig(
    plugin: {
        saveData: (file: string, content: unknown) => Promise<void>;
    },
    config: EnhancedDiaryConfig
): Promise<void> {
    const normalized = normalizeEnhancedDiaryConfig(config);
    await plugin.saveData(ENHANCED_DIARY_CONFIG_FILE, normalized);
}
