import {
    buildFtsMatchClause,
    escapeSqlLike,
    normalizeSortField,
    selectByIdsBatched,
    selectPaged,
} from "@/components/tools/siyuanSqlPaging";

const ALLOWED_SORT_FIELDS = ["updated", "created", "content", "sort"];

// 仅包含条件文档卡片展示、排序与打开所需字段；
// sortOrder 为 sort 时追加 sort，开启内置图标时追加 ial
function buildDocFields(sortOrder: string, includeBuiltinDocIcon: boolean): string {
    const fields = ["id", "content", "created", "updated"];
    if (sortOrder === "sort") {
        fields.push("sort");
    }
    if (includeBuiltinDocIcon) {
        fields.push("ial");
    }
    return fields.join(", ");
}

function normalizeConditionSortOrder(sortOrder: string): string {
    return normalizeSortField(sortOrder, ALLOWED_SORT_FIELDS, "updated");
}

function buildPositionWhere(position: string): string {
    switch (position) {
        case "DocTitle":
            return "AND type = 'd'";
        case "body":
            return "AND type != 'd'";
        case "bodyTitle":
            return "AND type = 'h'";
        case "paragraph":
            return "AND type = 'p'";
        case "list":
            return "AND type IN ('l', 'i')";
        case "table":
            return "AND type = 't'";
        case "code":
            return "AND type = 'c'";
        case "quote":
            return "AND type = 'b'";
        case "formula":
            return "AND type = 'm'";
        case "anywhere":
        default:
            return "";
    }
}

function splitSearchTerms(keyword: string): string[] {
    return keyword
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .slice(0, 8);
}

function buildContentFtsClause(position: string, keyword: string): string {
    const terms = splitSearchTerms(keyword);
    if (terms.length === 0) {
        return "1=0";
    }
    return buildFtsMatchClause(terms, ["content"], {
        prefix: position === "DocTitle",
        limit: 2000,
    });
}

async function searchContentRows(
    position: string,
    keyword: string,
    sortOrder: string,
): Promise<any[]> {
    const safeSort = normalizeConditionSortOrder(sortOrder);
    const ftsClause = buildContentFtsClause(position, keyword);
    const positionWhere = buildPositionWhere(position);

    const query = `
        SELECT id, root_id, type
        FROM blocks
        WHERE ${ftsClause}
        ${positionWhere}
        ORDER BY ${safeSort} DESC, id DESC
    `;
    return selectPaged(query, { pageSize: 64, maxRows: 2000 });
}

async function searchDocTitleRows(
    keyword: string,
    sortOrder: string,
    includeBuiltinDocIcon: boolean,
): Promise<any[]> {
    const safeSort = normalizeConditionSortOrder(sortOrder);
    const fields = buildDocFields(safeSort, includeBuiltinDocIcon);
    const ftsClause = buildContentFtsClause("DocTitle", keyword);

    const query = `
        SELECT ${fields}
        FROM blocks
        WHERE type = 'd'
        AND ${ftsClause}
        ORDER BY ${safeSort} DESC, id DESC
    `;
    return selectPaged(query, { pageSize: 64, maxRows: 2000 });
}

function dedupeAndSortDocs(docs: any[], sortOrder: string): any[] {
    const map = new Map<string, any>();
    for (const doc of docs) {
        if (doc?.id && !map.has(doc.id)) {
            map.set(doc.id, doc);
        }
    }

    const result = Array.from(map.values());
    result.sort((a, b) => {
        const aValue = a[sortOrder];
        const bValue = b[sortOrder];

        if (typeof aValue === "string" && typeof bValue === "string") {
            return bValue.localeCompare(aValue);
        }

        if (typeof aValue === "number" && typeof bValue === "number") {
            return bValue - aValue;
        }

        return 0;
    });

    return result;
}

export async function getConditionDocsByKeyword(
    conditionDocsKeyPosition: string,
    conditionDocsKeyWord: string,
    conditionDocsSortOrder: string,
    includeBuiltinDocIcon: boolean,
) {
    const keyword = conditionDocsKeyWord.trim();
    if (!keyword) {
        return [];
    }

    const safeSort = normalizeConditionSortOrder(conditionDocsSortOrder);
    const fields = buildDocFields(safeSort, includeBuiltinDocIcon);

    if (conditionDocsKeyPosition === "DocTitle") {
        const rows = await searchDocTitleRows(keyword, safeSort, includeBuiltinDocIcon);
        return dedupeAndSortDocs(rows, safeSort);
    }

    const contentRows = await searchContentRows(
        conditionDocsKeyPosition,
        keyword,
        safeSort,
    );

    const rootIds: string[] = [];
    for (const item of contentRows) {
        if (item.root_id) {
            rootIds.push(item.root_id);
        }
    }

    if (rootIds.length === 0) {
        return [];
    }

    const docs = await selectByIdsBatched(
        rootIds,
        (escapedIds) => `
            SELECT ${fields}
            FROM blocks
            WHERE type = 'd'
            AND id IN (${escapedIds})
            ORDER BY ${safeSort} DESC, id DESC
        `,
        64,
    );

    return dedupeAndSortDocs(docs, safeSort);
}

export async function getConditionDocsByTag(
    tag: string,
    sortOrder: string,
    includeBuiltinDocIcon: boolean,
) {
    const trimmedTag = tag.trim();
    if (!trimmedTag) {
        return [];
    }

    const safeSort = normalizeConditionSortOrder(sortOrder);
    const escapedTag = escapeSqlLike(trimmedTag);
    const fields = buildDocFields(safeSort, includeBuiltinDocIcon);

    const query = `
        SELECT ${fields}
        FROM blocks
        WHERE type = 'd'
        AND tag LIKE '%${escapedTag}%' ESCAPE '\\'
        ORDER BY ${safeSort} DESC, id DESC
    `;

    const rows = await selectPaged(query, { pageSize: 64, maxRows: 2000 });
    return dedupeAndSortDocs(rows, safeSort);
}
