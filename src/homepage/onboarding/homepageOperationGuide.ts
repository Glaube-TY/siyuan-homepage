import { mount } from "svelte";
import { isSiyuanMobileFrontend, svelteDialog } from "@/libs/dialog";
import HomepageOperationGuideDialog from "./HomepageOperationGuideDialog.svelte";

export const HOMEPAGE_OPERATION_GUIDE_KEY = "siyuan-homepage:desktop-operation-guide:suppressed-v1";

export function isHomepageOperationGuideSuppressed(): boolean {
    return window.localStorage.getItem(HOMEPAGE_OPERATION_GUIDE_KEY) === "1";
}

export function suppressHomepageOperationGuide(): void {
    window.localStorage.setItem(HOMEPAGE_OPERATION_GUIDE_KEY, "1");
    if (!isHomepageOperationGuideSuppressed()) throw new Error("Operation guide preference read-back failed");
}

let activeOwner: symbol | null = null;
const waiting = new Set<() => void>();

/** One attempt per homepage instance; the window shares only the active dialog ownership. */
export function createHomepageOperationGuide(canOpen: () => boolean) {
    const owner = Symbol("homepage-operation-guide");
    let destroyed = false;
    let shown = false;
    let frame: number | null = null;
    let dialog: { close: () => void } | null = null;
    const eligible = () => !destroyed && !shown && !isSiyuanMobileFrontend() && canOpen();

    function open() {
        frame = null;
        if (!eligible()) return;
        if (activeOwner) { waiting.add(request); return; }
        let readFailed = false;
        try {
            if (isHomepageOperationGuideSuppressed()) { shown = true; return; }
        } catch { readFailed = true; }
        if (!eligible()) return;
        activeOwner = owner;
        shown = true;
        let close = () => {};
        try {
            const opened = svelteDialog({
                title: "主页操作提示",
                width: "420px",
                constructor: (target) => mount(HomepageOperationGuideDialog, { target, props: { onClose: () => close(), readFailed } }),
                callback: () => {
                    dialog = null;
                    if (activeOwner !== owner) return;
                    activeOwner = null;
                    const pending = [...waiting];
                    waiting.clear();
                    pending.forEach((retry) => retry());
                },
            });
            close = opened.close;
            if (destroyed || activeOwner !== owner) opened.close();
            else dialog = opened;
        } catch {
            shown = false;
            if (activeOwner === owner) activeOwner = null;
            console.warn("[Homepage] 操作提示暂时无法打开。");
        }
    }

    function request() {
        if (frame !== null || waiting.has(request) || !eligible()) return;
        // Let the ready state reach a painted frame, then recheck visibility before taking focus.
        frame = requestAnimationFrame(() => {
            frame = null;
            if (eligible()) frame = requestAnimationFrame(open);
        });
    }

    return {
        request,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            waiting.delete(request);
            const ownedDialog = dialog;
            dialog = null;
            ownedDialog?.close();
        },
    };
}
