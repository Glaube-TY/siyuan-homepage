import { getChildBlocks, insertBlock, deleteBlock } from "@/api";
import {
    matchesRootHeading,
    normalizeHeadingTitle,
    parseMarkdownHeadingTree,
    getSectionMarkdown,
    type EnhancedDiaryHeadingNode,
} from "../enhancedDiaryMarkdownSections";
import { readDiaryMarkdown } from "../enhancedDiaryDoc";
import type { EnhancedDiaryHeadingStructureConfig, EnhancedDiaryPeriod, EnhancedDiaryTemplateFieldMapping } from "../enhancedDiaryTypes";
import {
    getActiveReviewFields,
    getFieldAliases,
    getPrimaryFieldTitle,
    getReviewFieldLookupAliases,
    headingTitleMatchesAliases,
} from "../enhancedDiaryTemplateFieldMapping";

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

function getReviewSectionDef(
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): ReviewSectionDef {
    return {
        rootTitle: getPrimaryFieldTitle(mapping, "rootHeadings", period),
        reviewTitle: getPrimaryFieldTitle(mapping, "reviewSections", period, "reviewRoot"),
        fields: getActiveReviewFields(mapping, period),
    };
}

function findDescendantByTitleInScopeWithAliases(
    parent: EnhancedDiaryHeadingNode,
    aliases: string[]
): { found: true; node: EnhancedDiaryHeadingNode } | { found: false; missingTitle?: string } {
    const preferredLevel = (parent.level + 1) as typeof parent.level;

    for (const child of parent.children) {
        if (child.level === preferredLevel) {
            const normalized = normalizeHeadingTitle(child.title);
            if (headingTitleMatchesAliases(normalized, aliases)) {
                return { found: true, node: child };
            }
        }
    }

    for (const child of parent.children) {
        if (child.level > preferredLevel) {
            const normalized = normalizeHeadingTitle(child.title);
            if (headingTitleMatchesAliases(normalized, aliases)) {
                return { found: true, node: child };
            }
        }
    }

    for (const child of parent.children) {
        const result = findDescendantByTitleInScopeWithAliases(child, aliases);
        if (result.found) return result;
    }

    return { found: false, missingTitle: aliases[0] };
}

function findReviewRootNode(
    roots: EnhancedDiaryHeadingNode[],
    period: EnhancedDiaryPeriod,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryHeadingNode | null {
    let periodRoot: EnhancedDiaryHeadingNode | null = null;

    for (const node of roots) {
        if (node.level === 1 && matchesRootHeading(normalizeHeadingTitle(node.title), period, mapping)) {
            periodRoot = node;
            break;
        }
    }
    if (!periodRoot) return null;

    const reviewTitleAliases = getFieldAliases(mapping, "reviewSections", period, "reviewRoot");
    const reviewLookup = findDescendantByTitleInScopeWithAliases(periodRoot, reviewTitleAliases);
    return reviewLookup.found && reviewLookup.node ? reviewLookup.node : null;
}

export async function loadReviewContent(
    docId: string,
    period: EnhancedDiaryPeriod,
    _headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Promise<{ fields: EnhancedDiaryReviewField[]; reason?: string }> {
    const def = getReviewSectionDef(period, mapping);
    const markdown = await readDiaryMarkdown(docId);
    const roots = parseMarkdownHeadingTree(markdown);
    const reviewRoot = findReviewRootNode(roots, period, mapping);

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
    for (let i = 0; i < def.fields.length; i++) {
        const fieldTitle = def.fields[i];
        const lookupAliases = getReviewFieldLookupAliases(mapping, period, fieldTitle, i);
        const lookup = findDescendantByTitleInScopeWithAliases(reviewRoot, lookupAliases);
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
    _headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Promise<{ ok: boolean; reason?: string }> {
    const reviewRootAliases = getFieldAliases(mapping, "reviewSections", period, "reviewRoot");

    const children = await getChildBlocks(docId);

    let periodRootIndex = -1;
    for (let i = 0; i < children.length; i++) {
        const level = getHeadingLevel(children[i]);
        if (level === 1) {
            const title = parseHeadingTitle(children[i].markdown);
            if (title && matchesRootHeading(normalizeHeadingTitle(title), period, mapping)) {
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
            if (headingTitleMatchesAliases(normalizedReviewTitle, reviewRootAliases)) {
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

    // Scan for existing fields by lookup aliases, mapping old titles to current field labels
    const activeFields = getActiveReviewFields(mapping, period);
    const fieldIndexMap = new Map<string, { blockIndex: number; blockId: string; endIndex: number }>();
    for (let i = reviewRootIndex + 1; i < reviewEndIndex; i++) {
        const level = getHeadingLevel(children[i]);
        if (level !== null && level > reviewRootLevelVal) {
            const title = parseHeadingTitle(children[i].markdown);
            if (!title) continue;
            const normalizedTitle = normalizeHeadingTitle(title);
            let matchedLabel: string | null = null;
            for (let fi = 0; fi < activeFields.length; fi++) {
                const fieldLabel = activeFields[fi];
                const lookupAliases = getReviewFieldLookupAliases(mapping, period, fieldLabel, fi);
                if (headingTitleMatchesAliases(normalizedTitle, lookupAliases)) {
                    matchedLabel = fieldLabel;
                    break;
                }
            }
            if (!matchedLabel || fieldIndexMap.has(matchedLabel)) continue;
            let endIdx = reviewEndIndex;
            for (let j = i + 1; j < reviewEndIndex; j++) {
                const jLevel = getHeadingLevel(children[j]);
                if (jLevel !== null && jLevel <= level) {
                    endIdx = j;
                    break;
                }
            }
            fieldIndexMap.set(matchedLabel, { blockIndex: i, blockId: children[i].id, endIndex: endIdx });
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
