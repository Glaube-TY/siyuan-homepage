import { batchGetBlockAttrs, getBlockInfo, getBlockKramdownChecked, getBlockTreeInfos, getChildBlocksChecked, insertBlockChecked, updateBlockChecked, performTransactionsChecked, setBlockAttrsChecked } from "@/api";
import { addQuickRecordToDiary, getOrCreateTodayDiaryDocument } from "../enhancedDiaryActions";
import {
    ENHANCED_DIARY_RECORD_CATEGORY_TITLES,
    type EnhancedDiaryRecordCategoryKey,
} from "../enhancedDiaryWorkspaceSections";
import {
    findRootHeading,
    getEnhancedDiaryHeadingLevel,
    getEnhancedDiaryHeadingTitle,
    getSectionMarkdown,
    normalizeHeadingTitle,
    type EnhancedDiaryHeadingNode,
} from "../enhancedDiaryMarkdownSections";
import {
    findDayWorkspaceHeadingBlock,
    extractOperationBlockIds,
    isEnhancedDiaryRecordHeadingType,
} from "../enhancedDiaryBlockLocator";
import {
    DEFAULT_ENHANCED_DIARY_CONFIG,
    type EnhancedDiaryConfig,
    type EnhancedDiaryHeadingStructureConfig,
    type EnhancedDiaryProjectStorageConfig,
    type EnhancedDiaryTemplateFieldMapping,
} from "../enhancedDiaryTypes";
import { readDiaryMarkdown, validateEnhancedDiaryWriteTarget, formatDiaryAttrDate } from "../enhancedDiaryDoc";
import { getEnhancedDiaryIndexEntries } from "../enhancedDiaryIndex";
import { formatDiaryDate } from "../enhancedDiaryUtils";
import {
    getFieldAliases,
    headingTitleMatchesAliases,
} from "../enhancedDiaryTemplateFieldMapping";
import { readEnhancedDiaryProjectIndex } from "../enhancedDiaryProjectIndex";
import { ENHANCED_DIARY_KEY_RECORD_ATTR, parseEnhancedDiaryBatchBlockAttrs } from "../enhancedDiaryProjectTypes";
import { appendRecordProjectReference, parseVisibleProjectTargetId, removeVisibleProjectReference, resolveProjectRelation } from "./enhancedDiaryWorkspaceProjectRelation";
import { ENHANCED_DIARY_PROJECT_TARGET_ATTR } from "../enhancedDiaryProjectTypes";
import { removeProjectRecordIndexItem, replaceProjectRecordIndexForDiary, upsertProjectRecordIndexItem } from "../enhancedDiaryProjectRecordIndex";
import {
    EnhancedDiaryProjectWriteTargetError,
    validateEnhancedDiaryProjectWriteTarget,
} from "./enhancedDiaryWorkspaceProjectLifecycle";

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
    tags: string[];
    projectTargetId?: string;
    hiddenProjectTargetId?: string;
    visibleProjectTargetId?: string;
    rootProjectId?: string;
    projectPath?: string[];
    projectAncestorTargetIds?: string[];
    isKeyRecord: boolean;
    projectRelationStatus: ReturnType<typeof resolveProjectRelation>["relationStatus"];
    rawProjectContent?: string;
    headingLevel?: number;
}

export interface EnhancedDiaryRecordWriteContext {
    dailyNotebookId: string;
    expectedDate: string;
    projectStorage?: EnhancedDiaryProjectStorageConfig;
}

export interface QuickRecordDialogSubmitInput {
    categoryTitle: string;
    content: string;
    tags: string[];
    projectTargetId?: string;
    projectTitle?: string;
    isKeyRecord: boolean;
    rootProjectId?: string;
    projectPath?: string[];
    projectAncestorTargetIds?: string[];
}

