import {
    appendBlockChecked,
    batchGetBlockAttrs,
    getChildBlocksChecked,
    insertBlockChecked,
    performTransactionsChecked,
} from "@/api";
import type { EnhancedDiaryProjectStorageConfig } from "../enhancedDiaryTypes";
import {
    hasEnhancedDiaryProjectNodeAttrs,
    parseEnhancedDiaryBatchBlockAttrs,
} from "../enhancedDiaryProjectTypes";
import {
    readEnhancedDiaryProjectIndex,
    resolveEnhancedDiaryProjectTarget,
} from "../enhancedDiaryProjectIndex";
import {
    getEnhancedDiaryHeadingLevel,
    getEnhancedDiaryHeadingTitle,
} from "../enhancedDiaryMarkdownSections";

export type EnhancedDiaryProjectContentField =
    | "项目概览"
    | "项目目标"
    | "当前重点"
    | "阶段总结"
    | "最终总结";

export interface EnhancedDiaryProjectOverviewSnapshot {
    overview: string;
    goal: string;
    focus: string;
}

export type EnhancedDiaryProjectContentSaveResult =
    | { status: "success" }
    | { status: "partial"; reason: "cleanup_failed" };

const CURRENT_FIELDS = new Set<EnhancedDiaryProjectContentField>(["项目概览", "项目目标", "当前重点", "最终总结"]);

interface HeadingBlock {
    id: string;
    index: number;
    level: number;
    title: string;
    isProjectNode: boolean;
}

async function loadStructure(rootProjectId: string): Promise<{ blocks: IResGetChildBlock[]; headings: HeadingBlock[] }> {
    const blocks = await getChildBlocksChecked(rootProjectId);
    const headingIds = blocks.filter((block) => block.type === "h").map((block) => block.id);
    const attrsById = headingIds.length
        ? parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(headingIds))
        : {};
    const headings = blocks.map((block, index) => ({
        id: block.id, index, level: getEnhancedDiaryHeadingLevel(block) || 0,
        title: getEnhancedDiaryHeadingTitle(block), isProjectNode: hasEnhancedDiaryProjectNodeAttrs(attrsById[block.id]),
    })).filter((heading) => heading.level > 0);
    return { blocks, headings };
}

function targetScope(
    headings: HeadingBlock[],
    rootProjectId: string,
    targetId: string,
): { start: number; end: number; targetLevel: number } {
    if (targetId === rootProjectId) return { start: -1, end: Number.MAX_SAFE_INTEGER, targetLevel: 0 };
    const headingIndex = headings.findIndex((heading) => heading.id === targetId);
    if (headingIndex < 0) throw new Error("项目节点标题已失效。");
    const target = headings[headingIndex];
    const boundary = headings.slice(headingIndex + 1).find((heading) => heading.level <= target.level);
    return { start: target.index, end: boundary?.index ?? Number.MAX_SAFE_INTEGER, targetLevel: target.level };
}

function findFieldHeading(
    headings: HeadingBlock[],
    scope: { start: number; end: number; targetLevel: number },
    field: EnhancedDiaryProjectContentField,
): HeadingBlock | undefined {
    const expectedLevel = scope.targetLevel + 1;
    return headings.find((heading) => heading.index > scope.start && heading.index < scope.end &&
        heading.level === expectedLevel && heading.title === field && !heading.isProjectNode);
}

function nextBoundaryBlockId(headings: HeadingBlock[], scope: { end: number }): string | undefined {
    return headings.find((heading) => heading.index === scope.end)?.id;
}

function projectContentInsertionBoundaryId(
    headings: HeadingBlock[],
    scope: { start: number; end: number; targetLevel: number },
): string | undefined {
    const directChildLevel = scope.targetLevel + 1;
    return headings.find((heading) => heading.index > scope.start && heading.index < scope.end &&
        heading.level === directChildLevel && heading.isProjectNode)?.id;
}

function readFieldContent(
    blocks: IResGetChildBlock[],
    headings: HeadingBlock[],
    scope: { start: number; end: number; targetLevel: number },
    field: EnhancedDiaryProjectContentField,
): string {
    const fieldHeading = findFieldHeading(headings, scope, field);
    if (!fieldHeading) return "";
    const next = headings.find((heading) => heading.index > fieldHeading.index && heading.level <= fieldHeading.level);
    const end = next?.index ?? blocks.length;
    return blocks.slice(fieldHeading.index + 1, end).map((block) => String(block.markdown || "")).join("\n\n").trim();
}

