import {
    appendBlockChecked,
    createDocWithMd,
    getBlockAttrsChecked,
    getChildBlocksChecked,
    getPathByID,
    insertBlockChecked,
    setBlockAttrsChecked,
} from "@/api";
import type { EnhancedDiaryProjectStorageConfig } from "../enhancedDiaryTypes";
import { validateEnhancedDiaryProjectWriteTarget } from "./enhancedDiaryWorkspaceProjectLifecycle";
import {
    ENHANCED_DIARY_PROJECT_NODE_ATTR,
    type EnhancedDiaryProjectIndexPayload,
} from "../enhancedDiaryProjectTypes";
import {
    readEnhancedDiaryProjectIndex,
    rebuildEnhancedDiaryProjectIndexAfterChange,
} from "../enhancedDiaryProjectIndex";
import {
    getEnhancedDiaryHeadingLevel,
    getEnhancedDiaryHeadingTitle,
    normalizeHeadingTitle,
} from "../enhancedDiaryMarkdownSections";
import {
    isDirectChildPath,
    listDirectProjectDocs,
    resolveProjectContainer,
} from "../enhancedDiaryProjectContainer";

export interface CreateRootProjectInput {
    storage: EnhancedDiaryProjectStorageConfig;
    name: string;
    overview?: string;
    goal?: string;
    focus?: string;
}

export interface CreateSubprojectInput {
    storage: EnhancedDiaryProjectStorageConfig;
    parentTargetId: string;
    name: string;
}

