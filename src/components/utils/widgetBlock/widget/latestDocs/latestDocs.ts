import {
    getRecentDocumentsApi,
    getRecentDocumentsFromStorageApi,
    splitNotebookIds,
} from "@/components/tools/siyuanComponentDataApi";

export interface latestDocumentInfo {
    id: string;
    content: string;
    updated: string;
    ial?: string;
}

export async function getLatestDocuments(
    docNotebookIds?: string,
    ensureOpenDocs?: boolean,
    includeBuiltinDocIcon?: boolean,
): Promise<latestDocumentInfo[]> {
    try {
        const notebookIds = splitNotebookIds(docNotebookIds);
        if (ensureOpenDocs) {
            return getRecentDocumentsFromStorageApi(
                notebookIds,
                Boolean(includeBuiltinDocIcon),
                100,
            ) as Promise<latestDocumentInfo[]>;
        }

        return getRecentDocumentsApi(
            notebookIds,
            Boolean(includeBuiltinDocIcon),
            100,
        ) as Promise<latestDocumentInfo[]>;
    } catch {
        return [];
    }
}
