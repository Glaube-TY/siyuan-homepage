import { sql } from "@/api";

export interface FavoritesNoteInfo {
    id: string;       // 文档ID
    content: string;  // 文档标题
    created: string;  // 创建时间（原始格式）
    updated: string;  // 最后更新时间（原始格式）
}

export async function getLatestFavoritesNotes(): Promise<FavoritesNoteInfo[]> {
    try {
        const query = `
            SELECT *
            FROM blocks 
            WHERE type = 'd'
            AND ial REGEXP 'customFavorites\\s*=\\s*"true"'
            ORDER BY created DESC
            LIMIT 9999999999999;
        `;
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest favorites notes:", error);
        return [];
    }
}