async function validateRecordBlocks(
    record: EnhancedDiaryWorkspaceRecord,
    targetBlockIds: string[],
    checkHeading: boolean
): Promise<{ ok: true; reason?: undefined } | { ok: false; reason: string }> {
    // Validate non-empty IDs
    for (const id of targetBlockIds) {
        if (!id || typeof id !== "string" || id.trim() === "") {
            return { ok: false, reason: "record_block_invalid" };
        }
    }

    // Check for duplicates
    const seen = new Set<string>();
    for (const id of targetBlockIds) {
        if (seen.has(id)) return { ok: false, reason: "record_block_invalid" };
        seen.add(id);
    }

    // headingBlockId must not appear in the ORIGINAL contentBlockIds
    if (record.headingBlockId && record.contentBlockIds && record.contentBlockIds.includes(record.headingBlockId)) {
        return { ok: false, reason: "record_block_invalid" };
    }

    if (targetBlockIds.length === 0) return { ok: false, reason: "record_block_missing" };

    if (targetBlockIds.length > 32) return { ok: false, reason: "record_block_invalid" };

    let rootScopeConfirmed = false;
    for (const waitMs of [0, 100, 300] as const) {
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        try {
            const infos = await Promise.all(targetBlockIds.map((id) => getBlockInfo(id)));
            if (infos.some((info) => info?.rootID !== record.docId)) {
                return { ok: false, reason: "record_block_out_of_scope" };
            }
            rootScopeConfirmed = true;
            break;
        } catch {
            // 新写入块或内核索引暂时不可读时，只做有限重试，不误判为用户已删除。
        }
    }
    if (!rootScopeConfirmed) return { ok: false, reason: "record_validation_failed" };

    if (checkHeading && record.headingBlockId) {
        try {
            const treeInfos = await getBlockTreeInfos([record.headingBlockId]);
            if (!isEnhancedDiaryRecordHeadingType(treeInfos?.[record.headingBlockId]?.type)) {
                return { ok: false, reason: "record_block_out_of_scope" };
            }
        } catch {
            return { ok: false, reason: "record_validation_failed" };
        }
    }

    return { ok: true };
}

export interface WorkspaceRecordActionResult {
    ok: boolean;
    partial?: boolean;
    changed?: boolean;
    blockId?: string;
    headingBlockId?: string;
    contentBlockIds?: string[];
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

interface RecordBodyAnalysis {
    oldBlockIds: string[];
    projectReferenceBlockId?: string;
}

const SAFE_RECORD_BODY_TYPES = new Set([
    "p", "l", "t", "c", "b", "m", "html", "tb",
    "NodeParagraph", "NodeList", "NodeTable", "NodeCodeBlock", "NodeBlockquote",
    "NodeMathBlock", "NodeHTMLBlock", "NodeThematicBreak",
]);

async function analyzeRecordBodyStructure(
    record: EnhancedDiaryWorkspaceRecord,
): Promise<{ ok: true; analysis: RecordBodyAnalysis } | { ok: false; reason: string; message: string }> {
    if (!record.headingBlockId || !record.contentBlockIds) {
        return { ok: false, reason: "record_block_missing", message: "未能可靠定位记录块，请刷新后重试。" };
    }
    const oldBlockIds = Array.from(new Set(record.contentBlockIds.filter(Boolean)));
    if (oldBlockIds.length !== record.contentBlockIds.length || oldBlockIds.length > 32) {
        return { ok: false, reason: "unsupported_record_shape", message: "记录正文块数量或标识异常，请在原日记中检查。" };
    }

    const blocks = await getChildBlocksChecked(record.docId);
    const headingIndex = blocks.findIndex((block) => block.id === record.headingBlockId);
    if (headingIndex < 0) {
        return { ok: false, reason: "record_block_missing", message: "记录标题已变化，请刷新后重试。" };
    }
    const currentRangeIds: string[] = [];
    for (let index = headingIndex + 1; index < blocks.length; index += 1) {
        const heading = parseHeadingBlock(blocks[index], index);
        if (heading && heading.level <= (record.headingLevel || 6)) break;
        if (blocks[index].id) currentRangeIds.push(blocks[index].id);
    }
    if (currentRangeIds.length !== oldBlockIds.length ||
        currentRangeIds.some((id, index) => id !== oldBlockIds[index])) {
        return { ok: false, reason: "record_structure_changed", message: "记录正文结构已经变化，请刷新工作台后重试。" };
    }

    const treeInfos = oldBlockIds.length ? await getBlockTreeInfos(oldBlockIds) : {};
    let projectReferenceBlockId: string | undefined;
    for (const id of oldBlockIds) {
        const type = treeInfos?.[id]?.type;
        if (isEnhancedDiaryRecordHeadingType(type)) {
            return { ok: false, reason: "unsupported_record_shape", message: "记录正文中包含子标题，为避免误删，请在原日记中编辑。" };
        }
        if (!SAFE_RECORD_BODY_TYPES.has(type)) {
            return { ok: false, reason: "unsupported_record_shape", message: "记录正文包含无法安全替换的复杂块，请在原日记中编辑。" };
        }
        const raw = await getBlockKramdownChecked(id);
        if (!parseVisibleProjectTargetId(raw?.kramdown)) continue;
        if (projectReferenceBlockId) {
            return { ok: false, reason: "multiple_project_references", message: "记录中存在多个项目引用块，请在原日记中确认后再编辑。" };
        }
        projectReferenceBlockId = id;
    }
    return { ok: true, analysis: { oldBlockIds, projectReferenceBlockId } };
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

function extractRecordTags(title: string): string[] {
    return Array.from(title.matchAll(/#([^#]+)#/g), (match) => match[1].trim()).filter(Boolean);
}

function baseRecordMetadata(title: string, content: string) {
    return {
        tags: extractRecordTags(title),
        content: removeVisibleProjectReference(content).trim(),
        rawProjectContent: content,
        isKeyRecord: false,
        projectRelationStatus: "none" as const,
    };
}

function isPlaceholderRecord(content: string): boolean {
    const normalized = content.trim();
    return !normalized || /^这里写.+内容。?$/.test(normalized);
}

function parseHeadingBlock(block: IResGetChildBlock, index: number): HeadingBlockInfo | null {
    const markdown = block.markdown || "";
    const level = getEnhancedDiaryHeadingLevel(block);
    const title = getEnhancedDiaryHeadingTitle(block);
    if (block.type !== "h") return null;
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
                ...baseRecordMetadata(recordNode.title, content),
                docId,
                date,
            });
        }
    }

