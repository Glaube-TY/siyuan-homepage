import {
    batchGetBlockAttrs,
    getBlockKramdownChecked,
    getChildBlocksChecked,
    moveBlockChecked,
    setBlockAttrsChecked,
    updateBlockChecked,
} from "@/api";
import type { EnhancedDiaryProjectStorageConfig } from "../enhancedDiaryTypes";
import {
    isEnhancedDiaryProjectDescendant,
    isEnhancedDiaryProjectEffectivelyActive,
    readEnhancedDiaryProjectIndex,
    rebuildEnhancedDiaryProjectIndex,
    resolveEnhancedDiaryProjectTarget,
} from "../enhancedDiaryProjectIndex";
import {
    hasEnhancedDiaryProjectNodeAttrs,
    parseEnhancedDiaryBatchBlockAttrs,
    ENHANCED_DIARY_PROJECT_ARCHIVED_AT_ATTR,
    ENHANCED_DIARY_PROJECT_NODE_ATTR,
    ENHANCED_DIARY_PROJECT_STATUS_ATTR,
    type EnhancedDiaryProjectIndexPayload,
    type EnhancedDiaryProjectNode,
    type EnhancedDiaryProjectTarget,
} from "../enhancedDiaryProjectTypes";
import { getEnhancedDiaryHeadingLevel } from "../enhancedDiaryMarkdownSections";

export type EnhancedDiarySubprojectMoveResult =
    | { status: "success"; sourceTargetId: string; destinationParentTargetId: string }
    | { status: "blocked"; message: string }
    | { status: "partial"; message: string };

interface HeadingSnapshot {
    id: string;
    originalLevel: number;
    expectedLevel: number;
    originalMarkdown: string;
    updatedMarkdown: string;
    mutableAttrs: Record<string, string>;
}

interface ProjectMoveSnapshot {
    rootProjectId: string;
    originalBlockIds: string[];
    sourceBlockIds: string[];
    headings: HeadingSnapshot[];
    originalParentTargetId: string;
    originalPreviousId?: string;
    originalNextId?: string;
}

interface PreparedMove {
    source: EnhancedDiaryProjectNode;
    sourceTarget: EnhancedDiaryProjectTarget;
    destination: EnhancedDiaryProjectTarget;
    snapshot: ProjectMoveSnapshot;
    destinationAnchorId?: string;
    movedProjectIds: string[];
    descendantParentIds: Record<string, string>;
    descendantPathSuffixes: Record<string, string[]>;
    descendantAncestorSuffixes: Record<string, string[]>;
}

const PARTIAL_MESSAGE = "项目内容仍保留，但结构调整未完整完成，请打开项目文档检查。";

function blocked(message: string): EnhancedDiarySubprojectMoveResult {
    return { status: "blocked", message };
}

