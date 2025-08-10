// latestDailyNotes.ts

import { sql } from "@/api";

/**
 * 定义日记文档的接口
 */
export interface DailyNoteInfo {
    id: string;       // 文档ID
    content: string;  // 文档标题
    created: string;  // 创建时间（原始格式）
    updated: string;  // 最后更新时间（原始格式）
}

/**
 * 查询最近的 20 个日记文档
 * 条件：blocks.ial 中包含以 'custom-dailynote-' 开头的字段
 */
export async function getLatestDailyNotes(): Promise<DailyNoteInfo[]> {
    try {
        const query = `
            SELECT *
            FROM blocks 
            WHERE type = 'd'
            AND ial LIKE '%custom-dailynote-%'
            ORDER BY created DESC
            LIMIT 100;
        `;
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest daily notes:", error);
        return [];
    }
}