import { sql } from "@/api";

export interface RecentTasksInfo {
    id: string;
    markdown: string;
    content: string;
    created: string;
    updated: string;
    hpath: string;
}

export async function getLatestTasks(tasksNotebookId?: string): Promise<RecentTasksInfo[]> {
    try {
        let notebookIds: string[] = [];
        if (tasksNotebookId) {
            notebookIds = tasksNotebookId.split(/[，,]/).map(id => id.trim()).filter(Boolean);
        }
        let query = `
            SELECT *
            FROM blocks 
            WHERE subtype = 't' AND type != 'l'
            ${notebookIds.length > 0 ? `AND box IN (${notebookIds.map(id => `'${id}'`).join(', ')})` : ''}
            ORDER BY updated DESC
            LIMIT 9999999999999
        `;
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest tasks:", error);
        return [];
    }
}