function replaceHeadingLevel(markdown: string, level: number): string {
    const match = /^(#{1,6})([ \t]+)/.exec(markdown);
    if (!match) throw new Error("项目范围内存在无法安全识别 Markdown 标记的标题，已停止调整。");
    return `${"#".repeat(level)}${markdown.slice(match[1].length)}`;
}

function mutableHeadingAttrs(attrs: Record<string, string> | undefined): Record<string, string> {
    if (!attrs) return {};
    return Object.fromEntries(Object.entries(attrs).filter(([name]) => name !== "id" && name !== "updated"));
}

async function restoreHeadingAttrs(heading: HeadingSnapshot): Promise<void> {
    if (Object.keys(heading.mutableAttrs).length > 0) {
        await setBlockAttrsChecked(heading.id, heading.mutableAttrs);
    }
}

function findRangeEnd(blocks: IResGetChildBlock[], start: number, level: number): number {
    for (let index = start + 1; index < blocks.length; index += 1) {
        const nextLevel = blocks[index].type === "h" ? getEnhancedDiaryHeadingLevel(blocks[index]) : null;
        if (nextLevel && nextLevel <= level) return index;
    }
    return blocks.length;
}

async function readHeadingMarkdown(block: IResGetChildBlock): Promise<string> {
    const response = await getBlockKramdownChecked(block.id);
    const markdown = String(response?.kramdown || "").replace(/\r?\n\{:[^\r\n]*\}\s*$/, "");
    if (!markdown) throw new Error(`无法读取标题块 ${block.id} 的原始 Markdown，已停止调整。`);
    return markdown;
}

async function prepareMove(
    storage: EnhancedDiaryProjectStorageConfig,
    sourceTargetId: string,
    destinationParentTargetId: string,
): Promise<PreparedMove> {
    const rebuild = await rebuildEnhancedDiaryProjectIndex(storage);
    if (rebuild.lastStatus !== "success") {
        throw new Error(rebuild.lastMessage || "移动前无法刷新完整项目索引，已停止调整。");
    }
    const index = await readEnhancedDiaryProjectIndex(storage);
    if (!index.complete) throw new Error("项目索引尚未完整，已停止调整。");

    const source = index.nodes[sourceTargetId];
    const sourceTarget = resolveEnhancedDiaryProjectTarget(index, sourceTargetId);
    const destination = resolveEnhancedDiaryProjectTarget(index, destinationParentTargetId);
    if (!source || !sourceTarget || sourceTarget.kind !== "node") throw new Error("源项目不是有效子项目，已停止调整。");
    if (!destination) throw new Error("新的上级项目已失效，已停止调整。");
    if (source.rootProjectId !== destination.rootProjectId) throw new Error("本轮只支持在同一顶级项目文档内调整归属。");
    if (!isEnhancedDiaryProjectEffectivelyActive(index, source.id)) throw new Error("归档项目或归档分支不能调整归属。");
    if (!isEnhancedDiaryProjectEffectivelyActive(index, destination.id)) throw new Error("不能移动到归档项目或归档分支。");
    if (isEnhancedDiaryProjectDescendant(index, destination.id, source.id)) {
        throw new Error("不能将项目移动到自己或自己的后代项目下。");
    }
    if (source.parentTargetId === destination.id) throw new Error("所选项目已经是当前直接上级，请选择其他项目。");

    const blocks = await getChildBlocksChecked(source.rootProjectId);
    const sourceIndex = blocks.findIndex((block) => block.id === source.id && block.type === "h");
    if (sourceIndex < 0) throw new Error("源项目标题已不存在，已停止调整。");
    const sourceLevel = getEnhancedDiaryHeadingLevel(blocks[sourceIndex]);
    if (!sourceLevel || sourceLevel !== source.level) throw new Error("源项目标题层级与最新索引不一致，已停止调整。");

    let destinationLevel = 0;
    if (destination.kind === "node") {
        const destinationHeading = blocks.find((block) => block.id === destination.id && block.type === "h");
        destinationLevel = destinationHeading ? getEnhancedDiaryHeadingLevel(destinationHeading) || 0 : 0;
        if (!destinationLevel || destinationLevel !== index.nodes[destination.id]?.level) {
            throw new Error("新的上级项目标题已失效，已停止调整。");
        }
    }

    const sourceEnd = findRangeEnd(blocks, sourceIndex, sourceLevel);
    const sourceBlocks = blocks.slice(sourceIndex, sourceEnd);
    const sourceBlockIds = sourceBlocks.map((block) => String(block.id));
    const sourceIdSet = new Set(sourceBlockIds);
    const descendants = Object.values(index.nodes).filter((node) =>
        node.rootProjectId === source.rootProjectId && node.ancestorTargetIds.includes(source.id));
    const movedProjectIds = [source.id, ...descendants.map((node) => node.id)];
    if (movedProjectIds.some((id) => !sourceIdSet.has(id))) {
        throw new Error("项目索引中的后代节点不在源项目完整范围内，已停止调整。");
    }

    const projectAttrs = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs([
        ...movedProjectIds,
        ...(destination.kind === "node" ? [destination.id] : []),
    ]));
    if (movedProjectIds.some((id) => !hasEnhancedDiaryProjectNodeAttrs(projectAttrs[id]))) {
        throw new Error("源项目或后代项目的节点属性已失效，已停止调整。");
    }
    if (destination.kind === "node" && !hasEnhancedDiaryProjectNodeAttrs(projectAttrs[destination.id])) {
        throw new Error("新的上级项目节点属性已失效，已停止调整。");
    }

    const newSourceLevel = destination.kind === "root" ? 1 : destinationLevel + 1;
    const delta = newSourceLevel - sourceLevel;
    const headingBlocks = sourceBlocks.filter((block) => block.type === "h");
    const headingAttrs = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(
        headingBlocks.map((heading) => String(heading.id)),
    ));
    const headings: HeadingSnapshot[] = [];
    for (const heading of headingBlocks) {
        const originalLevel = getEnhancedDiaryHeadingLevel(heading);
        if (!originalLevel) throw new Error(`项目范围内标题 ${heading.id} 的层级无效，已停止调整。`);
        const expectedLevel = originalLevel + delta;
        if (expectedLevel < 1 || expectedLevel > 6) {
            throw new Error("调整后项目范围内存在低于 H1 或超过 H6 的标题，已停止调整。");
        }
        const originalMarkdown = await readHeadingMarkdown(heading);
        headings.push({
            id: String(heading.id),
            originalLevel,
            expectedLevel,
            originalMarkdown,
            updatedMarkdown: replaceHeadingLevel(originalMarkdown, expectedLevel),
            mutableAttrs: mutableHeadingAttrs(headingAttrs[heading.id]),
        });
    }

    const remainingBlocks = blocks.filter((block) => !sourceIdSet.has(block.id));
    let destinationAnchorId: string | undefined;
    if (destination.kind === "root") {
        destinationAnchorId = remainingBlocks[remainingBlocks.length - 1]?.id;
    } else {
        const destinationIndex = remainingBlocks.findIndex((block) => block.id === destination.id);
        if (destinationIndex < 0) throw new Error("新的上级项目标题已不存在，已停止调整。");
        const destinationEnd = findRangeEnd(remainingBlocks, destinationIndex, destinationLevel);
        destinationAnchorId = remainingBlocks[destinationEnd - 1]?.id;
    }

    const descendantParentIds = Object.fromEntries(descendants.map((node) => [node.id, node.parentTargetId]));
    const descendantPathSuffixes = Object.fromEntries(descendants.map((node) => {
        const target = resolveEnhancedDiaryProjectTarget(index, node.id);
        return [node.id, target?.pathTitles.slice(sourceTarget.pathTitles.length) || []];
    }));
    const descendantAncestorSuffixes = Object.fromEntries(descendants.map((node) => {
        const sourceAncestorIndex = node.ancestorTargetIds.indexOf(source.id);
        return [node.id, sourceAncestorIndex >= 0 ? node.ancestorTargetIds.slice(sourceAncestorIndex + 1) : []];
    }));
    return {
        source,
        sourceTarget,
        destination,
        destinationAnchorId,
        movedProjectIds,
        descendantParentIds,
        descendantPathSuffixes,
        descendantAncestorSuffixes,
        snapshot: {
            rootProjectId: source.rootProjectId,
            originalBlockIds: blocks.map((block) => String(block.id)),
            sourceBlockIds,
            headings,
            originalParentTargetId: source.parentTargetId,
            originalPreviousId: blocks[sourceIndex - 1]?.id,
            originalNextId: blocks[sourceEnd]?.id,
        },
    };
}

