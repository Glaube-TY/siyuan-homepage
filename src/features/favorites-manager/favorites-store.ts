/**
 * 严格收藏存储事务层
 *
 * 设计原则：
 * 1. 使用 src/api.ts 的 getFileOrNullChecked / putFileChecked 统一包装
 * 2. 同一会话所有收藏写入使用唯一 Promise 队列串行化
 * 3. 每次写入前重新严格读取最新 payload
 * 4. 保留所有未知根字段和 item 未知字段
 * 5. 写后读回验证，失败不得宣称成功
 * 6. 旧 v1 格式只读兼容，只有真实写操作发生时才升级到 v2
 */

import { getFileOrNullChecked, putFileChecked } from "@/api";
import { dispatchFavoritesUpdated } from "./favorites-events";
import {
    VIRTUAL_UNGROUPED_ID,
    FavoritesWriteError,
    type FavoriteItemRecord,
    type FavoriteGroupRecord,
    type FavoritesIndexPayloadV2,
    type StrictReadResult,
} from "./types";

const COMPONENT_INDEX_DIR = "/data/storage/petal/siyuan-homepage";
const FAVORITES_INDEX_PATH = `${COMPONENT_INDEX_DIR}/favorites-index.json`;

// ---- 内部工具 ----

function makeJsonBlob(data: unknown): Blob {
    return new Blob([JSON.stringify(data)], { type: "application/json;charset=utf-8" });
}

async function fileContentToObject(raw: unknown): Promise<unknown> {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === "object" && !(raw instanceof Blob) && !ArrayBuffer.isView(raw)) return raw;
    let text: string;
    if (raw instanceof Blob) {
        text = await raw.text();
    } else if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
        const buf = raw instanceof ArrayBuffer ? raw : (raw as ArrayBufferView).buffer;
        text = new TextDecoder().decode(new Uint8Array(buf));
    } else {
        text = String(raw);
    }
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidId(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// ---- 严格读取 ----

/**
 * 严格读取收藏索引文件。
 * 返回 ok/missing/corrupt 三种结果，绝不静默返回空数据。
 */
export async function readFavoritesIndexStrict(): Promise<StrictReadResult> {
    let raw: unknown;
    try {
        raw = await getFileOrNullChecked(FAVORITES_INDEX_PATH);
    } catch (error) {
        return { kind: "corrupt", reason: `读取收藏索引文件失败: ${error instanceof Error ? error.message : String(error)}` };
    }

    if (raw === null) {
        return { kind: "missing" };
    }

    let parsed: unknown;
    try {
        parsed = await fileContentToObject(raw);
    } catch (error) {
        return { kind: "corrupt", reason: `解析收藏索引 JSON 失败: ${error instanceof Error ? error.message : String(error)}` };
    }

    if (parsed === undefined || parsed === null || typeof parsed !== "object") {
        return { kind: "corrupt", reason: "收藏索引文件内容为空或不是有效 JSON 对象" };
    }

    const obj = parsed as Record<string, unknown>;

    // 兼容旧格式：根数组（无 wrapper 对象）
    let items: unknown;
    if (Array.isArray(parsed)) {
        items = parsed;
    } else {
        items = obj.items;
    }

    if (!Array.isArray(items)) {
        return { kind: "corrupt", reason: "收藏索引 items 不是数组" };
    }

    // 构建 v2 payload
    const groups: FavoriteGroupRecord[] = Array.isArray(obj.groups) ? obj.groups as FavoriteGroupRecord[] : [];

    const payload: FavoritesIndexPayloadV2 = {
        version: 2,
        updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
        items: items.filter(Boolean) as FavoriteItemRecord[],
        groups,
    };

    // 保留未知根字段（跳过数字索引键，旧根数组兼容）
    for (const key of Object.keys(obj)) {
        if (!(key in payload) && !/^\d+$/.test(key)) {
            (payload as Record<string, unknown>)[key] = obj[key];
        }
    }

    return { kind: "ok", payload };
}

// ---- 写队列串行化 ----

class FavoritesWriteQueue {
    private queue: Promise<void> = Promise.resolve();

    enqueue<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue = this.queue
                .then(() => fn())
                .then(resolve, reject);
        });
    }
}

