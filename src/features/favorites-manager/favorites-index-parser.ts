import type {
    FavoriteGroupRecord,
    FavoriteItemRecord,
    FavoritesIndexPayloadV2,
    StrictReadResult,
} from "./types";

export const LEGACY_FAVORITES_UPDATED_AT = "1970-01-01T00:00:00.000Z";

const RUNTIME_PAYLOAD_KEYS = new Set(["version", "updatedAt", "items", "groups"]);

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function createRuntimePayload(
    source: Record<string, unknown>,
    items: unknown[],
    groups: unknown[],
    updatedAt: string,
): FavoritesIndexPayloadV2 {
    const payload: FavoritesIndexPayloadV2 = {
        version: 2,
        updatedAt,
        items: items as FavoriteItemRecord[],
        groups: groups as FavoriteGroupRecord[],
    };

    for (const key of Object.keys(source)) {
        if (!RUNTIME_PAYLOAD_KEYS.has(key)) {
            (payload as Record<string, unknown>)[key] = source[key];
        }
    }

    return payload;
}

export function parseFavoritesIndexPayload(parsed: unknown): StrictReadResult {
    if (parsed === undefined || parsed === null || typeof parsed !== "object") {
        return { kind: "corrupt", reason: "收藏索引文件内容为空或不是有效 JSON 对象" };
    }

    if (Array.isArray(parsed)) {
        return {
            kind: "ok",
            payload: createRuntimePayload({}, parsed, [], LEGACY_FAVORITES_UPDATED_AT),
        };
    }

    const obj = parsed as Record<string, unknown>;
    if (obj.version === 2) {
        if (!Array.isArray(obj.items)) {
            return { kind: "corrupt", reason: "收藏索引 items 不是数组" };
        }
        if (!Array.isArray(obj.groups)) {
            return { kind: "corrupt", reason: "收藏索引 groups 不是数组" };
        }
        if (!isNonEmptyString(obj.updatedAt)) {
            return { kind: "corrupt", reason: "收藏索引 updatedAt 无效" };
        }
        return { kind: "ok", payload: createRuntimePayload(obj, obj.items, obj.groups, obj.updatedAt) };
    }

    if (obj.version === 1) {
        if (!Array.isArray(obj.items)) {
            return { kind: "corrupt", reason: "收藏索引 items 不是数组" };
        }
        if (Object.prototype.hasOwnProperty.call(obj, "groups") && !Array.isArray(obj.groups)) {
            return { kind: "corrupt", reason: "收藏索引 groups 不是数组" };
        }
        if (
            Object.prototype.hasOwnProperty.call(obj, "updatedAt")
            && !isNonEmptyString(obj.updatedAt)
        ) {
            return { kind: "corrupt", reason: "收藏索引 updatedAt 无效" };
        }
        return {
            kind: "ok",
            payload: createRuntimePayload(
                obj,
                obj.items,
                Array.isArray(obj.groups) ? obj.groups : [],
                isNonEmptyString(obj.updatedAt) ? obj.updatedAt : LEGACY_FAVORITES_UPDATED_AT,
            ),
        };
    }

    return { kind: "corrupt", reason: `收藏索引版本不受支持：${String(obj.version)}` };
}
