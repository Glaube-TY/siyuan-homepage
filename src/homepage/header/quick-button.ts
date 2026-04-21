import { addCustomBlock } from "../../components/utils/widgetBlock/utils/block-creator";
import { svelteDialog } from "@/libs/dialog";
import HomepageSetting from "../homepageSetting/homepageSetting.svelte";
import Mousetrap from "mousetrap";
import { mount } from "svelte";

type ExtendedKeyboardEvent = KeyboardEvent & {
    keyCode: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    preventDefault: () => void;
    stopPropagation: () => void;
};

export type ButtonItem = {
    id: number;
    label: string;
    checked: boolean;
    shortcut?: string;
    order: number;
    action?: string;
};

const registeredShortcuts = new Map<string, ButtonItem>();
const normalizedShortcuts = new Map<string, string>();

// 修饰键固定顺序
const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"];

/**
 * 将快捷键片段按自然顺序排序：修饰键在前，主键在后
 * 例如: ["p", "ctrl", "shift"] -> ["ctrl", "shift", "p"]
 */
function sortShortcutParts(parts: string[]): string[] {
    const modifiers: string[] = [];
    const mainKeys: string[] = [];

    for (const part of parts) {
        if (MODIFIER_ORDER.includes(part)) {
            modifiers.push(part);
        } else {
            mainKeys.push(part);
        }
    }

    // 按固定顺序排列修饰键
    modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));

    return [...modifiers, ...mainKeys];
}

function normalizeShortcut(shortcut: string): string {
    if (!shortcut) return "";

    const parts = shortcut.toLowerCase()
        .replace(/\s+/g, "")
        .split("+");

    const normalizedParts = parts.map(part => {
        switch (part) {
            case "command":
            case "cmd":
                return "meta";
            case "option":
            case "opt":
            case "alt":
                return "alt";
            case "shift":
                return "shift";
            case "control":
            case "ctrl":
                return "ctrl";
            default:
                return part;
        }
    });

    return sortShortcutParts(normalizedParts).join("+");
}

/**
 * 将 KeyboardEvent 转换为规范快捷键字符串
 * 用于设置页按键捕获
 */
