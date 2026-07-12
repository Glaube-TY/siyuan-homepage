import { getChildBlocksChecked, insertBlockChecked, performTransactionsChecked } from "@/api";
import {
    matchesRootHeading,
    normalizeHeadingTitle,
    parseMarkdownHeadingTree,
    getSectionMarkdown,
    type EnhancedDiaryHeadingNode,
} from "../enhancedDiaryMarkdownSections";
import { readDiaryMarkdownResult } from "../enhancedDiaryDoc";
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
    const readResult = await readDiaryMarkdownResult(docId);
    if (!readResult.ok) {
        return {
            fields: def.fields.map((label) => ({
                key: label,
                label,
                content: "",
                missing: true,
            })),
            reason: "read_failed",
        };
    }
    const markdown = readResult.content;
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

// (inline checked calls used directly in saveReviewContent)

export async function saveReviewContent(
    docId: string,
    period: EnhancedDiaryPeriod,
    fields: EnhancedDiaryReviewField[],
    _headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Promise<{ ok: boolean; reason?: string; changed?: boolean; changedFieldCount?: number; failedFieldCount?: number; cleanupFailedCount?: number }> {
    const reviewRootAliases = getFieldAliases(mapping, "reviewSections", period, "reviewRoot");

    let children: IResGetChildBlock[];
    try {
        children = await getChildBlocksChecked(docId);
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceReviewContent] getChildBlocksChecked failed", err);
        return { ok: false, reason: "structure_read_failed" };
    }

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

    let changedFieldCount = 0;
    let failedFieldCount = 0;
    let cleanupFailedCount = 0;

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
        try {
            if (reviewBoundaryNextId) {
                await insertBlockChecked("markdown", mergedMarkdown, reviewBoundaryNextId);
            } else {
                await insertBlockChecked("markdown", mergedMarkdown, undefined, newFieldInsertAfterId);
            }
        } catch (err) {
            console.warn("[enhancedDiaryWorkspaceReviewContent] insert missing fields failed", err);
            failedFieldCount += missingFields.length;
        }
    } else {
        // New fields with empty content — nothing to do, not an error
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

            // User cleared field: only delete old content
            if (!newContent && contentBlockIds.length > 0) {
                try {
                    const deletes = contentBlockIds.map((bid) => ({ action: "delete" as const, id: bid }));
                    await performTransactionsChecked([{ doOperations: deletes }]);
                    changedFieldCount++;
                } catch (err) {
                    console.warn("[enhancedDiaryWorkspaceReviewContent] delete cleared field content failed", err);
                    failedFieldCount++;
                }
                continue;
            }

            // User updated field: insert new content first, then delete old
            if (newContent && contentBlockIds.length > 0) {
                // Insert new content first
                try {
                    const fieldBoundaryNextId = existing.endIndex < children.length ? children[existing.endIndex].id : reviewBoundaryNextId;
                    if (fieldBoundaryNextId) {
                        await insertBlockChecked("markdown", newContent, fieldBoundaryNextId);
                    } else {
                        await insertBlockChecked("markdown", newContent, undefined, existing.blockId);
                    }
                } catch (err) {
                    console.warn("[enhancedDiaryWorkspaceReviewContent] insert new content failed, preserving old", err);
                    failedFieldCount++;
                    continue;
                }
                // Insert succeeded — field changed
                changedFieldCount++;

                // New content inserted — now try to clean up old content
                try {
                    const deletes = contentBlockIds.map((bid) => ({ action: "delete" as const, id: bid }));
                    await performTransactionsChecked([{ doOperations: deletes }]);
                } catch (err) {
                    console.warn("[enhancedDiaryWorkspaceReviewContent] cleanup old content failed (new content kept)", err);
                    cleanupFailedCount++;
                }
            } else if (newContent && contentBlockIds.length === 0) {
                // New content for existing heading but no old content blocks — just insert
                try {
                    const fieldBoundaryNextId = existing.endIndex < children.length ? children[existing.endIndex].id : reviewBoundaryNextId;
                    if (fieldBoundaryNextId) {
                        await insertBlockChecked("markdown", newContent, fieldBoundaryNextId);
                    } else {
                        await insertBlockChecked("markdown", newContent, undefined, existing.blockId);
                    }
                    changedFieldCount++;
                } catch (err) {
                    console.warn("[enhancedDiaryWorkspaceReviewContent] insert new content failed", err);
                    failedFieldCount++;
                }
            }
        }
    }

    const anyError = failedFieldCount > 0 || cleanupFailedCount > 0;

    if (anyError) {
        if (cleanupFailedCount > 0) {
            return { ok: false, reason: "cleanup_failed", changed: true, changedFieldCount, cleanupFailedCount };
        }
        if (changedFieldCount > 0) {
            return { ok: false, reason: "partial_write", changed: true, changedFieldCount, failedFieldCount };
        }
        return { ok: false, reason: "write_failed", changed: false, failedFieldCount };
    }

    return { ok: true, changed: changedFieldCount > 0, changedFieldCount };
}
