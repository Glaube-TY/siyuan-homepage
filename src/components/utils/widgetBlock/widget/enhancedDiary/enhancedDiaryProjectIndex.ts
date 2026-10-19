import { batchGetBlockAttrs, getChildBlocksChecked, getFile, getFileChecked, getFileOrNullChecked, putFileChecked } from "@/api";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
import { prepareChangedRecentDocsForIndex } from "@/components/tools/siyuanComponentDataApi";
import { isEnhancedDiaryProjectStorageReady, type EnhancedDiaryProjectStorageConfig } from "./enhancedDiaryTypes";
import {
    ENHANCED_DIARY_PROJECT_INDEX_PATH,
    ENHANCED_DIARY_PROJECT_STATUS_ATTR,
    getEnhancedDiaryProjectContainerSignature,
    hasEnhancedDiaryProjectNodeAttrs,
    parseEnhancedDiaryProjectLifecycle,
    parseEnhancedDiaryBatchBlockAttrs,
    type EnhancedDiaryProjectIndexPayload,
    type EnhancedDiaryProjectNode,
    type EnhancedDiaryProjectTarget,
    type EnhancedDiaryRootProject,
} from "./enhancedDiaryProjectTypes";
import {
    listDirectProjectDocs,
    MAX_ROOT_PROJECTS,
    resolveProjectContainer,
    isDirectChildPath,
} from "./enhancedDiaryProjectContainer";
import {
    getEnhancedDiaryHeadingLevel,
    getEnhancedDiaryHeadingTitle,
} from "./enhancedDiaryMarkdownSections";

const INDEX_DIR = "/data/storage/petal/siyuan-homepage";
const INDEX_VERSION = 1;

let cache: EnhancedDiaryProjectIndexPayload | null = null;
const maintenanceTails = new Map<string, Promise<void>>();
const operationFlights = new Map<string, Promise<ComponentMigrationStatus>>();

function emptyIndex(storage: EnhancedDiaryProjectStorageConfig, complete = false): EnhancedDiaryProjectIndexPayload {
    return {
        version: INDEX_VERSION,
        updatedAt: new Date().toISOString(),
        containerSignature: getEnhancedDiaryProjectContainerSignature(storage),
        complete,
        roots: {},
        nodes: {},
    };
}

async function fileToObject(raw: any): Promise<any | undefined> {
    if (raw == null || raw === "") return undefined;
    if (typeof raw === "object" && typeof raw.code === "number") {
        if (raw.code !== 0) return undefined;
        return fileToObject(raw.data);
    }
    if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return undefined; }
    }
    if (raw instanceof Blob) return fileToObject(await raw.text());
    if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
        return fileToObject(new TextDecoder().decode(raw instanceof ArrayBuffer ? raw : raw.buffer));
    }
    return typeof raw === "object" ? raw : undefined;
}

function isIndex(value: any): value is EnhancedDiaryProjectIndexPayload {
    return !!value && value.version === INDEX_VERSION && typeof value.updatedAt === "string" &&
        typeof value.containerSignature === "string" && typeof value.complete === "boolean" &&
        !!value.roots && typeof value.roots === "object" && !Array.isArray(value.roots) &&
        !!value.nodes && typeof value.nodes === "object" && !Array.isArray(value.nodes);
}

function hasIndexFileResponse(raw: any): boolean {
    if (raw == null) return false;
    if (typeof raw === "object" && typeof raw.code === "number") {
        return raw.code === 0 && raw.data != null;
    }
    return true;
}

function normalizeIndexLifecycle(index: EnhancedDiaryProjectIndexPayload): EnhancedDiaryProjectIndexPayload {
    return {
        ...index,
        roots: Object.fromEntries(Object.entries(index.roots).map(([id, root]) => [
            id,
            { ...root, ...parseEnhancedDiaryProjectLifecycle(root as unknown as Record<string, unknown>) },
        ])),
        nodes: Object.fromEntries(Object.entries(index.nodes).map(([id, node]) => [
            id,
            { ...node, ...parseEnhancedDiaryProjectLifecycle(node as unknown as Record<string, unknown>) },
        ])),
    };
}