const writeQueue = new FavoritesWriteQueue();

// ---- 验证 ----

function validatePayload(payload: FavoritesIndexPayloadV2): void {
    const ids = new Set<string>();
    for (const item of payload.items) {
        if (!isValidId(item.id)) {
            throw new FavoritesWriteError("收藏索引包含无效 item.id", "validate");
        }
        if (ids.has(item.id)) {
            throw new FavoritesWriteError(`收藏索引包含重复 item.id: ${item.id}`, "validate");
        }
        ids.add(item.id);
    }

    const groupIds = new Set<string>();
    const groupNames = new Set<string>();
    for (const group of payload.groups) {
        if (!isValidId(group.id)) {
            throw new FavoritesWriteError("收藏索引包含无效 group.id", "validate");
        }
        if (groupIds.has(group.id)) {
            throw new FavoritesWriteError(`收藏索引包含重复 group.id: ${group.id}`, "validate");
        }
        groupIds.add(group.id);
        const name = (group.name ?? "").trim();
        if (!name) {
            throw new FavoritesWriteError(`分组 ${group.id} 名称为空`, "validate");
        }
        if (groupNames.has(name)) {
            throw new FavoritesWriteError(`分组名称重复: ${name}`, "validate");
        }
        groupNames.add(name);
    }

    for (const item of payload.items) {
        const gid = item.favoriteGroupId;
        if (gid !== undefined && gid !== null && gid !== "") {
            if (gid === VIRTUAL_UNGROUPED_ID) {
                throw new FavoritesWriteError(
                    `收藏 ${item.id} 的 favoriteGroupId 使用了保留虚拟 ID`,
                    "validate",
                );
            }
            if (!groupIds.has(gid)) {
                throw new FavoritesWriteError(
                    `收藏 ${item.id} 引用了不存在的分组 ${gid}`,
                    "validate",
                );
            }
        }
    }
}

// ---- 写入 ----

async function writePayloadDirect(payload: FavoritesIndexPayloadV2): Promise<void> {
    // 确保目录存在
    try {
        await putFileChecked(COMPONENT_INDEX_DIR, true, makeJsonBlob({}));
    } catch {
        // 旧版内核可能不需要显式创建目录
    }
    await putFileChecked(FAVORITES_INDEX_PATH, false, makeJsonBlob(payload));
}

/** 递归规范化对象：移除 undefined、对象键稳定排序 */
function normalizeForCompare(obj: unknown): unknown {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(normalizeForCompare);
    if (typeof obj === "object") {
        const sorted: Record<string, unknown> = {};
        const keys = Object.keys(obj as Record<string, unknown>).sort();
        for (const key of keys) {
            const val = (obj as Record<string, unknown>)[key];
            if (val !== undefined) sorted[key] = normalizeForCompare(val);
        }
        return sorted;
    }
    return obj;
}

/** 读回验证：不仅校验结构，还要与本次准备写入的 expected 进行完整语义比较 */
async function readBackVerify(expected: FavoritesIndexPayloadV2): Promise<void> {
    const result = await readFavoritesIndexStrict();
    if (result.kind !== "ok") {
        throw new FavoritesWriteError(
            `写入后读回验证失败: ${result.kind === "corrupt" ? result.reason : "文件丢失"}`,
            "validate",
        );
    }
    validatePayload(result.payload);

    const actualJson = JSON.stringify(normalizeForCompare(result.payload));
    const expectedJson = JSON.stringify(normalizeForCompare(expected));
    if (actualJson !== expectedJson) {
        throw new FavoritesWriteError(
            "写入后读回内容与写入内容不一致，写入操作已中止",
            "validate",
        );
    }
}

