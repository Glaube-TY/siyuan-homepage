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
    ial?: string;     // 内置图标解析来源
}

// 仅包含日记卡片展示、排序与打开所需字段；开启内置图标时追加 ial
function buildDailyNoteFields(includeBuiltinDocIcon: boolean): string {
    const fields = ["id", "content", "created", "updated"];
    if (includeBuiltinDocIcon) {
        fields.push("ial");
    }
    return fields.join(", ");
}

/**
 * 查询最近的日记文档
 * 条件：blocks.ial 中包含以 'custom-dailynote-' 开头的字段
 */
export async function getLatestDailyNotes(
    includeBuiltinDocIcon?: boolean,
): Promise<DailyNoteInfo[]> {
    try {
        const fields = buildDailyNoteFields(Boolean(includeBuiltinDocIcon));
        const query = `
            SELECT ${fields}
            FROM blocks
            WHERE type = 'd'
            AND ial LIKE '%custom-dailynote-%'
            ORDER BY created DESC
            LIMIT 100;
        `;
        return await sql(query);
    } catch {
        return [];
    }
}