import { sql } from "@/api";

export interface FavoritesNoteInfo {
    id: string;       // 文档ID
    content: string;  // 文档标题
    created: string;  // 创建时间（原始格式）
    updated: string;  // 最后更新时间（原始格式）
}

export async function getLatestFavoritesNotes(sortBy: string, tasksNotebookId?: string): Promise<FavoritesNoteInfo[]> {
    try {
        let notebookIds: string[] = [];
        if (tasksNotebookId) {
            notebookIds = tasksNotebookId.split(/[，,]/).map(id => id.trim()).filter(Boolean);
        }

        const query = `
            SELECT *
            FROM blocks 
            WHERE type = 'd'
            AND ial REGEXP 'customFavorites\\s*=\\s*"true"'
            ${notebookIds.length > 0 ? `AND box IN (${notebookIds.map(id => `'${id}'`).join(', ')})` : ''}
            ORDER BY ${sortBy} DESC
            LIMIT 9999999999999;
        `;
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest favorites notes:", error);
        return [];
    }
}