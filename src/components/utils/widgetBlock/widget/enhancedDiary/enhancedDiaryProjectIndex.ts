import { batchGetBlockAttrs, getChildBlocksChecked, getFile, putFileChecked } from "@/api";
import type { ComponentMigrationStatus } from "@/components/utils/widgetBlock/widget/common/componentMigrationTypes";
import { prepareChangedRecentDocsForIndex } from "@/components/tools/siyuanComponentDataApi";
import { isEnhancedDiaryProjectStorageReady, type EnhancedDiaryProjectStorageConfig } from "./enhancedDiaryTypes";
import {
    ENHANCED_DIARY_PROJECT_INDEX_PATH,
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

async function writeIndex(index: EnhancedDiaryProjectIndexPayload): Promise<void> {
    const next = { ...index, version: INDEX_VERSION, updatedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json;charset=utf-8" });
    try { await putFileChecked(INDEX_DIR, true, new Blob(["{}"])); } catch { /* 目录已存在 */ }
    await putFileChecked(ENHANCED_DIARY_PROJECT_INDEX_PATH, false, blob);
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

async function queryProjectNodes(rootIds: string[]): Promise<any[]> {
    const rows: any[] = [];
    for (const rootId of rootIds) {
        const children = await getChildBlocksChecked(rootId);
        const headings = children.filter((block) => block.type === "h");
        if (!headings.length) continue;
        const attrsById = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(headings.map((heading) => heading.id)));
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
): Promise<void> {
    for (const rootId of rootIds) {
        const previousNodes = Object.values(previous.nodes).filter((node) => node.rootProjectId === rootId);
        if (!previousNodes.length) continue;
        const headings = (await getChildBlocksChecked(rootId)).filter((block) => block.type === "h");
        const headingById = new Map(headings.map((heading) => [String(heading.id), heading]));
        const retainedHeadings = previousNodes.map((node) => headingById.get(node.id)).filter(Boolean) as IResGetChildBlock[];
        if (!retainedHeadings.length) continue;
        const attrsById = parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(
            retainedHeadings.map((heading) => String(heading.id)),
        ));
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

async function rebuildInternal(storage: EnhancedDiaryProjectStorageConfig): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    try {
        const previous = await readEnhancedDiaryProjectIndex(storage);
        const docs = await listDirectProjectDocs(storage);
        const roots: Record<string, EnhancedDiaryRootProject> = {};
        const rootAttrs = docs.length
            ? parseEnhancedDiaryBatchBlockAttrs(await batchGetBlockAttrs(docs.map((doc) => doc.id).filter(Boolean)))
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
        const rows = await queryProjectNodes(Object.keys(roots));
        const nodes = buildNodes(rows, roots);
        await writeIndex({ ...emptyIndex(storage, docs.length < MAX_ROOT_PROJECTS), roots, nodes });
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

async function refreshInternal(
    storage: EnhancedDiaryProjectStorageConfig,
): Promise<ComponentMigrationStatus> {
    const now = new Date().toISOString();
    try {
        const current = await readEnhancedDiaryProjectIndex(storage);
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
        await writeIndex({ ...current, roots, nodes, complete: true });
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