export function eventToShortcutString(e: KeyboardEvent): string | null {
    const modifierKeys: string[] = [];
    if (e.ctrlKey) modifierKeys.push("ctrl");
    if (e.altKey) modifierKeys.push("alt");
    if (e.shiftKey) modifierKeys.push("shift");
    if (e.metaKey) modifierKeys.push("meta");

    // 获取主键
    let mainKey = e.key;

    // 忽略纯修饰键
    if (["Control", "Alt", "Shift", "Meta"].includes(mainKey)) {
        return null;
    }

    // 特殊键名标准化
    switch (mainKey) {
        case "Escape":
            return null; // 取消捕获
        case " ":
            mainKey = "space";
            break;
        case "Backspace":
            return "__CLEAR__"; // 标记为清空
        case "Delete":
            return "__CLEAR__"; // 标记为清空
        default:
            // 将字母转为小写
            if (/^[a-zA-Z]$/.test(mainKey)) {
                mainKey = mainKey.toLowerCase();
            }
            break;
    }

    // 如果只有修饰键没有主键，不保存
    if (!mainKey && modifierKeys.length > 0) {
        return null;
    }

    // 组合快捷键
    if (modifierKeys.length > 0 && mainKey) {
        const parts = sortShortcutParts([...modifierKeys, mainKey]);
        return parts.join("+");
    }

    // 单键（功能键等）
    if (["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
         "space", "enter", "tab", "backspace", "delete", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(mainKey.toLowerCase())) {
        return normalizeShortcut(mainKey);
    }

    // 其他单键字母/数字
    if (/^[a-z0-9]$/i.test(mainKey)) {
        return normalizeShortcut(mainKey);
    }

    return null;
}

export function displayShortcut(shortcut: string): string {
    if (!shortcut) return "";

    const normalized = normalizeShortcut(shortcut);
    const parts = normalized.split("+");

    if (isMac()) {
        const displayParts = parts.map(part => {
            switch (part) {
                case "meta":
                    return "⌘";
                case "alt":
                    return "⌥";
                case "shift":
                    return "⇧";
                case "ctrl":
                    return "^";
                default:
                    // 单字母键显示为大写
                    if (/^[a-z]$/.test(part)) {
                        return part.toUpperCase();
                    }
                    return part;
            }
        });

        return displayParts.join(" ");
    }

    const displayParts = parts.map(part => {
        switch (part) {
            case "meta":
                return "Win";
            case "alt":
                return "Alt";
            case "shift":
                return "Shift";
            case "ctrl":
                return "Ctrl";
            default:
                // 单字母键显示为大写
                if (/^[a-z]$/.test(part)) {
                    return part.toUpperCase();
                }
                return part;
        }
    });

    return displayParts.join("+");
}

function isMac(): boolean {
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function checkShortcutConflict(shortcut: string): boolean {
    const normalized = normalizeShortcut(shortcut);

    if (normalizedShortcuts.has(normalized)) {
        const originalShortcut = normalizedShortcuts.get(normalized);
        console.warn(`快捷键 ${displayShortcut(shortcut)} 与 ${displayShortcut(originalShortcut!)} 冲突`);
        return true;
    }

    return false;
}

function registerShortcut(shortcut: string, button: ButtonItem): boolean {
    if (!shortcut || !button) return false;

    const normalized = normalizeShortcut(shortcut);

    if (checkShortcutConflict(shortcut)) {
        return false;
    }

    Mousetrap.bind(normalized, (e: ExtendedKeyboardEvent) => {
        // 防止递归：忽略 synthetic event（代码手动 dispatch 的事件）
        if (!e.isTrusted) {
            return true;
        }
        e.preventDefault();
        triggerShortcut(button);
        return false;
    });

    registeredShortcuts.set(shortcut, button);
    normalizedShortcuts.set(normalized, shortcut);

    return true;
}

function clearRegisteredShortcuts(): void {
    // 精确解绑本文件自己注册过的快捷键
    for (const normalized of normalizedShortcuts.keys()) {
        Mousetrap.unbind(normalized);
    }
    registeredShortcuts.clear();
    normalizedShortcuts.clear();
}

export function unregisterAllShortcuts(): void {
    clearRegisteredShortcuts();
}

export function reRegisterAllShortcuts(buttonsList: ButtonItem[]): void {
    clearRegisteredShortcuts();

    buttonsList.forEach(item => {
        // 所有配置了 shortcut 的按钮都参与快捷键注册，不再依赖 checked 状态
        if (item.shortcut?.trim()) {
            registerShortcut(item.shortcut.trim(), item);
        }
    });
}

function createOpenHomepageSetting(plugin: any) {
    return function OpenHomepageSetting() {
        const dialog = svelteDialog({
            title: "主页设置",
            constructor: (containerEl: HTMLElement) => {
                return mount(HomepageSetting, {
                                    target: containerEl,
                                    props: {
                                        plugin: plugin,
                                        close: () => {
                                            dialog.close();
                                        },
                                    },
                                });
            },
        });
    };
}

export function handleMoreButtonClick(showMoreMenu: boolean): boolean {
    return !showMoreMenu;
}

function getButtonAction(item: ButtonItem): string {
    if (item.action) {
        return item.action;
    }
    if (item.label.includes("➕ 添加组件")) {
        return "addWidget";
    }
    if (item.label.includes("⚙ 主页设置")) {
        return "settings";
    }
    if (item.label.includes("🔍 搜索笔记")) {
        return "search";
    }
    if (item.label.includes("📅 今日日记")) {
        return "diary";
    }
    return "";
}

export function handleButtonClick(
    item: ButtonItem,
    plugin: any,
    currentBlockForSettingsRef: { value: HTMLElement | null },
    saveLayoutFn: (plugin: any) => void
): void {
    const OpenHomepageSetting = createOpenHomepageSetting(plugin);

    const action = getButtonAction(item);

    if (action === "addWidget") {
        addCustomBlock(plugin, currentBlockForSettingsRef);
        saveLayoutFn(plugin);
    } else if (action === "settings") {
        OpenHomepageSetting();
    } else if (action === "search" || action === "diary") {
        // 搜索和日记按钮通过 shortcut 触发，但已有 isTrusted 保护不会递归
        if (item.shortcut) {
            triggerShortcut(item);
        }
    } else if (item.shortcut) {
        triggerShortcut(item);
    }
}

function triggerShortcut(item: ButtonItem): void {
    const keys = item.shortcut!.toLowerCase().split("+");
    const modifiers = keys.filter((k) =>
        ["ctrl", "alt", "shift", "meta"].includes(k),
    );
    const mainKey = keys.find((k) => !modifiers.includes(k));

    if (!mainKey) return;

    const keyEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: modifiers.includes("ctrl"),
        altKey: modifiers.includes("alt"),
        shiftKey: modifiers.includes("shift"),
        metaKey: modifiers.includes("meta"),
        key: mainKey === "space" ? " " : mainKey,
        code: codeFor(mainKey),
        keyCode: keyCodeMap[mainKey] || 0,
        which: keyCodeMap[mainKey] || 0,
    });

    document.dispatchEvent(keyEvent);
}

