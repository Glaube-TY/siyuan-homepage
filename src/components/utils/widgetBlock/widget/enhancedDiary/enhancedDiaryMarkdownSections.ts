import type {
    EnhancedDiaryHeadingStructureConfig,
    EnhancedDiaryPeriod,
} from "./enhancedDiaryTypes";

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

export interface EnhancedDiaryHeadingPlan {
    rootHeadingLevel: EnhancedDiaryHeadingLevel;
    baseLevel: EnhancedDiaryHeadingLevel;
    subLevel: EnhancedDiaryHeadingLevel;
    recordLevel: EnhancedDiaryHeadingLevel;
    rootHeadingTitle: string;
}

export function getEnhancedDiaryHeadingPlan(
    headingStructure: EnhancedDiaryHeadingStructureConfig,
    period: EnhancedDiaryPeriod
): EnhancedDiaryHeadingPlan {
    const rootHeadingTitle = ENHANCED_DIARY_ROOT_HEADINGS[period];
    let baseLevel = headingStructure.dayWorkspaceBaseHeadingLevel as EnhancedDiaryHeadingLevel;

    // Clamp: recordLevel = baseLevel + 2 must not exceed 6
    if (baseLevel > 4) {
        baseLevel = 4;
    }

    const subLevel = (baseLevel + 1) as EnhancedDiaryHeadingLevel;
    const recordLevel = (baseLevel + 2) as EnhancedDiaryHeadingLevel;

    return {
        rootHeadingLevel: 1,
        baseLevel,
        subLevel,
        recordLevel,
        rootHeadingTitle,
    };
}

export function getEnhancedDiaryRequiredPaths(
    plan: EnhancedDiaryHeadingPlan
): Array<{ path: string[]; label: string }> {
    const baseHash = "#".repeat(plan.baseLevel);
    const subHash = "#".repeat(plan.subLevel);
    return [
        { path: ["任务管理"], label: `${baseHash} 任务管理` },
        { path: ["任务管理", "新建任务"], label: `${subHash} 新建任务` },
        { path: ["任务管理", "迁移任务"], label: `${subHash} 迁移任务` },
        { path: ["任务管理", "任务动态"], label: `${subHash} 任务动态` },
        { path: ["快速记录"], label: `${baseHash} 快速记录` },
        { path: ["今日复盘"], label: `${baseHash} 今日复盘` },
    ];
}

export const ENHANCED_DIARY_ROOT_HEADINGS: Record<EnhancedDiaryPeriod, string> = {
    day: "今日日记",
    week: "周复盘",
    month: "月复盘",
    year: "年复盘",
};

export const ENHANCED_DIARY_ROOT_HEADING_ALIASES: Record<EnhancedDiaryPeriod, string[]> = {
    day: ["今日日记"],
    week: ["周复盘", "本周复盘"],
    month: ["月复盘", "月度复盘", "本月总结"],
    year: ["年复盘", "年度复盘", "年度总结"],
};

export function matchesRootHeading(normalizedTitle: string, period: EnhancedDiaryPeriod): boolean {
    const aliases = ENHANCED_DIARY_ROOT_HEADING_ALIASES[period];
    return aliases.some(
        (alias) => normalizedTitle === alias || normalizedTitle.startsWith(alias + " ")
    );
}

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

