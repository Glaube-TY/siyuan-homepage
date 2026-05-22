import { parseTaskLine } from "../tasksPlus/tasksPlusParser";
import { validateDayWorkspaceStructure } from "./enhancedDiaryMarkdownSections";
import {
    getDayWorkspaceSections,
    getRecordCategorySections,
} from "./enhancedDiaryWorkspaceSections";

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

function countRecordEntries(markdown: string): number {
    const lines = markdown.split("\n");
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
        if (!/^####\s+/.test(lines[i].trim())) continue;

        const contentLines: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
            if (/^#{1,4}\s+/.test(lines[j].trim())) break;
            contentLines.push(lines[j]);
        }

        const content = contentLines.join("\n").trim();
        if (content && !/^这里写.+内容。?$/.test(content)) {
            count += 1;
        }
    }

    return count;
}

function countProjectSections(markdown: string): number {
    return markdown
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^###\s+/.test(line) && line !== "### 示例项目")
        .length;
}

export function buildEnhancedDiaryWorkspaceSummary(
    markdown: string
): EnhancedDiaryWorkspaceSummary {
    const validation = validateDayWorkspaceStructure(markdown);
    const sections = getDayWorkspaceSections(markdown);
    const categories = getRecordCategorySections(markdown);

    const quickRecordCount = Object.values(categories).reduce(
        (sum, category) => sum + (category.found ? countRecordEntries(category.markdown) : 0),
        0
    );

    return {
        templateValid: validation.valid,
        missing: validation.missing,
        newTaskCount: sections.newTasks.found ? countTaskLines(sections.newTasks.markdown) : 0,
        migratedTaskCount: sections.migratedTasks.found
            ? countTaskLines(sections.migratedTasks.markdown)
            : 0,
        quickRecordCount,
        projectCount: sections.projectProgress.found
            ? countProjectSections(sections.projectProgress.markdown)
            : 0,
    };
}
