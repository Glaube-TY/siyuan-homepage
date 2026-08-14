import { registerMobileDialogNavigation } from "./mobileDialogNavigation";

const PORTAL_ID = "siyuan-homepage-mobile-dialog-portal";
const BODY_OPEN_CLASS = "siyuan-homepage-mobile-overlay-open";
const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(",");

export type MobileDialogPresentation = "workspace" | "prompt" | "disabled";
export type MobileDialogHeader = "auto" | "visible" | "hidden";
export type MobileDialogCloseControl = "portal" | "content";

export interface MobilePortalDialogHandle {
    element: HTMLElement;
    destroy: () => void;
}

interface CreateMobileDialogPortalOptions {
    title: string;
    presentation: Exclude<MobileDialogPresentation, "disabled">;
    header: MobileDialogHeader;
    closeControl: MobileDialogCloseControl;
    closeOnBack: boolean;
    onDestroy: () => void;
}

function getPortalHost(): HTMLElement {
    const existing = document.getElementById(PORTAL_ID);
    if (existing) {
        document.body.classList.add(BODY_OPEN_CLASS);
        return existing;
    }

    const host = document.createElement("div");
    host.id = PORTAL_ID;
    host.className = "siyuan-homepage-mobile-dialog-portal";
    host.dataset.siyuanHomepageMobileDialogPortal = "true";
    document.body.classList.add(BODY_OPEN_CLASS);
    document.body.appendChild(host);
    return host;
}

function cleanupPortalHost(host: HTMLElement): void {
    if (host.childElementCount !== 0) return;
    host.remove();
    document.body.classList.remove(BODY_OPEN_CLASS);
}

function createCloseButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "siyuan-homepage-mobile-dialog__close";
    button.setAttribute("aria-label", "关闭");
    button.innerHTML = '<svg aria-hidden="true"><use href="#iconClose" xlink:href="#iconClose"></use></svg>';
    return button;
}

/**
 * 移动端工作区使用项目自己的顶层 Portal，不进入思源 Dialog 的层叠上下文。
 * 这样文档面包屑、块操作点和移动工具栏无法穿透到项目界面上方。
 */
export function createMobileDialogPortal(options: CreateMobileDialogPortalOptions): {
    dialog: MobilePortalDialogHandle;
    content: HTMLElement;
    close: () => void;
} {
    const host = getPortalHost();
    const layer = document.createElement("section");
    const surface = document.createElement("div");
    const content = document.createElement("div");
    // 只有业务内容明确承诺提供可见关闭入口时才允许隐藏 Portal 标题栏。
    // 未声明时即使 title 为空或请求 hidden，也保留 Portal 关闭按钮作为安全兜底。
    const hideHeader = options.closeControl === "content" && (
        options.header === "hidden"
        || (options.header === "auto" && options.title.trim().length === 0)
    );

    layer.className = [
        "siyuan-homepage-mobile-overlay-layer",
        `siyuan-homepage-mobile-overlay-layer--${options.presentation}`,
        hideHeader ? "siyuan-homepage-mobile-overlay-layer--header-hidden" : "",
    ].filter(Boolean).join(" ");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");

    surface.className = "siyuan-homepage-mobile-dialog__surface";
    surface.tabIndex = -1;
    content.className = "siyuan-homepage-mobile-dialog__content";

    let close = () => undefined;
    if (!hideHeader) {
        const header = document.createElement("header");
        const title = document.createElement("div");
        const closeButton = createCloseButton();
        const titleId = `siyuan-homepage-mobile-dialog-title-${Date.now().toString(36)}`;
        header.className = "siyuan-homepage-mobile-dialog__header";
        title.className = "siyuan-homepage-mobile-dialog__title";
        title.id = titleId;
        title.textContent = options.title.trim() || "弹窗";
        layer.setAttribute("aria-labelledby", titleId);
        closeButton.addEventListener("click", () => close());
        header.append(title, closeButton);
        surface.appendChild(header);
    } else {
        layer.setAttribute("aria-label", options.title || "弹窗");
    }

    surface.appendChild(content);
    layer.appendChild(surface);
    host.appendChild(layer);

    layer.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
            .filter((element) => !element.hidden && element.getClientRects().length > 0);
        if (focusable.length === 0) {
            event.preventDefault();
            surface.focus({ preventScroll: true });
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !layer.contains(document.activeElement))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus({ preventScroll: true });
        }
    });

    let destroyed = false;
    const destroyNative = (): void => {
        if (destroyed) return;
        destroyed = true;
        try {
            options.onDestroy();
        } finally {
            layer.remove();
            cleanupPortalHost(host);
        }
    };
    close = options.closeOnBack
        ? registerMobileDialogNavigation(destroyNative).close
        : destroyNative;

    const dialog: MobilePortalDialogHandle = {
        element: layer,
        destroy: () => close(),
    };

    return { dialog, content, close };
}
