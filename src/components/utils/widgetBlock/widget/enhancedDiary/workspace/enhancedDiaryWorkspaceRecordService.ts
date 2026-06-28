import { deleteBlock, getChildBlocks, updateBlock } from "@/api";
import { addQuickRecordToDiary, getOrCreateTodayDiaryDocument } from "../enhancedDiaryActions";
import {
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES,
    type EnhancedDiaryRecordCategoryKey,
} from "../enhancedDiaryWorkspaceSections";
import {
    findRootHeading,
    getSectionMarkdown,
    normalizeHeadingTitle,
    type EnhancedDiaryHeadingNode,
} from "../enhancedDiaryMarkdownSections";
import { findDayWorkspaceHeadingBlock } from "../enhancedDiaryBlockLocator";
import {
    DEFAULT_ENHANCED_DIARY_CONFIG,
    type EnhancedDiaryConfig,
    type EnhancedDiaryHeadingStructureConfig,
    type EnhancedDiaryTemplateFieldMapping,
} from "../enhancedDiaryTypes";
import { getDiaryDocumentForDate } from "../enhancedDiaryDoc";
import { formatDiaryDate } from "../enhancedDiaryUtils";
import {
    getFieldAliases,
    headingTitleMatchesAliases,
} from "../enhancedDiaryTemplateFieldMapping";

export interface EnhancedDiaryWorkspaceRecord {
    id?: string;
    headingTitle: string;
    categoryKey: string;
    categoryTitle: string;
    timeText: string;
    content: string;
    docId: string;
    date?: string;
    docTitle?: string;
    headingBlockId?: string;
    contentBlockIds?: string[];
}

export interface WorkspaceRecordActionResult {
    ok: boolean;
    reason?: string;
    message?: string;
}

interface HeadingBlockInfo {
    id: string;
    level: number;
    title: string;
    markdown: string;
    index: number;
}

const CATEGORY_ENTRIES = Object.entries(
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES
) as Array<[EnhancedDiaryRecordCategoryKey, string]>;

function getCategoryMeta(title: string): { key: string; title: string } {
    const normalizedTitle = normalizeHeadingTitle(title);
    const known = CATEGORY_ENTRIES.find(([, categoryTitle]) => categoryTitle === normalizedTitle);
    if (known) {
        return { key: known[0], title: known[1] };
    }
    return { key: `custom:${normalizedTitle}`, title: normalizedTitle };
}

function extractTimeText(title: string): string {
    const match = title.match(/(\d{1,2}:\d{2})/);
    return match ? match[1] : "";
}

function isPlaceholderRecord(content: string): boolean {
    const normalized = content.trim();
    return !normalized || /^这里写.+内容。?$/.test(normalized);
}