async function moveBlocksInOrder(rootProjectId: string, blockIds: string[], initialAnchorId?: string): Promise<void> {
    let previousId = initialAnchorId;
    for (const id of blockIds) {
        await moveBlockChecked(id, previousId, previousId ? undefined : rootProjectId);
        previousId = id;
    }
}

async function restoreSnapshot(snapshot: ProjectMoveSnapshot): Promise<boolean> {
    const errors: unknown[] = [];
    for (const heading of snapshot.headings) {
        try {
            await updateBlockChecked("markdown", heading.originalMarkdown, heading.id);
            await restoreHeadingAttrs(heading);
        } catch (error) {
            errors.push(error);
        }
    }
    try {
        await moveBlocksInOrder(snapshot.rootProjectId, snapshot.originalBlockIds);
    } catch (error) {
        errors.push(error);
    }
    if (errors.length) {
        console.error("[enhancedDiaryWorkspaceProjectMove] restore failed", errors);
        return false;
    }
    try {
        const restored = await getChildBlocksChecked(snapshot.rootProjectId);
        const restoredIds = restored.map((block) => String(block.id));
        if (restoredIds.length !== snapshot.originalBlockIds.length ||
            restoredIds.some((id, index) => id !== snapshot.originalBlockIds[index])) return false;
        const sourceStart = restoredIds.indexOf(snapshot.sourceBlockIds[0]);
        if (snapshot.originalPreviousId && restoredIds[sourceStart - 1] !== snapshot.originalPreviousId) return false;
        if (snapshot.originalNextId && restoredIds[sourceStart + snapshot.sourceBlockIds.length] !== snapshot.originalNextId) return false;
        for (const heading of snapshot.headings) {
            if ((await readHeadingMarkdown({ id: heading.id } as IResGetChildBlock)) !== heading.originalMarkdown) return false;
        }
        const restoredAttrs = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(
            snapshot.headings.map((heading) => heading.id),
        ));
        for (const heading of snapshot.headings) {
            if (Object.entries(heading.mutableAttrs).some(([name, value]) => restoredAttrs[heading.id]?.[name] !== value)) {
                return false;
            }
        }
        return true;
    } catch {
        return false;
    }
}

