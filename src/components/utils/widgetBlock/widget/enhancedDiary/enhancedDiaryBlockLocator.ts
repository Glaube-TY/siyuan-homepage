import { appendBlock, getChildBlocks, insertBlock } from "@/api";
import {
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES,
    normalizeRecordCategoryTitle,
    type EnhancedDiaryDayWorkspaceSectionKey,
    type EnhancedDiaryRecordCategoryKey,
} from "./enhancedDiaryWorkspaceSections";
import {
    headingTitleStartsWith,
    normalizeHeadingTitle,
    type EnhancedDiaryHeadingLevel,
} from "./enhancedDiaryMarkdownSections";
import type { EnhancedDiaryHeadingStructureConfig, EnhancedDiaryTemplateFieldMapping } from "./enhancedDiaryTypes";
import {
    getDayWorkspaceSectionPathAliases,
    getFieldAliases,
    getPrimaryFieldTitle,
} from "./enhancedDiaryTemplateFieldMapping";

export interface EnhancedDiaryHeadingBlock {
    id: string;
    level: EnhancedDiaryHeadingLevel;
    title: string;
    markdown: string;
    index: number;
}

export interface EnhancedDiaryHeadingBlockLookup {
    found: boolean;
    heading?: EnhancedDiaryHeadingBlock;
    headings: EnhancedDiaryHeadingBlock[];
    missingTitle?: string;
    path: string[];
}

export interface EnhancedDiaryInsertResult {
    ok: boolean;
    reason?: string;
    missingTitle?: string;
    path?: string[];
}

export interface EnhancedDiaryInsertionAnchorResult {
    ok: boolean;
    previousID?: string;
    parentID?: string;
    reason?: string;
    missingTitle?: string;
    path?: string[];
}

function getHeadingLevelFromSubtype(subtype?: string): EnhancedDiaryHeadingLevel | null {
    const match = subtype?.match(/^h([1-6])$/);
    if (!match) return null;
    return Number(match[1]) as EnhancedDiaryHeadingLevel;
}

