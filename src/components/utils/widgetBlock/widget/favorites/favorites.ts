import {
    getFavoritesIndexResult,
    splitNotebookIds,
    type ComponentDataResult,
    type ComponentDocInfo,
} from "@/components/tools/siyuanComponentDataApi";
import {
    VIRTUAL_UNGROUPED_ID,
    VIRTUAL_UNGROUPED_NAME,
    type FavoriteGroupRecord,
} from "@/features/favorites-manager/types";
import { loadFavoritesForUI } from "@/features/favorites-manager/favorites-store";

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

/**
 * 分组解析结果，明确区分各种异常状态。
 */
export interface GroupedResult {
    /** 最终可展示的分组 Map */
    groups: Map<string, { name: string; items: ComponentDocInfo[] }>;
    /** 组件配置中选择了但当前 groups 中不存在的 ID */
    invalidSelectedGroupIds: string[];
    /** favoriteGroupId 指向不存在分组的收藏文档 */
    orphanedItems: ComponentDocInfo[];
    /** 是否配置了特定分组筛选 */
    hasSelection: boolean;
}

/**
 * 按分组归并收藏文档。
 * selectedGroupIds 为 null 表示显示全部组（分组关闭时传入 null）。
 * 空字符串 = 全部分组。
 * 虚拟默认分组固定最前，其他组按 order 排序。
 */
export function groupFavoritesByGroup(
    items: ComponentDocInfo[],
    groups: FavoriteGroupRecord[],
    groupIdsRaw: string,
): GroupedResult {
    const groupMap = new Map<string, { name: string; items: ComponentDocInfo[] }>();
    const invalidSelectedGroupIds: string[] = [];
    const orphanedItems: ComponentDocInfo[] = [];

    // 解析选择的分组 ID（逗号分隔）；空字符串 = 全部
    const selectedIds = groupIdsRaw
        ? groupIdsRaw.split(",").map((id) => id.trim()).filter(Boolean)
        : null;
    const hasSelection = selectedIds !== null && selectedIds.length > 0;

    const selectedSet = selectedIds !== null ? new Set(selectedIds) : null;
    const validGroupIds = new Set(groups.map((g) => g.id));

    // 检测无效选择
    if (selectedSet !== null) {
        for (const id of selectedSet) {
            if (id !== VIRTUAL_UNGROUPED_ID && !validGroupIds.has(id)) {
                invalidSelectedGroupIds.push(id);
            }
        }
    }

    // 按组排序（虚拟默认组最前）
    const sortedGroups = groups.slice().sort((a, b) => {
        const aOrder = a.order ?? 0;
        const bOrder = b.order ?? 0;
        return aOrder - bOrder;
    });

    // 虚拟默认分组始终最前
    const ungroupedItems = items.filter(
        (item) => !(item as any).favoriteGroupId || (item as any).favoriteGroupId === "" || (item as any).favoriteGroupId === VIRTUAL_UNGROUPED_ID,
    );
    if (
        (selectedSet === null || selectedSet.has(VIRTUAL_UNGROUPED_ID)) &&
        ungroupedItems.length > 0
    ) {
        groupMap.set(VIRTUAL_UNGROUPED_ID, { name: VIRTUAL_UNGROUPED_NAME, items: ungroupedItems });
    }

    // 遍历自定义分组（按 order 排序）
    for (const group of sortedGroups) {
        if (selectedSet !== null && !selectedSet.has(group.id)) continue;
        const groupItems = items.filter(
            (item) => (item as any).favoriteGroupId === group.id,
        );
        if (groupItems.length > 0) {
            groupMap.set(group.id, { name: group.name, items: groupItems });
        }
    }

    // 检测孤立收藏（favoriteGroupId 指向不存在分组）
    for (const item of items) {
        const gid = (item as any).favoriteGroupId;
        if (gid && gid !== VIRTUAL_UNGROUPED_ID && !validGroupIds.has(gid)) {
            orphanedItems.push(item);
        }
    }

    return { groups: groupMap, invalidSelectedGroupIds, orphanedItems, hasSelection };
}

export type GroupListResult =
    | { kind: "ok"; groups: FavoriteGroupRecord[] }
    | { kind: "error"; message: string };

/**
 * 加载分组列表供组件设置使用。
 * 区分"读取失败"和"确实没有分组"。
 */
export async function loadGroupListForSettings(): Promise<GroupListResult> {
    try {
        const payload = await loadFavoritesForUI();
        return { kind: "ok", groups: payload.groups };
    } catch (error) {
        return { kind: "error", message: error instanceof Error ? error.message : "分组列表暂不可用" };
    }
}