/**
 * 统一写入口：读最新 → 修改 → 验证 → 写 → 读回验证
 */
export async function writeFavoritesIndex(
    mutator: (payload: FavoritesIndexPayloadV2) => FavoritesIndexPayloadV2,
): Promise<void> {
    return writeQueue.enqueue(async () => {
        // 1. 严格读取最新
        const readResult = await readFavoritesIndexStrict();
        if (readResult.kind === "corrupt") {
            throw new FavoritesWriteError(readResult.reason, "read");
        }

        let payload: FavoritesIndexPayloadV2;
        if (readResult.kind === "missing") {
            // 初始化空索引
            payload = {
                version: 2,
                updatedAt: new Date().toISOString(),
                items: [],
                groups: [],
            };
        } else {
            payload = readResult.payload;
        }

        // 2. 修改
        const next = mutator(payload);
        next.updatedAt = new Date().toISOString();

        // 3. 写入前验证
        validatePayload(next);

        // 4. 写入
        try {
            await writePayloadDirect(next);
        } catch (error) {
            throw new FavoritesWriteError(
                `写入收藏索引失败: ${error instanceof Error ? error.message : String(error)}`,
                "write",
            );
        }

        // 5. 读回验证
        await readBackVerify(next);
    });
}

// ---- 高层写操作 ----

export async function addFavoriteItem(
    doc: FavoriteItemRecord,
    options: { groupId?: string | null } = {},
): Promise<void> {
    await writeFavoritesIndex((payload) => {
        if (typeof options.groupId === "string" && !payload.groups.some((group) => group.id === options.groupId)) {
            throw new FavoritesWriteError("收藏分组不存在", "validate");
        }
        const existing = payload.items.find((item) => item.id === doc.id);
        const nextGroupId = options.groupId !== undefined ? options.groupId : existing?.favoriteGroupId;
        const nextItem: FavoriteItemRecord = existing
            ? { ...existing, ...doc, favoriteGroupId: nextGroupId ?? undefined }
            : { ...doc, favoriteGroupId: nextGroupId ?? undefined };
        // 确保 favoriteOrder
        if (nextItem.favoriteOrder === undefined || nextItem.favoriteOrder === null) {
            const maxOrder = payload.items.reduce(
                (max, item) => Math.max(max, typeof item.favoriteOrder === "number" ? item.favoriteOrder : 0),
                -1,
            );
            nextItem.favoriteOrder = maxOrder + 1;
        }
        const nextItems = existing
            ? payload.items.map((item) => (item.id === doc.id ? nextItem : item))
            : [...payload.items, nextItem];
        return { ...payload, items: nextItems };
    });
    dispatchFavoritesUpdated();
}

export async function removeFavoriteItem(docId: string, options: { expectedUpdatedAt?: string } = {}): Promise<void> {
    await writeFavoritesIndex((payload) => {
        if (options.expectedUpdatedAt !== undefined && payload.updatedAt !== options.expectedUpdatedAt) {
            throw new FavoritesWriteError("收藏数据已变化，请重新读取", "lock");
        }
        const nextItems = payload.items.filter((item) => item.id !== docId);
        return { ...payload, items: nextItems };
    });
    dispatchFavoritesUpdated();
}

export async function removeFavoriteItemsByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await writeFavoritesIndex((payload) => {
        const nextItems = payload.items.filter((item) => !idSet.has(item.id));
        return { ...payload, items: nextItems };
    });
    dispatchFavoritesUpdated();
}