function parseHeadingBlock(block: IResGetChildBlock, index: number): HeadingBlockInfo | null {
    const markdown = block.markdown || "";
    const firstLine = markdown.split("\n")[0]?.trim() || "";
    const markdownMatch = firstLine.match(/^(#{1,6})\s+(.*)$/);
    const subtypeMatch = block.subtype?.match(/^h([1-6])$/);

    if (block.type !== "h" && !markdownMatch) return null;

    const level = markdownMatch
        ? markdownMatch[1].length
        : subtypeMatch
            ? Number(subtypeMatch[1])
            : 0;
    const title = markdownMatch
        ? normalizeHeadingTitle(markdownMatch[2])
        : normalizeHeadingTitle(markdown);

    if (!level || !title) return null;

    return {
        id: block.id,
        level,
        title,
        markdown,
        index,
    };
}

function findQuickRecordsNode(
    markdown: string,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryHeadingNode | null {
    const dayRoot = findRootHeading(markdown, "day", undefined, mapping);
    if (!dayRoot.found || !dayRoot.node) return null;

    const aliases = getFieldAliases(mapping, "dayWorkspaceSections", "quickRecords");
    const quickRecords = findDescendantByTitleInScopeWithAliases(dayRoot.node, aliases);
    if (!quickRecords.found || !quickRecords.node) return null;

    return quickRecords.node;
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

function queryTodayQuickRecordsFromMarkdown(
    docId: string,
    markdown: string,
    date?: string,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): EnhancedDiaryWorkspaceRecord[] {
    const qrNode = findQuickRecordsNode(markdown, mapping);
    if (!qrNode) return [];

    const records: EnhancedDiaryWorkspaceRecord[] = [];
    const preferredCategoryLevel = qrNode.level + 1;

    const categoryNodes: EnhancedDiaryHeadingNode[] = [];
    for (const child of qrNode.children) {
        if (child.level === preferredCategoryLevel) {
            categoryNodes.push(child);
        }
    }
    if (categoryNodes.length === 0) {
        for (const child of qrNode.children) {
            if (child.level > preferredCategoryLevel) {
                categoryNodes.push(child);
            }
        }
    }

    for (const categoryNode of categoryNodes) {
        const category = getCategoryMeta(categoryNode.title);
        const preferredRecordLevel = categoryNode.level + 1;

        const recordNodes: EnhancedDiaryHeadingNode[] = [];
        for (const child of categoryNode.children) {
            if (child.level === preferredRecordLevel) {
                recordNodes.push(child);
            }
        }
        if (recordNodes.length === 0) {
            for (const child of categoryNode.children) {
                if (child.level > preferredRecordLevel) {
                    recordNodes.push(child);
                }
            }
        }

        for (const recordNode of recordNodes) {
            const content = getSectionMarkdown(markdown, recordNode).trim();
            if (isPlaceholderRecord(content)) continue;

            records.push({
                id: `${docId}-${recordNode.lineIndex}`,
                headingTitle: recordNode.title,
                categoryKey: category.key,
                categoryTitle: category.title,
                timeText: extractTimeText(recordNode.title),
                content,
                docId,
                date,
            });
        }
    }

    return records;
}

export async function queryTodayQuickRecords(
    docId: string,
    markdown: string,
    date?: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null
): Promise<EnhancedDiaryWorkspaceRecord[]> {
    try {
        const qrLookup = await findDayWorkspaceHeadingBlock(docId, "quickRecords", headingStructure, mapping);
        if (!qrLookup.found || !qrLookup.heading) {
            return queryTodayQuickRecordsFromMarkdown(docId, markdown, date, mapping);
        }

        const qrBlock = qrLookup.heading;
        const allHeadings = qrLookup.headings;

        let qrScopeEnd = Number.MAX_SAFE_INTEGER;
        for (const h of allHeadings) {
            if (h.index > qrBlock.index && h.level <= qrBlock.level) {
                qrScopeEnd = h.index;
                break;
            }
        }

        const blocks = await getChildBlocks(docId);
        const effectiveEnd = Math.min(qrScopeEnd, blocks.length);
        const preferredCategoryLevel = qrBlock.level + 1;

        const records: EnhancedDiaryWorkspaceRecord[] = [];
        let activeCategory: { key: string; title: string; level: number } | null = null;
        let activeCategoryLevel = 0;

        for (let i = qrBlock.index + 1; i < effectiveEnd; i++) {
            const heading = parseHeadingBlock(blocks[i], i);
            if (!heading) continue;

            if (heading.level === preferredCategoryLevel ||
                (heading.level > preferredCategoryLevel && (!activeCategory || heading.level <= activeCategoryLevel))) {
                activeCategory = { ...getCategoryMeta(heading.title), level: heading.level };
                activeCategoryLevel = heading.level;
                continue;
            }

            if (!activeCategory) continue;
            if (heading.level <= activeCategoryLevel) continue;

            const contentBlockIds: string[] = [];
            const contentLines: string[] = [];
            for (let j = i + 1; j < effectiveEnd; j++) {
                const nextHeading = parseHeadingBlock(blocks[j], j);
                if (nextHeading && nextHeading.level <= heading.level) break;
                if (blocks[j].id) contentBlockIds.push(blocks[j].id);
                if (blocks[j].markdown) contentLines.push(blocks[j].markdown);
            }

            const content = contentLines.join("\n\n").trim();
            if (isPlaceholderRecord(content)) continue;

            records.push({
                id: heading.id,
                headingTitle: heading.title,
                categoryKey: activeCategory.key,
                categoryTitle: activeCategory.title,
                timeText: extractTimeText(heading.title),
                content,
                docId,
                date,
                headingBlockId: heading.id,
                contentBlockIds,
            });
        }

        return records;
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceRecordService] query records by blocks failed", err);
        return queryTodayQuickRecordsFromMarkdown(docId, markdown, date, mapping);
    }
}

export async function addWorkspaceQuickRecord(
    plugin: any,
    config: EnhancedDiaryConfig,
    categoryTitle: string,
    content: string
): Promise<WorkspaceRecordActionResult> {
    const todayDoc = await getOrCreateTodayDiaryDocument(plugin, config);
    if (!todayDoc.ok || !todayDoc.docId) {
        return {
            ok: false,
            reason: todayDoc.reason || "today_doc_failed",
            message: "未能打开或创建今日日记，记录未写入。",
        };
    }

    return addQuickRecordToDiary({
        docId: todayDoc.docId,
        categoryTitle,
        content,
        headingStructure: config.headingStructure,
        mapping: config.templateFieldMapping,
    });
}

export async function deleteQuickRecord(
    record: EnhancedDiaryWorkspaceRecord
): Promise<WorkspaceRecordActionResult> {
    if (!record.headingBlockId || !record.contentBlockIds) {
        return {
            ok: false,
            reason: "missing_block_ids",
            message: "未能可靠定位记录块，请在日记中手动删除。",
        };
    }

    try {
        for (const blockId of [...record.contentBlockIds].reverse()) {
            await deleteBlock(blockId);
        }
        await deleteBlock(record.headingBlockId);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceRecordService] delete quick record failed", err);
        return {
            ok: false,
            reason: "delete_failed",
            message: "删除记录失败，请稍后重试。",
        };
    }
}

export async function updateQuickRecord(
    record: EnhancedDiaryWorkspaceRecord,
    content: string
): Promise<WorkspaceRecordActionResult> {
    const trimmed = content.trim();
    if (!trimmed) {
        return {
            ok: false,
            reason: "empty_content",
            message: "记录内容不能为空。",
        };
    }

    if (!record.contentBlockIds || record.contentBlockIds.length !== 1) {
        return {
            ok: false,
            reason: "unsupported_record_shape",
            message: "当前记录由多个块组成，为避免误覆盖，请在日记中手动编辑。",
        };
    }

    try {
        await updateBlock("markdown", trimmed, record.contentBlockIds[0]);
        return { ok: true };
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceRecordService] update quick record failed", err);
        return {
            ok: false,
            reason: "update_failed",
            message: "更新记录失败，请稍后重试。",
        };
    }
}

export async function queryQuickRecordsInDateRange(params: {
    startDate: Date;
    endDate: Date;
    includeToday?: boolean;
    config?: EnhancedDiaryConfig;
}): Promise<EnhancedDiaryWorkspaceRecord[]> {
    const { startDate, endDate, includeToday = true, config = DEFAULT_ENHANCED_DIARY_CONFIG } = params;

    const rawStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const rawEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    if (rawStart > rawEnd) {
        console.warn("[enhancedDiaryWorkspaceRecordService] startDate > endDate, returning empty");
        return [];
    }

    const maxDays = 90;
    const maxStart = new Date(rawEnd);
    maxStart.setDate(maxStart.getDate() - (maxDays - 1));
    const actualStart = rawStart < maxStart ? maxStart : rawStart;

    const todayStr = formatDiaryDate(new Date());
    const allRecords: EnhancedDiaryWorkspaceRecord[] = [];
    const cursor = new Date(actualStart);

    while (cursor <= rawEnd) {
        const dateStr = formatDiaryDate(cursor);
        const skipToday = includeToday === false && dateStr === todayStr;
        const dayDate = new Date(cursor);

        if (!skipToday) {
            try {
                const doc = await getDiaryDocumentForDate(dayDate);
                if (doc) {
                    const dayRecords = await queryTodayQuickRecords(
                        doc.id,
                        doc.content,
                        dateStr,
                        config.headingStructure,
                        config.templateFieldMapping,
                    );
                    for (const record of dayRecords) {
                        record.date = dateStr;
                        record.docTitle = doc.title || dateStr;
                    }
                    allRecords.push(...dayRecords);
                }
            } catch (err) {
                console.warn(`[enhancedDiaryWorkspaceRecordService] query records for ${dateStr} failed`, err);
            }
        }

        cursor.setDate(cursor.getDate() + 1);
    }

    allRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return allRecords;
}
