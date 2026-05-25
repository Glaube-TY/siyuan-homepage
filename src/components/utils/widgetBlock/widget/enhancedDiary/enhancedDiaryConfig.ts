import {
    DEFAULT_ENHANCED_DIARY_CONFIG,
    ENHANCED_DIARY_CONFIG_FILE,
    ENHANCED_DIARY_PERIODS,
    type EnhancedDiaryConfig,
    type EnhancedDiaryReviewReminderWindow,
    type EnhancedDiaryReviewReminderWindows,
    type EnhancedDiaryWorkspaceCalendarSettings,
    type EnhancedDiaryWorkspaceSettings,
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
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (typeof value === "number" && VALID_WEEKDAYS.has(value)) {
        return value;
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
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 3650) {
        return Math.floor(value);
    }
    return 30;
}

function normalizeBoolean(raw: unknown, fallback: boolean): boolean {
    return typeof raw === "boolean" ? raw : fallback;
}

function normalizeWorkspaceCalendarSettings(raw: unknown): EnhancedDiaryWorkspaceCalendarSettings {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.workspaceSettings.calendar;
    if (!isRecord(raw)) {
        return { ...defaults };
    }

    return {
        showLunar: normalizeBoolean(raw.showLunar, defaults.showLunar),
        showSolarTerm: normalizeBoolean(raw.showSolarTerm, defaults.showSolarTerm),
        showFestival: normalizeBoolean(raw.showFestival, defaults.showFestival),
        showLegalHoliday: normalizeBoolean(raw.showLegalHoliday, defaults.showLegalHoliday),
        showBriefCounts: normalizeBoolean(raw.showBriefCounts, defaults.showBriefCounts),
    };
}

function normalizeWorkspaceSettings(raw: unknown): EnhancedDiaryWorkspaceSettings {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.workspaceSettings;
    if (!isRecord(raw)) {
        return {
            calendar: { ...defaults.calendar },
        };
    }

    return {
        calendar: normalizeWorkspaceCalendarSettings(raw.calendar),
    };
}

function normalizeRecordCategorySuggestions(raw: unknown): string[] {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.recordCategorySuggestions;
    if (!Array.isArray(raw)) {
        return [...defaults];
    }

    const result = Array.from(
        new Set(
            (raw as unknown[])
                .map((item) => {
                    if (typeof item !== "string") return "";
                    return item.trim().replace(/\n/g, "");
                })
                .filter((item) => item.length > 0 && item.length <= 30),
        ),
    );

    return result;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    const n = Math.floor(value);
    if (n < min || n > max) return fallback;
    return n;
}

function normalizeReviewReminderWindow(raw: unknown, fallback: EnhancedDiaryReviewReminderWindow): EnhancedDiaryReviewReminderWindow {
    if (!isRecord(raw)) return { ...fallback };
    return {
        beforeDays: clampInt((raw as Record<string, unknown>).beforeDays, 0, 30, fallback.beforeDays),
        afterDays: clampInt((raw as Record<string, unknown>).afterDays, 0, 30, fallback.afterDays),
    };
}

function normalizeReviewReminderWindows(raw: unknown): EnhancedDiaryReviewReminderWindows {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.reviewReminderWindows;
    if (!isRecord(raw)) return { ...defaults };
    return {
        week: normalizeReviewReminderWindow((raw as Record<string, unknown>).week, defaults.week),
        month: normalizeReviewReminderWindow((raw as Record<string, unknown>).month, defaults.month),
        year: normalizeReviewReminderWindow((raw as Record<string, unknown>).year, defaults.year),
    };
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
            workspaceSettings: {
                calendar: { ...DEFAULT_ENHANCED_DIARY_CONFIG.workspaceSettings.calendar },
            },
            recordCategorySuggestions: [...DEFAULT_ENHANCED_DIARY_CONFIG.recordCategorySuggestions],
            reviewReminderWindows: { ...DEFAULT_ENHANCED_DIARY_CONFIG.reviewReminderWindows },
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
        workspaceSettings: normalizeWorkspaceSettings(
            (input as Record<string, unknown>).workspaceSettings
        ),
        recordCategorySuggestions: normalizeRecordCategorySuggestions(
            (input as Record<string, unknown>).recordCategorySuggestions
        ),
        reviewReminderWindows: normalizeReviewReminderWindows(
            (input as Record<string, unknown>).reviewReminderWindows
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