export async function reorderFavoriteItems(orderedIds: string[], options: { expectedUpdatedAt?: string } = {}): Promise<void> {
    await writeFavoritesIndex((payload) => {
        if (options.expectedUpdatedAt !== undefined && payload.updatedAt !== options.expectedUpdatedAt) {
            throw new FavoritesWriteError("收藏数据已变化，请重新读取", "lock");
        }
        const byId = new Map(payload.items.map((item) => [item.id, item]));
        const existingIds = new Set(payload.items.map((item) => item.id));
        const orderedSet = new Set(orderedIds.filter((id) => existingIds.has(id)));
        if (orderedSet.size < 1) return payload;

        // 按当前 favoriteOrder 排序全部 items
        const sorted = payload.items.slice().sort((a, b) => {
            const aOrder = typeof a.favoriteOrder === "number" && Number.isFinite(a.favoriteOrder)
                ? a.favoriteOrder : 0;
            const bOrder = typeof b.favoriteOrder === "number" && Number.isFinite(b.favoriteOrder)
                ? b.favoriteOrder : 0;
            return aOrder - bOrder;
        });

        // 找到 orderedIds 原来占据的位置范围（在 sorted 中）
        const selectedIndices: number[] = [];
        for (let i = 0; i < sorted.length; i++) {
            if (orderedSet.has(sorted[i].id)) {
                selectedIndices.push(i);
            }
        }

        // 按 orderedIds 新顺序排列选中项
        const reorderedSelected = orderedIds
            .filter((id) => orderedSet.has(id))
            .map((id) => byId.get(id)!);

        // 在原位置用新顺序替换：构建结果数组
        const result = [...sorted];
        for (let j = 0; j < selectedIndices.length; j++) {
            result[selectedIndices[j]] = reorderedSelected[j];
        }

        // 统一生成连续 favoriteOrder
        const final = result.map((item, index) => ({ ...item, favoriteOrder: index }));
        return { ...payload, items: final };
    });
    dispatchFavoritesUpdated();
}

export async function setItemGroup(docId: string, groupId: string | null, options: { expectedUpdatedAt?: string } = {}): Promise<void> {
    await writeFavoritesIndex((payload) => {
        if (options.expectedUpdatedAt !== undefined && payload.updatedAt !== options.expectedUpdatedAt) {
            throw new FavoritesWriteError("收藏数据已变化，请重新读取", "lock");
        }
        const nextItems = payload.items.map((item) => {
            if (item.id !== docId) return item;
            if (groupId === null || groupId === "" || groupId === VIRTUAL_UNGROUPED_ID) {
                const { favoriteGroupId: _favoriteGroupId, ...rest } = item;
                void _favoriteGroupId;
                return rest as FavoriteItemRecord;
            }
            return { ...item, favoriteGroupId: groupId };
        });
        return { ...payload, items: nextItems };
    });
    dispatchFavoritesUpdated();
}

export async function createGroup(name: string): Promise<FavoriteGroupRecord> {
    const trimmed = name.trim();
    if (!trimmed) throw new FavoritesWriteError("分组名称不能为空", "validate");
    if (trimmed.length > 60) throw new FavoritesWriteError("分组名称过长（最多60个字符）", "validate");

    let created: FavoriteGroupRecord | undefined;
    await writeFavoritesIndex((payload) => {
        const existingNames = new Set(payload.groups.map((g) => g.name));
        if (existingNames.has(trimmed)) {
            throw new FavoritesWriteError(`分组名称 "${trimmed}" 已存在`, "validate");
        }
        const maxOrder = payload.groups.reduce((max, g) => Math.max(max, g.order ?? 0), -1);
        const now = new Date().toISOString();
        created = {
            id: generateId(),
            name: trimmed,
            order: maxOrder + 1,
            createdAt: now,
            updatedAt: now,
        };
        return { ...payload, groups: [...payload.groups, created!] };
    });
    if (!created) throw new FavoritesWriteError("创建分组失败", "write");
    dispatchFavoritesUpdated();
    return created;
}