    return records;
}

export interface EnhancedDiaryQuickRecordQueryResult {
    records: EnhancedDiaryWorkspaceRecord[];
    structureComplete: boolean;
    relationComplete: boolean;
    reason?: string;
}

async function applyFallbackProjectRelations(
    records: EnhancedDiaryWorkspaceRecord[],
    config?: EnhancedDiaryConfig,
): Promise<boolean> {
    if (!config) return false;
    const projectIndex = await readEnhancedDiaryProjectIndex(config.projectStorage);
    records.forEach((record) => {
        const relation = resolveProjectRelation(projectIndex, {}, record.rawProjectContent || record.content);
        record.projectTargetId = relation.projectTargetId;
        record.hiddenProjectTargetId = relation.hiddenProjectTargetId;
        record.visibleProjectTargetId = relation.visibleProjectTargetId;
        record.rootProjectId = relation.rootProjectId;
        record.projectPath = relation.projectPath;
        record.projectAncestorTargetIds = relation.projectAncestorTargetIds;
        record.projectRelationStatus = relation.relationStatus;
        record.content = removeVisibleProjectReference(record.content).trim();
    });
    return true;
}

export async function queryTodayQuickRecordsDetailed(
    docId: string,
    markdown: string,
    date?: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null,
    config?: EnhancedDiaryConfig,
): Promise<EnhancedDiaryQuickRecordQueryResult> {
    try {
        const qrLookup = await findDayWorkspaceHeadingBlock(docId, "quickRecords", headingStructure, mapping);
        if (!qrLookup.found || !qrLookup.heading) {
            const records = queryTodayQuickRecordsFromMarkdown(docId, markdown, date, mapping);
            const relationComplete = await applyFallbackProjectRelations(records, config);
            return { records, structureComplete: false, relationComplete, reason: "quick_record_heading_unavailable" };
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

        const blocks = await getChildBlocksChecked(docId);
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
                ...baseRecordMetadata(heading.title, content),
                docId,
                date,
                headingBlockId: heading.id,
                headingLevel: heading.level,
                contentBlockIds,
            });
        }

        if (records.length > 0 && config) {
            const ids = records.map((record) => record.headingBlockId).filter(Boolean) as string[];
            const attrsById = ids.length
                ? parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(ids))
                : {};
            const projectIndex = await readEnhancedDiaryProjectIndex(config.projectStorage);
            records.forEach((record) => {
                const attrs = attrsById?.[record.headingBlockId || ""] || {};
                const relation = resolveProjectRelation(projectIndex, attrs, record.rawProjectContent || record.content);
                record.projectTargetId = relation.projectTargetId;
                record.hiddenProjectTargetId = relation.hiddenProjectTargetId;
                record.visibleProjectTargetId = relation.visibleProjectTargetId;
                record.rootProjectId = relation.rootProjectId;
                record.projectPath = relation.projectPath;
                record.projectAncestorTargetIds = relation.projectAncestorTargetIds;
                record.projectRelationStatus = relation.relationStatus;
                record.isKeyRecord = attrs?.[ENHANCED_DIARY_KEY_RECORD_ATTR] === "true" && !!relation.projectTargetId;
                record.content = removeVisibleProjectReference(record.content).trim();
            });
        }
        return { records, structureComplete: true, relationComplete: true };
    } catch (err) {
        console.warn("[enhancedDiaryWorkspaceRecordService] query records by blocks failed", err);
        const records = queryTodayQuickRecordsFromMarkdown(docId, markdown, date, mapping);
        let relationComplete = false;
        try { relationComplete = await applyFallbackProjectRelations(records, config); } catch { /* 保留展示回退 */ }
        return { records, structureComplete: false, relationComplete, reason: "block_structure_read_failed" };
    }
}

