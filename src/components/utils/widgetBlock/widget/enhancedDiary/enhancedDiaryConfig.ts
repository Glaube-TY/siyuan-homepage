import {
    DEFAULT_ENHANCED_DIARY_CONFIG,
    ENHANCED_DIARY_CONFIG_FILE,
    ENHANCED_DIARY_PERIODS,
    type EnhancedDiaryConfig,
    type EnhancedDiaryDayWorkspaceBaseHeadingLevel,
    type EnhancedDiaryHeadingStructureConfig,
    type EnhancedDiaryReviewReminderWindow,
    type EnhancedDiaryReviewReminderWindows,
    type EnhancedDiaryTemplateFieldMapping,
    type EnhancedDiaryWorkspaceCalendarSettings,
    type EnhancedDiaryWorkspaceModules,
    type EnhancedDiaryWorkspaceSettings,
    type EnhancedDiaryTemplateMap,
} from "./enhancedDiaryTypes";



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

function normalizeTemplates(raw: unknown): EnhancedDiaryTemplateMap {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.templates;
    if (!isRecord(raw)) {
        return { ...defaults };
    }

    const result: Partial<EnhancedDiaryTemplateMap> = {};

    for (const period of ENHANCED_DIARY_PERIODS) {
        const normalized = normalizeSingleTemplate((raw as Record<string, unknown>)[period]);
        if (normalized) {
            result[period] = normalized;
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

function normalizeWorkspaceModules(raw: unknown): EnhancedDiaryWorkspaceModules {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.workspaceSettings.modules;
    if (!isRecord(raw)) {
        return { ...defaults };
    }
    return {
        taskManagementEnabled: normalizeBoolean(raw.taskManagementEnabled, defaults.taskManagementEnabled),
    };
}

function normalizeWorkspaceSettings(raw: unknown): EnhancedDiaryWorkspaceSettings {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.workspaceSettings;
    if (!isRecord(raw)) {
        return {
            calendar: { ...defaults.calendar },
            modules: { ...defaults.modules },
        };
    }

    return {
        calendar: normalizeWorkspaceCalendarSettings(raw.calendar),
        modules: normalizeWorkspaceModules(raw.modules),
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

const VALID_BASE_HEADING_LEVELS = new Set([2, 3, 4]);

function normalizeDayWorkspaceBaseHeadingLevel(raw: unknown): EnhancedDiaryDayWorkspaceBaseHeadingLevel {
    if (typeof raw === "number" && VALID_BASE_HEADING_LEVELS.has(raw)) {
        return raw as EnhancedDiaryDayWorkspaceBaseHeadingLevel;
    }
    return 2;
}

function normalizeHeadingStructure(raw: unknown): EnhancedDiaryHeadingStructureConfig {
    if (!isRecord(raw)) {
        return { ...DEFAULT_ENHANCED_DIARY_CONFIG.headingStructure };
    }
    return {
        dayWorkspaceBaseHeadingLevel: normalizeDayWorkspaceBaseHeadingLevel(
            (raw as Record<string, unknown>).dayWorkspaceBaseHeadingLevel
        ),
    };
}

function normalizeStringArray(raw: unknown, fallback: string[]): string[] {
    if (!Array.isArray(raw)) {
        return [...fallback];
    }
    const result = Array.from(
        new Set(
            (raw as unknown[])
                .map((item) => {
                    if (typeof item !== "string") return "";
                    return item
                        .trim()
                        .replace(/[\r\n]+/g, " ")
                        .replace(/\s+/g, " ");
                })
                .filter((item) => item.length > 0 && item.length <= 50),
        ),
    );
    return result.length > 0 ? result : [...fallback];
}

function normalizeTemplateFieldMapping(raw: unknown): EnhancedDiaryTemplateFieldMapping {
    const defaults = DEFAULT_ENHANCED_DIARY_CONFIG.templateFieldMapping;
    if (!isRecord(raw)) {
        return structuredClone(defaults);
    }

    const input = raw as Partial<EnhancedDiaryTemplateFieldMapping>;

    const rootHeadings: EnhancedDiaryTemplateFieldMapping["rootHeadings"] = {
        day: normalizeStringArray(input.rootHeadings?.day, defaults.rootHeadings.day),
        week: normalizeStringArray(input.rootHeadings?.week, defaults.rootHeadings.week),
        month: normalizeStringArray(input.rootHeadings?.month, defaults.rootHeadings.month),
        year: normalizeStringArray(input.rootHeadings?.year, defaults.rootHeadings.year),
    };

    const inputDaySections: Partial<EnhancedDiaryTemplateFieldMapping["dayWorkspaceSections"]> =
        input.dayWorkspaceSections || {};
    const dayWorkspaceSections: EnhancedDiaryTemplateFieldMapping["dayWorkspaceSections"] = {
        overview: normalizeStringArray(inputDaySections.overview, defaults.dayWorkspaceSections.overview),
        taskManagement: normalizeStringArray(inputDaySections.taskManagement, defaults.dayWorkspaceSections.taskManagement),
        newTasks: normalizeStringArray(inputDaySections.newTasks, defaults.dayWorkspaceSections.newTasks),
        migratedTasks: normalizeStringArray(inputDaySections.migratedTasks, defaults.dayWorkspaceSections.migratedTasks),
        taskLog: normalizeStringArray(inputDaySections.taskLog, defaults.dayWorkspaceSections.taskLog),
        quickRecords: normalizeStringArray(inputDaySections.quickRecords, defaults.dayWorkspaceSections.quickRecords),
        dailyReview: normalizeStringArray(inputDaySections.dailyReview, defaults.dayWorkspaceSections.dailyReview),
        projectProgress: normalizeStringArray(inputDaySections.projectProgress, defaults.dayWorkspaceSections.projectProgress),
    };

    const inputReviewSections: Partial<EnhancedDiaryTemplateFieldMapping["reviewSections"]> =
        input.reviewSections || {};
    const reviewSections: EnhancedDiaryTemplateFieldMapping["reviewSections"] = {
        day: {
            reviewRoot: normalizeStringArray(
                inputReviewSections.day?.reviewRoot,
                defaults.reviewSections.day.reviewRoot,
            ),
            fields: normalizeStringArray(inputReviewSections.day?.fields, defaults.reviewSections.day.fields),
            carryoverField: normalizeStringArray(
                inputReviewSections.day?.carryoverField,
                defaults.reviewSections.day.carryoverField,
            ),
        },
        week: {
            reviewRoot: normalizeStringArray(
                inputReviewSections.week?.reviewRoot,
                defaults.reviewSections.week.reviewRoot,
            ),
            fields: normalizeStringArray(inputReviewSections.week?.fields, defaults.reviewSections.week.fields),
            carryoverField: normalizeStringArray(
                inputReviewSections.week?.carryoverField,
                defaults.reviewSections.week.carryoverField,
            ),
        },
        month: {
            reviewRoot: normalizeStringArray(
                inputReviewSections.month?.reviewRoot,
                defaults.reviewSections.month.reviewRoot,
            ),
            fields: normalizeStringArray(inputReviewSections.month?.fields, defaults.reviewSections.month.fields),
            carryoverField: normalizeStringArray(
                inputReviewSections.month?.carryoverField,
                defaults.reviewSections.month.carryoverField,
            ),
        },
        year: {
            reviewRoot: normalizeStringArray(
                inputReviewSections.year?.reviewRoot,
                defaults.reviewSections.year.reviewRoot,
            ),
            fields: normalizeStringArray(inputReviewSections.year?.fields, defaults.reviewSections.year.fields),
            carryoverField: normalizeStringArray(
                inputReviewSections.year?.carryoverField,
                defaults.reviewSections.year.carryoverField,
            ),
        },
    };

    return {
        rootHeadings,
        dayWorkspaceSections,
        reviewSections,
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
                modules: { ...DEFAULT_ENHANCED_DIARY_CONFIG.workspaceSettings.modules },
            },
            recordCategorySuggestions: [...DEFAULT_ENHANCED_DIARY_CONFIG.recordCategorySuggestions],
            reviewReminderWindows: { ...DEFAULT_ENHANCED_DIARY_CONFIG.reviewReminderWindows },
            headingStructure: { ...DEFAULT_ENHANCED_DIARY_CONFIG.headingStructure },
            templateFieldMapping: structuredClone(DEFAULT_ENHANCED_DIARY_CONFIG.templateFieldMapping),
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
        headingStructure: normalizeHeadingStructure(
            (input as Record<string, unknown>).headingStructure
        ),
        templateFieldMapping: normalizeTemplateFieldMapping(
            (input as Record<string, unknown>).templateFieldMapping
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
