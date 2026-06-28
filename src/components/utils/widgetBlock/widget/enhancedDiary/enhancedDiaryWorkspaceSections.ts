import type { EnhancedDiaryHeadingNode, EnhancedDiarySectionLookupResult } from "./enhancedDiaryMarkdownSections";
import {
    findRootHeading,
    findDescendantByTitleInScope,
    getSectionMarkdown,
    getEnhancedDiaryHeadingPlan,
} from "./enhancedDiaryMarkdownSections";
import { normalizeHeadingTitle } from "./enhancedDiaryMarkdownSections";
import type { EnhancedDiaryHeadingStructureConfig, EnhancedDiaryTemplateFieldMapping } from "./enhancedDiaryTypes";
import {
    getDayWorkspaceSectionPathAliases,
    getFieldAliases,
    getPrimaryFieldTitle,
} from "./enhancedDiaryTemplateFieldMapping";

export const ENHANCED_DIARY_DAY_WORKSPACE_SECTION_KEYS = [
    "overview",
    "newTasks",
    "migratedTasks",
    "quickRecords",
    "projectProgress",
    "taskLog",
    "dailyReview",
] as const;

export type EnhancedDiaryDayWorkspaceSectionKey = typeof ENHANCED_DIARY_DAY_WORKSPACE_SECTION_KEYS[number];

export const ENHANCED_DIARY_RECORD_CATEGORY_TITLES = {
    uncategorized: "未分类",
    idea: "想法",
    problem: "问题",
    decision: "决策",
    log: "日志",
} as const;

export type EnhancedDiaryRecordCategoryKey = keyof typeof ENHANCED_DIARY_RECORD_CATEGORY_TITLES;

export interface EnhancedDiaryWorkspaceSectionResult {
    found: boolean;
    node?: EnhancedDiaryHeadingNode;
    markdown: string;
    missingTitle?: string;
    path: string[];
}

export interface EnhancedDiaryDayWorkspaceMap {
    dayRoot: EnhancedDiaryWorkspaceSectionResult;
    overview: EnhancedDiaryWorkspaceSectionResult;
    newTasks: EnhancedDiaryWorkspaceSectionResult;
    migratedTasks: EnhancedDiaryWorkspaceSectionResult;
    quickRecords: EnhancedDiaryWorkspaceSectionResult;
    projectProgress: EnhancedDiaryWorkspaceSectionResult;
    taskLog: EnhancedDiaryWorkspaceSectionResult;
    dailyReview: EnhancedDiaryWorkspaceSectionResult;
}

export interface EnhancedDiaryRecordCategoryResult extends EnhancedDiaryWorkspaceSectionResult {
    categoryKey?: EnhancedDiaryRecordCategoryKey;
}

function toWorkspaceSectionResult(
    markdown: string,
    lookupResult: EnhancedDiarySectionLookupResult,
    path: string[]
): EnhancedDiaryWorkspaceSectionResult {
    if (lookupResult.found && lookupResult.node) {
        return {
            found: true,
            node: lookupResult.node,
            markdown: getSectionMarkdown(markdown, lookupResult.node),
            path,
        };
    }

    return {
        found: false,
        markdown: "",
        missingTitle: lookupResult.missingTitle,
        path,
    };
}

function findDescendantByTitleInScopeWithAliases(
    parent: EnhancedDiaryHeadingNode,
    aliases: string[]
): EnhancedDiarySectionLookupResult {
    const children = parent.children;

    // Pass 1: direct children at parent.level + 1
    const preferredLevel = (parent.level + 1) as typeof parent.level;
    for (const child of children) {
        if (child.level === preferredLevel) {
            const normalized = normalizeHeadingTitle(child.title);
            if (headingTitleMatchesAliases(normalized, aliases)) {
                return { found: true, node: child };
            }
        }
    }

    // Pass 2: any direct child at deeper level
    for (const child of children) {
        if (child.level > preferredLevel) {
            const normalized = normalizeHeadingTitle(child.title);
            if (headingTitleMatchesAliases(normalized, aliases)) {
                return { found: true, node: child };
            }
        }
    }

    // Pass 3: recurse into subtrees
    for (const child of children) {
        const result = findDescendantByTitleInScopeWithAliases(child, aliases);
        if (result.found) return result;
    }

    return { found: false, missingTitle: aliases[0] };
}