async function restoreAndVerifyOriginalStructure(
    storage: EnhancedDiaryProjectStorageConfig,
    prepared: PreparedMove,
): Promise<boolean> {
    if (!await restoreSnapshot(prepared.snapshot)) return false;
    const rebuild = await rebuildEnhancedDiaryProjectIndex(storage);
    if (rebuild.lastStatus !== "success") return false;
    const rebuilt = await readEnhancedDiaryProjectIndex(storage);
    const source = rebuilt.nodes[prepared.source.id];
    if (!source || source.rootProjectId !== prepared.source.rootProjectId ||
        source.parentTargetId !== prepared.snapshot.originalParentTargetId) return false;
    return prepared.movedProjectIds.slice(1).every((id) =>
        rebuilt.nodes[id]?.parentTargetId === prepared.descendantParentIds[id]);
}

async function repairInterruptedProjectMetadata(
    storage: EnhancedDiaryProjectStorageConfig,
    sourceTargetId: string,
): Promise<{ currentParentTargetId: string } | null> {
    const previousIndex = await readEnhancedDiaryProjectIndex(storage);
    const previousSource = previousIndex.nodes[sourceTargetId];
    if (!previousSource) return null;
    const blocks = await getChildBlocksChecked(previousSource.rootProjectId);
    const sourceIndex = blocks.findIndex((block) => block.id === sourceTargetId && block.type === "h");
    if (sourceIndex < 0) return null;
    const currentSourceLevel = getEnhancedDiaryHeadingLevel(blocks[sourceIndex]);
    if (!currentSourceLevel) return null;
    const delta = currentSourceLevel - previousSource.level;
    // 旧版本只会在层级确实发生变化时丢失标题属性；delta=0 不进行推断修复。
    if (delta === 0) return null;

    const previousDescendants = Object.values(previousIndex.nodes).filter((node) =>
        node.rootProjectId === previousSource.rootProjectId && node.ancestorTargetIds.includes(sourceTargetId));
    const previousMovedNodes = [previousSource, ...previousDescendants];
    const sourceEnd = findRangeEnd(blocks, sourceIndex, currentSourceLevel);
    const sourceRange = blocks.slice(sourceIndex, sourceEnd);
    const sourceRangeIds = new Set(sourceRange.map((block) => String(block.id)));
    if (previousMovedNodes.some((node) => !sourceRangeIds.has(node.id))) return null;
    for (const node of previousMovedNodes) {
        const block = sourceRange.find((item) => item.id === node.id && item.type === "h");
        const level = block ? getEnhancedDiaryHeadingLevel(block) : null;
        if (!level || level !== node.level + delta || level < 1 || level > 6) return null;
    }

    const attrs = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(
        previousMovedNodes.map((node) => node.id),
    ));
    if (hasEnhancedDiaryProjectNodeAttrs(attrs[sourceTargetId])) return null;

    for (const node of previousMovedNodes) {
        if (hasEnhancedDiaryProjectNodeAttrs(attrs[node.id])) continue;
        const restoredAttrs: Record<string, string> = {
            [ENHANCED_DIARY_PROJECT_NODE_ATTR]: "true",
        };
        if (node.status === "archived") {
            restoredAttrs[ENHANCED_DIARY_PROJECT_STATUS_ATTR] = "archived";
            restoredAttrs[ENHANCED_DIARY_PROJECT_ARCHIVED_AT_ATTR] = node.archivedAt;
        }
        await setBlockAttrsChecked(node.id, restoredAttrs);
    }

    const verifiedAttrs = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(
        previousMovedNodes.map((node) => node.id),
    ));
    if (previousMovedNodes.some((node) => !hasEnhancedDiaryProjectNodeAttrs(verifiedAttrs[node.id]))) {
        throw new Error("中断项目的节点属性恢复后校验失败。");
    }
    const rebuild = await rebuildEnhancedDiaryProjectIndex(storage);
    if (rebuild.lastStatus !== "success") {
        throw new Error(rebuild.lastMessage || "中断项目恢复后索引重建失败。");
    }
    const rebuilt = await readEnhancedDiaryProjectIndex(storage);
    const currentSource = rebuilt.nodes[sourceTargetId];
    if (!currentSource || currentSource.rootProjectId !== previousSource.rootProjectId) {
        throw new Error("中断项目恢复后索引仍未识别源项目。");
    }
    for (const descendant of previousDescendants) {
        const current = rebuilt.nodes[descendant.id];
        if (!current || current.rootProjectId !== previousSource.rootProjectId ||
            current.parentTargetId !== descendant.parentTargetId) {
            throw new Error("中断项目恢复后，后代项目关系校验失败。");
        }
    }
    return { currentParentTargetId: currentSource.parentTargetId };
}

