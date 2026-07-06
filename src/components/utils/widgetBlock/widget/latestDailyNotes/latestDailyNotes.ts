// latestDailyNotes.ts

import {
    getLatestDailyNotesResult as getLatestDailyNotesDataResult,
    getRecentDailyNotesApi,
    type ComponentDataResult,
} from "@/components/tools/siyuanComponentDataApi";
import { ENHANCED_DIARY_CONFIG_FILE } from "../enhancedDiary/enhancedDiaryTypes";

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

/**
 * 查询最近的日记文档
 */
export async function getLatestDailyNotes(
    includeBuiltinDocIcon?: boolean,
): Promise<DailyNoteInfo[]> {
    try {
        return await getRecentDailyNotesApi(Boolean(includeBuiltinDocIcon)) as DailyNoteInfo[];
    } catch {
        return [];
    }
}

export async function getLatestDailyNotesWithStatus(
    plugin: any,
    includeBuiltinDocIcon?: boolean,
): Promise<ComponentDataResult<DailyNoteInfo>> {
    let dailyNotebookId = "";
    try {
        const config = await plugin?.loadData?.(ENHANCED_DIARY_CONFIG_FILE);
        dailyNotebookId = String(config?.dailyNotebookId || "").trim();
    } catch {
        dailyNotebookId = "";
    }
    return getLatestDailyNotesDataResult(Boolean(includeBuiltinDocIcon), dailyNotebookId) as Promise<ComponentDataResult<DailyNoteInfo>>;
}