function headingTitleMatchesAliases(title: string, aliases: string[]): boolean {
    return aliases.some(
        (alias) => title === alias || title.startsWith(alias + " ")
    );
}

export function getDayRootSection(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryWorkspaceSectionResult {
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day", mapping) : undefined;
    const lookupResult = findRootHeading(markdown, "day", plan, mapping);
    return toWorkspaceSectionResult(markdown, lookupResult, [getPrimaryFieldTitle(mapping, "rootHeadings", "day")]);
}

export function getDayWorkspaceSection(
    markdown: string,
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryWorkspaceSectionResult {
    const pathAliases = getDayWorkspaceSectionPathAliases(mapping, sectionKey);
    const primaryPath = pathAliases.map((aliases) => aliases[0]);
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day", mapping) : undefined;
    const dayRootLookup = findRootHeading(markdown, "day", plan, mapping);
    const rootTitle = getPrimaryFieldTitle(mapping, "rootHeadings", "day");
    const fullPath = [rootTitle, ...primaryPath];

    if (!dayRootLookup.found || !dayRootLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: dayRootLookup.missingTitle,
            path: fullPath,
        };
    }

    let currentNode = dayRootLookup.node;
    for (let i = 0; i < pathAliases.length; i++) {
        const aliases = pathAliases[i];
        const childLookup = findDescendantByTitleInScopeWithAliases(currentNode, aliases);
        if (!childLookup.found || !childLookup.node) {
            return {
                found: false,
                markdown: "",
                missingTitle: childLookup.missingTitle,
                path: fullPath,
            };
        }
        currentNode = childLookup.node;
    }

    return {
        found: true,
        node: currentNode,
        markdown: getSectionMarkdown(markdown, currentNode),
        path: fullPath,
    };
}

export function getDayWorkspaceSections(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryDayWorkspaceMap {
    const dayRoot = getDayRootSection(markdown, headingStructure, mapping);

    const result: EnhancedDiaryDayWorkspaceMap = {
        dayRoot,
        overview: getDayWorkspaceSection(markdown, "overview", headingStructure, mapping),
        newTasks: getDayWorkspaceSection(markdown, "newTasks", headingStructure, mapping),
        migratedTasks: getDayWorkspaceSection(markdown, "migratedTasks", headingStructure, mapping),
        quickRecords: getDayWorkspaceSection(markdown, "quickRecords", headingStructure, mapping),
        projectProgress: getDayWorkspaceSection(markdown, "projectProgress", headingStructure, mapping),
        taskLog: getDayWorkspaceSection(markdown, "taskLog", headingStructure, mapping),
        dailyReview: getDayWorkspaceSection(markdown, "dailyReview", headingStructure, mapping),
    };

    return result;
}

export function getQuickRecordsRoot(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryWorkspaceSectionResult {
    return getDayWorkspaceSection(markdown, "quickRecords", headingStructure, mapping);
}

export function getRecordCategorySection(
    markdown: string,
    categoryKey: EnhancedDiaryRecordCategoryKey,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryRecordCategoryResult {
    const categoryTitle = ENHANCED_DIARY_RECORD_CATEGORY_TITLES[categoryKey];
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day", mapping) : undefined;
    const quickRecordsLookup = findRootHeading(markdown, "day", plan, mapping);
    const rootTitle = getPrimaryFieldTitle(mapping, "rootHeadings", "day");
    const quickRecordsTitle = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "quickRecords");

    if (!quickRecordsLookup.found || !quickRecordsLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: quickRecordsLookup.missingTitle,
            path: [rootTitle, quickRecordsTitle, categoryTitle],
            categoryKey,
        };
    }

    const quickRecordsNode = quickRecordsLookup.node;
    const quickRecordsChild = findDescendantByTitleInScopeWithAliases(quickRecordsNode, getFieldAliases(mapping, "dayWorkspaceSections", "quickRecords"));

    if (!quickRecordsChild.found || !quickRecordsChild.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: quickRecordsChild.missingTitle,
            path: [rootTitle, quickRecordsTitle, categoryTitle],
            categoryKey,
        };
    }

    const categoryLookup = findDescendantByTitleInScope(quickRecordsChild.node, categoryTitle);
    const result = toWorkspaceSectionResult(markdown, categoryLookup, [rootTitle, quickRecordsTitle, categoryTitle]);

    return {
        ...result,
        categoryKey,
    };
}

export function getRecordCategorySections(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Record<EnhancedDiaryRecordCategoryKey, EnhancedDiaryRecordCategoryResult> {
    return {
        uncategorized: getRecordCategorySection(markdown, "uncategorized", headingStructure, mapping),
        idea: getRecordCategorySection(markdown, "idea", headingStructure, mapping),
        problem: getRecordCategorySection(markdown, "problem", headingStructure, mapping),
        decision: getRecordCategorySection(markdown, "decision", headingStructure, mapping),
        log: getRecordCategorySection(markdown, "log", headingStructure, mapping),
    };
}

export function getProjectSection(
    markdown: string,
    projectName: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryWorkspaceSectionResult {
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day", mapping) : undefined;
    const projectProgressLookup = findRootHeading(markdown, "day", plan, mapping);
    const rootTitle = getPrimaryFieldTitle(mapping, "rootHeadings", "day");
    const projectProgressTitle = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "projectProgress");

    if (!projectProgressLookup.found || !projectProgressLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: projectProgressLookup.missingTitle,
            path: [rootTitle, projectProgressTitle, projectName],
        };
    }

    const dayRoot = projectProgressLookup.node;
    const projectProgressChild = findDescendantByTitleInScopeWithAliases(dayRoot, getFieldAliases(mapping, "dayWorkspaceSections", "projectProgress"));

    if (!projectProgressChild.found || !projectProgressChild.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: projectProgressChild.missingTitle,
            path: [rootTitle, projectProgressTitle, projectName],
        };
    }

    // Find project by exact title match within projectProgress scope
    const projectLookup = findDescendantByTitleInScope(projectProgressChild.node, projectName);
    if (projectLookup.found && projectLookup.node) {
        return {
            found: true,
            node: projectLookup.node,
            markdown: getSectionMarkdown(markdown, projectLookup.node),
            path: [rootTitle, projectProgressTitle, projectName],
        };
    }

    return {
        found: false,
        markdown: "",
        missingTitle: projectName,
        path: [rootTitle, projectProgressTitle, projectName],
    };
}