async function insertProjectContent(
    rootProjectId: string,
    headings: HeadingBlock[],
    scope: { start: number; end: number; targetLevel: number },
    markdown: string,
): Promise<void> {
    const boundaryId = projectContentInsertionBoundaryId(headings, scope) || nextBoundaryBlockId(headings, scope);
    if (boundaryId) await insertBlockChecked("markdown", markdown, boundaryId);
    else await appendBlockChecked("markdown", markdown, rootProjectId);
}

export async function loadEnhancedDiaryProjectContent(params: {
    storage: EnhancedDiaryProjectStorageConfig;
    targetId: string;
    field: EnhancedDiaryProjectContentField;
}): Promise<string> {
    const index = await readEnhancedDiaryProjectIndex(params.storage);
    const target = resolveEnhancedDiaryProjectTarget(index, params.targetId);
    if (!target) throw new Error("项目目标已失效。");
    const { blocks, headings } = await loadStructure(target.rootProjectId);
    const scope = targetScope(headings, target.rootProjectId, target.id);
    return readFieldContent(blocks, headings, scope, params.field);
}

export async function loadEnhancedDiaryProjectOverviewSnapshot(params: {
    storage: EnhancedDiaryProjectStorageConfig;
    targetId: string;
}): Promise<EnhancedDiaryProjectOverviewSnapshot> {
    const index = await readEnhancedDiaryProjectIndex(params.storage);
    const target = resolveEnhancedDiaryProjectTarget(index, params.targetId);
    if (!target) throw new Error("项目目标已失效。");
    const { blocks, headings } = await loadStructure(target.rootProjectId);
    const scope = targetScope(headings, target.rootProjectId, target.id);
    return {
        overview: readFieldContent(blocks, headings, scope, "项目概览"),
        goal: readFieldContent(blocks, headings, scope, "项目目标"),
        focus: readFieldContent(blocks, headings, scope, "当前重点"),
    };
}

export async function saveEnhancedDiaryProjectContent(params: {
    storage: EnhancedDiaryProjectStorageConfig;
    targetId: string;
    field: EnhancedDiaryProjectContentField;
    content: string;
    now?: Date;
}): Promise<EnhancedDiaryProjectContentSaveResult> {
    const index = await readEnhancedDiaryProjectIndex(params.storage);
    const target = resolveEnhancedDiaryProjectTarget(index, params.targetId);
    if (!target) throw new Error("项目目标已失效。");
    const { blocks, headings } = await loadStructure(target.rootProjectId);
    const scope = targetScope(headings, target.rootProjectId, target.id);
    if (scope.targetLevel >= 6) throw new Error("H6 项目节点不能自动生成内容标题，请先调整为 H5 或更浅层级。");
    const content = params.content.trim();
    const fieldHeading = findFieldHeading(headings, scope, params.field);
    const level = scope.targetLevel + 1;

    if (!fieldHeading) {
        if (!content) return { status: "success" };
        const body = params.field === "阶段总结"
            ? `${formatTimestamp(params.now || new Date())} ${content}`
            : content;
        await insertProjectContent(target.rootProjectId, headings, scope, `${"#".repeat(level)} ${params.field}\n\n${body}`);
        return { status: "success" };
    }

    const next = headings.find((heading) => heading.index > fieldHeading.index && heading.level <= fieldHeading.level);
    const end = next?.index ?? blocks.length;
    if (params.field === "阶段总结") {
        if (!content) return { status: "success" };
        const entry = `${formatTimestamp(params.now || new Date())} ${content}`;
        if (next) await insertBlockChecked("markdown", entry, next.id);
        else await appendBlockChecked("markdown", entry, target.rootProjectId);
        return { status: "success" };
    }
    if (!CURRENT_FIELDS.has(params.field)) throw new Error("不支持的项目内容字段。");
    const bodyBlocks = blocks.slice(fieldHeading.index + 1, end);

    if (!content) {
        if (bodyBlocks.length) {
            const deletes = bodyBlocks.map((block) => ({ action: "delete" as const, id: block.id }));
            await performTransactionsChecked([{ doOperations: deletes }]);
        }
        return { status: "success" };
    }

    if (next) await insertBlockChecked("markdown", content, next.id);
    else await appendBlockChecked("markdown", content, target.rootProjectId);

    if (!bodyBlocks.length) return { status: "success" };
    try {
        const deletes = bodyBlocks.map((block) => ({ action: "delete" as const, id: block.id }));
        await performTransactionsChecked([{ doOperations: deletes }]);
    } catch (reason) {
        console.warn("[enhancedDiaryWorkspaceProjectContent] cleanup old content failed (new content kept)", reason);
        return { status: "partial", reason: "cleanup_failed" };
    }
    return { status: "success" };
}

function formatTimestamp(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
