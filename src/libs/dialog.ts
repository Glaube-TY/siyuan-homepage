/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2024-10-16 14:31:04
 * @Description  : Kits about dialogs
 */
import { Dialog, getFrontend } from "siyuan";
import { unmount } from "svelte";
import {
    createMobileDialogPortal,
    type MobileDialogHeader,
    type MobileDialogCloseControl,
    type MobileDialogPresentation,
    type MobilePortalDialogHandle,
} from "./mobileDialogPortal";

export type { MobileDialogCloseControl, MobileDialogHeader, MobileDialogPresentation } from "./mobileDialogPortal";

export function isSiyuanMobileFrontend(): boolean {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile" || frontend.includes("mobile");
}

/**
 * 给插件创建的思源弹窗统一增加视口边界和滚动容器。
 * 具体布局由全局 dialog-viewport.css 处理，调用方只需标记宿主元素。
 */
const constrainDialogToViewport = (dialog: Pick<Dialog, "element">): void => {
    dialog.element.classList.add("siyuan-homepage-viewport-dialog");
};

/**
 * 思源原生 Dialog 只保留给桌面端；移动端入口必须在创建 Dialog 之前
 * 转入 createMobileDialogPortal，避免宿主弹窗栈和触摸遮罩介入。
 */
export function registerPluginDialog(
    dialog: Dialog,
): { close: () => void; mobile: boolean } {
    constrainDialogToViewport(dialog);
    const originalClose = dialog.destroy.bind(dialog);
    return { close: originalClose, mobile: false };
}

export const inputDialog = (args: {
    title: string, placeholder?: string, defaultText?: string,
    confirm?: (text: string) => void, cancel?: () => void,
    width?: string, height?: string,
    destroyCallback?: () => void
}) => {
    if (isSiyuanMobileFrontend()) {
        const element = document.createElement("div");
        element.className = "siyuan-homepage-mobile-prompt-content";
        element.innerHTML = `<div class="b3-dialog__content">
    <div class="ft__breakword"><textarea class="b3-text-field fn__block" style="height: 100%;"></textarea></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`;
        const { dialog } = simpleDialog({
            title: args.title,
            ele: element,
            mobilePresentation: "prompt",
            callback: args.destroyCallback,
        });
        const target = element.querySelector<HTMLTextAreaElement>("textarea")!;
        if (args.placeholder) target.placeholder = args.placeholder;
        if (args.defaultText) target.value = args.defaultText;
        const buttons = element.querySelectorAll<HTMLButtonElement>(".b3-button");
        buttons[0].addEventListener("click", () => {
            args.cancel?.();
            dialog.destroy();
        });
        buttons[1].addEventListener("click", () => {
            args.confirm?.(target.value);
            dialog.destroy();
        });
        return;
    }

    const dialog = new Dialog({
        title: args.title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword"><textarea class="b3-text-field fn__block" style="height: 100%;"></textarea></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
        width: args.width ?? "520px",
        height: args.height,
        destroyCallback: args.destroyCallback
    });
    registerPluginDialog(dialog);
    const target: HTMLTextAreaElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword>textarea");
    if (args.placeholder) target.placeholder = args.placeholder;
    if (args.defaultText) target.value = args.defaultText;
    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        if (args?.cancel) {
            args.cancel();
        }
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        if (args?.confirm) {
            args.confirm(target.value);
        }
        dialog.destroy();
    });
};

export const inputDialogSync = async (args: {
    title: string, placeholder?: string, defaultText?: string,
    width?: string, height?: string
}) => {
    return new Promise<string | null>((resolve) => {
        let settled = false;
        const settle = (value: string | null) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        inputDialog({
            ...args,
            confirm: (text) => settle(text),
            cancel: () => settle(null),
            destroyCallback: () => settle(null),
        });
    });
}


interface IConfirmDialogArgs {
    title: string;
    content: string | HTMLElement;
    confirm?: (ele?: HTMLElement) => void;
    cancel?: (ele?: HTMLElement) => void;
    width?: string;
    height?: string;
    destroyCallback?: () => void;
}