async function verifyMovedDocument(prepared: PreparedMove): Promise<void> {
    const { snapshot, destination, movedProjectIds } = prepared;
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            const blocks = await getChildBlocksChecked(snapshot.rootProjectId);
            const blockIds = blocks.map((block) => String(block.id));
            if (blockIds.length !== snapshot.originalBlockIds.length ||
                snapshot.originalBlockIds.some((id) => !blockIds.includes(id))) {
                throw new Error("移动后项目文档块数量或块 ID 不一致。");
            }
            const sourceStart = blockIds.indexOf(snapshot.sourceBlockIds[0]);
            if (sourceStart < 0 || snapshot.sourceBlockIds.some((id, index) => blockIds[sourceStart + index] !== id)) {
                throw new Error("移动后源项目范围不连续或块顺序发生变化。");
            }
            if (destination.kind === "root") {
                if (sourceStart + snapshot.sourceBlockIds.length !== blocks.length) {
                    throw new Error("源项目范围没有移动到顶级项目文档末尾。");
                }
            } else {
                const destinationIndex = blockIds.indexOf(destination.id);
                const destinationLevel = getEnhancedDiaryHeadingLevel(blocks[destinationIndex]);
                if (destinationIndex < 0 || !destinationLevel) throw new Error("移动后无法定位新的上级项目。");
                const destinationEnd = findRangeEnd(blocks, destinationIndex, destinationLevel);
                if (sourceStart <= destinationIndex || sourceStart + snapshot.sourceBlockIds.length !== destinationEnd) {
                    throw new Error("源项目范围没有连续位于新上级项目范围末尾。");
                }
            }
            for (const heading of snapshot.headings) {
                const current = blocks.find((block) => block.id === heading.id);
                if (!current || getEnhancedDiaryHeadingLevel(current) !== heading.expectedLevel) {
                    throw new Error(`标题块 ${heading.id} 的层级未按预期更新。`);
                }
                if (await readHeadingMarkdown(current) !== heading.updatedMarkdown) {
                    throw new Error(`标题块 ${heading.id} 的原始内容未被完整保留。`);
                }
            }
            const attrs = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(
                snapshot.headings.map((heading) => heading.id),
            ));
            for (const heading of snapshot.headings) {
                if (Object.entries(heading.mutableAttrs).some(([name, value]) => attrs[heading.id]?.[name] !== value)) {
                    throw new Error(`标题块 ${heading.id} 的原始属性未被完整保留。`);
                }
            }
            if (movedProjectIds.some((id) => !hasEnhancedDiaryProjectNodeAttrs(attrs[id]))) {
                throw new Error("移动后源项目或后代项目的节点属性丢失。");
            }
            return;
        } catch (error) {
            lastError = error;
            if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 120));
        }
    }
    throw lastError instanceof Error ? lastError : new Error("移动后项目文档验证失败。");
}

function samePath(actual: string[], expected: string[]): boolean {
    return actual.length === expected.length && actual.every((title, index) => title === expected[index]);
}

