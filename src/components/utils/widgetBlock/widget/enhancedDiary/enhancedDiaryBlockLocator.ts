import {
    appendBlockChecked,
    checkBlockExist,
    deleteBlockChecked,
    getBlockBreadcrumb,
    getBlockInfo,
    getBlockKramdowns,
    getBlockTreeInfos,
    getChildBlocksChecked,
    insertBlockChecked,
} from "@/api";
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
import { parseTaskLine } from "@/features/task-data/task-parser";

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
    readFailed?: boolean;
}

export interface EnhancedDiaryInsertResult {
    ok: boolean;
    blockId?: string;
    blockIds?: string[];
    reason?: string;
    missingTitle?: string;
    path?: string[];
}

export function extractOperationBlockIds(operations: unknown): string[] {
    const ids: string[] = [];
    const insertActions = new Set(["insert", "appendInsert", "prependInsert"]);
    for (const transaction of Array.isArray(operations) ? operations : []) {
        for (const operation of Array.isArray(transaction?.doOperations) ? transaction.doOperations : []) {
            if (insertActions.has(operation?.action) && typeof operation.id === "string" &&
                /^[0-9]{14}-[a-z0-9]{7}$/i.test(operation.id)) ids.push(operation.id);
        }
    }
    return Array.from(new Set(ids));
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExistingBlockInfo(id: string): Promise<any | undefined> {
    if (!id) return undefined;
    try {
        if (!await checkBlockExist(id)) return undefined;
        return await getBlockInfo(id);
    } catch {
        return undefined;
    }
}

export function isEnhancedDiaryTaskListItemType(type: unknown): boolean {
    return type === "i" || type === "NodeListItem";
}

export function isEnhancedDiaryRecordHeadingType(type: unknown): boolean {
    return type === "h" || type === "NodeHeading";
}

export function isEnhancedDiaryListContainerType(type: unknown): boolean {
    return type === "l" || type === "NodeList";
}

export function isEnhancedDiaryDocumentType(type: unknown): boolean {
    return type === "d" || type === "NodeDocument";
}

export interface EnhancedDiaryTaskMoveTarget {
    ok: boolean;
    targetListId?: string;
    previousTaskItemId?: string;
    placeholderTaskItemId?: string;
    headingId?: string;
    reason?: string;
    error?: unknown;
    path?: string[];
}

export interface EnhancedDiaryTaskListBlock {
    id: string;
    type?: unknown;
    subtype?: unknown;
    subType?: unknown;
    markdown?: string;
    content?: string;
}

export type EnhancedDiaryTaskListTailCandidate =
    | { kind: "existing"; targetListId: string; previousTaskItemId: string }
    | { kind: "bootstrap"; reason: string };

export function validateTaskListTreeShape(params: {
    docId: string;
    targetListId: string;
    targetListType: unknown;
    targetListParentId?: string;
    targetListParentType: unknown;
    previousTaskItemId: string;
    previousType: unknown;
    previousParentId?: string;
    previousParentType: unknown;
}): { ok: true } | { ok: false; reason: string } {
    if (!params.docId || !params.targetListId || !params.previousTaskItemId ||
        !isEnhancedDiaryListContainerType(params.targetListType) ||
        params.targetListParentId !== params.docId ||
        !isEnhancedDiaryDocumentType(params.targetListParentType)) {
        return { ok: false, reason: "target_structure_invalid" };
    }
    if (!isEnhancedDiaryTaskListItemType(params.previousType) ||
        params.previousParentId !== params.targetListId ||
        !isEnhancedDiaryListContainerType(params.previousParentType)) {
        return { ok: false, reason: "previous_task_structure_invalid" };
    }
    return { ok: true };
}

function isTaskMarkdownCandidate(markdown: unknown): boolean {
    const firstLine = String(markdown || "").split("\n")[0]
        .replace(/^([-*]\s*)\{:[^}]*\}\s*/, "$1")
        .trim();
    return /^[-*]\s+\[( |x|X)\]/.test(firstLine);
}

