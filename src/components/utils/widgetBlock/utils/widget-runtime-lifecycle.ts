export function destroyMountedWidgetBlocks(container: Element | null | undefined): void {
    if (!container) return;
    const blocks: Element[] = [];
    if (container.matches(".widget-block")) blocks.push(container);
    blocks.push(...Array.from(container.querySelectorAll(".widget-block")));
    for (const block of blocks) {
        const instance = (block as HTMLElement & {
            __widgetBlockInstance?: { destroy?: () => void };
        }).__widgetBlockInstance;
        if (!instance || typeof instance.destroy !== "function") continue;
        try {
            instance.destroy();
        } catch (error) {
            console.warn("[WidgetRuntimeLifecycle] 销毁组件实例失败，继续处理其他组件", error);
        }
    }
}
