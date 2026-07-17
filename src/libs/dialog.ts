/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2024-10-16 14:31:04
 * @Description  : Kits about dialogs
 */
import { Dialog } from "siyuan";
import { unmount } from "svelte";

/**
 * 给插件创建的思源弹窗统一增加视口边界和滚动容器。
 * 具体布局由全局 dialog-viewport.css 处理，调用方只需标记宿主元素。
 */
export const constrainDialogToViewport = (dialog: Pick<Dialog, "element">): void => {
    dialog.element.classList.add("siyuan-homepage-viewport-dialog");
};

export const inputDialog = (args: {
    title: string, placeholder?: string, defaultText?: string,
    confirm?: (text: string) => void, cancel?: () => void,
    width?: string, height?: string,
    destroyCallback?: () => void
}) => {
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
    constrainDialogToViewport(dialog);
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
    constrainDialogToViewport(dialog);

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
    callback?: () => void;
}) => {
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; height: 100%;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    constrainDialogToViewport(dialog);
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return {
        dialog,
        close: dialog.destroy.bind(dialog)
    };
}


export const svelteDialog = (args: {
    title: string, constructor: (container: HTMLElement) => Record<string, any>,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    let container = document.createElement('div')
    container.style.display = 'contents';
    let component = args.constructor(container);
    const { dialog, close } = simpleDialog({
        ...args, ele: container, callback: () => {
            unmount(component);
            if (args.callback) args.callback();
        }
    });
    return {
        component,
        dialog,
        close
    }
}
