import { sql, removeDoc } from "@/api";
import { escapeSqlString, selectPaged } from "@/components/tools/siyuanSqlPaging";

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
    const findSQL = `
        SELECT parent.id AS id,
               parent.content AS content,
               parent.box AS box,
               parent.path AS path
        FROM blocks AS parent
        LEFT JOIN blocks AS child
            ON parent.id = child.parent_id
        WHERE parent.type = 'd'
        AND NOT EXISTS (
            SELECT 1
            FROM blocks AS child_doc
            WHERE child_doc.path LIKE
                SUBSTR(parent.path, 1, LENGTH(parent.path) - 3) || '/%'
            AND child_doc.type = 'd'
        )
        GROUP BY parent.id
        HAVING (
            COUNT(child.id) = 0 OR (
                SUM(CASE WHEN child.type != 'p' THEN 1 ELSE 0 END) = 0
                AND SUM(CASE WHEN child.type = 'p' AND TRIM(COALESCE(child.content, '')) != '' THEN 1 ELSE 0 END) = 0
            )
        )
        ORDER BY parent.updated DESC, parent.id DESC
    `;

    const alldocs = await selectPaged(findSQL, { pageSize: 64, maxRows: 5000 });
    if (alldocs.length > 0) {
        return alldocs.map((doc: any) => ({
            id: doc.id,
            name: doc.content,
            notebook: doc.box,
            path: doc.path,
        }));
    }
    return [];
}

async function isEmptyDoc(doc: DocItem): Promise<boolean> {
    const checkSQL = `
        SELECT parent.id AS id
        FROM blocks AS parent
        LEFT JOIN blocks AS child 
            ON parent.id = child.parent_id
        WHERE parent.id = '${escapeSqlString(doc.id)}'
        AND parent.type = 'd'
        AND NOT EXISTS (
            SELECT 1 
            FROM blocks AS child_doc 
            WHERE child_doc.path LIKE 
                SUBSTR(parent.path, 1, LENGTH(parent.path) - 3) || '/%'
            AND child_doc.type = 'd'
        )
        GROUP BY parent.id
        HAVING (
            COUNT(child.id) = 0 OR (
                SUM(CASE WHEN child.type != 'p' THEN 1 ELSE 0 END) = 0
                AND SUM(CASE WHEN child.type = 'p' AND TRIM(COALESCE(child.content, '')) != '' THEN 1 ELSE 0 END) = 0
            )
        )
    `;

    const result = await sql(checkSQL);
    return result.length > 0;
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
