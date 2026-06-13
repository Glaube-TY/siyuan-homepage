import { parseTaskLine } from "../tasksPlus/tasksPlusParser";
import { validateDayWorkspaceStructure, parseMarkdownHeadingTree, getSectionMarkdown, type EnhancedDiaryHeadingNode } from "./enhancedDiaryMarkdownSections";
import {
    getDayWorkspaceSections,
} from "./enhancedDiaryWorkspaceSections";
import type { EnhancedDiaryHeadingStructureConfig } from "./enhancedDiaryTypes";

export interface EnhancedDiaryWorkspaceSummary {
    templateValid: boolean;
    missing: string[];
    newTaskCount: number;
    migratedTaskCount: number;
    quickRecordCount: number;
    projectCount: number;
}

function countTaskLines(markdown: string): number {
    return markdown
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => {
            if (!/^[-*]\s\[( |x|X)\]/.test(line)) return false;
            const task = parseTaskLine(line);
            return !!task.taskname && task.taskname !== "示例任务";
        })
        .length;
}

/**
 * Collect record heading nodes under a category node.
 * Preferred: category.level + 1; fallback: any deeper level.
 */
function collectRecordNodes(category: EnhancedDiaryHeadingNode): EnhancedDiaryHeadingNode[] {
    const preferredLevel = category.level + 1;
    const result: EnhancedDiaryHeadingNode[] = [];

    // Pass 1: direct children at preferred level
    for (const child of category.children) {
        if (child.level === preferredLevel) {
            result.push(child);
        }
    }
    if (result.length > 0) return result;

    // Pass 2: fallback — any child at a deeper level
    for (const child of category.children) {
        if (child.level > preferredLevel) {
            result.push(child);
        }
    }

    return result;
}

function countRecordEntries(markdown: string): number {
    if (!markdown.trim()) return 0;

    const roots = parseMarkdownHeadingTree(markdown);
    // roots are category headings within the quick-records section
    // (the section markdown does not include the "## 快速记录" heading itself)
    let count = 0;

    for (const category of roots) {
        const records = collectRecordNodes(category);
        for (const record of records) {
            const content = getSectionMarkdown(markdown, record).trim();
            if (content && !/^这里写.+内容。?$/.test(content)) {
                count += 1;
            }
        }
    }

    return count;
}

function countProjectSections(markdown: string, parentLevel: number): number {
    if (!markdown.trim()) return 0;

    const roots = parseMarkdownHeadingTree(markdown);
    // roots are project headings within the project-progress section
    // (the section markdown does not include the "## 项目推进" heading itself)
    const preferredLevel = parentLevel + 1;

    // Pass 1: project headings at preferred level
    let projectNodes = roots.filter((n) => n.level === preferredLevel);

    // Pass 2: fallback — any deeper level
    if (projectNodes.length === 0) {
        projectNodes = roots.filter((n) => n.level > preferredLevel);
    }

    return projectNodes.filter((n) => n.title !== "示例项目").length;
}

export function buildEnhancedDiaryWorkspaceSummary(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryWorkspaceSummary {
    const validation = validateDayWorkspaceStructure(markdown, headingStructure);
    const sections = getDayWorkspaceSections(markdown, headingStructure);

    const projectProgressNode = sections.projectProgress.node;

    const quickRecordCount = sections.quickRecords.found
        ? countRecordEntries(sections.quickRecords.markdown)
        : 0;

    return {
        templateValid: validation.valid,
        missing: validation.missing,
        newTaskCount: sections.newTasks.found ? countTaskLines(sections.newTasks.markdown) : 0,
        migratedTaskCount: sections.migratedTasks.found
            ? countTaskLines(sections.migratedTasks.markdown)
            : 0,
        quickRecordCount,
        projectCount: sections.projectProgress.found
            ? countProjectSections(sections.projectProgress.markdown, projectProgressNode?.level ?? 2)
            : 0,
    };
}
