import { appendBlock, getChildBlocks, insertBlock } from "@/api";
import {
    ENHANCED_DIARY_DAY_WORKSPACE_SECTION_PATHS,
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES,
    normalizeRecordCategoryTitle,
    type EnhancedDiaryDayWorkspaceSectionKey,
    type EnhancedDiaryRecordCategoryKey,
} from "./enhancedDiaryWorkspaceSections";
import {
    ENHANCED_DIARY_ROOT_HEADINGS,
    headingTitleStartsWith,
    normalizeHeadingTitle,
    type EnhancedDiaryHeadingLevel,
} from "./enhancedDiaryMarkdownSections";

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

function headingTitleMatches(
    heading: EnhancedDiaryHeadingBlock,
    expectedTitle: string
): boolean {
    return headingTitleStartsWith(
        {
            level: heading.level,
            title: heading.title,
            raw: heading.markdown,
            lineIndex: 0,
            startLine: 0,
            endLine: 0,
            children: [],
        },
        expectedTitle
    );
}

async function getDocumentHeadingBlocks(docId: string): Promise<EnhancedDiaryHeadingBlock[]> {
    const children = await getChildBlocks(docId);
    return (children || [])
        .map((block, index) => blockToHeadingBlock(block, index))
        .filter((block): block is EnhancedDiaryHeadingBlock => !!block);
}

function findRootHeadingBlock(
    headings: EnhancedDiaryHeadingBlock[],
    expectedTitle: string
): EnhancedDiaryHeadingBlock | null {
    return headings.find(
        (heading) => heading.level === 1 && headingTitleMatches(heading, expectedTitle)
    ) || null;
}

function findChildHeadingBlock(
    headings: EnhancedDiaryHeadingBlock[],
    parent: EnhancedDiaryHeadingBlock,
    expectedTitle: string,
    level: EnhancedDiaryHeadingLevel
): EnhancedDiaryHeadingBlock | null {
    for (const heading of headings) {
        if (heading.index <= parent.index) continue;
        if (heading.level <= parent.level) break;
        if (heading.level === level && headingTitleMatches(heading, expectedTitle)) {
            return heading;
        }
    }
    return null;
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
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey
): Promise<EnhancedDiaryHeadingBlockLookup> {
    const headings = await getDocumentHeadingBlocks(docId);
    const dayTitle = ENHANCED_DIARY_ROOT_HEADINGS.day;
    const path = ENHANCED_DIARY_DAY_WORKSPACE_SECTION_PATHS[sectionKey];
    const fullPath = [dayTitle, ...path];
    const root = findRootHeadingBlock(headings, dayTitle);

    if (!root) {
        return {
            found: false,
            headings,
            missingTitle: `# ${dayTitle}`,
            path: fullPath,
        };
    }

    let currentParent: EnhancedDiaryHeadingBlock = root;
    for (let i = 0; i < path.length; i++) {
        const expectedLevel = (i + 2) as EnhancedDiaryHeadingLevel;
        const child = findChildHeadingBlock(headings, currentParent, path[i], expectedLevel);
        if (!child) {
            return {
                found: false,
                headings,
                missingTitle: `${"#".repeat(expectedLevel)} ${path[i]}`,
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
    categoryKey: EnhancedDiaryRecordCategoryKey
): Promise<EnhancedDiaryHeadingBlockLookup> {
    const quickRecords = await findDayWorkspaceHeadingBlock(docId, "quickRecords");
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
        categoryTitle,
        3
    );

    if (!category) {
        return {
            found: false,
            headings: quickRecords.headings,
            missingTitle: `### ${categoryTitle}`,
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
}): Promise<EnhancedDiaryInsertResult> {
    const lookup = await findDayWorkspaceHeadingBlock(params.docId, params.sectionKey);
    return insertMarkdownAtHeadingEnd(params.docId, lookup, params.markdown);
}

export async function appendMarkdownToRecordCategory(params: {
    docId: string;
    categoryKey: EnhancedDiaryRecordCategoryKey;
    markdown: string;
}): Promise<EnhancedDiaryInsertResult> {
    const lookup = await findRecordCategoryHeadingBlock(params.docId, params.categoryKey);
    return insertMarkdownAtHeadingEnd(params.docId, lookup, params.markdown);
}

export async function appendMarkdownToRecordCategoryByTitle(params: {
    docId: string;
    categoryTitle: string;
    markdown: string;
}): Promise<EnhancedDiaryInsertResult> {
    const normalizedTitle = normalizeRecordCategoryTitle(params.categoryTitle);
    const quickRecords = await findDayWorkspaceHeadingBlock(params.docId, "quickRecords");

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
        normalizedTitle,
        3
    );

    if (!category) {
        const nextBoundary = findNextBoundaryHeading(quickRecords.headings, quickRecords.heading);
        const categoryMarkdown = `### ${normalizedTitle}\n\n${params.markdown}`;

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

    return insertMarkdownAtHeadingEnd(params.docId, {
        found: true,
        heading: category,
        headings: quickRecords.headings,
        path: [...quickRecords.path, normalizedTitle],
    }, params.markdown);
}

export async function getDayWorkspaceSectionEndAnchor(params: {
    docId: string;
    sectionKey: EnhancedDiaryDayWorkspaceSectionKey;
}): Promise<EnhancedDiaryInsertionAnchorResult> {
    const lookup = await findDayWorkspaceHeadingBlock(params.docId, params.sectionKey);
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
