import {
    DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING,
    ENHANCED_DIARY_PERIODS,
    type EnhancedDiaryConfig,
    type EnhancedDiaryDayWorkspaceSectionFieldKey,
    type EnhancedDiaryPeriod,
    type EnhancedDiaryTemplateFieldMapping,
} from "./enhancedDiaryTypes";

const ALIAS_SEPARATORS = /[,，、;；\n]+/;
const MAX_ALIAS_LENGTH = 50;
export const ENHANCED_DIARY_COMPLETED_SUFFIX = "（已完成复盘）";

export function normalizeHeadingTitle(title: string): string {
    let result = title.trim();
    result = result.replace(/\s+/g, " ");
    result = result.replace(/\s*#+\s*$/, "");
    return result.trim();
}

export function stripReviewStatusSuffix(title: string): string {
    return title.replace(new RegExp(`${ENHANCED_DIARY_COMPLETED_SUFFIX}$`), "").trim();
}

export function parseAliasInput(input: string): string[] {
    const trimmed = input.trim();
    if (!trimmed) return [];
    return Array.from(
        new Set(
            trimmed
                .split(ALIAS_SEPARATORS)
                .map((part) =>
                    part
                        .trim()
                        .replace(/\s+/g, " ")
                        .slice(0, MAX_ALIAS_LENGTH)
                )
                .filter((part) => part.length > 0),
        ),
    );
}



function normalizeAlias(alias: string): string {
    return alias.trim().replace(/\s+/g, " ");
}

function mergeAliases(userAliases: string[] | undefined, defaultAliases: string[]): string[] {
    const user = Array.isArray(userAliases) ? userAliases : [];
    const combined = [...user, ...defaultAliases];
    const result: string[] = [];
    for (const alias of combined) {
        const normalized = normalizeAlias(alias);
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

function resolveActiveFields(userFields: string[] | undefined, defaultFields: string[]): string[] {
    const user = Array.isArray(userFields) ? userFields : [];
    const normalized = user.map(normalizeAlias).filter((f) => f.length > 0);
    return normalized.length > 0 ? normalized : [...defaultFields];
}

export const DEFAULT_TASK_REVIEW_FIELD_LABELS: Record<EnhancedDiaryPeriod, string[]> = {
    day: [],
    week: ["任务回顾"],
    month: ["任务回顾"],
    year: [],
};

export function getResolvedTemplateFieldMapping(
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryTemplateFieldMapping {
    const defaults = DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING;
    if (!mapping) return structuredClone(defaults);

    const rootHeadings: EnhancedDiaryTemplateFieldMapping["rootHeadings"] = {
        day: mergeAliases(mapping.rootHeadings?.day, defaults.rootHeadings.day),
        week: mergeAliases(mapping.rootHeadings?.week, defaults.rootHeadings.week),
        month: mergeAliases(mapping.rootHeadings?.month, defaults.rootHeadings.month),
        year: mergeAliases(mapping.rootHeadings?.year, defaults.rootHeadings.year),
    };

    const daySections = mapping.dayWorkspaceSections || defaults.dayWorkspaceSections;
    const dayWorkspaceSections: EnhancedDiaryTemplateFieldMapping["dayWorkspaceSections"] = {
        overview: mergeAliases(daySections.overview, defaults.dayWorkspaceSections.overview),
        taskManagement: mergeAliases(daySections.taskManagement, defaults.dayWorkspaceSections.taskManagement),
        newTasks: mergeAliases(daySections.newTasks, defaults.dayWorkspaceSections.newTasks),
        migratedTasks: mergeAliases(daySections.migratedTasks, defaults.dayWorkspaceSections.migratedTasks),
        taskLog: mergeAliases(daySections.taskLog, defaults.dayWorkspaceSections.taskLog),
        quickRecords: mergeAliases(daySections.quickRecords, defaults.dayWorkspaceSections.quickRecords),
        dailyReview: mergeAliases(daySections.dailyReview, defaults.dayWorkspaceSections.dailyReview),
        projectProgress: mergeAliases(daySections.projectProgress, defaults.dayWorkspaceSections.projectProgress),
    };

    const reviewSections: EnhancedDiaryTemplateFieldMapping["reviewSections"] = {
        day: {
            reviewRoot: mergeAliases(
                mapping.reviewSections?.day?.reviewRoot,
                defaults.reviewSections.day.reviewRoot,
            ),
            fields: resolveActiveFields(mapping.reviewSections?.day?.fields, defaults.reviewSections.day.fields),
            carryoverField: mergeAliases(
                mapping.reviewSections?.day?.carryoverField,
                defaults.reviewSections.day.carryoverField,
            ),
        },
        week: {
            reviewRoot: mergeAliases(
                mapping.reviewSections?.week?.reviewRoot,
                defaults.reviewSections.week.reviewRoot,
            ),
            fields: resolveActiveFields(mapping.reviewSections?.week?.fields, defaults.reviewSections.week.fields),
            carryoverField: mergeAliases(
                mapping.reviewSections?.week?.carryoverField,
                defaults.reviewSections.week.carryoverField,
            ),
        },
        month: {
            reviewRoot: mergeAliases(
                mapping.reviewSections?.month?.reviewRoot,
                defaults.reviewSections.month.reviewRoot,
            ),
            fields: resolveActiveFields(mapping.reviewSections?.month?.fields, defaults.reviewSections.month.fields),
            carryoverField: mergeAliases(
                mapping.reviewSections?.month?.carryoverField,
                defaults.reviewSections.month.carryoverField,
            ),
        },
        year: {
            reviewRoot: mergeAliases(
                mapping.reviewSections?.year?.reviewRoot,
                defaults.reviewSections.year.reviewRoot,
            ),
            fields: resolveActiveFields(mapping.reviewSections?.year?.fields, defaults.reviewSections.year.fields),
            carryoverField: mergeAliases(
                mapping.reviewSections?.year?.carryoverField,
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

export function getPrimaryFieldTitle(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "rootHeadings",
    key: EnhancedDiaryPeriod
): string;
export function getPrimaryFieldTitle(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "dayWorkspaceSections",
    key: EnhancedDiaryDayWorkspaceSectionFieldKey
): string;
export function getPrimaryFieldTitle(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "reviewSections",
    period: EnhancedDiaryPeriod,
    key: "reviewRoot"
): string;
export function getPrimaryFieldTitle(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "reviewSections",
    period: EnhancedDiaryPeriod,
    key: "fields",
    fieldIndex: number
): string;
export function getPrimaryFieldTitle(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: string,
    keyOrPeriod: EnhancedDiaryPeriod | EnhancedDiaryDayWorkspaceSectionFieldKey,
    key?: "reviewRoot" | "fields",
    fieldIndex?: number
): string {
    const resolved = getResolvedTemplateFieldMapping(mapping);
    if (group === "rootHeadings") {
        return resolved.rootHeadings[keyOrPeriod as EnhancedDiaryPeriod][0];
    }
    if (group === "dayWorkspaceSections") {
        return resolved.dayWorkspaceSections[keyOrPeriod as EnhancedDiaryDayWorkspaceSectionFieldKey][0];
    }
    const period = keyOrPeriod as EnhancedDiaryPeriod;
    const section = resolved.reviewSections[period];
    if (key === "reviewRoot") {
        return section.reviewRoot[0];
    }
    const index = typeof fieldIndex === "number" ? fieldIndex : 0;
    return section.fields[index] ?? section.fields[0] ?? "";
}

export function getFieldAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "rootHeadings",
    key: EnhancedDiaryPeriod
): string[];
export function getFieldAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "dayWorkspaceSections",
    key: EnhancedDiaryDayWorkspaceSectionFieldKey
): string[];
export function getFieldAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "reviewSections",
    period: EnhancedDiaryPeriod,
    key: "reviewRoot"
): string[];
export function getFieldAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "reviewSections",
    period: EnhancedDiaryPeriod,
    key: "fields",
    fieldIndex?: number
): string[];
export function getFieldAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: "reviewSections",
    period: EnhancedDiaryPeriod,
    key: "carryoverField"
): string[];
export function getFieldAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    group: string,
    keyOrPeriod: EnhancedDiaryPeriod | EnhancedDiaryDayWorkspaceSectionFieldKey,
    key?: "reviewRoot" | "fields" | "carryoverField",
    fieldIndex?: number
): string[] {
    const resolved = getResolvedTemplateFieldMapping(mapping);
    if (group === "rootHeadings") {
        return [...resolved.rootHeadings[keyOrPeriod as EnhancedDiaryPeriod]];
    }
    if (group === "dayWorkspaceSections") {
        return [...resolved.dayWorkspaceSections[keyOrPeriod as EnhancedDiaryDayWorkspaceSectionFieldKey]];
    }
    const period = keyOrPeriod as EnhancedDiaryPeriod;
    const section = resolved.reviewSections[period];
    if (key === "reviewRoot") {
        return [...section.reviewRoot];
    }
    if (key === "carryoverField") {
        return [...section.carryoverField];
    }
    if (typeof fieldIndex === "number") {
        const title = section.fields[fieldIndex];
        return title ? [title] : [];
    }
    return [...section.fields];
}

export function headingTitleMatchesAliases(title: string, aliases: string[]): boolean {
    const normalized = normalizeHeadingTitle(title);
    return aliases.some(
        (alias) => normalized === alias || normalized.startsWith(alias + " ")
    );
}

export function matchesRootHeadingWithMapping(
    title: string,
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): boolean {
    const stripped = stripReviewStatusSuffix(title);
    const aliases = getFieldAliases(mapping, "rootHeadings", period);
    return headingTitleMatchesAliases(stripped, aliases);
}

export function getActiveReviewFields(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod
): string[] {
    return getFieldAliases(mapping, "reviewSections", period, "fields");
}

export function getReviewFieldMatchAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod
): string[] {
    const active = getActiveReviewFields(mapping, period);
    const defaults = DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.reviewSections[period].fields;
    return mergeAliases(active, defaults);
}

const DEFAULT_CARRYOVER_FIELD_LABELS: Record<EnhancedDiaryPeriod, string> = {
    day: "明日关注",
    week: "下周计划",
    month: "下月计划",
    year: "明年方向",
};

/**
 * 判断当前复盘字段列表是否处于“低风险改名”场景：
 * 字段数量与默认模板一致，且每个当前字段都能对应到某个默认字段或承接字段别名。
 * 满足该条件时，可为普通字段加入默认同位置标题作为兼容别名；
 * 否则普通字段只按当前标题读取，避免用户删除/重排/新增字段后误读旧内容。
 */
function isLowRiskRenameScenario(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod
): boolean {
    const activeFields = getActiveReviewFields(mapping, period);
    const defaults = DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.reviewSections[period].fields;
    if (activeFields.length !== defaults.length) return false;

    const defaultSet = new Set(defaults.map(normalizeAlias));
    const seen = new Set<string>();
    for (let i = 0; i < activeFields.length; i++) {
        const field = activeFields[i];
        const normalized = normalizeAlias(field);
        // 空标题、临时占位字段（如“字段 1”）不视为低风险改名
        if (!normalized || /^字段\s*\d+$/.test(normalized)) return false;
        if (seen.has(normalized)) return false;
        seen.add(normalized);

        // 如果某个默认字段标题出现在了不同 index，说明用户做了重排，不是单纯的改名
        const defaultAtIndex = normalizeAlias(defaults[i]);
        if (defaultSet.has(normalized) && normalized !== defaultAtIndex) {
            return false;
        }
    }
    return true;
}

/**
 * 获取复盘字段在文档中查找内容时应匹配的别名集合。
 * 普通字段至少包含当前字段名；承接字段额外包含 carryoverField 别名和默认承接字段名。
 * 可选传入字段 index，在低风险改名场景下加入默认模板同位置字段标题作为兼容别名。
 */
export function getReviewFieldLookupAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod,
    fieldTitle: string,
    fieldIndex?: number
): string[] {
    const aliases = new Set<string>();
    aliases.add(fieldTitle);

    const defaults = DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.reviewSections[period].fields;
    const carryoverAliases = getCarryoverFieldAliases(mapping, period);
    const normalizedField = normalizeAlias(fieldTitle);
    const isCarryover = carryoverAliases.map(normalizeAlias).includes(normalizedField);
    const lowRiskRename = isLowRiskRenameScenario(mapping, period);

    if (typeof fieldIndex === "number") {
        const defaultTitle = defaults[fieldIndex];
        if (defaultTitle) {
            // 普通字段只在低风险改名场景（或当前标题就是默认标题）时加入默认标题兼容；
            // 承接字段始终加入默认同位置标题，确保上一周期内容可读。
            const isRenamedDefaultField = normalizeAlias(defaultTitle) === normalizedField;
            if (isCarryover || isRenamedDefaultField || lowRiskRename) {
                aliases.add(defaultTitle);
            }
        }
    }

    if (isCarryover) {
        for (const alias of carryoverAliases) aliases.add(alias);
        aliases.add(DEFAULT_CARRYOVER_FIELD_LABELS[period]);
    }

    return Array.from(aliases).filter(Boolean);
}

