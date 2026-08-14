interface MobileDialogEntry {
    closeFromNavigation: () => void;
}

const activeDialogs = new Map<string, MobileDialogEntry>();
const dialogStack: string[] = [];
let sequence = 0;
let listenerInstalled = false;

function removeFromStack(id: string): void {
    const index = dialogStack.lastIndexOf(id);
    if (index >= 0) dialogStack.splice(index, 1);
}

function topDialog(): MobileDialogEntry | undefined {
    const topId = dialogStack[dialogStack.length - 1];
    return topId ? activeDialogs.get(topId) : undefined;
}

function handleBackKey(event: KeyboardEvent): void {
    const isBackKey = event.key === "Escape"
        || event.key === "BrowserBack"
        || event.key === "GoBack"
        || (event.altKey && event.key === "ArrowLeft");
    if (!isBackKey) return;

    const top = topDialog();
    if (!top) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    top.closeFromNavigation();
}

function installListener(): void {
    if (listenerInstalled || typeof window === "undefined") return;
    listenerInstalled = true;
    window.addEventListener("keydown", handleBackKey, true);
}

/**
 * 维护插件弹窗自己的返回栈，只处理 WebView/桌面能够传递到页面的返回按键。
 * 不读写浏览器 History，避免与思源的文档路由互相触发而造成页面跳转和卡顿。
 */
export function registerMobileDialogNavigation(closeNative: () => void): { close: () => void } {
    installListener();
    const id = `dialog-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
    let closed = false;

    const close = (): void => {
        if (closed) return;
        closed = true;
        activeDialogs.delete(id);
        removeFromStack(id);
        closeNative();
    };

    activeDialogs.set(id, { closeFromNavigation: close });
    dialogStack.push(id);
    return { close };
}
