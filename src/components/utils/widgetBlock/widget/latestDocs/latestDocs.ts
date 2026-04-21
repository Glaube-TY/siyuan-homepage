import { sql, getFile } from "@/api";

export interface latestDocumentInfo {
    id: string;
    content: string;
    updated: string;
    icon?: string;
    ial?: string;
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

            // 提取所有 rootID
            const rootIds = parsedRecent.map((doc: any) => doc.rootID);
            if (rootIds.length === 0) {
                return [];
            }

            const ids = rootIds.map((id: string) => `'${id}'`).join(',');

            // 一次性从 blocks 表查询所有需要的字段（包含 ial 用于兜底提取 icon）
            const blocksQuery = `SELECT id, content, updated, box, icon, ial FROM blocks WHERE id IN (${ids})`;
            const blocksData = await sql(blocksQuery);

            // 创建 id -> blockData 的映射，方便快速查找
            const blockMap = new Map();
            for (const block of blocksData) {
                blockMap.set(block.id, block);
            }

            // 如果有笔记本过滤，先过滤 parsedRecent
            if (docNotebookIds) {
                const targetNotebooks = docNotebookIds.split(/[，,]/).map(id => id.trim());
                parsedRecent = parsedRecent.filter((doc: any) => {
                    const block = blockMap.get(doc.rootID);
                    return block && targetNotebooks.includes(block.box);
                });
            }

            // 组装结果，只返回在 blocks 中存在的文档
            const result = parsedRecent
                .map((doc: any) => {
                    const block = blockMap.get(doc.rootID);
                    if (!block) {
                        return null;
                    }
                    return {
                        id: doc.rootID,
                        content: block.content || "(无标题)",
                        updated: block.updated || "",
                        icon: block.icon || "",
                        ial: block.ial || ""
                    };
                })
                .filter((doc: any): doc is latestDocumentInfo => doc !== null);

            // 按 updated 倒序排序（新的在前）
            result.sort((a, b) => {
                // 空值放后面
                if (!a.updated) return 1;
                if (!b.updated) return -1;
                // 倒序比较
                return b.updated.localeCompare(a.updated);
            });

            return result;
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
            LIMIT 100;
        `;

        const result = await sql(query);
        return result;
    } catch (error) {
        console.error("Failed to fetch latest documents:", error);
        return [];
    }
}