import { getChildBlocks, insertBlock, deleteBlock } from "@/api";
import {
    ENHANCED_DIARY_ROOT_HEADINGS,
    findDescendantByTitleInScope,
    matchesRootHeading,
    normalizeHeadingTitle,
    parseMarkdownHeadingTree,
    getSectionMarkdown,
    type EnhancedDiaryHeadingNode,
} from "../enhancedDiaryMarkdownSections";
import { readDiaryMarkdown } from "../enhancedDiaryDoc";
import type { EnhancedDiaryHeadingStructureConfig, EnhancedDiaryPeriod } from "../enhancedDiaryTypes";

export interface EnhancedDiaryReviewField {
    key: string;
    label: string;
    content: string;
    missing: boolean;
}

interface ReviewSectionDef {
    rootTitle: string;
    reviewTitle: string;
    fields: string[];
}

const REVIEW_CONTENT_FIELDS: Record<EnhancedDiaryPeriod, ReviewSectionDef> = {
    day: {
        rootTitle: ENHANCED_DIARY_ROOT_HEADINGS.day,
        reviewTitle: "今日复盘",
        fields: ["今日总结", "情绪状态", "收获与问题", "明日关注"],
    },
    week: {
        rootTitle: ENHANCED_DIARY_ROOT_HEADINGS.week,
        reviewTitle: "周复盘",
        fields: ["本周总结", "任务回顾", "记录沉淀", "问题与风险", "下周计划"],
    },
    month: {
        rootTitle: ENHANCED_DIARY_ROOT_HEADINGS.month,
        reviewTitle: "月度复盘",
        fields: ["本月总结", "关键进展", "任务回顾", "问题与风险", "下月计划"],
    },
    year: {
        rootTitle: ENHANCED_DIARY_ROOT_HEADINGS.year,
        reviewTitle: "年度复盘",
        fields: ["年度总结", "关键成果", "重要变化", "经验教训", "明年方向"],
    },
};

function findReviewRootNode(
    roots: EnhancedDiaryHeadingNode[],
    period: EnhancedDiaryPeriod,
    reviewTitle: string
): EnhancedDiaryHeadingNode | null {
    let periodRoot: EnhancedDiaryHeadingNode | null = null;

    for (const node of roots) {
        if (node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), period)) {
            periodRoot = node;
            break;
        }
    }
    if (!periodRoot) return null;

    const reviewLookup = findDescendantByTitleInScope(periodRoot, reviewTitle);
    return reviewLookup.found && reviewLookup.node ? reviewLookup.node : null;
}

export async function loadReviewContent(
    docId: string,
    period: EnhancedDiaryPeriod,
    _headingStructure?: EnhancedDiaryHeadingStructureConfig
): Promise<{ fields: EnhancedDiaryReviewField[]; reason?: string }> {
    const def = REVIEW_CONTENT_FIELDS[period];
    const markdown = await readDiaryMarkdown(docId);
    const roots = parseMarkdownHeadingTree(markdown);
    const reviewRoot = findReviewRootNode(roots, period, def.reviewTitle);

    if (!reviewRoot) {
        return {
            fields: def.fields.map((label) => ({
                key: label,
                label,
                content: "",
                missing: true,
            })),
            reason: "missing_review_root",
        };
    }

    const fields: EnhancedDiaryReviewField[] = [];
    for (const fieldTitle of def.fields) {
        const lookup = findDescendantByTitleInScope(reviewRoot, fieldTitle);
        if (lookup.found && lookup.node) {
            fields.push({
                key: fieldTitle,
                label: fieldTitle,
                content: getSectionMarkdown(markdown, lookup.node).trim(),
                missing: false,
            });
        } else {
            fields.push({
                key: fieldTitle,
                label: fieldTitle,
                content: "",
                missing: true,
            });
        }
    }

    return { fields };
}

function parseHeadingTitle(markdown: string): string | null {
    const line = (markdown || "").split("\n")[0]?.trim();
    const match = line?.match(/^#{1,6}\s+(.*)$/);
    return match ? match[1].trim() : null;
}

function getHeadingLevelFromSubtype(subtype?: string): number | null {
    const match = subtype?.match(/^h([1-6])$/);
    return match ? Number(match[1]) : null;
}

function getHeadingLevel(block: IResGetChildBlock): number | null {
    const parsed = /^#{1,6}\s+/.test((block.markdown || "").trim()) ? (block.markdown || "").match(/^(#{1,6})\s+/)?.[1].length : undefined;
    return parsed || getHeadingLevelFromSubtype(block.subtype) || null;
}

async function insertMarkdownAfterBlock(
    markdown: string,
    boundaryNextId: string | null,
    fallbackPreviousId: string
): Promise<boolean> {
    try {
        if (boundaryNextId) {
            await insertBlock("markdown", markdown, boundaryNextId);
        } else {
            await insertBlock("markdown", markdown, undefined, fallbackPreviousId);
        }
        return true;
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceReviewContent] insertMarkdownAfterBlock failed", err);
        return false;
    }
}