export function assertSectionReady(
    result: EnhancedDiaryWorkspaceSectionResult
): { ok: boolean; message?: string } {
    if (result.found) {
        return { ok: true };
    }

    const pathStr = result.path.join(" > ");
    return {
        ok: false,
        message: `当前日记缺少「${pathStr}」区块，请补充模板或恢复标题。`,
    };
}

const CATEGORY_ENTRIES = Object.entries(
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES
) as Array<[EnhancedDiaryRecordCategoryKey, string]>;

export function normalizeRecordCategoryTitle(title: string): string {
    const trimmed = title.trim().replace(/\n/g, " ").replace(/\r/g, "");
    if (!trimmed) return "未分类";
    return trimmed.slice(0, 30);
}

export function resolveRecordCategoryTitle(
    title: string
): { key: string; title: string } {
    const normalized = normalizeHeadingTitle(title);
    const known = CATEGORY_ENTRIES.find(([, categoryTitle]) => categoryTitle === normalized);
    if (known) {
        return { key: known[0], title: known[1] };
    }
    return { key: `custom:${normalized}`, title: normalized };
}

export const ENHANCED_DIARY_RECORD_SUGGESTED_CATEGORIES = [
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES.uncategorized,
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES.idea,
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES.problem,
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES.decision,
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES.log,
];