async function writeIndex(index: EnhancedDiaryProjectIndexPayload, verify = false): Promise<void> {
    const next = { ...index, version: INDEX_VERSION, updatedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json;charset=utf-8" });
    try { await putFileChecked(INDEX_DIR, true, new Blob(["{}"])); } catch { /* 目录已存在 */ }
    await putFileChecked(ENHANCED_DIARY_PROJECT_INDEX_PATH, false, blob);
    if (verify) {
        cache = null;
        const persisted = await readCreationIndex(index.containerSignature, false);
        if (!persisted || persisted.updatedAt !== next.updatedAt || projectIndexContent(persisted) !== projectIndexContent(next)) {
            throw new Error("项目索引写后磁盘回读校验失败，请刷新项目索引检查，勿重复创建。");
        }
    }
    cache = next;
}

export async function readEnhancedDiaryProjectIndex(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<EnhancedDiaryProjectIndexPayload> {
    const signature = getEnhancedDiaryProjectContainerSignature(storage);
    if (cache?.containerSignature === signature) return cache;
    const parsed = await fileToObject(await getFile(ENHANCED_DIARY_PROJECT_INDEX_PATH));
    if (!isIndex(parsed) || parsed.containerSignature !== signature) return emptyIndex(storage);
    cache = normalizeIndexLifecycle(parsed);
    return cache;
}

export async function readEnhancedDiaryProjectIndexStrict(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<EnhancedDiaryProjectIndexPayload> {
    const signature = getEnhancedDiaryProjectContainerSignature(storage);
    const raw = await getFile(ENHANCED_DIARY_PROJECT_INDEX_PATH);
    if (!hasIndexFileResponse(raw)) throw new Error("项目索引不存在，请先在强化日记项目中心完成索引构建。");
    const parsed = await fileToObject(raw);
    if (!isIndex(parsed)) throw new Error("项目索引文件损坏或版本无效，通知扫描已停止。");
    if (parsed.containerSignature !== signature) throw new Error("项目索引与当前项目容器不一致，通知扫描已停止。");
    if (!parsed.complete) throw new Error("项目索引尚未完整，通知扫描已停止。");
    cache = normalizeIndexLifecycle(parsed);
    return cache;
}

export async function getEnhancedDiaryProjectIndexStatus(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ComponentMigrationStatus> {
    if (!isEnhancedDiaryProjectStorageReady(storage)) return { lastStatus: "idle", lastMessage: "尚未配置项目存储位置。" };
    try {
        const raw = await getFile(ENHANCED_DIARY_PROJECT_INDEX_PATH);
        if (!hasIndexFileResponse(raw)) return { lastStatus: "idle", lastMessage: "项目索引尚未建立。" };
        const parsed = await fileToObject(raw);
        if (!isIndex(parsed)) return { lastStatus: "error", lastMessage: "项目索引文件损坏或版本无效，请重建。" };
        if (parsed.containerSignature !== getEnhancedDiaryProjectContainerSignature(storage)) {
            return { lastRunAt: parsed.updatedAt, lastStatus: "idle", lastMessage: "项目存储位置已变化，需要重建项目索引。" };
        }
        const migratedCount = Object.keys(parsed.roots).length + Object.keys(parsed.nodes).length;
        if (!parsed.complete) {
            return { lastRunAt: parsed.updatedAt, lastStatus: "idle", lastMessage: "项目索引尚未完整，请重建。", migratedCount };
        }
        return { lastRunAt: parsed.updatedAt, lastStatus: "success", lastMessage: `项目索引完整，共 ${migratedCount} 个项目。`, migratedCount };
    } catch (error) {
        return { lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目索引状态读取失败。" };
    }
}

function headingLevel(row: any): 1 | 2 | 3 | 4 | 5 | 6 | null {
    return getEnhancedDiaryHeadingLevel(row);
}

async function readProjectAttrs(ids: string[]): Promise<ReturnType<typeof parseEnhancedDiaryBatchBlockAttrs>> {
    const raw = await batchGetBlockAttrs(ids);
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || ids.some((id) =>
        !raw[id] || typeof raw[id] !== "object" || Array.isArray(raw[id]) ||
        Object.values(raw[id]).some((value) => typeof value !== "string") || (raw[id].id && raw[id].id !== id))) {
        throw new Error("项目块属性响应不完整，未更新项目索引。");
    }
    if (ids.some((id) => raw[id][ENHANCED_DIARY_PROJECT_STATUS_ATTR] !== undefined &&
        !["active", "archived"].includes(raw[id][ENHANCED_DIARY_PROJECT_STATUS_ATTR]))) throw new Error("项目状态属性异常，未更新索引。");
    return parseEnhancedDiaryBatchBlockAttrs(raw);
}

async function queryProjectNodes(rootIds: string[], strict = false): Promise<any[]> {
    const rows: any[] = [];
    const seenIds = new Set(rootIds);
    for (const rootId of rootIds) {
        const children = await getChildBlocksChecked(rootId);
        if (strict && (!Array.isArray(children) || children.some((block) => !block ||
            !/^\d{14}-[a-z0-9]{7}$/i.test(block.id) || typeof block.type !== "string") ||
            new Set(children.map((block) => block.id)).size !== children.length || children.some((block) => seenIds.has(block.id)))) {
            throw new Error("项目标题列表响应异常，未更新项目索引。");
        }
        if (strict) children.forEach((block) => seenIds.add(block.id));
        const headings = children.filter((block) => block.type === "h");
        if (!headings.length) continue;
        const ids = headings.map((heading) => heading.id);
        const attrsById = strict ? await readProjectAttrs(ids) : parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(ids));
        if (strict && headings.some((heading) => !headingLevel(heading) ||
            (hasEnhancedDiaryProjectNodeAttrs(attrsById[heading.id]) && typeof heading.markdown !== "string"))) {
            throw new Error("项目标题层级或内容异常，未更新项目索引。");
        }
        headings.forEach((heading, order) => {
            const attrs = attrsById[heading.id];
            rows.push({
                id: heading.id, root_id: rootId, content: getEnhancedDiaryHeadingTitle(heading),
                subtype: heading.subtype, subType: heading.subType,
                markdown: heading.markdown, attrs, updated: attrs?.updated || "", sort: order,
            });
        });
    }
    return rows;
}

async function assertNoInterruptedProjectMove(
    previous: EnhancedDiaryProjectIndexPayload,
    rootIds: string[],
    rows?: any[],
): Promise<void> {
    for (const rootId of rootIds) {
        const previousNodes = Object.values(previous.nodes).filter((node) => node.rootProjectId === rootId);
        if (!previousNodes.length) continue;
        const headings = rows ? rows.filter((row) => row.root_id === rootId) : (await getChildBlocksChecked(rootId)).filter((block) => block.type === "h");
        const headingById = new Map(headings.map((heading) => [String(heading.id), heading]));
        const retainedHeadings = previousNodes.map((node) => headingById.get(node.id)).filter(Boolean) as IResGetChildBlock[];
        if (!retainedHeadings.length) continue;
        const attrsById = rows ? Object.fromEntries(headings.map((heading: any) => [heading.id, heading.attrs]))
            : parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(retainedHeadings.map((heading) => String(heading.id))));
        const interrupted = previousNodes.find((node) => {
            const heading = headingById.get(node.id);
            const currentLevel = heading ? getEnhancedDiaryHeadingLevel(heading) : null;
            return Boolean(currentLevel && currentLevel !== node.level &&
                !hasEnhancedDiaryProjectNodeAttrs(attrsById[node.id]));
        });
        if (interrupted) {
            throw new Error("检测到项目归属调整中断，项目标题仍存在但节点属性尚未恢复；已保留原索引，请从项目中心重试调整。");
        }
    }
}

function buildNodes(rows: any[], roots: Record<string, EnhancedDiaryRootProject>): Record<string, EnhancedDiaryProjectNode> {
    const result: Record<string, EnhancedDiaryProjectNode> = {};
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
        if (!roots[row.root_id] || !hasEnhancedDiaryProjectNodeAttrs(row.attrs)) continue;
        const list = grouped.get(row.root_id) || [];
        list.push(row);
        grouped.set(row.root_id, list);
    }
    for (const [rootProjectId, headings] of grouped) {
        const stack: EnhancedDiaryProjectNode[] = [];
        headings.forEach((row, order) => {
            const level = headingLevel(row);
            if (!level || !row.id) return;
            while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
            const parent = stack[stack.length - 1];
            const node: EnhancedDiaryProjectNode = {
                id: String(row.id), kind: "node", rootProjectId,
                title: String(row.content || row.id), level,
                parentTargetId: parent?.id || rootProjectId,
                ancestorTargetIds: parent ? [...parent.ancestorTargetIds, parent.id] : [rootProjectId],
                order, updated: String(row.updated || ""),
                ...parseEnhancedDiaryProjectLifecycle(row.attrs),
            };
            result[node.id] = node;
            stack.push(node);
        });
    }
    return result;
}

async function rebuildInternal(
    storage: EnhancedDiaryProjectStorageConfig,
    verifyCreation?: (index: EnhancedDiaryProjectIndexPayload) => Promise<void>,
): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    try {
        const previous = await readEnhancedDiaryProjectIndex(storage);
        const docs = await listDirectProjectDocs(storage, Boolean(verifyCreation));
        const roots: Record<string, EnhancedDiaryRootProject> = {};
        const rootAttrs = docs.length
            ? verifyCreation ? await readProjectAttrs(docs.map((doc) => doc.id))
                : parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(docs.map((doc) => doc.id).filter(Boolean)))
            : {};
        docs.forEach((doc, order) => {
            if (!doc.id) return;
            roots[doc.id] = {
                id: doc.id, kind: "root", title: doc.title,
                notebookId: doc.notebookId, path: doc.path, hpath: doc.hpath,
                order, updated: doc.updated,
                ...parseEnhancedDiaryProjectLifecycle(rootAttrs[doc.id]),
            };
        });
        await assertNoInterruptedProjectMove(previous, Object.keys(roots));
        const rows = await queryProjectNodes(Object.keys(roots), Boolean(verifyCreation));
        const nodes = buildNodes(rows, roots);
        const next = { ...emptyIndex(storage, docs.length < MAX_ROOT_PROJECTS), roots, nodes };
        await verifyCreation?.(next);
        await writeIndex(next, Boolean(verifyCreation));
        return {
            lastRunAt: now, lastStatus: "success",
            lastMessage: `项目索引重建完成：${Object.keys(roots).length} 个根项目，${Object.keys(nodes).length} 个子项目。`,
            migratedCount: Object.keys(roots).length + Object.keys(nodes).length,
        };
    } catch (error) {
        return { lastRunAt: now, lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目索引重建失败" };
    }
}

