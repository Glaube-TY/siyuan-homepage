/**
 * 收藏数据更新事件
 * 所有成功的收藏、取消收藏、分组、排序操作后派发，供已挂载的收藏组件订阅并重新加载。
 */

const FAVORITES_UPDATED_EVENT = "siyuan-homepage:favorites-updated";

export function dispatchFavoritesUpdated(): void {
    const runtime = globalThis as typeof globalThis & { CustomEvent?: typeof CustomEvent };
    if (typeof runtime.dispatchEvent === "function" && runtime.CustomEvent) {
        runtime.dispatchEvent(new runtime.CustomEvent(FAVORITES_UPDATED_EVENT));
    }
}

export function onFavoritesUpdated(handler: () => void): () => void {
    const runtime = globalThis as typeof globalThis;
    if (typeof runtime.addEventListener !== "function") return () => undefined;
    runtime.addEventListener(FAVORITES_UPDATED_EVENT, handler);
    return () => runtime.removeEventListener(FAVORITES_UPDATED_EVENT, handler);
}