export function getTaskReviewFieldAliases(
    period: EnhancedDiaryPeriod
): string[] {
    const defaults = DEFAULT_TASK_REVIEW_FIELD_LABELS[period];
    return defaults.map(normalizeAlias).filter((f) => f.length > 0);
}

export function isTaskReviewField(
    period: EnhancedDiaryPeriod,
    fieldTitle: string
): boolean {
    const normalized = normalizeAlias(fieldTitle);
    return getTaskReviewFieldAliases(period).includes(normalized);
}

export function getWorkspaceReviewFields(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod,
    taskManagementEnabled: boolean = true
): string[] {
    return getWorkspaceReviewFieldEntries(mapping, period, taskManagementEnabled).map((e) => e.label);
}

export interface WorkspaceReviewFieldEntry {
    label: string;
    originalIndex: number;
}

export function getWorkspaceReviewFieldEntries(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod,
    taskManagementEnabled: boolean = true
): WorkspaceReviewFieldEntry[] {
    const fields = getActiveReviewFields(mapping, period);
    return fields
        .map((label, originalIndex) => ({ label, originalIndex }))
        .filter((entry) => taskManagementEnabled || !isTaskReviewField(period, entry.label));
}

export function getReviewFieldDefinitions(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod
): { reviewRootAliases: string[]; fieldAliases: string[]; carryoverFieldAliases: string[] } {
    return {
        reviewRootAliases: getFieldAliases(mapping, "reviewSections", period, "reviewRoot"),
        fieldAliases: getReviewFieldMatchAliases(mapping, period),
        carryoverFieldAliases: getFieldAliases(mapping, "reviewSections", period, "carryoverField"),
    };
}

