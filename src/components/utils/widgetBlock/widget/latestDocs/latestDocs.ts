import { sql } from "@/api";

/**
 * 定义文档信息的接口
 */
export interface latestDocumentInfo {
    id: string;       // 文档ID
    content: string;    // 文档标题
    updated: string;  // 最后更新时间（原始格式）
}

/**
 * 查询指定笔记本下的最新20个文档信息
 */
export async function getLatestDocuments(docNotebookIds?: string): Promise<latestDocumentInfo[]> {
    try {
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

        // 如果有笔记本ID，则添加过滤条件
        if (notebookIds.length > 0) {
            query += ` AND box IN (${notebookIds.map(id => `'${id}'`).join(', ')})`;
        }

        query += `
            ORDER BY updated DESC
            LIMIT 20;
        `;

        const result = await sql(query); // 使用参数化查询防止SQL注入
        return result;
    } catch (error) {
        console.error("Failed to fetch latest documents:", error);
        return [];
    }
}