export async function renameGroup(groupId: string, name: string, options: { expectedUpdatedAt?: string; expectedGroupUpdatedAt?: string } = {}): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new FavoritesWriteError("分组名称不能为空", "validate");
    if (trimmed.length > 60) throw new FavoritesWriteError("分组名称过长（最多60个字符）", "validate");

    await writeFavoritesIndex((payload) => {
        if (options.expectedUpdatedAt !== undefined && payload.updatedAt !== options.expectedUpdatedAt) {
            throw new FavoritesWriteError("收藏数据已变化，请重新读取", "lock");
        }
        const existing = payload.groups.find((g) => g.id === groupId);
        if (!existing) throw new FavoritesWriteError(`分组 ${groupId} 不存在`, "validate");
        if (options.expectedGroupUpdatedAt !== undefined && existing.updatedAt !== options.expectedGroupUpdatedAt) {
            throw new FavoritesWriteError("收藏分组已变化，请重新读取", "lock");
        }
        const otherNames = new Set(
            payload.groups.filter((g) => g.id !== groupId).map((g) => g.name),
        );
        if (otherNames.has(trimmed)) {
            throw new FavoritesWriteError(`分组名称 "${trimmed}" 已存在`, "validate");
        }
        const nextGroups = payload.groups.map((g) =>
            g.id === groupId
                ? { ...g, name: trimmed, updatedAt: new Date().toISOString() }
                : g,
        );
        return { ...payload, groups: nextGroups };
    });
    dispatchFavoritesUpdated();
}

export async function deleteGroup(groupId: string, options: { expectedUpdatedAt?: string; expectedGroupUpdatedAt?: string; expectedItemCount?: number } = {}): Promise<void> {
    await writeFavoritesIndex((payload) => {
        if (options.expectedUpdatedAt !== undefined && payload.updatedAt !== options.expectedUpdatedAt) {
            throw new FavoritesWriteError("收藏数据已变化，请重新读取", "lock");
        }
        const currentGroup = payload.groups.find((g) => g.id === groupId);
        if (!payload.groups.some((g) => g.id === groupId)) {
            throw new FavoritesWriteError(`分组 ${groupId} 不存在`, "validate");
        }
        if (options.expectedGroupUpdatedAt !== undefined && currentGroup?.updatedAt !== options.expectedGroupUpdatedAt) {
            throw new FavoritesWriteError("收藏分组已变化，请重新读取", "lock");
        }
        const currentItemCount = payload.items.filter((item) => item.favoriteGroupId === groupId).length;
        if (options.expectedItemCount !== undefined && currentItemCount !== options.expectedItemCount) {
            throw new FavoritesWriteError("收藏分组下的文档数已变化，请重新读取", "lock");
        }
        // 清除该组所有收藏的 favoriteGroupId
        const nextItems = payload.items.map((item) => {
            if (item.favoriteGroupId === groupId) {
                const { favoriteGroupId: _gid, ...rest } = item;
                void _gid;
                return rest as FavoriteItemRecord;
            }
            return item;
        });
        const nextGroups = payload.groups.filter((g) => g.id !== groupId);
        return { ...payload, items: nextItems, groups: nextGroups };
    });
    dispatchFavoritesUpdated();
}

/**
 * 只读获取当前全部收藏（用于 UI 展示，不做写操作）。
 * 返回 v2 payload（groups 可能为空数组）。
 */
export async function loadFavoritesForUI(): Promise<FavoritesIndexPayloadV2> {
    const result = await readFavoritesIndexStrict();
    if (result.kind === "missing") {
        return {
            version: 2,
            updatedAt: new Date().toISOString(),
            items: [],
            groups: [],
        };
    }
    if (result.kind === "corrupt") {
        throw new FavoritesWriteError(result.reason, "read");
    }
    return result.payload;
}

/**
 * 检查收藏索引文件是否存在且可读
 */
export async function doesFavoritesIndexExist(): Promise<boolean> {
    const result = await readFavoritesIndexStrict();
    return result.kind === "ok";
}
