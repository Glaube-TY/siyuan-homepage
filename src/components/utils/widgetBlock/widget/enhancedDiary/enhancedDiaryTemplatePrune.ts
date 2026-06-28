import {
    parseMarkdownHeadingTree,
    getLines,
    matchesRootHeading,
    normalizeHeadingTitle,
    type EnhancedDiaryHeadingNode,
} from "./enhancedDiaryMarkdownSections";
import { getFieldAliases, headingTitleMatchesAliases } from "./enhancedDiaryTemplateFieldMapping";
import type { EnhancedDiaryTemplateFieldMapping } from "./enhancedDiaryTypes";

const DAY_TASK_SECTION_KEYS: Array<"taskManagement" | "projectProgress"> = ["taskManagement", "projectProgress"];

function isTaskSectionNode(
    node: EnhancedDiaryHeadingNode,
    mapping?: EnhancedDiaryTemplateFieldMapping | null,
): boolean {
    for (const key of DAY_TASK_SECTION_KEYS) {
        const aliases = getFieldAliases(mapping, "dayWorkspaceSections", key);
        if (headingTitleMatchesAliases(normalizeHeadingTitle(node.title), aliases)) {
            return true;
        }
    }
    return false;
}

function collectTaskSectionNodes(
    roots: EnhancedDiaryHeadingNode[],
    mapping?: EnhancedDiaryTemplateFieldMapping | null,
): EnhancedDiaryHeadingNode[] {
    const result: EnhancedDiaryHeadingNode[] = [];

    // 找到 day 根标题
    let dayRoot: EnhancedDiaryHeadingNode | null = null;
    for (const node of roots) {
        if (node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), "day", mapping)) {
            dayRoot = node;
            break;
        }
    }

    if (dayRoot) {
        // 优先在 day 根标题下剔除任务区块
        for (const child of dayRoot.children) {
            if (isTaskSectionNode(child, mapping)) {
                result.push(child);
            }
        }
    } else {
        // 兜底：如果找不到 day 根标题，在顶层 heading tree 中剔除匹配的任务区块
        for (const node of roots) {
            if (isTaskSectionNode(node, mapping)) {
                result.push(node);
            }
        }
    }

    return result;
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
    if (intervals.length === 0) return [];
    const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        const current = sorted[i];
        if (current[0] <= last[1] + 1) {
            last[1] = Math.max(last[1], current[1]);
        } else {
            merged.push(current);
        }
    }
    return merged;
}

/**
 * 从 day 周期推荐模板/渲染结果中剔除任务体系区块。
 * 基于 Markdown 标题树和别名匹配，不依赖脆弱字符串替换。
 * 保留用户模板中的非任务内容（今日日记根标题、快速记录、今日复盘、自定义区块等）。
 */
export function pruneTaskSectionsFromDayTemplate(
    markdown: string,
    mapping?: EnhancedDiaryTemplateFieldMapping | null,
): string {
    const roots = parseMarkdownHeadingTree(markdown);
    const taskNodes = collectTaskSectionNodes(roots, mapping);
    if (taskNodes.length === 0) return markdown;

    const lines = getLines(markdown);
    const intervals = taskNodes.map((node): [number, number] => [node.startLine, node.endLine]);
    const merged = mergeIntervals(intervals);

    const keptLines: string[] = [];
    let currentInterval = 0;
    for (let i = 0; i < lines.length; i++) {
        if (currentInterval < merged.length && i >= merged[currentInterval][0] && i <= merged[currentInterval][1]) {
            continue;
        }
        if (currentInterval < merged.length && i > merged[currentInterval][1]) {
            currentInterval++;
        }
        keptLines.push(lines[i]);
    }

    return keptLines.join("\n");
}