export const confirmDialog = (args: IConfirmDialogArgs) => {
    const { title, content, confirm, cancel, width, height } = args;

    if (isSiyuanMobileFrontend()) {
        const element = document.createElement("div");
        element.className = "siyuan-homepage-mobile-prompt-content";
        element.innerHTML = `<div class="b3-dialog__content"><div class="ft__breakword"></div></div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`;
        const target = element.querySelector<HTMLElement>(".ft__breakword")!;
        if (typeof content === "string") target.innerHTML = content;
        else target.appendChild(content);
        const result = simpleDialog({
            title,
            ele: element,
            mobilePresentation: "prompt",
            callback: args.destroyCallback,
        });
        const buttons = element.querySelectorAll<HTMLButtonElement>(".b3-button");
        buttons[0].addEventListener("click", () => {
            cancel?.(target);
            result.dialog.destroy();
        });
        buttons[1].addEventListener("click", () => {
            confirm?.(target);
            result.dialog.destroy();
        });
        return { dialog: result.dialog, target };
    }

    const dialog = new Dialog({
        title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
        width: width,
        height: height,
        destroyCallback: args.destroyCallback
    });
    registerPluginDialog(dialog);

    const target: HTMLElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword");
    if (typeof content === "string") {
        target.innerHTML = content;
    } else {
        target.appendChild(content);
    }

    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", () => {
        if (cancel) {
            cancel(target);
        }
        dialog.destroy();
    });
    btnsElement[1].addEventListener("click", () => {
        if (confirm) {
            confirm(target);
        }
        dialog.destroy();
    });

    return { dialog, target };
};


export const confirmDialogSync = async (args: IConfirmDialogArgs) => {
    return new Promise<HTMLElement>((resolve) => {
        let settled = false;
        let targetRef: HTMLElement | null = null;

        const settle = (ele?: HTMLElement) => {
            if (settled) return;
            settled = true;
            resolve(ele ?? targetRef ?? document.createElement("div"));
        };

        const { target } = confirmDialog({
            ...args,
            confirm: (ele?: HTMLElement) => settle(ele),
            cancel: (ele?: HTMLElement) => settle(ele),
            destroyCallback: () => settle(),
        });
        targetRef = target;
    });
};

export const confirmDialogBoolean = async (args: IConfirmDialogArgs) => {
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        confirmDialog({
            ...args,
            confirm: () => settle(true),
            cancel: () => settle(false),
            destroyCallback: () => settle(false),
        });
    });
};

/**
 * 创建安全的确认弹窗内容元素，避免用户可控文本通过 innerHTML 注入。
 * @param parts 文本片段数组，字符串会通过 textContent 安全设置
 * @returns HTMLElement
 */
export const safeConfirmContent = (...parts: (string | HTMLElement)[]): HTMLElement => {
    const wrapper = document.createElement("div");
    for (const part of parts) {
        if (typeof part === "string") {
            wrapper.append(part);
        } else {
            wrapper.append(part);
        }
    }
    return wrapper;
};


export const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    mobilePresentation?: MobileDialogPresentation;
    mobileHeader?: MobileDialogHeader;
    mobileCloseControl?: MobileDialogCloseControl;
    closeOnMobileBack?: boolean;
    callback?: () => void;
}) => {
    const presentation = args.mobilePresentation ?? "workspace";
    if (presentation !== "disabled" && isSiyuanMobileFrontend()) {
        const portal = createMobileDialogPortal({
            title: args.title,
            presentation,
            header: args.mobileHeader ?? "auto",
            closeControl: args.mobileCloseControl ?? "portal",
            closeOnBack: args.closeOnMobileBack !== false,
            onDestroy: () => args.callback?.(),
        });
        portal.content.appendChild(args.ele);
        return {
            dialog: portal.dialog as Dialog,
            close: portal.close,
            mobile: true,
        };
    }

    const dialog = new Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; height: 100%;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    const registration = registerPluginDialog(dialog);
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return {
        dialog,
        close: registration.close,
        mobile: registration.mobile,
    };
}


export const svelteDialog = (args: {
    title: string, constructor: (container: HTMLElement) => Record<string, any>,
    width?: string, height?: string,
    mobilePresentation?: MobileDialogPresentation;
    mobileHeader?: MobileDialogHeader;
    mobileCloseControl?: MobileDialogCloseControl;
    closeOnMobileBack?: boolean;
    callback?: () => void;
}) => {
    const presentation = args.mobilePresentation ?? "workspace";
    if (presentation !== "disabled" && isSiyuanMobileFrontend()) {
        let component: Record<string, any> | null = null;
        const portal = createMobileDialogPortal({
            title: args.title,
            presentation,
            header: args.mobileHeader ?? "auto",
            closeControl: args.mobileCloseControl ?? "portal",
            closeOnBack: args.closeOnMobileBack !== false,
            onDestroy: () => {
                if (component) unmount(component);
                args.callback?.();
            },
        });
        try {
            component = args.constructor(portal.content);
        } catch (error) {
            portal.close();
            throw error;
        }
        return {
            component,
            dialog: portal.dialog as Dialog | MobilePortalDialogHandle,
            close: portal.close,
            mobile: true,
        };
    }

    let container = document.createElement('div')
    container.style.display = 'contents';
    let component = args.constructor(container);
    const { dialog, close, mobile } = simpleDialog({
        ...args, ele: container, callback: () => {
            unmount(component);
            if (args.callback) args.callback();
        }
    });
    return {
        component,
        dialog,
        close,
        mobile,
    }
}
