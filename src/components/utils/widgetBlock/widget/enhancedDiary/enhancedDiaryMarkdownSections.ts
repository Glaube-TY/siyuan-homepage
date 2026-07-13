import type {
    EnhancedDiaryHeadingStructureConfig,
    EnhancedDiaryPeriod,
    EnhancedDiaryTemplateFieldMapping,
} from "./enhancedDiaryTypes";
import {
    DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING,
} from "./enhancedDiaryTypes";
import {
    ENHANCED_DIARY_COMPLETED_SUFFIX,
    getFieldAliases,
    getPrimaryFieldTitle,
    headingTitleMatchesAliases,
    normalizeHeadingTitle,
    stripReviewStatusSuffix,
} from "./enhancedDiaryTemplateFieldMapping";

export {
    ENHANCED_DIARY_COMPLETED_SUFFIX,
    normalizeHeadingTitle,
    stripReviewStatusSuffix,
};

export type EnhancedDiaryHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface EnhancedDiaryHeadingBlockLike {
    subtype?: unknown;
    subType?: unknown;
    markdown?: unknown;
}

export function getEnhancedDiaryHeadingLevel(
    block: EnhancedDiaryHeadingBlockLike,
): EnhancedDiaryHeadingLevel | null {
    const subtype = String(block.subtype || block.subType || "");
    const subtypeMatch = /^h([1-6])$/i.exec(subtype);
    if (subtypeMatch) return Number(subtypeMatch[1]) as EnhancedDiaryHeadingLevel;
    const firstLine = String(block.markdown || "").replace(/\r\n/g, "\n").split("\n", 1)[0];
    const markdownMatch = /^(#{1,6})\s+/.exec(firstLine);
    return markdownMatch ? markdownMatch[1].length as EnhancedDiaryHeadingLevel : null;
}

export function getEnhancedDiaryHeadingTitle(block: EnhancedDiaryHeadingBlockLike): string {
    const firstLine = String(block.markdown || "").replace(/\r\n/g, "\n").split("\n", 1)[0];
    return normalizeHeadingTitle(firstLine.replace(/^#{1,6}\s+/, ""));
}

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
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryHeadingPlan {
    const rootHeadingTitle = getPrimaryFieldTitle(mapping, "rootHeadings", period);
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
    plan: EnhancedDiaryHeadingPlan,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Array<{ path: string[]; label: string }> {
    const baseHash = "#".repeat(plan.baseLevel);
    const subHash = "#".repeat(plan.subLevel);
    const taskManagement = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "taskManagement");
    const newTasks = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "newTasks");
    const migratedTasks = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "migratedTasks");
    const taskLog = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "taskLog");
    const quickRecords = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "quickRecords");
    const dailyReview = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "dailyReview");
    return [
        { path: [taskManagement], label: `${baseHash} ${taskManagement}` },
        { path: [taskManagement, newTasks], label: `${subHash} ${newTasks}` },
        { path: [taskManagement, migratedTasks], label: `${subHash} ${migratedTasks}` },
        { path: [taskManagement, taskLog], label: `${subHash} ${taskLog}` },
        { path: [quickRecords], label: `${baseHash} ${quickRecords}` },
        { path: [dailyReview], label: `${baseHash} ${dailyReview}` },
    ];
}

export const ENHANCED_DIARY_ROOT_HEADINGS: Record<EnhancedDiaryPeriod, string> = {
    day: DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.day[0],
    week: DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.week[0],
    month: DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.month[0],
    year: DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.year[0],
};

export const ENHANCED_DIARY_ROOT_HEADING_ALIASES: Record<EnhancedDiaryPeriod, string[]> = {
    day: [...DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.day],
    week: [...DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.week],
    month: [...DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.month],
    year: [...DEFAULT_ENHANCED_DIARY_TEMPLATE_FIELD_MAPPING.rootHeadings.year],
};

export function matchesRootHeading(
    normalizedTitle: string,
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): boolean {
    const stripped = stripReviewStatusSuffix(normalizedTitle);
    const aliases = getFieldAliases(mapping, "rootHeadings", period);
    return headingTitleMatchesAliases(stripped, aliases);
}