export function codeFor(key: string): string {
    if (/[a-z]/.test(key)) return `Key${key.toUpperCase()}`;
    if (/[0-9]/.test(key)) return `Digit${key}`;

    const specialKeys: Record<string, string> = {
        "[": "BracketLeft",
        "]": "BracketRight",
        "{": "BracketLeft",
        "}": "BracketRight",
        "'": "Quote",
        '"': "Quote",
        ";": "Semicolon",
        ":": "Semicolon",
        ",": "Comma",
        "<": "Comma",
        ".": "Period",
        ">": "Period",
        "/": "Slash",
        "?": "Slash",
        "-": "Minus",
        "_": "Minus",
        "=": "Equal",
        "+": "Equal",
    };

    return specialKeys[key] || "";
}

// 键码映射表
export const keyCodeMap: { [key: string]: number } = {
    'a': 65,
    'b': 66,
    'c': 67,
    'd': 68,
    'e': 69,
    'f': 70,
    'g': 71,
    'h': 72,
    'i': 73,
    'j': 74,
    'k': 75,
    'l': 76,
    'm': 77,
    'n': 78,
    'o': 79,
    'p': 80,
    'q': 81,
    'r': 82,
    's': 83,
    't': 84,
    'u': 85,
    'v': 86,
    'w': 87,
    'x': 88,
    'y': 89,
    'z': 90,
    '0': 48,
    '1': 49,
    '2': 50,
    '3': 51,
    '4': 52,
    '5': 53,
    '6': 54,
    '7': 55,
    '8': 56,
    '9': 57,
    'f1': 112,
    'f2': 113,
    'f3': 114,
    'f4': 115,
    'f5': 116,
    'f6': 117,
    'f7': 118,
    'f8': 119,
    'f9': 120,
    'f10': 121,
    'f11': 122,
    'f12': 123,
    'f13': 124,
    'f14': 125,
    'f15': 126,
    'f16': 127,
    'f17': 128,
    'f18': 129,
    'f19': 130,
    'f20': 131,
    'backspace': 8,
    'tab': 9,
    'enter': 13,
    'shift': 16,
    'control': 17,
    'alt': 18,
    'pausebreak': 19,
    'capslock': 20,
    'escape': 27,
    'space': 32,
    'pageup': 33,
    'pagedown': 34,
    'end': 35,
    'home': 36,
    'arrowleft': 37,
    'arrowup': 38,
    'arrowright': 39,
    'arrowdown': 40,
    'printscreen': 44,
    'insert': 45,
    'delete': 46,
    'numpad0': 96,
    'numpad1': 97,
    'numpad2': 98,
    'numpad3': 99,
    'numpad4': 100,
    'numpad5': 101,
    'numpad6': 102,
    'numpad7': 103,
    'numpad8': 104,
    'numpad9': 105,
    'multiply': 106,
    'add': 107,
    'separator': 108,
    'subtract': 109,
    'decimal': 110,
    'divide': 111,
    'browserback': 166,
    'browserforward': 167,
    'browserrefresh': 168,
    'browserstop': 169,
    'browsersearch': 170,
    'browserfavorites': 171,
    'browserhome': 172,
    'volumemute': 173,
    'volumedown': 174,
    'volumeup': 175,
    'medianexttrack': 176,
    'mediaprevioustrack': 177,
    'mediastop': 178,
    'mediaplaypause': 179,
    'launchmail': 180,
    'launchmediaselect': 181,
    'select': 41,
    'execute': 43,
    'help': 47,
    'menu': 93,
    'sleep': 95,
    'zoom': 251,
    "[": 219,
    "]": 221,
    "{": 219,
    "}": 221,
    "'": 222,
    '"': 222,
    ";": 186,
    ":": 186,
    ",": 188,
    "<": 188,
    ".": 190,
    ">": 190,
    "/": 191,
    "?": 191,
    "-": 189,
    "_": 189,
    "=": 187,
    "+": 187,
};