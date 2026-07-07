import {
    getTaskIndexResult,
    splitNotebookIds,
    type ComponentDataResult,
} from "@/components/tools/siyuanComponentDataApi";

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
): Promise<ComponentDataResult<RecentTasksInfo>> {
    void plugin;
    return getTaskIndexResult(splitNotebookIds(tasksNotebookId)) as Promise<ComponentDataResult<RecentTasksInfo>>;
}