export class EnhancedDiaryProjectCreatedButNotVerifiedError extends Error {
    public readonly docId: string;
    public readonly stage: "heading" | "metadata" | "index";
    constructor(docId: string, stage: "heading" | "metadata" | "index", message: string) {
        super(message);
        this.docId = docId;
        this.stage = stage;
        this.name = "EnhancedDiaryProjectCreatedButNotVerifiedError";
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTitle(value: string): string {
    const title = value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
    if (!title) throw new Error("项目名称不能为空。");
    if (title.length > 100) throw new Error("项目名称不能超过 100 个字符。");
    if (/[\\/:*?"<>|]/.test(title)) throw new Error("项目名称不能包含路径特殊字符。");
    return title;
}

function joinDocPath(parent: string, name: string): string {
    const base = parent === "/" ? "" : parent.replace(/\/$/, "");
    return `${base}/${name}`;
}

function buildRootProjectMarkdown(input: CreateRootProjectInput): string {
    const parts: string[] = [];
    const overview = String(input.overview || "").trim();
    const goal = String(input.goal || "").trim();
    const focus = String(input.focus || "").trim();
    if (overview) parts.push(`# 项目概览\n\n${overview}`);
    if (goal) parts.push(`# 项目目标\n\n${goal}`);
    if (focus) parts.push(`# 当前重点\n\n${focus}`);
    return parts.join("\n\n");
}

export async function createEnhancedDiaryRootProject(input: CreateRootProjectInput): Promise<string> {
    const title = cleanTitle(input.name);
    const container = await resolveProjectContainer(input.storage);
    const directDocs = await listDirectProjectDocs(input.storage);
    const duplicate = directDocs.some((doc) =>
        doc.name.trim().toLocaleLowerCase() === title.toLocaleLowerCase());
    if (duplicate) throw new Error(`当前位置已存在同名项目“${title}”。`);
    const createPath = container.mode === "notebook" ? "/" : (container.parentDocHpath || "/");
    const markdown = buildRootProjectMarkdown(input);
    const docId = await createDocWithMd(container.notebookId, joinDocPath(createPath, title), markdown);

    const pathInfo = await getPathByID(docId);
    const actualNotebookId = String(pathInfo?.notebook || "");
    const actualPath = String(pathInfo?.path || "");
    if (actualNotebookId !== container.notebookId) {
        throw new Error("项目文档已创建，但所属笔记本与项目容器不一致，请在思源文档树中检查。");
    }
    const expectedParent = container.mode === "notebook" ? "" : (container.parentDocPath || "");
    const pathValid = container.mode === "notebook"
        ? actualPath.startsWith("/") && !actualPath.slice(1).includes("/")
        : isDirectChildPath(actualPath, expectedParent);
    if (!pathValid) {
        throw new Error("项目文档已创建，但实际位置不在项目容器下，请在思源文档树中检查。");
    }

    const status = await rebuildEnhancedDiaryProjectIndexAfterChange(input.storage);
    if (status.lastStatus !== "success") {
        throw new EnhancedDiaryProjectCreatedButNotVerifiedError(
            docId,
            "index",
            status.lastMessage || "项目文档已经创建，但项目索引重建失败。",
        );
    }
    if (!(await readEnhancedDiaryProjectIndex(input.storage)).roots[docId]) {
        throw new EnhancedDiaryProjectCreatedButNotVerifiedError(
            docId,
            "index",
            "项目文档已经创建，但项目索引尚未识别；请手动刷新项目索引。",
        );
    }
    return docId;
}

function operationIds(result: unknown): string[] {
    const ids: string[] = [];
    const operationGroups = Array.isArray(result) ? result : [];
    for (const group of operationGroups) {
        if (!Array.isArray(group?.doOperations)) continue;
        for (const operation of group.doOperations) {
            const id = String(operation?.id || "");
            if (operation?.action === "insert" && /^\d{14}-[a-z0-9]{7}$/i.test(id)) ids.push(id);
        }
    }
    return Array.from(new Set(ids));
}

function findNextHeadingBoundary(
    headings: IResGetChildBlock[],
    rootProjectId: string,
    parentTargetId: string,
    parentLevel: number,
): string | undefined {
    if (parentTargetId === rootProjectId) return undefined;
    const parentIndex = headings.findIndex((row) => row.id === parentTargetId);
    for (let index = parentIndex + 1; index < headings.length; index += 1) {
        const level = getEnhancedDiaryHeadingLevel(headings[index]);
        if (level && level <= parentLevel) return String(headings[index].id);
    }
    return undefined;
}

async function loadProjectHeadings(rootProjectId: string): Promise<IResGetChildBlock[]> {
    return (await getChildBlocksChecked(rootProjectId)).filter((block) => block.type === "h");
}

function findSameLevelTitle(
    headings: IResGetChildBlock[],
    parentTargetId: string,
    rootProjectId: string,
    parentLevel: number,
    expectedLevel: number,
    title: string,
): IResGetChildBlock | undefined {
    const start = parentTargetId === rootProjectId ? 0 : headings.findIndex((heading) => heading.id === parentTargetId) + 1;
    const normalizedTitle = normalizeHeadingTitle(title).toLocaleLowerCase();
    for (let index = start; index < headings.length; index += 1) {
        const heading = headings[index];
        const level = getEnhancedDiaryHeadingLevel(heading);
        if (parentTargetId !== rootProjectId && level && level <= parentLevel) break;
        if (level === expectedLevel && getEnhancedDiaryHeadingTitle(heading).toLocaleLowerCase() === normalizedTitle) return heading;
    }
    return undefined;
}

async function verifyNoDuplicateHeading(
    headings: IResGetChildBlock[],
    parentTargetId: string,
    rootProjectId: string,
    parentLevel: number,
    expectedLevel: number,
    title: string,
): Promise<void> {
    const duplicate = findSameLevelTitle(headings, parentTargetId, rootProjectId, parentLevel, expectedLevel, title);
    if (!duplicate) return;
    const attrs = await getBlockAttrsChecked(duplicate.id);
    if (attrs?.[ENHANCED_DIARY_PROJECT_NODE_ATTR] === "true") {
        throw new Error(`该父项目下已存在同名子项目“${title}”。`);
    }
    throw new Error("当前层级已经存在同名普通标题，请先删除、重命名，或后续使用‘转换为子项目’功能。");
}

async function locateInsertedHeading(
    rootProjectId: string,
    insertedIds: string[],
    level: number,
    title: string,
): Promise<string> {
    const idSet = new Set(insertedIds);
    const normalizedTitle = normalizeHeadingTitle(title).toLocaleLowerCase();
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const heading = (await loadProjectHeadings(rootProjectId)).find((block) =>
            idSet.has(block.id) && getEnhancedDiaryHeadingLevel(block) === level &&
            getEnhancedDiaryHeadingTitle(block).toLocaleLowerCase() === normalizedTitle);
        if (heading) return heading.id;
        if (attempt < 7) await delay(200);
    }
    throw new EnhancedDiaryProjectCreatedButNotVerifiedError(
        rootProjectId,
        "heading",
        "子项目标题已经创建，但暂时无法确认真实标题块；请勿重复创建，请刷新文档后检查。",
    );
}

async function waitForProjectNodeAttribute(blockId: string): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const attrs = await getBlockAttrsChecked(blockId);
        if (attrs?.[ENHANCED_DIARY_PROJECT_NODE_ATTR] === "true") return;
        if (attempt < 7) await delay(120);
    }
    throw new EnhancedDiaryProjectCreatedButNotVerifiedError(
        blockId,
        "metadata",
        "子项目标题已经创建，但项目节点属性尚未完成；请勿重复创建，请稍后检查。",
    );
}

export async function createEnhancedDiarySubproject(input: CreateSubprojectInput): Promise<string> {
    const title = cleanTitle(input.name);
    const parent = await validateEnhancedDiaryProjectWriteTarget(input.storage, input.parentTargetId);
    const headings = await loadProjectHeadings(parent.rootProjectId);
    const parentHeading = parent.kind === "root" ? undefined : headings.find((heading) => heading.id === parent.id);
    if (parent.kind === "node" && !parentHeading) {
        throw new Error("父项目标题已不存在，请刷新项目索引后重试。");
    }
    const parentLevel = parent.kind === "root" ? 0 : getEnhancedDiaryHeadingLevel(parentHeading || {});
    if (parentLevel === null) throw new Error("父项目标题层级无效，请刷新项目索引后重试。");
    if (parentLevel >= 6) throw new Error("H6 项目节点不能自动创建下一层；请先将它调整为 H5 或更浅层级。");
    const level = parentLevel + 1;
    await verifyNoDuplicateHeading(headings, parent.id, parent.rootProjectId, parentLevel, level, title);
    const markdown = `${"#".repeat(level)} ${title}`;
    const nextId = findNextHeadingBoundary(headings, parent.rootProjectId, parent.id, parentLevel);
    await validateEnhancedDiaryProjectWriteTarget(input.storage, input.parentTargetId);
    const operations = nextId
        ? await insertBlockChecked("markdown", markdown, nextId)
        : await appendBlockChecked("markdown", markdown, parent.rootProjectId);
    const insertedIds = operationIds(operations);
    if (!insertedIds.length) {
        throw new EnhancedDiaryProjectCreatedButNotVerifiedError(
            parent.rootProjectId,
            "heading",
            "子项目标题已经创建，但插入响应中没有可验证的标题块 ID；请勿重复创建，请刷新文档后检查。",
        );
    }
    const blockId = await locateInsertedHeading(parent.rootProjectId, insertedIds, level, title);
    await setBlockAttrsChecked(blockId, { [ENHANCED_DIARY_PROJECT_NODE_ATTR]: "true" });
    await waitForProjectNodeAttribute(blockId);
    const status = await rebuildEnhancedDiaryProjectIndexAfterChange(input.storage);
    if (status.lastStatus !== "success") {
        throw new EnhancedDiaryProjectCreatedButNotVerifiedError(
            blockId,
            "index",
            status.lastMessage || "子项目标题和属性已经创建，但项目索引重建失败。",
        );
    }
    const rebuilt = await readEnhancedDiaryProjectIndex(input.storage);
    if (!rebuilt.nodes[blockId]) {
        throw new EnhancedDiaryProjectCreatedButNotVerifiedError(
            blockId,
            "index",
            "子项目标题和属性已经创建，但项目索引尚未识别；请勿重复创建，请手动刷新项目索引。",
        );
    }
    return blockId;
}

export async function loadEnhancedDiaryProjectIndexForWorkspace(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<EnhancedDiaryProjectIndexPayload> {
    const current = await readEnhancedDiaryProjectIndex(storage);
    return current;
}
