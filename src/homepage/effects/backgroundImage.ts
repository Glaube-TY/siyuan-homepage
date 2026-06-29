export interface BackgroundImageConfig {
    advanced: boolean;
    backgroundImageEnabled: boolean;
    backgroundImageGlobalEnabled: boolean;
    backgroundImageSrc: string;
    backgroundImageOpacity: number;
    backgroundImageBlur: number;
}

const BACKGROUND_STYLE_ID = "siyuan-homepage-background-style";
const GLOBAL_BACKGROUND_LAYER_ID = "siyuan-homepage-global-background-layer";
const GLOBAL_BACKGROUND_CLASS = "siyuan-homepage-global-background-active";

let originalBodyOpacity: string | null = null;

function removeHomepageBackgroundStyle(): void {
    const existingStyle = document.getElementById(BACKGROUND_STYLE_ID);
    if (existingStyle) {
        existingStyle.remove();
    }
}

function removeGlobalBackgroundLayer(): void {
    const existingLayer = document.getElementById(GLOBAL_BACKGROUND_LAYER_ID);
    if (existingLayer) {
        existingLayer.remove();
    }
}

function saveOriginalBodyOpacity(): void {
    if (originalBodyOpacity === null) {
        originalBodyOpacity = document.body.style.opacity || "";
    }
}

function restoreBodyOpacity(): void {
    if (originalBodyOpacity !== null) {
        if (originalBodyOpacity === "") {
            document.body.style.removeProperty("opacity");
        } else {
            document.body.style.opacity = originalBodyOpacity;
        }
        originalBodyOpacity = null;
    }
}

function removeGlobalBackgroundEffects(): void {
    removeGlobalBackgroundLayer();
    document.body.classList.remove(GLOBAL_BACKGROUND_CLASS);
    restoreBodyOpacity();
}

function toCssUrl(value: string): string {
    const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/\r?\n/g, "");
    return `url("${escaped}")`;
}

function normalizePercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeBlur(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(40, Math.max(0, Math.round(value)));
}

function computeBodyOpacity(opacity: number): number {
    const normalized = Math.min(1, Math.max(0, opacity));
    return Math.max(0.82, 0.99 - 0.25 * normalized);
}

function createGlobalBackgroundLayer(
    image: string,
    opacity: number,
    blur: number,
    scale: number,
): HTMLElement {
    const layer = document.createElement("div");
    layer.id = GLOBAL_BACKGROUND_LAYER_ID;
    layer.style.position = "fixed";
    layer.style.inset = "0";
    layer.style.width = "100vw";
    layer.style.height = "100vh";
    layer.style.pointerEvents = "none";
    layer.style.backgroundImage = image;
    layer.style.backgroundSize = "cover";
    layer.style.backgroundPosition = "center";
    layer.style.backgroundRepeat = "no-repeat";
    layer.style.opacity = String(opacity);
    layer.style.filter = `blur(${blur}px)`;
    layer.style.transform = `scale(${scale})`;
    layer.style.transformOrigin = "center";
    layer.style.zIndex = "-10000";
    layer.style.display = "block";
    return layer;
}

function insertGlobalBackgroundLayer(layer: HTMLElement): void {
    const html = document.documentElement;
    const head = document.head;
    if (head && head.parentNode === html) {
        html.insertBefore(layer, head);
    } else {
        html.appendChild(layer);
    }
}

export function updateHomepageBackgroundImageStyle(config: BackgroundImageConfig): void {
    removeHomepageBackgroundStyle();

    const imageSrc = config.backgroundImageSrc?.trim();
    if (!config.advanced || !config.backgroundImageEnabled || !imageSrc) {
        return;
    }

    // 全局背景开启时由插件级全局背景层统一处理，主页不再叠加局部背景
    if (config.backgroundImageGlobalEnabled) {
        return;
    }

    const opacity = normalizePercent(config.backgroundImageOpacity) / 100;
    const blur = normalizeBlur(config.backgroundImageBlur);
    const scale = blur > 0 ? 1.04 : 1;
    const image = toCssUrl(imageSrc);

    const style = document.createElement("style");
    style.id = BACKGROUND_STYLE_ID;
    style.textContent = `
        .homepage-container::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background-image: ${image};
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            opacity: ${opacity};
            filter: blur(${blur}px);
            transform: scale(${scale});
            transform-origin: center;
            z-index: 0;
        }

        .homepage-container {
            position: relative;
            isolation: isolate;
        }

        .homepage-container > * {
            position: relative;
            z-index: 1;
        }
    `;

    document.head.appendChild(style);
}

export function updateGlobalBackgroundImageStyle(config: BackgroundImageConfig): void {
    removeGlobalBackgroundEffects();

    const imageSrc = config.backgroundImageSrc?.trim();
    if (!config.advanced || !config.backgroundImageEnabled || !imageSrc || !config.backgroundImageGlobalEnabled) {
        return;
    }

    const opacity = normalizePercent(config.backgroundImageOpacity) / 100;
    const blur = normalizeBlur(config.backgroundImageBlur);
    const scale = blur > 0 ? 1.04 : 1;
    const image = toCssUrl(imageSrc);

    const layer = createGlobalBackgroundLayer(image, opacity, blur, scale);
    insertGlobalBackgroundLayer(layer);
    document.body.classList.add(GLOBAL_BACKGROUND_CLASS);
    saveOriginalBodyOpacity();
    document.body.style.opacity = String(computeBodyOpacity(opacity));
}

export function cleanupHomepageBackgroundImageStyle(): void {
    removeHomepageBackgroundStyle();
}

export function cleanupGlobalBackgroundImageStyle(): void {
    removeGlobalBackgroundEffects();
}

export function cleanupBackgroundImageStyle(): void {
    cleanupHomepageBackgroundImageStyle();
    cleanupGlobalBackgroundImageStyle();
}
