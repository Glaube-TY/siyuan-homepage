import { sql } from "@/api";

export async function getLatestFavoritesNotes(sortBy: string, notebookId?: string): Promise<any[]> {
    try {
        let notebookIds: string[] = [];
        if (notebookId) {
            notebookIds = notebookId.split(/[，,]/).map(id => id.trim()).filter(Boolean);
        }

        let query = `
            SELECT *
            FROM blocks 
            WHERE type = 'd'
            AND ial REGEXP 'custom-homepage-favorites\\s*=\\s*"true"'
        `;

        // 添加笔记本筛选条件
        if (notebookIds.length > 0) {
            query += ` AND box IN (${notebookIds.map(id => `'${id}'`).join(', ')})`;
        }

        query += ` ORDER BY ${sortBy} DESC`;
        
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest favorites notes:", error);
        return [];
    }
}