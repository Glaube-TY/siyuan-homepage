import type { EnhancedDiaryPeriod } from "./enhancedDiaryTypes";

export type EnhancedDiaryHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface EnhancedDiaryHeadingNode {
    level: EnhancedDiaryHeadingLevel;
    title: string;
    raw: string;
    lineIndex: number;
    startLine: number;
    endLine: number;
    children: EnhancedDiaryHeadingNode[];
}

export interface EnhancedDiarySectionLookupResult {
    found: boolean;
    node?: EnhancedDiaryHeadingNode;
    missingTitle?: string;
}

export interface EnhancedDiaryWorkspaceValidationResult {
    valid: boolean;
    missing: string[];
}

export const ENHANCED_DIARY_ROOT_HEADINGS: Record<EnhancedDiaryPeriod, string> = {
    day: "今日日记",
    week: "本周复盘",
    month: "本月总结",
    year: "年度总结",
};

export const ENHANCED_DIARY_DAY_REQUIRED_PATHS: Array<{ path: string[]; label: string }> = [
    { path: ["任务管理"], label: "## 任务管理" },
    { path: ["任务管理", "新建任务"], label: "### 新建任务" },
    { path: ["任务管理", "迁移任务"], label: "### 迁移任务" },
    { path: ["任务管理", "任务动态"], label: "### 任务动态" },
    { path: ["快速记录"], label: "## 快速记录" },
    { path: ["今日复盘"], label: "## 今日复盘" },
];

export function getLines(markdown: string): string[] {
    return markdown.replace(/\r\n/g, "\n").split("\n");
}

export function normalizeHeadingTitle(title: string): string {
    let result = title.trim();
    result = result.replace(/\s+/g, " ");
    result = result.replace(/\s*#+\s*$/, "");
    return result.trim();
}

export function isHeadingLine(line: string): boolean {
    return /^#{1,6}\s+/.test(line);
}

function parseHeading(line: string): { level: EnhancedDiaryHeadingLevel; title: string } | null {
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (!match) return null;
    const level = match[1].length as EnhancedDiaryHeadingLevel;
    const title = match[2].trim();
    return { level, title };
}

export function parseMarkdownHeadingTree(markdown: string): EnhancedDiaryHeadingNode[] {
    const lines = getLines(markdown);
    const headings: Array<{ lineIndex: number; level: EnhancedDiaryHeadingLevel; title: string; raw: string }> = [];

    let inCodeBlock = false;
    let codeFenceChar = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (!inCodeBlock) {
            if (/^(```|~~~)/.test(trimmedLine)) {
                inCodeBlock = true;
                codeFenceChar = trimmedLine[0];
                continue;
            }
        } else {
            if (trimmedLine.startsWith(codeFenceChar.repeat(3))) {
                inCodeBlock = false;
                codeFenceChar = "";
            }
            continue;
        }

        const parsed = parseHeading(line);
        if (parsed) {
            headings.push({ lineIndex: i, level: parsed.level, title: parsed.title, raw: line });
        }
    }

    // 为每个标题计算 endLine：下一个同级或更高级标题前一行，不被子标题截断
    function findEndLine(index: number, level: EnhancedDiaryHeadingLevel): number {
        for (let j = index + 1; j < headings.length; j++) {
            if (headings[j].level <= level) {
                return headings[j].lineIndex - 1;
            }
        }
        return lines.length - 1;
    }

    const roots: EnhancedDiaryHeadingNode[] = [];
    const stack: EnhancedDiaryHeadingNode[] = [];

    for (let i = 0; i < headings.length; i++) {
        const h = headings[i];

        const node: EnhancedDiaryHeadingNode = {
            level: h.level,
            title: h.title,
            raw: h.raw,
            lineIndex: h.lineIndex,
            startLine: h.lineIndex,
            endLine: findEndLine(i, h.level),
            children: [],
        };

        while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
            stack.pop();
        }

        if (stack.length === 0) {
            roots.push(node);
        } else {
            stack[stack.length - 1].children.push(node);
        }

        stack.push(node);
    }

    return roots;
}

export function flattenHeadingTree(nodes: EnhancedDiaryHeadingNode[]): EnhancedDiaryHeadingNode[] {
    const result: EnhancedDiaryHeadingNode[] = [];
    for (const node of nodes) {
        result.push(node);
        if (node.children.length > 0) {
            result.push(...flattenHeadingTree(node.children));
        }
    }
    return result;
}

export function headingTitleStartsWith(node: EnhancedDiaryHeadingNode, expectedTitle: string): boolean {
    const normalized = normalizeHeadingTitle(node.title);
    return normalized === expectedTitle || normalized.startsWith(expectedTitle + " ");
}

export function findRootHeading(markdown: string, period: EnhancedDiaryPeriod): EnhancedDiarySectionLookupResult {
    const roots = parseMarkdownHeadingTree(markdown);
    const expectedTitle = ENHANCED_DIARY_ROOT_HEADINGS[period];

    for (const node of roots) {
        if (node.level === 1 && headingTitleStartsWith(node, expectedTitle)) {
            return { found: true, node };
        }
    }

    return { found: false, missingTitle: `# ${expectedTitle}` };
}

export function findDirectChildHeading(
    parent: EnhancedDiaryHeadingNode,
    expectedTitle: string,
    level?: EnhancedDiaryHeadingLevel
): EnhancedDiarySectionLookupResult {
    for (const child of parent.children) {
        if (level !== undefined && child.level !== level) continue;
        if (headingTitleStartsWith(child, expectedTitle)) {
            return { found: true, node: child };
        }
    }

    return { found: false, missingTitle: expectedTitle };
}

export function validateDayWorkspaceStructure(markdown: string): EnhancedDiaryWorkspaceValidationResult {
    const missing: string[] = [];
    const roots = parseMarkdownHeadingTree(markdown);

    let rootNode: EnhancedDiaryHeadingNode | null = null;

    for (const node of roots) {
        if (node.level === 1 && headingTitleStartsWith(node, ENHANCED_DIARY_ROOT_HEADINGS.day)) {
            rootNode = node;
            break;
        }
    }

    if (!rootNode) {
        missing.push(`# ${ENHANCED_DIARY_ROOT_HEADINGS.day}`);
        return { valid: false, missing };
    }

    for (const { path, label } of ENHANCED_DIARY_DAY_REQUIRED_PATHS) {
        let currentNode = rootNode;
        let found = true;

        for (let i = 0; i < path.length; i++) {
            const expectedLevel = (i + 2) as EnhancedDiaryHeadingLevel;
            const childResult = findDirectChildHeading(currentNode, path[i], expectedLevel);
            if (!childResult.found || !childResult.node) {
                found = false;
                break;
            }
            currentNode = childResult.node;
        }

        if (!found) {
            missing.push(label);
        }
    }

    return { valid: missing.length === 0, missing };
}

export function getSectionMarkdown(markdown: string, node: EnhancedDiaryHeadingNode): string {
    if (!node || node.startLine === undefined || node.endLine === undefined) {
        return "";
    }

    const lines = getLines(markdown);
    const contentLines = lines.slice(node.startLine + 1, node.endLine + 1);
    return contentLines.join("\n");
}
