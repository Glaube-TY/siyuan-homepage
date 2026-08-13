import { splitNotebookIds, type ComponentDataResult } from "@/components/tools/siyuanComponentDataApi";
import { loadTaskData } from "@/features/task-data/task-data-service";

export interface RecentTasksInfo {
    id: string;
    markdown: string;
    content: string;
    created: string;
    updated: string;
    hpath: string;
}

export async function getLatestTasks(
    tasksNotebookId: string | undefined,
    plugin?: any,
    forceRefresh = false,
): Promise<ComponentDataResult<RecentTasksInfo>> {
    return loadTaskData(plugin, {
        notebookIds: splitNotebookIds(tasksNotebookId),
        forceRefresh,
    }) as Promise<ComponentDataResult<RecentTasksInfo>>;
}