function isTaskListItemCandidate(block: EnhancedDiaryTaskListBlock): boolean {
    if (!isEnhancedDiaryTaskListItemType(block.type)) return false;
    const subtype = String(block.subtype || block.subType || "").trim().toLowerCase();
    if (subtype) return subtype === "t" || subtype === "task" || /^t[12]$/.test(subtype);
    return isTaskMarkdownCandidate(block.markdown || block.content);
}

export function resolveTaskListTailCandidate(
    sectionTopLevelBlocks: EnhancedDiaryTaskListBlock[],
    candidateListChildren: EnhancedDiaryTaskListBlock[],
): EnhancedDiaryTaskListTailCandidate {
    const lastBlock = sectionTopLevelBlocks[sectionTopLevelBlocks.length - 1];
    if (!lastBlock) return { kind: "bootstrap", reason: "section_empty" };
    if (!isEnhancedDiaryListContainerType(lastBlock.type)) {
        return { kind: "bootstrap", reason: "section_tail_not_list" };
    }
    if (!candidateListChildren.length) return { kind: "bootstrap", reason: "list_empty" };
    if (!candidateListChildren.every(isTaskListItemCandidate)) {
        return { kind: "bootstrap", reason: "list_not_task_list" };
    }
    const previousTaskItemId = candidateListChildren[candidateListChildren.length - 1]?.id;
    if (!lastBlock.id || !previousTaskItemId) return { kind: "bootstrap", reason: "list_identity_missing" };
    return {
        kind: "existing",
        targetListId: lastBlock.id,
        previousTaskItemId,
    };
}

function matchesLocatedBlockType(
    type: unknown,
    nodeType: "NodeListItem" | "NodeHeading",
): boolean {
    return nodeType === "NodeListItem"
        ? isEnhancedDiaryTaskListItemType(type)
        : isEnhancedDiaryRecordHeadingType(type);
}

const INSERT_OPERATION_LIMIT = 16;
const INSERT_CANDIDATE_LIMIT = 64;
const LOCATE_RETRY_DELAYS = [0, 100, 200, 400, 800] as const;

async function collectInsertedBlockCandidates(operationIds: string[]): Promise<{
    ids: string[];
    typeHints: Map<string, unknown>;
}> {
    const ids: string[] = [];
    const seen = new Set<string>();
    const typeHints = new Map<string, unknown>();
    const addCandidate = (id: unknown, type?: unknown): void => {
        if (typeof id !== "string" || !/^[0-9]{14}-[a-z0-9]{7}$/i.test(id) || seen.has(id)) return;
        if (ids.length >= INSERT_CANDIDATE_LIMIT) return;
        seen.add(id);
        ids.push(id);
        if (type) typeHints.set(id, type);
    };

    const roots = operationIds.slice(0, INSERT_OPERATION_LIMIT);
    roots.forEach((id) => addCandidate(id));

    // 先确认候选存在，再触发详情读取以加载目标块树。
    await Promise.all(roots.map(async (id) => {
        await getExistingBlockInfo(id);
    }));

    const childSources = new Set(roots);
    try {
        const rootTreeInfos = await getBlockTreeInfos(roots);
        roots.forEach((id) => {
            const treeInfo = rootTreeInfos?.[id];
            const type = treeInfo?.type;
            if (type) typeHints.set(id, type);
            addCandidate(treeInfo?.parentID, treeInfo?.parentType);
            if (isEnhancedDiaryListContainerType(treeInfo?.parentType) && treeInfo?.parentID) {
                childSources.add(treeInfo.parentID);
            }
        });
    } catch {
        // 新块树尚未就绪时仍尝试官方直接子块 API。
    }

    for (const id of roots) {
        try {
            const breadcrumb = await getBlockBreadcrumb(id);
            for (const node of Array.isArray(breadcrumb) ? breadcrumb : []) {
                addCandidate(node?.id, node?.type);
                if (isEnhancedDiaryListContainerType(node?.type)) childSources.add(node.id);
            }
        } catch {
            // 面包屑只用于补齐有限父级候选，失败时由树信息和后续重试兜底。
        }
    }

    const firstLevelContainers: string[] = [];
    for (const id of Array.from(childSources).slice(0, INSERT_OPERATION_LIMIT * 2)) {
        try {
            const children = await getChildBlocksChecked(id);
            for (const child of children || []) {
                addCandidate(child?.id, child?.type);
                if (isEnhancedDiaryListContainerType(child?.type)) firstLevelContainers.push(child.id);
            }
        } catch {
            // 单个候选读取失败不扩大扫描范围，由下一次有限重试继续。
        }
    }

    // 只为直接子块中的列表容器再读取一层，绝不递归扫描整篇文档。
    for (const id of firstLevelContainers.slice(0, INSERT_OPERATION_LIMIT)) {
        try {
            const children = await getChildBlocksChecked(id);
            for (const child of children || []) addCandidate(child?.id, child?.type);
        } catch {
            // 下一次有限重试继续。
        }
    }

    return { ids, typeHints };
}

