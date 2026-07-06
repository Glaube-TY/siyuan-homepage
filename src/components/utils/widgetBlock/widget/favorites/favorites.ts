import {
    getFavoritesIndexResult,
    getHomepageGlobalSqlPolicy,
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
    const policy = plugin ? await getHomepageGlobalSqlPolicy(plugin) : undefined;
    return getFavoritesIndexResult(splitNotebookIds(notebookId), policy, plugin);
}