export function getCarryoverFieldAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod
): string[] {
    return getFieldAliases(mapping, "reviewSections", period, "carryoverField");
}

export function isCarryoverField(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    period: EnhancedDiaryPeriod,
    fieldTitle: string
): boolean {
    const normalized = normalizeHeadingTitle(fieldTitle);
    const aliases = getCarryoverFieldAliases(mapping, period);
    return aliases.some((alias) => normalizeHeadingTitle(alias) === normalized);
}

export function isEnhancedDiaryTaskManagementEnabled(
    config: EnhancedDiaryConfig | undefined | null
): boolean {
    if (!config) return true;
    return config.workspaceSettings?.modules?.taskManagementEnabled !== false;
}

export function getDayWorkspaceSectionPath(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    sectionKey: EnhancedDiaryDayWorkspaceSectionFieldKey
): string[] {
    const resolved = getResolvedTemplateFieldMapping(mapping);
    const sections = resolved.dayWorkspaceSections;
    switch (sectionKey) {
        case "overview":
            return [sections.overview[0]];
        case "newTasks":
            return [sections.taskManagement[0], sections.newTasks[0]];
        case "migratedTasks":
            return [sections.taskManagement[0], sections.migratedTasks[0]];
        case "taskLog":
            return [sections.taskManagement[0], sections.taskLog[0]];
        case "quickRecords":
            return [sections.quickRecords[0]];
        case "dailyReview":
            return [sections.dailyReview[0]];
        case "projectProgress":
            return [sections.projectProgress[0]];
        default:
            return [];
    }
}

export function getDayWorkspaceSectionPathAliases(
    mapping: EnhancedDiaryTemplateFieldMapping | undefined | null,
    sectionKey: EnhancedDiaryDayWorkspaceSectionFieldKey
): string[][] {
    const resolved = getResolvedTemplateFieldMapping(mapping);
    const sections = resolved.dayWorkspaceSections;
    switch (sectionKey) {
        case "overview":
            return [sections.overview];
        case "newTasks":
            return [sections.taskManagement, sections.newTasks];
        case "migratedTasks":
            return [sections.taskManagement, sections.migratedTasks];
        case "taskLog":
            return [sections.taskManagement, sections.taskLog];
        case "quickRecords":
            return [sections.quickRecords];
        case "dailyReview":
            return [sections.dailyReview];
        case "projectProgress":
            return [sections.projectProgress];
        default:
            return [];
    }
}

export function getEnhancedDiaryPeriods(): readonly EnhancedDiaryPeriod[] {
    return ENHANCED_DIARY_PERIODS;
}
