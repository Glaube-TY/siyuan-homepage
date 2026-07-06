import {
    normalizeSortField,
} from "@/components/tools/siyuanSqlPaging";
import {
    searchDocsByKeywordApi,
    searchDocsByTagApi,
} from "@/components/tools/siyuanComponentDataApi";

const ALLOWED_SORT_FIELDS = ["updated", "created", "content", "sort"];

function normalizeConditionSortOrder(sortOrder: string): string {
    return normalizeSortField(sortOrder, ALLOWED_SORT_FIELDS, "updated");
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
    return searchDocsByKeywordApi(
        conditionDocsKeyPosition,
        keyword,
        safeSort,
        includeBuiltinDocIcon,
    );
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
    return searchDocsByTagApi(trimmedTag, safeSort, includeBuiltinDocIcon);
}