export async function queryTodayQuickRecords(
    docId: string,
    markdown: string,
    date?: string,
    headingStructure?: EnhancedDiaryHeadingStructureConfig,
    mapping?: EnhancedDiaryTemplateFieldMapping | null,
    config?: EnhancedDiaryConfig,
): Promise<EnhancedDiaryWorkspaceRecord[]> {
    return (await queryTodayQuickRecordsDetailed(docId, markdown, date, headingStructure, mapping, config)).records;
}

export async function addWorkspaceQuickRecord(
    plugin: any,
    config: EnhancedDiaryConfig,
    categoryTitle: string,
    content: string,
    metadata: { tags?: string[]; projectTargetId?: string; projectTitle?: string; isKeyRecord?: boolean; rootProjectId?: string; projectPath?: string[]; projectAncestorTargetIds?: string[] } = {},
): Promise<WorkspaceRecordActionResult> {
    const todayDoc = await getOrCreateTodayDiaryDocument(plugin, config);
    if (!todayDoc.ok || !todayDoc.docId) {
        return {
            ok: false,
            reason: todayDoc.reason || "today_doc_failed",
            message: "未能打开或创建今日日记，记录未写入。",
        };
    }

    const result = await addQuickRecordToDiary({
        docId: todayDoc.docId,
        categoryTitle,
        content,
        dailyNotebookId: config.dailyNotebookId!,
        expectedDate: formatDiaryAttrDate(new Date()),
        headingStructure: config.headingStructure,
        mapping: config.templateFieldMapping,
        projectStorage: config.projectStorage,
        ...metadata,
        synchronizeIndex: async () => {
            const markdown = await readDiaryMarkdown(todayDoc.docId!);
            const detailed = await queryTodayQuickRecordsDetailed(
                todayDoc.docId!,
                markdown,
                formatDiaryDate(new Date()),
                config.headingStructure,
                config.templateFieldMapping,
                config,
            );
            if (!detailed.structureComplete) return false;
            await replaceProjectRecordIndexForDiary(config.dailyNotebookId!, todayDoc.docId!, detailed.records);
            return true;
        },
    });
    return result;
}

