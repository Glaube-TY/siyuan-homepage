import {
    getFavoritesIndexResult,
    splitNotebookIds,
    type ComponentDataResult,
} from "@/components/tools/siyuanComponentDataApi";

export async function getLatestFavoritesNotes(
    sortBy: string,
    notebookId: string | undefined,
    includeBuiltinDocIcon: boolean | undefined,
    plugin?: any,
): Promise<ComponentDataResult<any>> {
    void sortBy;
    void includeBuiltinDocIcon;
    void plugin;
    return getFavoritesIndexResult(splitNotebookIds(notebookId));
}