export function getLines(markdown: string): string[] {
    return markdown.replace(/\r\n/g, "\n").split("\n");
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
    plan?: EnhancedDiaryHeadingPlan,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiarySectionLookupResult {
    const roots = parseMarkdownHeadingTree(markdown);
    const targetLevel = plan ? plan.rootHeadingLevel : 1;

    for (const node of roots) {
        if (node.level === targetLevel && matchesRootHeading(normalizeHeadingTitle(node.title), period, mapping)) {
            return { found: true, node };
        }
    }

    const expectedTitle = plan ? plan.rootHeadingTitle : getPrimaryFieldTitle(mapping, "rootHeadings", period);
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

function findDescendantByAliases(
    parent: EnhancedDiaryHeadingNode,
    aliases: string[]
): EnhancedDiaryHeadingNode | null {
    const preferredLevel = (parent.level + 1) as EnhancedDiaryHeadingLevel;
    for (const child of parent.children) {
        if (child.level === preferredLevel && headingTitleMatchesAliases(normalizeHeadingTitle(child.title), aliases)) {
            return child;
        }
    }
    for (const child of parent.children) {
        if (child.level > preferredLevel && headingTitleMatchesAliases(normalizeHeadingTitle(child.title), aliases)) {
            return child;
        }
    }
    for (const child of parent.children) {
        const found = findDescendantByAliases(child, aliases);
        if (found) return found;
    }
    return null;
}

function findSectionByAliasesPath(
    root: EnhancedDiaryHeadingNode,
    aliasesPath: string[][]
): boolean {
    let current: EnhancedDiaryHeadingNode | null = root;
    for (const aliases of aliasesPath) {
        current = findDescendantByAliases(current, aliases);
        if (!current) return false;
    }
    return true;
}

export function validateDayWorkspaceStructure(
    markdown: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null,
    taskManagementEnabled: boolean = true
): EnhancedDiaryWorkspaceValidationResult {
    const missing: string[] = [];

    const roots = parseMarkdownHeadingTree(markdown);
    let rootNode: EnhancedDiaryHeadingNode | null = null;

    for (const node of roots) {
        if (node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), "day", mapping)) {
            rootNode = node;
            break;
        }
    }

    if (!rootNode) {
        missing.push(`# ${getPrimaryFieldTitle(mapping, "rootHeadings", "day")}`);
        return { valid: false, missing };
    }

    const plan = headingStructure
        ? getEnhancedDiaryHeadingPlan(headingStructure, "day", mapping)
        : null;
    const baseHash = plan ? "#".repeat(plan.baseLevel) : "##";
    const subHash = plan ? "#".repeat(plan.subLevel) : "###";

    const quickRecords = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "quickRecords");
    const dailyReview = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "dailyReview");
    const quickRecordsAliases = getFieldAliases(mapping, "dayWorkspaceSections", "quickRecords");
    const dailyReviewAliases = getFieldAliases(mapping, "dayWorkspaceSections", "dailyReview");

    const requiredItems: { aliasesPath: string[][]; recommendedLabel: string }[] = [
        { aliasesPath: [quickRecordsAliases], recommendedLabel: `${baseHash} ${quickRecords}` },
        { aliasesPath: [dailyReviewAliases], recommendedLabel: `${baseHash} ${dailyReview}` },
    ];

    if (taskManagementEnabled) {
        const taskManagement = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "taskManagement");
        const newTasks = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "newTasks");
        const migratedTasks = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "migratedTasks");
        const taskLog = getPrimaryFieldTitle(mapping, "dayWorkspaceSections", "taskLog");
        const taskManagementAliases = getFieldAliases(mapping, "dayWorkspaceSections", "taskManagement");
        const newTasksAliases = getFieldAliases(mapping, "dayWorkspaceSections", "newTasks");
        const migratedTasksAliases = getFieldAliases(mapping, "dayWorkspaceSections", "migratedTasks");
        const taskLogAliases = getFieldAliases(mapping, "dayWorkspaceSections", "taskLog");

        requiredItems.unshift(
            { aliasesPath: [taskManagementAliases], recommendedLabel: `${baseHash} ${taskManagement}` },
            { aliasesPath: [taskManagementAliases, newTasksAliases], recommendedLabel: `${subHash} ${newTasks}` },
            { aliasesPath: [taskManagementAliases, migratedTasksAliases], recommendedLabel: `${subHash} ${migratedTasks}` },
            { aliasesPath: [taskManagementAliases, taskLogAliases], recommendedLabel: `${subHash} ${taskLog}` }
        );
    }

    for (const { aliasesPath, recommendedLabel } of requiredItems) {
        if (!findSectionByAliasesPath(rootNode, aliasesPath)) {
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
