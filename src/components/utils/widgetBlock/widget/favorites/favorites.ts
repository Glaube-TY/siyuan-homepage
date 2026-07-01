import {
    escapeSqlString,
    normalizeSortField,
    selectPaged,
} from "@/components/tools/siyuanSqlPaging";

const ALLOWED_SORT_FIELDS = ["updated", "created", "sort"];

// 仅包含收藏文档卡片展示、排序与打开所需字段；
// sortOrder 为 sort 时追加 sort，开启内置图标时追加 ial
function buildFavoritesFields(sortBy: string, includeBuiltinDocIcon: boolean): string {
    const fields = ["id", "content", "created", "updated"];
    if (sortBy === "sort") {
        fields.push("sort");
    }
    if (includeBuiltinDocIcon) {
        fields.push("ial");
    }
    return fields.join(", ");
}

export async function getLatestFavoritesNotes(
    sortBy: string,
    notebookId?: string,
    includeBuiltinDocIcon?: boolean,
): Promise<any[]> {
    let notebookIds: string[] = [];
    if (notebookId) {
        notebookIds = notebookId.split(/[，,]/).map(id => id.trim()).filter(Boolean);
    }

    const safeSort = normalizeSortField(sortBy, ALLOWED_SORT_FIELDS, "updated");
    const boxFilter = notebookIds.length > 0
        ? `AND box IN (${notebookIds.map(id => `'${escapeSqlString(id)}'`).join(", ")})`
        : "";
    const fields = buildFavoritesFields(safeSort, Boolean(includeBuiltinDocIcon));

    const query = `
        SELECT ${fields}
        FROM blocks
        WHERE type = 'd'
        AND ial REGEXP 'custom-homepage-favorites\\s*=\\s*"true"'
        ${boxFilter}
        ORDER BY ${safeSort} DESC, id DESC
    `;

    return selectPaged(query, { pageSize: 64, maxRows: 1000 });
}