function normalizeTaskKramdownForParsing(markdown: unknown): string {
    const firstLine = String(markdown || "").split("\n")[0] || "";
    return firstLine
        .replace(/^([*-]\s*)\{:[^}]*\}\s*(\[(?: |x|X)\])/, "$1$2")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizedTags(tags: string[]): string[] {
    return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).sort();
}

function taskSemanticKey(markdown: unknown): string {
    const parsed = parseTaskLine(normalizeTaskKramdownForParsing(markdown));
    return JSON.stringify({
        taskname: parsed.taskname.replace(/\s+/g, " ").trim(),
        projectTargetId: parsed.parsed.visibleProjectTargetId || "",
        startDate: parsed.parsed.startDate || "",
        deadline: parsed.parsed.deadline || "",
        priority: parsed.parsed.priority || "",
        tags: normalizedTags(parsed.parsed.tags),
    });
}

function normalizeRecordHeading(markdown: unknown): string {
    return String(markdown || "")
        .split("\n")[0]
        .replace(/^#{1,6}\s+/, "")
        .replace(/\{:[^}]*\}/g, " ")
        .replace(/#[^#]+#/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function recordHeadingIdentity(markdown: unknown): string | undefined {
    const normalized = normalizeRecordHeading(markdown);
    const match = normalized.match(/^(\d{2}:\d{2})\s+记录(?:\s|$)/);
    return match ? `${match[1]} 记录` : undefined;
}

export async function locateInsertedBlock(params: {
    operationIds: string[];
    rootId: string;
    nodeType: "NodeListItem" | "NodeHeading";
    expectedMarkdown?: string;
}): Promise<string | undefined> {
    const operationIds = Array.from(new Set(params.operationIds.filter((id) => /^[0-9]{14}-[a-z0-9]{7}$/i.test(id))));
    if (!operationIds.length) return undefined;
    for (let attempt = 0; attempt < LOCATE_RETRY_DELAYS.length; attempt += 1) {
        if (LOCATE_RETRY_DELAYS[attempt] > 0) await delay(LOCATE_RETRY_DELAYS[attempt]);
        try {
            const collected = await collectInsertedBlockCandidates(operationIds);
            const treeInfos = await getBlockTreeInfos(collected.ids);
            const typedCandidates = collected.ids.filter((id) => matchesLocatedBlockType(
                treeInfos?.[id]?.type || collected.typeHints.get(id),
                params.nodeType,
            ));
            const scopedCandidates: string[] = [];
            for (const id of typedCandidates) {
                const info = await getExistingBlockInfo(id);
                if (info?.rootID === params.rootId) scopedCandidates.push(id);
            }

            if (params.nodeType === "NodeHeading" && params.expectedMarkdown) {
                const kramdowns = scopedCandidates.length ? await getBlockKramdowns(scopedCandidates) : {};
                const expectedIdentity = recordHeadingIdentity(params.expectedMarkdown);
                const recordCandidates = scopedCandidates.filter((id) =>
                    !!expectedIdentity && recordHeadingIdentity(kramdowns?.[id]) === expectedIdentity
                );
                if (recordCandidates.length === 1) return recordCandidates[0];
                if (recordCandidates.length > 1) {
                    const expectedTitle = normalizeRecordHeading(params.expectedMarkdown);
                    const exact = recordCandidates.filter((id) => normalizeRecordHeading(kramdowns?.[id]) === expectedTitle);
                    if (exact.length === 1) return exact[0];
                }
                continue;
            }

            if (scopedCandidates.length === 1) return scopedCandidates[0];
            if (scopedCandidates.length > 1 && params.expectedMarkdown) {
                const kramdowns = await getBlockKramdowns(scopedCandidates);
                const expectedKey = taskSemanticKey(params.expectedMarkdown);
                const semanticMatches = scopedCandidates.filter((id) => taskSemanticKey(kramdowns?.[id]) === expectedKey);
                if (semanticMatches.length === 1) return semanticMatches[0];
            }
        } catch {
            // 新插入块可能尚未进入块树，只在有限重试窗口内等待。
        }
    }
    return undefined;
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
    let children: IResGetChildBlock[];
    try {
        children = await getChildBlocksChecked(docId);
    } catch (err) {
        console.warn("[enhancedDiaryBlockLocator] getChildBlocksChecked failed", err);
        throw new Error("structure_read_failed");
    }
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
        const operations = nextBoundary
            ? await insertBlockChecked("markdown", data, nextBoundary.id)
            : await appendBlockChecked("markdown", data, docId);
        const blockIds = extractOperationBlockIds(operations);
        return { ok: true, blockId: blockIds[0], blockIds, path: lookup.path };
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

function createTaskMovePlaceholderMarkdown(): string {
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `- [ ] siyuan-homepage migration anchor ${nonce}`;
}

export async function deleteTaskMovePlaceholder(id: string): Promise<boolean> {
    if (!id) return true;
    try {
        await deleteBlockChecked(id);
        return true;
    } catch (error) {
        console.warn("[enhancedDiary:migrateTask] placeholder cleanup failed", { placeholderTaskItemId: id, error });
        return false;
    }
}

async function cleanupUnlocatedTaskMovePlaceholder(
    operationIds: string[],
    rootId: string,
    expectedMarkdown: string,
): Promise<void> {
    if (!operationIds.length) return;
    try {
        const treeInfos = await getBlockTreeInfos(operationIds);
        const treeCandidates = operationIds.filter((id) => {
            const info = treeInfos?.[id];
            return isEnhancedDiaryTaskListItemType(info?.type) &&
                isEnhancedDiaryListContainerType(info?.parentType);
        });
        const candidates: string[] = [];
        for (const candidateId of treeCandidates) {
            const info = await getExistingBlockInfo(candidateId);
            if (info?.rootID === rootId) candidates.push(candidateId);
        }
        if (candidates.length !== 1) return;
        const kramdowns = await getBlockKramdowns(candidates);
        if (taskSemanticKey(kramdowns?.[candidates[0]]) === taskSemanticKey(expectedMarkdown)) {
            await deleteTaskMovePlaceholder(candidates[0]);
        }
    } catch {
        // 无法安全定位时不删除未知块，避免误删用户内容。
    }
}

async function validateResolvedTaskListTarget(params: {
    docId: string;
    targetListId: string;
    previousTaskItemId: string;
}): Promise<{ ok: true } | { ok: false; reason: string; error?: unknown }> {
    try {
        const treeInfos = await getBlockTreeInfos([params.targetListId, params.previousTaskItemId]);
        const targetListInfo = treeInfos?.[params.targetListId];
        const previousInfo = treeInfos?.[params.previousTaskItemId];
        return validateTaskListTreeShape({
            docId: params.docId,
            targetListId: params.targetListId,
            targetListType: targetListInfo?.type,
            targetListParentId: targetListInfo?.parentID,
            targetListParentType: targetListInfo?.parentType,
            previousTaskItemId: params.previousTaskItemId,
            previousType: previousInfo?.type,
            previousParentId: previousInfo?.parentID,
            previousParentType: previousInfo?.parentType,
        });
    } catch (error) {
        return { ok: false, reason: "target_structure_read_failed", error };
    }
}

export async function resolveDayWorkspaceTaskMoveTarget(params: {
    docId: string;
    headingStructure?: EnhancedDiaryHeadingStructureConfig;
    mapping?: EnhancedDiaryTemplateFieldMapping | null;
}): Promise<EnhancedDiaryTaskMoveTarget> {
    let lookup: EnhancedDiaryHeadingBlockLookup;
    try {
        lookup = await findDayWorkspaceHeadingBlock(params.docId, "migratedTasks", params.headingStructure, params.mapping);
    } catch {
        return { ok: false, reason: "structure_read_failed" };
    }
    if (!lookup.found || !lookup.heading) {
        return {
            ok: false,
            reason: "missing_heading",
            path: lookup.path,
        };
    }

    let children: IResGetChildBlock[];
    try {
        children = await getChildBlocksChecked(params.docId);
    } catch {
        return { ok: false, reason: "structure_read_failed", headingId: lookup.heading.id, path: lookup.path };
    }
    const headingIndex = children.findIndex((block) => block.id === lookup.heading?.id);
    if (headingIndex < 0) {
        return { ok: false, reason: "heading_block_not_found", headingId: lookup.heading.id, path: lookup.path };
    }

    let boundaryIndex = children.length;
    for (let index = headingIndex + 1; index < children.length; index += 1) {
        const heading = blockToHeadingBlock(children[index], index);
        if (heading && heading.level <= lookup.heading.level) {
            boundaryIndex = index;
            break;
        }
    }
    const sectionTopLevelBlocks = children.slice(headingIndex + 1, boundaryIndex);
    const lastBlock = sectionTopLevelBlocks[sectionTopLevelBlocks.length - 1];
    let candidateListChildren: IResGetChildBlock[] = [];
    if (lastBlock && isEnhancedDiaryListContainerType(lastBlock.type)) {
        try {
            candidateListChildren = await getChildBlocksChecked(lastBlock.id);
        } catch {
            return { ok: false, reason: "target_structure_read_failed", headingId: lookup.heading.id, path: lookup.path };
        }
        const needsMarkdownFallback = candidateListChildren.some((child) =>
            isEnhancedDiaryTaskListItemType(child.type) &&
            !String(child.subtype || child.subType || "").trim() &&
            !child.markdown && !child.content
        );
        if (needsMarkdownFallback) {
            try {
                const kramdowns = await getBlockKramdowns(candidateListChildren.map((child) => child.id));
                candidateListChildren = candidateListChildren.map((child) => ({
                    ...child,
                    markdown: child.markdown || child.content || kramdowns?.[child.id],
                }));
            } catch {
                return { ok: false, reason: "target_structure_read_failed", headingId: lookup.heading.id, path: lookup.path };
            }
        }
    }

    const candidate = resolveTaskListTailCandidate(sectionTopLevelBlocks, candidateListChildren);
    if (candidate.kind === "existing") {
        const targetValidation = await validateResolvedTaskListTarget({
            docId: params.docId,
            targetListId: candidate.targetListId,
            previousTaskItemId: candidate.previousTaskItemId,
        });
        if (targetValidation.ok === false) {
            return {
                ok: false,
                reason: targetValidation.reason,
                error: targetValidation.error,
                headingId: lookup.heading.id,
                path: lookup.path,
            };
        }
        return {
            ok: true,
            targetListId: candidate.targetListId,
            previousTaskItemId: candidate.previousTaskItemId,
            headingId: lookup.heading.id,
            path: lookup.path,
        };
    }

    const placeholderMarkdown = createTaskMovePlaceholderMarkdown();
    let inserted: EnhancedDiaryInsertResult;
    try {
        inserted = await appendMarkdownToDaySection({
            docId: params.docId,
            sectionKey: "migratedTasks",
            markdown: placeholderMarkdown,
            headingStructure: params.headingStructure,
            mapping: params.mapping,
        });
    } catch {
        return { ok: false, reason: "placeholder_insert_failed", headingId: lookup.heading.id, path: lookup.path };
    }
    if (!inserted.ok) {
        return {
            ok: false,
            reason: inserted.reason || "placeholder_insert_failed",
            headingId: lookup.heading.id,
            path: lookup.path,
        };
    }

    const operationIds = Array.from(new Set([
        ...(inserted.blockIds || []),
        ...(inserted.blockId ? [inserted.blockId] : []),
    ].filter(Boolean)));
    const placeholderTaskItemId = await locateInsertedBlock({
        operationIds,
        rootId: params.docId,
        nodeType: "NodeListItem",
        expectedMarkdown: placeholderMarkdown,
    });
    if (!placeholderTaskItemId) {
        await cleanupUnlocatedTaskMovePlaceholder(operationIds, params.docId, placeholderMarkdown);
        return { ok: false, reason: "placeholder_not_found", headingId: lookup.heading.id, path: lookup.path };
    }

    try {
        const treeInfos = await getBlockTreeInfos([placeholderTaskItemId]);
        const placeholderInfo = treeInfos?.[placeholderTaskItemId];
        const parentID = placeholderInfo?.parentID;
        if (!isEnhancedDiaryTaskListItemType(placeholderInfo?.type) ||
            !parentID || !isEnhancedDiaryListContainerType(placeholderInfo?.parentType)) {
            return {
                ok: false,
                reason: "target_structure_invalid",
                targetListId: parentID,
                placeholderTaskItemId,
                headingId: lookup.heading.id,
                path: lookup.path,
            };
        }
        const targetValidation = await validateResolvedTaskListTarget({
            docId: params.docId,
            targetListId: parentID,
            previousTaskItemId: placeholderTaskItemId,
        });
        if (targetValidation.ok === false) {
            return {
                ok: false,
                reason: targetValidation.reason,
                error: targetValidation.error,
                targetListId: parentID,
                placeholderTaskItemId,
                headingId: lookup.heading.id,
                path: lookup.path,
            };
        }
        return {
            ok: true,
            targetListId: parentID,
            previousTaskItemId: placeholderTaskItemId,
            placeholderTaskItemId,
            headingId: lookup.heading.id,
            path: lookup.path,
        };
    } catch {
        return {
            ok: false,
            reason: "target_structure_invalid",
            placeholderTaskItemId,
            headingId: lookup.heading.id,
            path: lookup.path,
        };
    }
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
        const categoryMarkdown = `${"#".repeat(categoryLevel)} ${normalizedTitle}\n\n${recordHash} ${params.recordTime}\n\n${params.content}`;

        try {
            const operations = nextBoundary
                ? await insertBlockChecked("markdown", categoryMarkdown, nextBoundary.id)
                : await appendBlockChecked("markdown", categoryMarkdown, params.docId);
            const blockIds = extractOperationBlockIds(operations);
            return { ok: true, blockId: blockIds[0], blockIds, path: [...quickRecords.path, normalizedTitle] };
        } catch (err) {
            console.warn("[enhancedDiaryBlockLocator] insert category failed", err);
            return { ok: false, reason: "insert_failed", path: [...quickRecords.path, normalizedTitle] };
        }
    }

    // Compute record level from actual found category level
    const recordLevel = (category.level + 1) as EnhancedDiaryHeadingLevel;
    const recordHash = "#".repeat(recordLevel);
    const recordMarkdown = `${recordHash} ${params.recordTime}\n\n${params.content}`;

    return insertMarkdownAtHeadingEnd(params.docId, {
        found: true,
        heading: category,
        headings: quickRecords.headings,
        path: [...quickRecords.path, normalizedTitle],
    }, recordMarkdown);
}
