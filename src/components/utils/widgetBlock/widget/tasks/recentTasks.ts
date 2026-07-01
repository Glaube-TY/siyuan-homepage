import { escapeSqlString, selectPaged } from "@/components/tools/siyuanSqlPaging";

export interface RecentTasksInfo {
    id: string;
    markdown: string;
    content: string;
    created: string;
    updated: string;
    hpath: string;
}

// 仅包含最近任务卡片展示、排序、来源与状态更新所需字段
const TASK_FIELDS = [
    "id",
    "markdown",
    "content",
    "created",
    "updated",
    "hpath",
    "box",
].join(", ");

export async function getLatestTasks(tasksNotebookId?: string): Promise<RecentTasksInfo[]> {
    let notebookIds: string[] = [];
    if (tasksNotebookId) {
        notebookIds = tasksNotebookId.split(/[，,]/).map(id => id.trim()).filter(Boolean);
    }
    const boxFilter = notebookIds.length > 0
        ? `AND box IN (${notebookIds.map(id => `'${escapeSqlString(id)}'`).join(", ")})`
        : "";
    const query = `
        SELECT ${TASK_FIELDS}
        FROM blocks
        WHERE subtype = 't' AND type != 'l'
        ${boxFilter}
        ORDER BY updated DESC, id DESC
    `;
    return selectPaged(query, { pageSize: 64, maxRows: 2000 });
}