export async function rebuildEnhancedDiaryProjectIndex(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ComponentMigrationStatus> {
    return queueMaintenance(storage, "rebuild", () => rebuildInternal(storage));
}

export async function rebuildEnhancedDiaryProjectIndexAfterChange(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ComponentMigrationStatus> {
    const signature = getEnhancedDiaryProjectContainerSignature(storage);
    const previous = maintenanceTails.get(signature) || Promise.resolve();
    const promise = previous.catch(() => undefined).then(() => rebuildInternal(storage));
    maintenanceTails.set(signature, promise.then(() => undefined, () => undefined));
    return promise;
}

type ProjectCreationIndexInput = {
    storage: EnhancedDiaryProjectStorageConfig;
    createdId: string;
    affectedRootProjectId: string;
} & ({ createdKind: "root" } | {
    createdKind: "node";
    expectedNode: Pick<EnhancedDiaryProjectNode, "title" | "level" | "parentTargetId" | "ancestorTargetIds">;
});

function assertCreationIndex(index: any): asserts index is EnhancedDiaryProjectIndexPayload {
    if (!isIndex(index)) throw new Error("项目索引文件损坏或版本无效，未覆盖原文件。");
    const idValid = (id: unknown) => typeof id === "string" && /^\d{14}-[a-z0-9]{7}$/i.test(id);
    const commonValid = (item: any, id: string) => item && item.id === id && idValid(id) &&
        typeof item.title === "string" && typeof item.updated === "string" && Number.isInteger(item.order) && item.order >= 0 &&
        (item.status === undefined || item.status === "active" || item.status === "archived") &&
        (item.archivedAt === undefined || typeof item.archivedAt === "string");
    if (Object.entries(index.roots).some(([id, root]: [string, any]) => !commonValid(root, id) || root.kind !== "root" ||
        !idValid(root.notebookId) || typeof root.path !== "string" || !root.path.endsWith(`/${id}.sy`) || typeof root.hpath !== "string") ||
        Object.entries(index.nodes).some(([id, node]: [string, any]) => !commonValid(node, id) || index.roots[id] || node.kind !== "node" ||
            !index.roots[node.rootProjectId] || !Number.isInteger(node.level) || node.level < 1 || node.level > 6 ||
            !Array.isArray(node.ancestorTargetIds))) throw new Error("项目索引条目损坏，未覆盖原文件。");
    for (const node of Object.values(index.nodes) as EnhancedDiaryProjectNode[]) {
        const parent = index.nodes[node.parentTargetId];
        const ancestors = node.parentTargetId === node.rootProjectId ? [node.rootProjectId]
            : parent && parent.rootProjectId === node.rootProjectId && parent.level < node.level
                ? [...parent.ancestorTargetIds, parent.id] : null;
        if (!ancestors || JSON.stringify(ancestors) !== JSON.stringify(node.ancestorTargetIds)) {
            throw new Error("项目索引父子或祖先关系异常，未覆盖原文件。");
        }
    }
}

async function readCreationIndex(signature: string, allowMissing: boolean): Promise<EnhancedDiaryProjectIndexPayload | null> {
    const raw = allowMissing ? await getFileOrNullChecked(ENHANCED_DIARY_PROJECT_INDEX_PATH) : await getFileChecked(ENHANCED_DIARY_PROJECT_INDEX_PATH);
    if (raw === null && allowMissing) return null;
    const parsed = await fileToObject(raw);
    assertCreationIndex(parsed);
    if (parsed.containerSignature !== signature) throw new Error("项目索引容器已变化，未覆盖原文件，请检查项目位置。");
    return normalizeIndexLifecycle(parsed);
}

function projectIndexContent(index: EnhancedDiaryProjectIndexPayload): string {
    return JSON.stringify([index.version, index.containerSignature, index.complete,
        Object.keys(index.roots).sort().map((id) => { const root = index.roots[id]; return [id, root.kind, root.title,
            root.notebookId, root.path, root.hpath, root.order, root.updated, root.status, root.archivedAt]; }),
        Object.keys(index.nodes).sort().map((id) => { const node = index.nodes[id]; return [id, node.kind, node.rootProjectId,
            node.title, node.level, node.parentTargetId, node.ancestorTargetIds, node.order, node.updated, node.status, node.archivedAt]; }),
    ]);
}

function assertCreatedProject(index: EnhancedDiaryProjectIndexPayload, input: ProjectCreationIndexInput): void {
    assertCreationIndex(index);
    if (!index.complete || !index.roots[input.affectedRootProjectId] || !isEnhancedDiaryProjectEffectivelyActive(index, input.createdId)) {
        throw new Error("创建的项目尚未在完整索引中确认，或项目已归档；请检查索引，勿重复创建。");
    }
    if (input.createdKind === "root") {
        if (input.createdId !== input.affectedRootProjectId || !index.roots[input.createdId]) throw new Error("创建的根项目无法确认。");
    } else {
        const node = index.nodes[input.createdId];
        const expected = input.expectedNode;
        if (!node || node.rootProjectId !== input.affectedRootProjectId || node.title !== expected.title || node.level !== expected.level ||
            node.parentTargetId !== expected.parentTargetId || JSON.stringify(node.ancestorTargetIds) !== JSON.stringify(expected.ancestorTargetIds)) {
            throw new Error("创建的子项目标题、层级或父子关系无法确认，未更新索引；请勿重复创建。");
        }
    }
}

/** Only verified creation callers may replace one root's nodes; manual rebuild semantics stay unchanged. */
export function refreshEnhancedDiaryProjectIndexAfterCreation(input: ProjectCreationIndexInput): Promise<ComponentMigrationStatus> {
    const storage = { ...input.storage };
    const signature = getEnhancedDiaryProjectContainerSignature(storage);
    const previousTail = maintenanceTails.get(signature) || Promise.resolve();
    const promise = previousTail.catch(() => undefined).then(async (): Promise<ComponentMigrationStatus> => {
        const now = new Date().toISOString();
        try {
            const previous = await readCreationIndex(signature, true);
            const docs = await listDirectProjectDocs(storage, true);
            const container = await resolveProjectContainer(storage);
            const affected = docs.find((doc) => doc.id === input.affectedRootProjectId);
            if (!affected || docs.some((doc) => doc.notebookId !== container.notebookId ||
                (container.mode === "notebook" ? doc.path.slice(1).includes("/") : !isDirectChildPath(doc.path, container.parentDocPath || "")))) {
                throw new Error("创建的项目不在当前容器的直接子文档中，未更新索引。");
            }
            const checkUnchanged = async () => {
                const latestDocs = await listDirectProjectDocs(storage, true);
                if (JSON.stringify(latestDocs) !== JSON.stringify(docs)) throw new Error("项目目录在读取期间发生变化，请刷新索引检查，勿重复创建。");
                const latest = await readCreationIndex(signature, true);
                if (previous ? !latest || previous.updatedAt !== latest.updatedAt || projectIndexContent(previous) !== projectIndexContent(latest) : latest !== null) {
                    throw new Error("项目索引在读取期间发生变化，未覆盖并发更新，请刷新索引检查。");
                }
            };
            const verify = async (next: EnhancedDiaryProjectIndexPayload) => { assertCreatedProject(next, input); await checkUnchanged(); };
            if (!previous || !previous.complete) {
                cache = previous || emptyIndex(storage);
                return await rebuildInternal(storage, verify);
            }
            if (docs.length !== Object.keys(previous.roots).length + (previous.roots[input.affectedRootProjectId] ? 0 : 1) ||
                docs.some((doc) => doc.id !== input.affectedRootProjectId && (!previous.roots[doc.id] ||
                    [doc.title, doc.path, doc.hpath, doc.notebookId, doc.updated].some((value, i) =>
                        value !== [previous.roots[doc.id].title, previous.roots[doc.id].path, previous.roots[doc.id].hpath, previous.roots[doc.id].notebookId, previous.roots[doc.id].updated][i])))) {
                cache = previous;
                return await rebuildInternal(storage, verify);
            }
            const attrs = await readProjectAttrs([affected.id]);
            const root: EnhancedDiaryRootProject = {
                id: affected.id, kind: "root", title: affected.title, notebookId: affected.notebookId,
                path: affected.path, hpath: affected.hpath, updated: affected.updated, order: docs.indexOf(affected),
                ...parseEnhancedDiaryProjectLifecycle(attrs[affected.id]),
            };
            const rows = await queryProjectNodes([root.id], true);
            await assertNoInterruptedProjectMove(previous, [root.id], rows);
            const roots = Object.fromEntries(docs.map((doc, order) => [doc.id, doc.id === root.id ? root : { ...previous.roots[doc.id], order }]));
            const nodes = Object.fromEntries(Object.entries(previous.nodes).filter(([, node]) => node.rootProjectId !== root.id));
            Object.assign(nodes, buildNodes(rows, roots));
            const next = { ...previous, roots, nodes };
            await verify(next);
            if (projectIndexContent(previous) !== projectIndexContent(next)) await writeIndex(next, true);
            else cache = previous;
            return { lastRunAt: now, lastStatus: "success", refreshedCount: 1, lastMessage: "项目创建索引已确认，仅重新读取受影响根项目。" };
        } catch (error) {
            return { lastRunAt: now, lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目创建索引更新失败，请勿重复创建。" };
        }
    });
    maintenanceTails.set(signature, promise.then(() => undefined, () => undefined));
    return promise;
}

async function refreshInternal(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    try {
        // A warm display cache must not hide a corrupt or unreadable file before a mutation.
        const current = await readCreationIndex(getEnhancedDiaryProjectContainerSignature(storage), true) || emptyIndex(storage);
        if (!current.complete) return { lastRunAt: now, lastStatus: "idle", lastMessage: "项目索引尚未完整，请手动重建。" };
        const docs = await listDirectProjectDocs(storage);
        const directIds = docs.map((doc) => doc.id).filter(Boolean);
        const oldIds = Object.keys(current.roots);
        if (directIds.length !== oldIds.length || directIds.some((id) => !current.roots[id])) {
            return rebuildInternal(storage);
        }
        const roots: Record<string, EnhancedDiaryRootProject> = {};
        const rootAttrs = docs.length
            ? parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(directIds))
            : {};
        docs.forEach((doc, order) => {
            const previous = current.roots[doc.id];
            roots[doc.id] = {
                ...previous,
                title: doc.title,
                path: doc.path,
                hpath: doc.hpath || previous?.hpath || "",
                order,
                updated: doc.updated || previous?.updated || "",
                ...parseEnhancedDiaryProjectLifecycle(rootAttrs[doc.id]),
            };
        });
        const prepared = await prepareChangedRecentDocsForIndex("enhanced-diary-project");
        const changedRootIds = prepared.changedDocs.map((doc) => doc.id).filter((id) => roots[id]);
        let nodes = { ...current.nodes };
        if (changedRootIds.length) {
            await assertNoInterruptedProjectMove(current, changedRootIds);
            nodes = Object.fromEntries(Object.entries(nodes).filter(([, node]) => !changedRootIds.includes(node.rootProjectId)));
            Object.assign(nodes, buildNodes(await queryProjectNodes(changedRootIds), roots));
        }
        const next = { ...current, roots, nodes, complete: true };
        const currentContent = projectIndexContent(current);
        const latest = await readCreationIndex(getEnhancedDiaryProjectContainerSignature(storage), true);
        if (!latest || latest.updatedAt !== current.updatedAt || projectIndexContent(latest) !== currentContent) {
            throw new Error("项目索引在读取期间发生变化，未覆盖并发更新，请刷新索引检查。");
        }
        if (projectIndexContent(next) !== currentContent) await writeIndex(next, true);
        else cache = latest;
        await prepared.commit();
        return { lastRunAt: now, lastStatus: "success", lastMessage: `项目索引增量刷新完成：${changedRootIds.length} 篇项目文档发生变化。`, refreshedCount: changedRootIds.length };
    } catch (error) {
        return { lastRunAt: now, lastStatus: "error", lastMessage: error instanceof Error ? error.message : "项目索引增量刷新失败" };
    }
}

function queueMaintenance(
    storage: EnhancedDiaryProjectStorageConfig,
    operation: string,
    work: () => Promise<ComponentMigrationStatus>,
): Promise<ComponentMigrationStatus> {
    const signature = getEnhancedDiaryProjectContainerSignature(storage);
    const key = `${signature}:${operation}`;
    const running = operationFlights.get(key);
    if (running) return running;
    const previous = maintenanceTails.get(signature) || Promise.resolve();
    const promise = previous.catch(() => undefined).then(work);
    operationFlights.set(key, promise);
    maintenanceTails.set(signature, promise.then(() => undefined, () => undefined));
    promise.finally(() => {
        if (operationFlights.get(key) === promise) operationFlights.delete(key);
    });
    return promise;
}

export async function refreshEnhancedDiaryProjectIndex(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ComponentMigrationStatus> {
    return queueMaintenance(storage, "refresh", () => refreshInternal(storage));
}

export function resolveEnhancedDiaryProjectTarget(
    index: EnhancedDiaryProjectIndexPayload,
    targetId: string | undefined,
): EnhancedDiaryProjectTarget | null {
    if (!targetId) return null;
    const root = index.roots[targetId];
    if (root) return {
        id: root.id, kind: "root", title: root.title, rootProjectId: root.id,
        ancestorTargetIds: [], pathTitles: [root.title], valid: true,
        status: root.status, archivedAt: root.archivedAt,
    };
    const node = index.nodes[targetId];
    if (!node) return null;
    const titles = [index.roots[node.rootProjectId]?.title || node.rootProjectId];
    for (const ancestorId of node.ancestorTargetIds.slice(1)) {
        titles.push(index.nodes[ancestorId]?.title || ancestorId);
    }
    titles.push(node.title);
    return {
        id: node.id, kind: "node", title: node.title, rootProjectId: node.rootProjectId,
        parentTargetId: node.parentTargetId, ancestorTargetIds: [...node.ancestorTargetIds],
        pathTitles: titles, valid: true,
        status: node.status, archivedAt: node.archivedAt,
    };
}

export function isEnhancedDiaryProjectDescendant(
    index: EnhancedDiaryProjectIndexPayload,
    candidateTargetId: string,
    ancestorTargetId: string,
): boolean {
    return candidateTargetId === ancestorTargetId ||
        index.nodes[candidateTargetId]?.ancestorTargetIds.includes(ancestorTargetId) === true;
}

function enhancedDiaryProjectLifecyclePathIds(
    index: EnhancedDiaryProjectIndexPayload,
    targetId: string,
): string[] {
    if (index.roots[targetId]) return [targetId];
    const node = index.nodes[targetId];
    return node ? [...node.ancestorTargetIds, targetId] : [];
}

export function isEnhancedDiaryProjectEffectivelyActive(
    index: EnhancedDiaryProjectIndexPayload,
    targetId: string | undefined,
): boolean {
    if (!targetId) return false;
    const pathIds = enhancedDiaryProjectLifecyclePathIds(index, targetId);
    return pathIds.length > 0 && pathIds.every((id) =>
        (index.roots[id] || index.nodes[id])?.status === "active",
    );
}

export function isEnhancedDiaryProjectEffectivelyArchived(
    index: EnhancedDiaryProjectIndexPayload,
    targetId: string | undefined,
): boolean {
    if (!targetId) return false;
    const pathIds = enhancedDiaryProjectLifecyclePathIds(index, targetId);
    return pathIds.length > 0 && pathIds.some((id) =>
        (index.roots[id] || index.nodes[id])?.status === "archived",
    );
}

export function isEnhancedDiaryProjectActiveBranch(
    index: EnhancedDiaryProjectIndexPayload,
    directTargetId: string | undefined,
    scopeTargetId: string,
): boolean {
    if (!directTargetId || !scopeTargetId) return false;
    if (!isEnhancedDiaryProjectEffectivelyActive(index, scopeTargetId) ||
        !isEnhancedDiaryProjectEffectivelyActive(index, directTargetId)) return false;
    if (directTargetId === scopeTargetId) return true;
    const node = index.nodes[directTargetId];
    if (!node) return false;
    return node.ancestorTargetIds.includes(scopeTargetId);
}