export async function deleteQuickRecord(
    record: EnhancedDiaryWorkspaceRecord,
    ctx: EnhancedDiaryRecordWriteContext
): Promise<WorkspaceRecordActionResult> {
    if (!record.headingBlockId || !record.contentBlockIds) {
        return {
            ok: false,
            reason: "missing_block_ids",
            message: "未能可靠定位记录块，请在日记中手动删除。",
        };
    }

    // Validate parent diary scope
    const diaryCheck = await validateEnhancedDiaryWriteTarget(record.docId, ctx.dailyNotebookId, ctx.expectedDate);
    if (diaryCheck.status !== "valid") {
        return {
            ok: false,
            reason: diaryCheck.status === "out_of_scope" ? "record_block_out_of_scope" : "record_validation_failed",
            message: "日记文档已变更，无法删除记录。",
        };
    }

    // Validate all target blocks belong to this diary
    const allBlockIds = [...record.contentBlockIds, record.headingBlockId];
    const blockCheck = await validateRecordBlocks(record, allBlockIds, true);
    if (!blockCheck.ok) return { ok: false, reason: blockCheck.reason, message: "记录块已变更，请在日记中手动删除。" };

    try {
        // Use transaction to atomically delete all blocks — prevents partial deletion
        const doOperations = [...record.contentBlockIds, record.headingBlockId].map((blockId) => ({
            action: "delete",
            id: blockId,
        }));
        await performTransactionsChecked([{ doOperations }]);
        try { await removeProjectRecordIndexItem(ctx.dailyNotebookId, record.headingBlockId); } catch { /* 可重建 */ }
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
    content: string,
    ctx: EnhancedDiaryRecordWriteContext,
    metadata: { categoryTitle?: string; tags?: string[]; projectTargetId?: string; projectTitle?: string; isKeyRecord?: boolean; rootProjectId?: string; projectPath?: string[]; projectAncestorTargetIds?: string[] } = {},
): Promise<WorkspaceRecordActionResult> {
    const trimmed = content.trim();
    if (!trimmed) {
        return {
            ok: false,
            reason: "empty_content",
            message: "记录内容不能为空。",
        };
    }

    if (!record.headingBlockId || !record.contentBlockIds) {
        return {
            ok: false,
            reason: "record_block_missing",
            message: "未能可靠定位记录块，请刷新后重试。",
        };
    }

    const diaryCheck = await validateEnhancedDiaryWriteTarget(record.docId, ctx.dailyNotebookId, ctx.expectedDate);
    if (diaryCheck.status !== "valid") {
        return {
            ok: false,
            reason: diaryCheck.status === "out_of_scope" ? "record_block_out_of_scope" : "record_validation_failed",
            message: "日记文档已变更，无法更新记录。",
        };
    }

    const blockCheck = await validateRecordBlocks(record, [...record.contentBlockIds, record.headingBlockId], true);
    if (!blockCheck.ok) {
        return { ok: false, reason: blockCheck.reason, message: "记录块已变更，请在日记中手动编辑。" };
    }

    let bodyAnalysis: RecordBodyAnalysis;
    try {
        const analyzed = await analyzeRecordBodyStructure(record);
        if (!analyzed.ok) return analyzed;
        bodyAnalysis = analyzed.analysis;
    } catch (reason) {
        console.warn("[enhancedDiaryWorkspaceRecordService] analyze record body failed", reason);
        return {
            ok: false,
            reason: "record_validation_failed",
            message: "无法确认记录正文结构，为避免误改，请在原日记中编辑。",
        };
    }

    let resolvedMetadata = metadata;
    if (Object.prototype.hasOwnProperty.call(metadata, "projectTargetId")) {
        if (metadata.projectTargetId) {
            if (!ctx.projectStorage) {
                return { ok: false, reason: "project_storage_unavailable", message: "无法确认项目状态，记录未更新。" };
            }
            try {
                const target = await validateEnhancedDiaryProjectWriteTarget(
                    ctx.projectStorage,
                    metadata.projectTargetId,
                    record.projectTargetId,
                );
                resolvedMetadata = {
                    ...metadata,
                    projectTargetId: target.id,
                    projectTitle: target.title,
                    rootProjectId: target.rootProjectId,
                    projectPath: target.pathTitles,
                    projectAncestorTargetIds: target.ancestorTargetIds,
                };
            } catch (reason) {
                return {
                    ok: false,
                    reason: reason instanceof EnhancedDiaryProjectWriteTargetError ? reason.code : "project_index_unavailable",
                    message: reason instanceof Error ? reason.message : "无法确认项目状态，记录未更新。",
                };
            }
        } else {
            resolvedMetadata = {
                ...metadata,
                projectTargetId: undefined,
                projectTitle: undefined,
                rootProjectId: undefined,
                projectPath: undefined,
                projectAncestorTargetIds: undefined,
            };
        }
    }

    const projectTargetId = Object.prototype.hasOwnProperty.call(resolvedMetadata, "projectTargetId")
        ? resolvedMetadata.projectTargetId || ""
        : record.projectTargetId || "";
    const projectTitle = resolvedMetadata.projectTitle ?? record.projectPath?.[record.projectPath.length - 1] ?? "";
    const nextContent = projectTargetId && projectTitle
        ? appendRecordProjectReference(trimmed, projectTargetId, projectTitle)
        : removeVisibleProjectReference(trimmed);
    const firstOldBlockId = bodyAnalysis.oldBlockIds[0];
    let insertedBlockIds: string[] = [];
    try {
        const operations = firstOldBlockId
            ? await insertBlockChecked("markdown", nextContent, firstOldBlockId)
            : await insertBlockChecked("markdown", nextContent, undefined, record.headingBlockId);
        insertedBlockIds = extractOperationBlockIds(operations);
    } catch (reason) {
        console.warn("[enhancedDiaryWorkspaceRecordService] insert updated record body failed", reason);
        return {
            ok: false,
            reason: "update_failed",
            message: "记录新内容写入失败，原正文已保留。",
        };
    }
    const partialResult: WorkspaceRecordActionResult = {
        ok: true,
        partial: true,
        changed: true,
        contentBlockIds: insertedBlockIds,
        reason: "record_cleanup_pending",
        message: "记录新内容已经保存，但旧正文或项目属性清理未完成，请打开原日记检查。",
    };
    if (insertedBlockIds.length === 0) return partialResult;

    const tags = Array.from(new Set((resolvedMetadata.tags ?? record.tags).map((tag) => tag.replace(/^#+|#+$/g, "").trim()).filter(Boolean)));
    const tagText = tags.map((tag) => `#${tag}#`).join(" ");
    const level = Math.max(1, Math.min(6, record.headingLevel || 3));
    const baseTitle = `${record.timeText || extractTimeText(record.headingTitle)} 记录`.trim();
    const nextHeadingTitle = `${baseTitle}${tagText ? ` ${tagText}` : ""}`;
    const nextHeadingMarkdown = `${"#".repeat(level)} ${nextHeadingTitle}`;
    try {
        await updateBlockChecked("markdown", nextHeadingMarkdown, record.headingBlockId);
        await setBlockAttrsChecked(record.headingBlockId, {
            [ENHANCED_DIARY_PROJECT_TARGET_ATTR]: projectTargetId,
            [ENHANCED_DIARY_KEY_RECORD_ATTR]: projectTargetId && resolvedMetadata.isKeyRecord ? "true" : "",
        });
    } catch (reason) {
        console.warn("[enhancedDiaryWorkspaceRecordService] update record metadata failed", reason);
        return partialResult;
    }

    if (bodyAnalysis.oldBlockIds.length > 0) {
        try {
            await performTransactionsChecked([{
                doOperations: bodyAnalysis.oldBlockIds.map((id) => ({ action: "delete", id })),
            }]);
        } catch (reason) {
            console.warn("[enhancedDiaryWorkspaceRecordService] cleanup old record body failed", reason);
            return partialResult;
        }
    }

    try {
        await upsertProjectRecordIndexItem(ctx.dailyNotebookId, {
            ...record,
            headingTitle: nextHeadingTitle,
            content: trimmed,
            rawProjectContent: nextContent,
            contentBlockIds: insertedBlockIds,
            tags,
            projectTargetId: projectTargetId || undefined,
            hiddenProjectTargetId: projectTargetId || undefined,
            visibleProjectTargetId: projectTargetId || undefined,
            rootProjectId: projectTargetId ? resolvedMetadata.rootProjectId : undefined,
            projectPath: projectTargetId ? resolvedMetadata.projectPath : undefined,
            projectAncestorTargetIds: projectTargetId ? resolvedMetadata.projectAncestorTargetIds : undefined,
            isKeyRecord: !!projectTargetId && !!resolvedMetadata.isKeyRecord,
            projectRelationStatus: projectTargetId ? "normal" : "none",
        });
    } catch (reason) {
        console.warn("[enhancedDiaryWorkspaceRecordService] update record index failed", reason);
        return partialResult;
    }
    return { ok: true, changed: true, contentBlockIds: insertedBlockIds };
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
    const requestedDates: string[] = [];
    for (const cursor = new Date(actualStart); cursor <= rawEnd; cursor.setDate(cursor.getDate() + 1)) {
        const dateStr = formatDiaryDate(cursor);
        if (includeToday || dateStr !== todayStr) requestedDates.push(dateStr.replace(/-/g, ""));
    }
    const entries = config.dailyNotebookId
        ? await getEnhancedDiaryIndexEntries(config.dailyNotebookId, requestedDates)
        : {};
    const allRecords: EnhancedDiaryWorkspaceRecord[] = [];
    for (const [compactDate, entry] of Object.entries(entries)) {
        try {
            const content = await readDiaryMarkdown(entry.id);
            if (!content) continue;
            const dateStr = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
            const dayRecords = await queryTodayQuickRecords(entry.id, content, dateStr, config.headingStructure, config.templateFieldMapping, config);
            for (const record of dayRecords) {
                record.date = dateStr;
                record.docTitle = entry.title || dateStr;
            }
            allRecords.push(...dayRecords);
        } catch (err) {
            console.warn(`[enhancedDiaryWorkspaceRecordService] query records for ${compactDate} failed`, err);
        }
    }

    allRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return allRecords;
}
