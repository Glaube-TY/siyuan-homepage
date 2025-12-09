import { sql } from "@/api";

export async function getLatestFavoritesNotes(sortBy: string, tasksNotebookId?: string): Promise<any[]> {
    try {
        let notebookIds: string[] = [];
        if (tasksNotebookId) {
            notebookIds = tasksNotebookId.split(/[，,]/).map(id => id.trim()).filter(Boolean);
        }

        const query = `
            SELECT *
            FROM blocks 
            WHERE type = 'd'
            AND ial REGEXP 'custom-homepage-favorites\\s*=\\s*"true"'
            ORDER BY ${sortBy} DESC
        `;
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest favorites notes:", error);
        return [];
    }
}