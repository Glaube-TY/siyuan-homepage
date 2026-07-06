import { removeDoc } from "@/api";

export interface DocItem {
    id: string;
    name: string;
    notebook: string;
    path: string;
}

export interface DeleteResult {
    deleted: DocItem[];
    skipped: DocItem[];
    failed: { doc: DocItem; error: unknown }[];
}

export async function findEmptyDocuments(): Promise<DocItem[]> {
    return [];
}

async function isEmptyDoc(doc: DocItem): Promise<boolean> {
    void doc;
    return false;
}

export async function deleteEmptyDocuments(docs: DocItem[]): Promise<DeleteResult> {
    const result: DeleteResult = {
        deleted: [],
        skipped: [],
        failed: [],
    };

    for (const doc of docs) {
        try {
            const stillEmpty = await isEmptyDoc(doc);
            if (!stillEmpty) {
                result.skipped.push(doc);
                continue;
            }
            await removeDoc(doc.notebook, doc.path);
            result.deleted.push(doc);
        } catch (error) {
            result.failed.push({ doc, error });
        }
    }

    return result;
}
