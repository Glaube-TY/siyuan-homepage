/**
 * 收藏文档分组数据模型
 * 在 favorites-index.json 内增量扩展，不新增第二个分组文件。
 */

/** 虚拟未分组保留 ID，仅用于组件配置和运行时，绝不能写入 item.favoriteGroupId 或 groups */
export const VIRTUAL_UNGROUPED_ID = "__ungrouped__";

/** 虚拟默认分组显示名称 */
export const VIRTUAL_UNGROUPED_NAME = "默认分组（未分组）";

export interface FavoriteGroupRecord {
    id: string;
    name: string;
    order: number;
    createdAt: string;
    updatedAt: string;
}

export interface FavoriteItemRecord {
    id: string;
    content?: string;
    box?: string;
    path?: string;
    hpath?: string;
    icon?: string;
    created?: string;
    updated?: string;
    favoritedAt?: string;
    favoriteOrder?: number;
    favoriteGroupId?: string; // 新增可选
    [key: string]: unknown;   // 保留未知字段
}

/** version:2 完整 payload */
export interface FavoritesIndexPayloadV2 {
    version: 2;
    updatedAt: string;
    items: FavoriteItemRecord[];
    groups: FavoriteGroupRecord[];
    [key: string]: unknown; // 保留未知根字段
}

export type FavoritesIndexPayload = FavoritesIndexPayloadV2;

/** 严格读取结果 */
export type StrictReadResult =
    | { kind: "ok"; payload: FavoritesIndexPayloadV2 }
    | { kind: "missing" }
    | { kind: "corrupt"; reason: string };

/** 写操作错误 */
export class FavoritesWriteError extends Error {
    constructor(message: string, public readonly kind: "read" | "write" | "validate" | "lock") {
        super(message);
        this.name = "FavoritesWriteError";
    }
}
