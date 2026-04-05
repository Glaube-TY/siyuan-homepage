import {
    defaultClickEffects,
    cursorIconMap,
} from "./effectsConstants";

export interface MouseEffectConfig {
    advanced: boolean;
    mouseIcon: string;
    mouseGlobalEnabled: boolean;
    ClickEffectEnabled: boolean;
    ClickEffectContent: string;
    MouseTrailEnabled: boolean;
}

const CURSOR_STYLE_ID = "siyuan-homepage-cursor-style";

let effectIndex = 0;
let trailElements: HTMLElement[] = [];

export function isElectron(): boolean {
    return (
        window.navigator.userAgent.includes("Electron") ||
        typeof window.require === "function"
    );
}

function removeCursorStyle(): void {
    const existingStyle = document.getElementById(CURSOR_STYLE_ID);
    if (existingStyle) {
        existingStyle.remove();
    }
}

export function updateCursorStyle(config: MouseEffectConfig): void {
    removeCursorStyle();

    if (!config.advanced) return;

    if (config.mouseIcon === "default") return;

    const iconPath = cursorIconMap[config.mouseIcon];
    if (!iconPath) return;

    if (iconPath.endsWith(".ico")) {
        console.warn("当前图标为 .ico，CSS cursor 兼容性可能较差，建议改用 .png 或 .cur");
    }

    const cursorUrl = encodeURI(iconPath.replace(/\\/g, "/"));
    const baseSelector = config.mouseGlobalEnabled ? "body" : ".homepage-container";
    const mainSelector = `${baseSelector}, ${baseSelector} *`;

    const inputSelector = config.mouseGlobalEnabled
        ? "input, textarea, [contenteditable=\"true\"]"
        : `${baseSelector} input, ${baseSelector} textarea, ${baseSelector} [contenteditable="true"]`;

    removeCursorStyle();

    const style = document.createElement("style");
    style.id = CURSOR_STYLE_ID;
    style.textContent = `
        ${mainSelector} {
            cursor: url("${cursorUrl}") 4 4, auto !important;
        }
        ${inputSelector} {
            cursor: text !important;
        }
    `;
    document.head.appendChild(style);
}

export function createClickEffect(
    e: MouseEvent,
    config: MouseEffectConfig
): void {
    if (!config.advanced || !config.ClickEffectEnabled) return;

    const customEffects = config.ClickEffectContent
        ? config.ClickEffectContent.split("\n").filter((line) => line.trim())
        : defaultClickEffects;

    const effectsToUse = customEffects.length > 0 ? customEffects : defaultClickEffects;

    if (!config.mouseGlobalEnabled) {
        const container = document.querySelector(".homepage-container") as HTMLElement;
        if (container) {
            const rect = container.getBoundingClientRect();
            if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            ) {
                return;
            }
        }
    }

    const span = document.createElement("span");
    span.textContent = effectsToUse[effectIndex];
    effectIndex = (effectIndex + 1) % effectsToUse.length;

    const x = e.pageX;
    const y = e.pageY;
    span.style.cssText = `
        z-index: 999999;
        top: ${y - 20}px;
        left: ${x}px;
        position: fixed;
        font-weight: bold;
        color: rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255});
        transition: all 1.5s ease-out;
        pointer-events: none;
    `;

    document.body.appendChild(span);

    requestAnimationFrame(() => {
        span.style.top = `${y - 180}px`;
        span.style.opacity = "0";
    });

    setTimeout(() => span.remove(), 1500);
}

export function createMouseTrail(
    e: MouseEvent,
    config: MouseEffectConfig
): void {
    if (!config.advanced || !config.MouseTrailEnabled) return;

    const containerSelector = config.mouseGlobalEnabled ? "body" : ".homepage-container";
    const container = document.querySelector(containerSelector);
    if (!container) return;

    if (!config.mouseGlobalEnabled) {
        const homepageContainer = document.querySelector(".homepage-container") as HTMLElement;
        if (homepageContainer) {
            const rect = homepageContainer.getBoundingClientRect();
            if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
            ) {
                return;
            }
        }
    }

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const trail = document.createElement("div");
    trail.className = "mouse-trail";
    trail.style.cssText = `
        left: ${x}px;
        top: ${y}px;
        opacity: 0.7;
    `;

    container.appendChild(trail);
    trailElements.push(trail);

    if (trailElements.length > 1000) {
        const old = trailElements.shift();
        old?.remove();
    }

    requestAnimationFrame(() => {
        trail.style.opacity = "0";
        trail.style.transform = "scale(2)";
    });

    setTimeout(() => trail.remove(), 1000);
}

export function cleanupMouseEffects(): void {
    removeCursorStyle();
    trailElements.forEach((el) => el.remove());
    trailElements = [];
    effectIndex = 0;
}