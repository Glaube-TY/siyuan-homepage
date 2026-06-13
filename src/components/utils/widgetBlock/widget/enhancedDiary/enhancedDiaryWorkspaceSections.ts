import type { EnhancedDiaryHeadingNode, EnhancedDiarySectionLookupResult } from "./enhancedDiaryMarkdownSections";
import {
    findRootHeading,
    findDescendantByTitleInScope,
    getSectionMarkdown,
    getEnhancedDiaryHeadingPlan,
} from "./enhancedDiaryMarkdownSections";
import { normalizeHeadingTitle } from "./enhancedDiaryMarkdownSections";
import type { EnhancedDiaryHeadingStructureConfig } from "./enhancedDiaryTypes";

export const ENHANCED_DIARY_DAY_WORKSPACE_SECTION_TITLES = {
    overview: "今日概览",
    newTasks: "新建任务",
    migratedTasks: "迁移任务",
    quickRecords: "快速记录",
    projectProgress: "项目推进",
    taskLog: "任务动态",
    dailyReview: "今日复盘",
} as const;

export const ENHANCED_DIARY_DAY_WORKSPACE_SECTION_PATHS: Record<EnhancedDiaryDayWorkspaceSectionKey, string[]> = {
    overview: ["今日概览"],
    newTasks: ["任务管理", "新建任务"],
    migratedTasks: ["任务管理", "迁移任务"],
    quickRecords: ["快速记录"],
    projectProgress: ["项目推进"],
    taskLog: ["任务管理", "任务动态"],
    dailyReview: ["今日复盘"],
};

export type EnhancedDiaryDayWorkspaceSectionKey = keyof typeof ENHANCED_DIARY_DAY_WORKSPACE_SECTION_TITLES;

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

export function getDayRootSection(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryWorkspaceSectionResult {
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day") : undefined;
    const lookupResult = findRootHeading(markdown, "day", plan);
    return toWorkspaceSectionResult(markdown, lookupResult, ["今日日记"]);
}

export function getDayWorkspaceSection(
    markdown: string,
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryWorkspaceSectionResult {
    const path = ENHANCED_DIARY_DAY_WORKSPACE_SECTION_PATHS[sectionKey];
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day") : undefined;
    const dayRootLookup = findRootHeading(markdown, "day", plan);
    const fullPath = ["今日日记", ...path];

    if (!dayRootLookup.found || !dayRootLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: dayRootLookup.missingTitle,
            path: fullPath,
        };
    }

    let currentNode = dayRootLookup.node;
    for (let i = 0; i < path.length; i++) {
        const childLookup = findDescendantByTitleInScope(currentNode, path[i]);
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
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryDayWorkspaceMap {
    const dayRoot = getDayRootSection(markdown, headingStructure);

    const result: EnhancedDiaryDayWorkspaceMap = {
        dayRoot,
        overview: getDayWorkspaceSection(markdown, "overview", headingStructure),
        newTasks: getDayWorkspaceSection(markdown, "newTasks", headingStructure),
        migratedTasks: getDayWorkspaceSection(markdown, "migratedTasks", headingStructure),
        quickRecords: getDayWorkspaceSection(markdown, "quickRecords", headingStructure),
        projectProgress: getDayWorkspaceSection(markdown, "projectProgress", headingStructure),
        taskLog: getDayWorkspaceSection(markdown, "taskLog", headingStructure),
        dailyReview: getDayWorkspaceSection(markdown, "dailyReview", headingStructure),
    };

    return result;
}

export function getQuickRecordsRoot(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryWorkspaceSectionResult {
    return getDayWorkspaceSection(markdown, "quickRecords", headingStructure);
}

export function getRecordCategorySection(
    markdown: string,
    categoryKey: EnhancedDiaryRecordCategoryKey,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryRecordCategoryResult {
    const categoryTitle = ENHANCED_DIARY_RECORD_CATEGORY_TITLES[categoryKey];
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day") : undefined;
    const quickRecordsLookup = findRootHeading(markdown, "day", plan);

    if (!quickRecordsLookup.found || !quickRecordsLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: quickRecordsLookup.missingTitle,
            path: ["今日日记", "快速记录", categoryTitle],
            categoryKey,
        };
    }

    const quickRecordsNode = quickRecordsLookup.node;
    const quickRecordsChild = findDescendantByTitleInScope(quickRecordsNode, "快速记录");

    if (!quickRecordsChild.found || !quickRecordsChild.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: quickRecordsChild.missingTitle,
            path: ["今日日记", "快速记录", categoryTitle],
            categoryKey,
        };
    }

    const categoryLookup = findDescendantByTitleInScope(quickRecordsChild.node, categoryTitle);
    const result = toWorkspaceSectionResult(markdown, categoryLookup, ["今日日记", "快速记录", categoryTitle]);

    return {
        ...result,
        categoryKey,
    };
}

export function getRecordCategorySections(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): Record<EnhancedDiaryRecordCategoryKey, EnhancedDiaryRecordCategoryResult> {
    return {
        uncategorized: getRecordCategorySection(markdown, "uncategorized", headingStructure),
        idea: getRecordCategorySection(markdown, "idea", headingStructure),
        problem: getRecordCategorySection(markdown, "problem", headingStructure),
        decision: getRecordCategorySection(markdown, "decision", headingStructure),
        log: getRecordCategorySection(markdown, "log", headingStructure),
    };
}

export function getProjectSection(
    markdown: string,
    projectName: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryWorkspaceSectionResult {
    const plan = headingStructure ? getEnhancedDiaryHeadingPlan(headingStructure, "day") : undefined;
    const projectProgressLookup = findRootHeading(markdown, "day", plan);

    if (!projectProgressLookup.found || !projectProgressLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: projectProgressLookup.missingTitle,
            path: ["今日日记", "项目推进", projectName],
        };
    }

    const dayRoot = projectProgressLookup.node;
    const projectProgressChild = findDescendantByTitleInScope(dayRoot, "项目推进");

    if (!projectProgressChild.found || !projectProgressChild.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: projectProgressChild.missingTitle,
            path: ["今日日记", "项目推进", projectName],
        };
    }

    // Find project by exact title match within projectProgress scope
    const projectLookup = findDescendantByTitleInScope(projectProgressChild.node, projectName);
    if (projectLookup.found && projectLookup.node) {
        return {
            found: true,
            node: projectLookup.node,
            markdown: getSectionMarkdown(markdown, projectLookup.node),
            path: ["今日日记", "项目推进", projectName],
        };
    }

    return {
        found: false,
        markdown: "",
        missingTitle: projectName,
        path: ["今日日记", "项目推进", projectName],
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
