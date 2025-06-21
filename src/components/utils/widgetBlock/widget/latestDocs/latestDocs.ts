import { sql, getFile } from "@/api";

export interface latestDocumentInfo {
    id: string;
    content: string;
    updated: string;
}

export async function getLatestDocuments(
    docNotebookIds?: string,
    ensureOpenDocs?: boolean
): Promise<latestDocumentInfo[]> {
    try {
        if (ensureOpenDocs) {
            const recentDocs = await getFile("/data/storage/recent-doc.json");
            let parsedRecent = typeof recentDocs === 'string'
                ? JSON.parse(recentDocs)
                : recentDocs;

            const ids = parsedRecent.map((doc: any) => `'${doc.rootID}'`).join(',');
            const updateQuery = `SELECT id, updated FROM blocks WHERE id IN (${ids})`;
            const updates = await sql(updateQuery);

            if (docNotebookIds) {
                const targetNotebooks = docNotebookIds.split(/[，,]/).map(id => id.trim());
                const notebookQuery = `SELECT id, box FROM blocks WHERE id IN (${ids})`;
                const notebookData = await sql(notebookQuery);
                
                parsedRecent = parsedRecent.filter((doc: any) => 
                    notebookData.some((n: any) => 
                        n.id === doc.rootID && 
                        targetNotebooks.includes(n.box)
                    )
                );
            }

            return parsedRecent.map((doc: any) => ({
                id: doc.rootID,
                content: doc.title,
                updated: updates.find((u: any) => u.id === doc.rootID)?.updated || ""
            }));
        }

        let notebookIds: string[] = [];
        if (docNotebookIds) {
            notebookIds = docNotebookIds.split(/[，,]/).map(id => id.trim()).filter(Boolean);
        }

        let query = `
            SELECT *
            FROM blocks
            WHERE type = 'd'
              AND content != 'daily note'
              AND hpath NOT LIKE '/daily note/%'
        `;

        if (notebookIds.length > 0) {
            query += ` AND box IN (${notebookIds.map(id => `'${id}'`).join(', ')})`;
        }

        query += `
            ORDER BY updated DESC
            LIMIT 20;
        `;

        const result = await sql(query);
        return result;
    } catch (error) {
        console.error("Failed to fetch latest documents:", error);
        return [];
    }
}