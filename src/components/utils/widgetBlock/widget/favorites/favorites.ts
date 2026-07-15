import {
    getFavoritesIndexResult,
    splitNotebookIds,
    type ComponentDataResult,
    type ComponentDocInfo,
} from "@/components/tools/siyuanComponentDataApi";

export type FavoritesSortOrder =
    | "createdDesc"
    | "createdAsc"
    | "updatedDesc"
    | "updatedAsc"
    | "favoritedDesc"
    | "favoritedAsc"
    | "nameAsc"
    | "nameDesc"
    | "manual";

export const FAVORITES_SORT_OPTIONS: Array<{
    value: FavoritesSortOrder;
    label: string;
}> = [
    { value: "favoritedDesc", label: "收藏时间（新到旧）" },
    { value: "favoritedAsc", label: "收藏时间（旧到新）" },
    { value: "updatedDesc", label: "更新时间（新到旧）" },
    { value: "updatedAsc", label: "更新时间（旧到新）" },
    { value: "createdDesc", label: "创建时间（新到旧）" },
    { value: "createdAsc", label: "创建时间（旧到新）" },
    { value: "nameAsc", label: "名称（A 到 Z）" },
    { value: "nameDesc", label: "名称（Z 到 A）" },
    { value: "manual", label: "自定义排序" },
];

export function normalizeFavoritesSortOrder(
    value: unknown,
): FavoritesSortOrder {
    if (value === "created") return "createdDesc";
    if (value === "updated") return "updatedDesc";
    return FAVORITES_SORT_OPTIONS.some((option) => option.value === value)
        ? value as FavoritesSortOrder
        : "favoritedDesc";
}

export function favoriteTimeValue(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (/^\d{14}$/.test(text)) {
        const timestamp = new Date(
            Number(text.slice(0, 4)),
            Number(text.slice(4, 6)) - 1,
            Number(text.slice(6, 8)),
            Number(text.slice(8, 10)),
            Number(text.slice(10, 12)),
            Number(text.slice(12, 14)),
        ).getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
    }
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function compareOptionalTime(
    left: unknown,
    right: unknown,
    direction: "asc" | "desc",
): number {
    const a = favoriteTimeValue(left);
    const b = favoriteTimeValue(right);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return direction === "asc" ? a - b : b - a;
}

export function sortFavoriteNotes(
    items: ComponentDocInfo[],
    rawSortOrder: unknown,
): ComponentDocInfo[] {
    const sortOrder = normalizeFavoritesSortOrder(rawSortOrder);
    return items
        .map((item, index) => ({ item, index }))
        .sort((left, right) => {
            let result = 0;
            if (sortOrder === "manual") {
                const leftOrder = typeof left.item.favoriteOrder === "number"
                    && Number.isFinite(left.item.favoriteOrder)
                    ? left.item.favoriteOrder
                    : left.index;
                const rightOrder = typeof right.item.favoriteOrder === "number"
                    && Number.isFinite(right.item.favoriteOrder)
                    ? right.item.favoriteOrder
                    : right.index;
                result = leftOrder - rightOrder;
            } else if (sortOrder === "nameAsc" || sortOrder === "nameDesc") {
                result = String(left.item.content || "").localeCompare(
                    String(right.item.content || ""),
                    "zh-CN",
                    { numeric: true, sensitivity: "base" },
                );
                if (sortOrder === "nameDesc") result *= -1;
            } else if (sortOrder.startsWith("created")) {
                result = compareOptionalTime(
                    left.item.created,
                    right.item.created,
                    sortOrder.endsWith("Asc") ? "asc" : "desc",
                );
            } else if (sortOrder.startsWith("updated")) {
                result = compareOptionalTime(
                    left.item.updated,
                    right.item.updated,
                    sortOrder.endsWith("Asc") ? "asc" : "desc",
                );
            } else {
                result = compareOptionalTime(
                    left.item.favoritedAt,
                    right.item.favoritedAt,
                    sortOrder.endsWith("Asc") ? "asc" : "desc",
                );
            }
            return result || left.index - right.index;
        })
        .map(({ item }) => item);
}

export async function getLatestFavoritesNotes(
    sortBy: unknown,
    notebookId: string | undefined,
    includeBuiltinDocIcon: boolean | undefined,
    plugin?: any,
): Promise<ComponentDataResult<ComponentDocInfo>> {
    void includeBuiltinDocIcon;
    const result = await getFavoritesIndexResult(
        splitNotebookIds(notebookId),
        plugin,
    );
    return {
        ...result,
        items: sortFavoriteNotes(result.items, sortBy),
    };
}