function verifyRebuiltIndex(prepared: PreparedMove, rebuilt: EnhancedDiaryProjectIndexPayload): void {
    const source = rebuilt.nodes[prepared.source.id];
    const expectedSourceAncestors = [...prepared.destination.ancestorTargetIds, prepared.destination.id];
    if (!source || source.rootProjectId !== prepared.source.rootProjectId ||
        source.parentTargetId !== prepared.destination.id ||
        !samePath(source.ancestorTargetIds, expectedSourceAncestors)) {
        throw new Error("项目索引未识别新的上级项目关系。");
    }
    const sourceTarget = resolveEnhancedDiaryProjectTarget(rebuilt, source.id);
    const expectedSourcePath = [...prepared.destination.pathTitles, prepared.source.title];
    if (!sourceTarget || !samePath(sourceTarget.pathTitles, expectedSourcePath)) {
        throw new Error("项目索引中的源项目路径未正确更新。");
    }
    for (const id of prepared.movedProjectIds.slice(1)) {
        const node = rebuilt.nodes[id];
        const expectedAncestors = [
            ...expectedSourceAncestors,
            prepared.source.id,
            ...(prepared.descendantAncestorSuffixes[id] || []),
        ];
        if (!node || node.rootProjectId !== prepared.source.rootProjectId ||
            node.parentTargetId !== prepared.descendantParentIds[id] ||
            !samePath(node.ancestorTargetIds, expectedAncestors)) {
            throw new Error("项目索引中的后代项目 ID 或相对父子关系发生变化。");
        }
        const target = resolveEnhancedDiaryProjectTarget(rebuilt, id);
        const expectedPath = [...expectedSourcePath, ...(prepared.descendantPathSuffixes[id] || [])];
        if (!target || !samePath(target.pathTitles, expectedPath)) {
            throw new Error("项目索引中的后代项目路径未正确更新。");
        }
    }
}

export async function moveEnhancedDiarySubproject(params: {
    storage: EnhancedDiaryProjectStorageConfig;
    sourceTargetId: string;
    destinationParentTargetId: string;
}): Promise<EnhancedDiarySubprojectMoveResult> {
    try {
        const repaired = await repairInterruptedProjectMetadata(params.storage, params.sourceTargetId);
        if (repaired?.currentParentTargetId === params.destinationParentTargetId) {
            return {
                status: "success",
                sourceTargetId: params.sourceTargetId,
                destinationParentTargetId: params.destinationParentTargetId,
            };
        }
    } catch (error) {
        console.error("[enhancedDiaryWorkspaceProjectMove] interrupted move repair failed", error);
        return { status: "partial", message: PARTIAL_MESSAGE };
    }

    let prepared: PreparedMove;
    try {
        prepared = await prepareMove(params.storage, params.sourceTargetId, params.destinationParentTargetId);
    } catch (error) {
        return blocked(error instanceof Error ? error.message : "项目结构无法安全确认，已停止调整。");
    }

    try {
        for (const heading of prepared.snapshot.headings) {
            if (heading.updatedMarkdown !== heading.originalMarkdown) {
                await updateBlockChecked("markdown", heading.updatedMarkdown, heading.id);
                await restoreHeadingAttrs(heading);
            }
        }
        await moveBlocksInOrder(
            prepared.snapshot.rootProjectId,
            prepared.snapshot.sourceBlockIds,
            prepared.destinationAnchorId,
        );
    } catch (error) {
        console.warn("[enhancedDiaryWorkspaceProjectMove] move failed, restoring snapshot", error);
        const restored = await restoreSnapshot(prepared.snapshot);
        return restored
            ? blocked("项目归属调整未完成，原始文档结构已经恢复，请稍后重试。")
            : { status: "partial", message: PARTIAL_MESSAGE };
    }

    try {
        await verifyMovedDocument(prepared);
    } catch (error) {
        console.error("[enhancedDiaryWorkspaceProjectMove] document verification failed, restoring snapshot", error);
        const restored = await restoreAndVerifyOriginalStructure(params.storage, prepared);
        return restored
            ? blocked("项目归属调整未完成，原始文档结构已经恢复，请稍后重试。")
            : { status: "partial", message: PARTIAL_MESSAGE };
    }

    try {
        const rebuild = await rebuildEnhancedDiaryProjectIndex(params.storage);
        if (rebuild.lastStatus !== "success") throw new Error(rebuild.lastMessage || "项目索引重建失败。");
        const rebuilt = await readEnhancedDiaryProjectIndex(params.storage);
        verifyRebuiltIndex(prepared, rebuilt);
    } catch (error) {
        console.error("[enhancedDiaryWorkspaceProjectMove] post-move verification failed", error);
        return { status: "partial", message: PARTIAL_MESSAGE };
    }

    return {
        status: "success",
        sourceTargetId: prepared.source.id,
        destinationParentTargetId: prepared.destination.id,
    };
}
