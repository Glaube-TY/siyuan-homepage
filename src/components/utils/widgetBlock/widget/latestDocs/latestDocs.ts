import { sql } from "@/api";

/**
 * 定义文档信息的接口
 */
export interface latestDocumentInfo {
    id: string;       // 文档ID
    content: string;    // 文档标题
    created: string;  // 创建时间（原始格式）
    updated: string;  // 最后更新时间（原始格式）
}

/**
 * 查询最新的20个文档信息
 */
export async function getLatestDocuments(): Promise<latestDocumentInfo[]> {
    try {
        const query = `
            SELECT *
            FROM blocks 
            WHERE type = 'd' 
            ORDER BY created DESC 
            LIMIT 20;
        `;
        return await sql(query);
    } catch (error) {
        console.error("Failed to fetch latest documents:", error);
        return [];
    }
}