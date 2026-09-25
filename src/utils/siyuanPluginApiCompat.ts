export function removeTopBarWithFallback(
    plugin: { removeTopBar?: (id: string) => void },
    id: string,
    fallback: () => void,
): void {
    if (typeof plugin.removeTopBar === "function") {
        plugin.removeTopBar(id);
    } else {
        fallback();
    }
}

export function supportsDynamicToolbar(
    plugin: { addToolbarItem?: unknown; removeToolbarItem?: unknown },
): boolean {
    return typeof plugin.addToolbarItem === "function"
        && typeof plugin.removeToolbarItem === "function";
}