export function findRootHeading(
    markdown: string,
    period: EnhancedDiaryPeriod,
    plan?: EnhancedDiaryHeadingPlan
): EnhancedDiarySectionLookupResult {
    const roots = parseMarkdownHeadingTree(markdown);
    const targetLevel = plan ? plan.rootHeadingLevel : 1;

    for (const node of roots) {
        if (node.level === targetLevel && matchesRootHeading(normalizeHeadingTitle(node.title), period)) {
            return { found: true, node };
        }
    }

    const expectedTitle = plan ? plan.rootHeadingTitle : ENHANCED_DIARY_ROOT_HEADINGS[period];
    return { found: false, missingTitle: `${"#".repeat(targetLevel)} ${expectedTitle}` };
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

export function validateDayWorkspaceStructure(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig
): EnhancedDiaryWorkspaceValidationResult {
    const missing: string[] = [];

    const roots = parseMarkdownHeadingTree(markdown);
    let rootNode: EnhancedDiaryHeadingNode | null = null;

    for (const node of roots) {
        if (node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), "day")) {
            rootNode = node;
            break;
        }
    }

    if (!rootNode) {
        missing.push(`# ${ENHANCED_DIARY_ROOT_HEADINGS.day}`);
        return { valid: false, missing };
    }

    // Build recommended labels from plan (for display only, not for matching)
    const plan = headingStructure
        ? getEnhancedDiaryHeadingPlan(headingStructure, "day")
        : null;
    const baseHash = plan ? "#".repeat(plan.baseLevel) : "##";
    const subHash = plan ? "#".repeat(plan.subLevel) : "###";

    const requiredItems: { path: string[]; recommendedLabel: string }[] = [
        { path: ["任务管理"], recommendedLabel: `${baseHash} 任务管理` },
        { path: ["任务管理", "新建任务"], recommendedLabel: `${subHash} 新建任务` },
        { path: ["任务管理", "迁移任务"], recommendedLabel: `${subHash} 迁移任务` },
        { path: ["任务管理", "任务动态"], recommendedLabel: `${subHash} 任务动态` },
        { path: ["快速记录"], recommendedLabel: `${baseHash} 快速记录` },
        { path: ["今日复盘"], recommendedLabel: `${baseHash} 今日复盘` },
    ];

    for (const { path, recommendedLabel } of requiredItems) {
        const result = findSectionByTitlePath(rootNode, path);
        if (!result.found) {
            missing.push(recommendedLabel);
        }
    }

    return { valid: missing.length === 0, missing };
}

/**
 * Find a direct child of `parent` by title text (ignoring level).
 * Returns the first match among parent.children.
 */
export function findChildByTitle(
    parent: EnhancedDiaryHeadingNode,
    title: string
): EnhancedDiarySectionLookupResult {
    for (const child of parent.children) {
        if (headingTitleStartsWith(child, title)) {
            return { found: true, node: child };
        }
    }
    return { found: false, missingTitle: title };
}

/**
 * Find a heading by title text within the scope of `parent`.
 * Searches parent.children first (direct child, prioritizing parent.level + 1),
 * then falls back to deeper descendants within parent's scope.
 */
export function findDescendantByTitleInScope(
    parent: EnhancedDiaryHeadingNode,
    title: string
): EnhancedDiarySectionLookupResult {
    const preferredLevel = (parent.level + 1) as EnhancedDiaryHeadingLevel;

    // Pass 1: match direct children at parent.level + 1 (highest priority)
    for (const child of parent.children) {
        if (child.level === preferredLevel && headingTitleStartsWith(child, title)) {
            return { found: true, node: child };
        }
    }

    // Pass 2: match any direct child with title match at deeper levels
    // (handles skipped-level headings, e.g. H3 under H1 when no H2 exists)
    for (const child of parent.children) {
        if (child.level > preferredLevel && headingTitleStartsWith(child, title)) {
            return { found: true, node: child };
        }
    }

    // Pass 3: recurse into children's subtrees for nested descendants
    for (const child of parent.children) {
        const result = findDescendantByTitleInScope(child, title);
        if (result.found) {
            return result;
        }
    }

    return { found: false, missingTitle: title };
}

/**
 * Walk a title path (e.g. ["任务管理", "新建任务"]) starting from `root`,
 * using findDescendantByTitleInScope at each step.
 */
export function findSectionByTitlePath(
    root: EnhancedDiaryHeadingNode,
    path: string[]
): EnhancedDiarySectionLookupResult {
    let currentNode = root;
    for (const title of path) {
        const result = findDescendantByTitleInScope(currentNode, title);
        if (!result.found || !result.node) {
            return { found: false, missingTitle: title };
        }
        currentNode = result.node;
    }
    return { found: true, node: currentNode };
}

export function getSectionMarkdown(markdown: string, node: EnhancedDiaryHeadingNode): string {
    if (!node || node.startLine === undefined || node.endLine === undefined) {
        return "";
    }

    const lines = getLines(markdown);
    const contentLines = lines.slice(node.startLine + 1, node.endLine + 1);
    return contentLines.join("\n");
}