export async function saveReviewContent(
    docId: string,
    period: EnhancedDiaryPeriod,
    fields: EnhancedDiaryReviewField[],
    _headingStructure?: EnhancedDiaryHeadingStructureConfig
): Promise<{ ok: boolean; reason?: string }> {
    const def = REVIEW_CONTENT_FIELDS[period];

    const children = await getChildBlocks(docId);

    let periodRootIndex = -1;
    for (let i = 0; i < children.length; i++) {
        const level = getHeadingLevel(children[i]);
        if (level === 1) {
            const title = parseHeadingTitle(children[i].markdown);
            if (title && matchesRootHeading(normalizeHeadingTitle(title), period)) {
                periodRootIndex = i;
                break;
            }
        }
    }

    if (periodRootIndex < 0) {
        return { ok: false, reason: "missing_period_root" };
    }

    let reviewRootIndex = -1;
    for (let i = periodRootIndex + 1; i < children.length; i++) {
        const level = getHeadingLevel(children[i]);
        if (level !== null && level <= 1) break;
        const title = parseHeadingTitle(children[i].markdown);
        if (title) {
            const normalizedReviewTitle = normalizeHeadingTitle(title);
            if (normalizedReviewTitle === def.reviewTitle || normalizedReviewTitle.startsWith(def.reviewTitle + " ")) {
                reviewRootIndex = i;
                break;
            }
        }
    }

    if (reviewRootIndex < 0) {
        return { ok: false, reason: "missing_review_root" };
    }

    const reviewRootBlock = children[reviewRootIndex];
    const reviewRootLevelVal = getHeadingLevel(reviewRootBlock) || 2;
    // New fields are created one level deeper than review root
    const newFieldLevel = reviewRootLevelVal + 1;

    let reviewEndIndex = children.length;
    for (let i = reviewRootIndex + 1; i < children.length; i++) {
        const level = getHeadingLevel(children[i]);
        if (level !== null && level <= reviewRootLevelVal) {
            reviewEndIndex = i;
            break;
        }
    }

    const reviewBoundaryNextId = reviewEndIndex < children.length ? children[reviewEndIndex].id : null;

    // Scan for existing fields by title text at any level deeper than review root
    const fieldIndexMap = new Map<string, { blockIndex: number; blockId: string; endIndex: number }>();
    for (let i = reviewRootIndex + 1; i < reviewEndIndex; i++) {
        const level = getHeadingLevel(children[i]);
        if (level !== null && level > reviewRootLevelVal) {
            const title = parseHeadingTitle(children[i].markdown);
            if (title && def.fields.includes(title) && !fieldIndexMap.has(title)) {
                // Found a field heading — compute its scope end
                let endIdx = reviewEndIndex;
                for (let j = i + 1; j < reviewEndIndex; j++) {
                    const jLevel = getHeadingLevel(children[j]);
                    if (jLevel !== null && jLevel <= level) {
                        endIdx = j;
                        break;
                    }
                }
                fieldIndexMap.set(title, { blockIndex: i, blockId: children[i].id, endIndex: endIdx });
            }
        }
    }

    let hasError = false;

    // Track insertion anchor for new fields so successive inserts maintain order
    let newFieldInsertAfterId = reviewRootBlock.id;
    for (let i = reviewEndIndex - 1; i > reviewRootIndex; i--) {
        newFieldInsertAfterId = children[i].id;
        break;
    }

    // Collect missing fields to insert in one merged block for stable ordering
    const missingFields: { label: string; content: string }[] = [];
    for (const field of fields) {
        if (!fieldIndexMap.has(field.label) && field.content.trim()) {
            missingFields.push({ label: field.label, content: field.content.trim() });
        }
    }

    // Insert missing fields as a single merged markdown block
    if (missingFields.length > 0) {
        const fieldHash = "#".repeat(newFieldLevel);
        const mergedMarkdown = missingFields
            .map((mf) => `${fieldHash} ${mf.label}\n\n${mf.content}`)
            .join("\n\n");
        const ok = await insertMarkdownAfterBlock(mergedMarkdown, reviewBoundaryNextId, newFieldInsertAfterId);
        if (!ok) hasError = true;
    }

    for (const field of fields) {
        const newContent = field.content.trim();
        const existing = fieldIndexMap.get(field.label);

        // Skip missing fields — they were handled above in the merged block
        if (!existing) continue;

        if (existing) {
            const contentBlockIds: string[] = [];
            for (let i = existing.blockIndex + 1; i < existing.endIndex; i++) {
                contentBlockIds.push(children[i].id);
            }
            for (const blockId of contentBlockIds.reverse()) {
                try {
                    await deleteBlock(blockId);
                } catch (err) {
                    console.warn("[enhancedDiaryWorkspaceReviewContent] delete old content block failed", err);
                    hasError = true;
                }
            }

            if (newContent) {
                const fieldBoundaryNextId = existing.endIndex < children.length ? children[existing.endIndex].id : reviewBoundaryNextId;
                const ok = await insertMarkdownAfterBlock(newContent, fieldBoundaryNextId, existing.blockId);
                if (!ok) hasError = true;
            }
        }
    }

    if (hasError) {
        return { ok: false, reason: "write_failed" };
    }

    return { ok: true };
}