function parseHeadingMarkdown(markdown?: string): {
    level: EnhancedDiaryHeadingLevel;
    title: string;
} | null {
    const line = (markdown || "").split("\n")[0]?.trim();
    const match = line?.match(/^(#{1,6})\s+(.*)$/);
    if (!match) return null;
    return {
        level: match[1].length as EnhancedDiaryHeadingLevel,
        title: normalizeHeadingTitle(match[2]),
    };
}

function blockToHeadingBlock(
    block: IResGetChildBlock,
    index: number
): EnhancedDiaryHeadingBlock | null {
    const parsed = parseHeadingMarkdown(block.markdown);
    const subtypeLevel = getHeadingLevelFromSubtype(block.subtype);
    const level = parsed?.level || subtypeLevel;

    if (block.type !== "h" && !parsed) return null;
    if (!level || !parsed?.title) return null;

    return {
        id: block.id,
        level,
        title: parsed.title,
        markdown: block.markdown || "",
        index,
    };
}

function headingTitleMatchesAny(
    heading: EnhancedDiaryHeadingBlock,
    aliases: string[]
): boolean {
    const node: Parameters<typeof headingTitleStartsWith>[0] = {
        level: heading.level,
        title: heading.title,
        raw: heading.markdown,
        lineIndex: 0,
        startLine: 0,
        endLine: 0,
        children: [],
    };
    return aliases.some((alias) => headingTitleStartsWith(node, alias));
}

async function getDocumentHeadingBlocks(docId: string): Promise<EnhancedDiaryHeadingBlock[]> {
    const children = await getChildBlocks(docId);
    return (children || [])
        .map((block, index) => blockToHeadingBlock(block, index))
        .filter((block): block is EnhancedDiaryHeadingBlock => !!block);
}

function findRootHeadingBlock(
    headings: EnhancedDiaryHeadingBlock[],
    aliases: string[],
    level: EnhancedDiaryHeadingLevel = 1
): EnhancedDiaryHeadingBlock | null {
    return headings.find(
        (heading) => heading.level === level && headingTitleMatchesAny(heading, aliases)
    ) || null;
}

function findChildHeadingBlock(
    headings: EnhancedDiaryHeadingBlock[],
    parent: EnhancedDiaryHeadingBlock,
    aliases: string[]
): EnhancedDiaryHeadingBlock | null {
    const preferredLevel = parent.level + 1;
    let firstDeeperMatch: EnhancedDiaryHeadingBlock | null = null;

    for (const heading of headings) {
        if (heading.index <= parent.index) continue;
        if (heading.level <= parent.level) break;
        if (headingTitleMatchesAny(heading, aliases)) {
            if (heading.level === preferredLevel) {
                return heading; // exact level match — immediate return
            }
            if (!firstDeeperMatch) {
                firstDeeperMatch = heading; // track first deeper fallback
            }
        }
    }

    return firstDeeperMatch;
}

function findNextBoundaryHeading(
    headings: EnhancedDiaryHeadingBlock[],
    target: EnhancedDiaryHeadingBlock
): EnhancedDiaryHeadingBlock | null {
    for (const heading of headings) {
        if (heading.index <= target.index) continue;
        if (heading.level <= target.level) {
            return heading;
        }
    }
    return null;
}

export async function findDayWorkspaceHeadingBlock(
    docId: string,
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey,
    _headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Promise<EnhancedDiaryHeadingBlockLookup> {
    const headings = await getDocumentHeadingBlocks(docId);
    const rootAliases = getFieldAliases(mapping, "rootHeadings", "day");
    const pathAliases = getDayWorkspaceSectionPathAliases(mapping, sectionKey);
    const primaryPath = pathAliases.map((aliases) => aliases[0]);
    const rootTitle = getPrimaryFieldTitle(mapping, "rootHeadings", "day");
    const fullPath = [rootTitle, ...primaryPath];

    let root = findRootHeadingBlock(headings, rootAliases, 1);

    if (!root) {
        return {
            found: false,
            headings,
            missingTitle: `# ${rootTitle}`,
            path: fullPath,
        };
    }

    let currentParent: EnhancedDiaryHeadingBlock = root;
    for (let i = 0; i < pathAliases.length; i++) {
        const child = findChildHeadingBlock(headings, currentParent, pathAliases[i]);
        if (!child) {
            return {
                found: false,
                headings,
                missingTitle: primaryPath[i],
                path: fullPath,
            };
        }
        currentParent = child;
    }

    return {
        found: true,
        heading: currentParent,
        headings,
        path: fullPath,
    };
}

export async function findRecordCategoryHeadingBlock(
    docId: string,
    categoryKey: EnhancedDiaryRecordCategoryKey,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Promise<EnhancedDiaryHeadingBlockLookup> {
    const quickRecords = await findDayWorkspaceHeadingBlock(docId, "quickRecords", headingStructure, mapping);
    const categoryTitle = ENHANCED_DIARY_RECORD_CATEGORY_TITLES[categoryKey];

    if (!quickRecords.found || !quickRecords.heading) {
        return {
            ...quickRecords,
            path: [...quickRecords.path, categoryTitle],
        };
    }

    const category = findChildHeadingBlock(
        quickRecords.headings,
        quickRecords.heading,
        [categoryTitle]
    );

    if (!category) {
        return {
            found: false,
            headings: quickRecords.headings,
            missingTitle: categoryTitle,
            path: [...quickRecords.path, categoryTitle],
        };
    }

    return {
        found: true,
        heading: category,
        headings: quickRecords.headings,
        path: [...quickRecords.path, categoryTitle],
    };
}

async function insertMarkdownAtHeadingEnd(
    docId: string,
    lookup: EnhancedDiaryHeadingBlockLookup,
    markdown: string
): Promise<EnhancedDiaryInsertResult> {
    if (!lookup.found || !lookup.heading) {
        return {
            ok: false,
            reason: "missing_heading",
            missingTitle: lookup.missingTitle,
            path: lookup.path,
        };
    }

    const data = markdown.trim();
    if (!data) {
        return { ok: false, reason: "empty_markdown", path: lookup.path };
    }

    const nextBoundary = findNextBoundaryHeading(lookup.headings, lookup.heading);
    try {
        if (nextBoundary) {
            await insertBlock("markdown", data, nextBoundary.id);
        } else {
            await appendBlock("markdown", data, docId);
        }
        return { ok: true, path: lookup.path };
    } catch (err) {
        console.warn("[enhancedDiaryBlockLocator] insert failed", err);
        return { ok: false, reason: "insert_failed", path: lookup.path };
    }
}

export async function appendMarkdownToDaySection(params: {
    docId: string;
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey;
    markdown: string;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<EnhancedDiaryInsertResult> {
    const lookup = await findDayWorkspaceHeadingBlock(params.docId, params.sectionKey, params.headingStructure, params.mapping);
    return insertMarkdownAtHeadingEnd(params.docId, lookup, params.markdown);
}

export async function appendMarkdownToRecordCategory(params: {
    docId: string;
    categoryKey: EnhancedDiaryRecordCategoryKey;
    markdown: string;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<EnhancedDiaryInsertResult> {
    const lookup = await findRecordCategoryHeadingBlock(params.docId, params.categoryKey, params.headingStructure, params.mapping);
    return insertMarkdownAtHeadingEnd(params.docId, lookup, params.markdown);
}

export async function appendMarkdownToRecordCategoryByTitle(params: {
    docId: string;
    categoryTitle: string;
    content: string;
    recordTime: string;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<EnhancedDiaryInsertResult> {
    const normalizedTitle = normalizeRecordCategoryTitle(params.categoryTitle);
    const quickRecords = await findDayWorkspaceHeadingBlock(params.docId, "quickRecords", params.headingStructure, params.mapping);

    if (!quickRecords.found || !quickRecords.heading) {
        return {
            ok: false,
            reason: "missing_quick_records_heading",
            path: [...quickRecords.path, normalizedTitle],
        };
    }

    const category = findChildHeadingBlock(
        quickRecords.headings,
        quickRecords.heading,
        [normalizedTitle]
    );

    if (!category) {
        const nextBoundary = findNextBoundaryHeading(quickRecords.headings, quickRecords.heading);
        // Derive category level from actual quickRecords heading level
        const categoryLevel = (quickRecords.heading.level + 1) as EnhancedDiaryHeadingLevel;
        const recordLevel = (categoryLevel + 1) as EnhancedDiaryHeadingLevel;
        const recordHash = "#".repeat(recordLevel);
        const categoryMarkdown = `${"#".repeat(categoryLevel)} ${normalizedTitle}\n\n${recordHash} ${params.recordTime} 记录\n\n${params.content}`;

        try {
            if (nextBoundary) {
                await insertBlock("markdown", categoryMarkdown, nextBoundary.id);
            } else {
                await appendBlock("markdown", categoryMarkdown, params.docId);
            }
            return { ok: true, path: [...quickRecords.path, normalizedTitle] };
        } catch (err) {
            console.warn("[enhancedDiaryBlockLocator] insert category failed", err);
            return { ok: false, reason: "insert_failed", path: [...quickRecords.path, normalizedTitle] };
        }
    }

    // Compute record level from actual found category level
    const recordLevel = (category.level + 1) as EnhancedDiaryHeadingLevel;
    const recordHash = "#".repeat(recordLevel);
    const recordMarkdown = `${recordHash} ${params.recordTime} 记录\n\n${params.content}`;

    return insertMarkdownAtHeadingEnd(params.docId, {
        found: true,
        heading: category,
        headings: quickRecords.headings,
        path: [...quickRecords.path, normalizedTitle],
    }, recordMarkdown);
}

export async function getDayWorkspaceSectionEndAnchor(params: {
    docId: string;
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<EnhancedDiaryInsertionAnchorResult> {
    const lookup = await findDayWorkspaceHeadingBlock(params.docId, params.sectionKey, params.headingStructure, params.mapping);
    if (!lookup.found || !lookup.heading) {
        return {
            ok: false,
            reason: "missing_heading",
            missingTitle: lookup.missingTitle,
            path: lookup.path,
        };
    }

    const children = await getChildBlocks(params.docId);
    const headingIndex = children.findIndex((block) => block.id === lookup.heading?.id);
    if (headingIndex < 0) {
        return {
            ok: false,
            reason: "heading_block_not_found",
            path: lookup.path,
        };
    }

    let boundaryIndex = children.length;
    for (let i = headingIndex + 1; i < children.length; i++) {
        const heading = blockToHeadingBlock(children[i], i);
        if (heading && heading.level <= lookup.heading.level) {
            boundaryIndex = i;
            break;
        }
    }

    const previousBlock = children[boundaryIndex - 1] || children[headingIndex];
    return {
        ok: true,
        previousID: previousBlock.id,
        parentID: params.docId,
        path: lookup.path,
    };
}
