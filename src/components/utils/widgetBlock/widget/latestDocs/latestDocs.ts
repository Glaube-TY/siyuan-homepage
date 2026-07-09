import {
    clampRecentDocsLimit,
    getRecentDocumentsApi,
    normalizeRecentDocsSortBy,
    RECENT_DOCS_MAX_LIMIT,
    splitNotebookIds,
    type RecentDocsSortBy,
} from "@/components/tools/siyuanComponentDataApi";

export interface latestDocumentInfo {
    id: string;
    content: string;
    updated?: string;
    recentTime?: string;
    recentSortBy?: RecentDocsSortBy;
    ial?: string;
}

export async function getLatestDocuments(
    docNotebookIds?: string,
    ensureOpenDocs?: boolean,
    includeBuiltinDocIcon?: boolean,
    latestDocsSortBy?: RecentDocsSortBy,
    limit = RECENT_DOCS_MAX_LIMIT,
): Promise<latestDocumentInfo[]> {
    try {
        const notebookIds = splitNotebookIds(docNotebookIds);
        const fallbackSortBy: RecentDocsSortBy = ensureOpenDocs ? "openAt" : "updated";
        const sortBy = normalizeRecentDocsSortBy(latestDocsSortBy, fallbackSortBy);

        return getRecentDocumentsApi(
            notebookIds,
            Boolean(includeBuiltinDocIcon),
            clampRecentDocsLimit(limit, RECENT_DOCS_MAX_LIMIT),
            sortBy,
        ) as Promise<latestDocumentInfo[]>;
    } catch {
        return [];
    }
}
