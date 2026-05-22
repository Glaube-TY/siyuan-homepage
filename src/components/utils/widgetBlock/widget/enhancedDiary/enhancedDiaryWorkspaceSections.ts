import type { EnhancedDiaryHeadingNode, EnhancedDiarySectionLookupResult } from "./enhancedDiaryMarkdownSections";
import {
    findRootHeading,
    findDirectChildHeading,
    getSectionMarkdown,
} from "./enhancedDiaryMarkdownSections";
import { normalizeHeadingTitle } from "./enhancedDiaryMarkdownSections";

export const ENHANCED_DIARY_DAY_WORKSPACE_SECTION_TITLES = {
    overview: "今日概览",
    newTasks: "新建任务",
    migratedTasks: "迁移任务",
    quickRecords: "快速记录",
    projectProgress: "项目推进",
    taskLog: "任务动态",
    dailyReview: "今日复盘",
} as const;

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

export function getDayRootSection(markdown: string): EnhancedDiaryWorkspaceSectionResult {
    const lookupResult = findRootHeading(markdown, "day");
    return toWorkspaceSectionResult(markdown, lookupResult, ["今日日记"]);
}

export function getDayWorkspaceSection(
    markdown: string,
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey
): EnhancedDiaryWorkspaceSectionResult {
    const sectionTitle = ENHANCED_DIARY_DAY_WORKSPACE_SECTION_TITLES[sectionKey];
    const dayRootLookup = findRootHeading(markdown, "day");

    if (!dayRootLookup.found || !dayRootLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: dayRootLookup.missingTitle,
            path: ["今日日记", sectionTitle],
        };
    }

    const childLookup = findDirectChildHeading(dayRootLookup.node, sectionTitle, 2);
    return toWorkspaceSectionResult(markdown, childLookup, ["今日日记", sectionTitle]);
}

export function getDayWorkspaceSections(markdown: string): EnhancedDiaryDayWorkspaceMap {
    const dayRoot = getDayRootSection(markdown);

    const result: EnhancedDiaryDayWorkspaceMap = {
        dayRoot,
        overview: getDayWorkspaceSection(markdown, "overview"),
        newTasks: getDayWorkspaceSection(markdown, "newTasks"),
        migratedTasks: getDayWorkspaceSection(markdown, "migratedTasks"),
        quickRecords: getDayWorkspaceSection(markdown, "quickRecords"),
        projectProgress: getDayWorkspaceSection(markdown, "projectProgress"),
        taskLog: getDayWorkspaceSection(markdown, "taskLog"),
        dailyReview: getDayWorkspaceSection(markdown, "dailyReview"),
    };

    return result;
}

export function getQuickRecordsRoot(markdown: string): EnhancedDiaryWorkspaceSectionResult {
    return getDayWorkspaceSection(markdown, "quickRecords");
}

export function getRecordCategorySection(
    markdown: string,
    categoryKey: EnhancedDiaryRecordCategoryKey
): EnhancedDiaryRecordCategoryResult {
    const categoryTitle = ENHANCED_DIARY_RECORD_CATEGORY_TITLES[categoryKey];
    const quickRecordsLookup = findRootHeading(markdown, "day");

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
    const quickRecordsChild = findDirectChildHeading(quickRecordsNode, "快速记录", 2);

    if (!quickRecordsChild.found || !quickRecordsChild.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: quickRecordsChild.missingTitle,
            path: ["今日日记", "快速记录", categoryTitle],
            categoryKey,
        };
    }

    const categoryLookup = findDirectChildHeading(quickRecordsChild.node, categoryTitle, 3);
    const result = toWorkspaceSectionResult(markdown, categoryLookup, ["今日日记", "快速记录", categoryTitle]);

    return {
        ...result,
        categoryKey,
    };
}

export function getRecordCategorySections(
    markdown: string
): Record<EnhancedDiaryRecordCategoryKey, EnhancedDiaryRecordCategoryResult> {
    return {
        uncategorized: getRecordCategorySection(markdown, "uncategorized"),
        idea: getRecordCategorySection(markdown, "idea"),
        problem: getRecordCategorySection(markdown, "problem"),
        decision: getRecordCategorySection(markdown, "decision"),
        log: getRecordCategorySection(markdown, "log"),
    };
}

export function getProjectSection(
    markdown: string,
    projectName: string
): EnhancedDiaryWorkspaceSectionResult {
    const projectProgressLookup = findRootHeading(markdown, "day");

    if (!projectProgressLookup.found || !projectProgressLookup.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: projectProgressLookup.missingTitle,
            path: ["今日日记", "项目推进", projectName],
        };
    }

    const dayRoot = projectProgressLookup.node;
    const projectProgressChild = findDirectChildHeading(dayRoot, "项目推进", 2);

    if (!projectProgressChild.found || !projectProgressChild.node) {
        return {
            found: false,
            markdown: "",
            missingTitle: projectProgressChild.missingTitle,
            path: ["今日日记", "项目推进", projectName],
        };
    }

    const projectNode = projectProgressChild.node.children.find(
        (child) => child.level === 3 && normalizeHeadingTitle(child.title) === projectName
    );

    if (projectNode) {
        return {
            found: true,
            node: projectNode,
            markdown: getSectionMarkdown(markdown, projectNode),
            path: ["今日日记", "项目推进", projectName],
        };
    }

    return {
        found: false,
        markdown: "",
        missingTitle: `### ${projectName}`,
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
