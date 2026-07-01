import { sql, getFile } from "@/api";
import { escapeSqlString, selectByIdsBatched } from "@/components/tools/siyuanSqlPaging";

export interface latestDocumentInfo {
    id: string;
    content: string;
    updated: string;
    ial?: string;
}

// 仅包含最近文档卡片展示、排序与打开所需字段；开启内置图标时追加 ial
function buildLatestDocFields(includeBuiltinDocIcon: boolean): string {
    const fields = ["id", "content", "updated"];
    if (includeBuiltinDocIcon) {
        fields.push("ial");
    }
    return fields.join(", ");
}

export async function getLatestDocuments(
    docNotebookIds?: string,
    ensureOpenDocs?: boolean,
    includeBuiltinDocIcon?: boolean,
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

            const recentDocFields = [
                "id",
                "content",
                "updated",
                "box",
                ...(includeBuiltinDocIcon ? ["ial"] : []),
            ].join(", ");

            const blocksData = await selectByIdsBatched(
                rootIds,
                (escapedIds) => `
                    SELECT ${recentDocFields}
                    FROM blocks
                    WHERE id IN (${escapedIds})
                    ORDER BY updated DESC, id DESC
                `,
                64,
            );

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
                    const result: latestDocumentInfo = {
                        id: doc.rootID,
                        content: block.content || "(无标题)",
                        updated: block.updated || "",
                    };
                    if (includeBuiltinDocIcon && block.ial) {
                        result.ial = block.ial;
                    }
                    return result;
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

        const boxFilter = notebookIds.length > 0
            ? `AND box IN (${notebookIds.map(id => `'${escapeSqlString(id)}'`).join(", ")})`
            : "";
        const fields = buildLatestDocFields(Boolean(includeBuiltinDocIcon));

        const query = `
            SELECT ${fields}
            FROM blocks
            WHERE type = 'd'
              AND content != 'daily note'
              AND hpath NOT LIKE '/daily note/%'
            ${boxFilter}
            ORDER BY updated DESC, id DESC
            LIMIT 100
        `;

        const result = await sql(query);
        return Array.isArray(result) ? result : [];
    } catch {
        return [];
    }
}
