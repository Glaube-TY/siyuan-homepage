export interface IdleTaskOptions {
    timeout?: number;
}

type IdleWindow = Window & typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: IdleTaskOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
};

/**
 * 将不影响当前交互的工作安排到浏览器空闲期，并提供可用于卸载清理的取消函数。
 * 不支持 requestIdleCallback 的 WebView 使用短延时降级，避免同步挤占首帧。
 */
export function scheduleIdleTask(task: () => void, options: IdleTaskOptions = {}): () => void {
    if (typeof window === "undefined") {
        task();
        return () => undefined;
    }

    const target = window as IdleWindow;
    if (typeof target.requestIdleCallback === "function") {
        const handle = target.requestIdleCallback(task, { timeout: options.timeout ?? 1200 });
        return () => target.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(task, Math.min(options.timeout ?? 1200, 32));
    return () => window.clearTimeout(handle);
}
