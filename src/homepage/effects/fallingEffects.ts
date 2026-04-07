import { fallingIconList } from "./effectsConstants";

export interface FallingEffectConfig {
    advanced: boolean;
    FallEffectsEnabled: boolean;
    GlobalFallingEffectsEnabled: boolean;
    FallingIcon: string;
    FallingDensity: string;
    FallingSpeed: string;
}

let fallingIconCache: { [key: string]: string } = {};
const fallingFlakesPool: HTMLImageElement[] = [];
const maxFallingElement = 1000;
let animationFrameId: number | null = null;
let lastTime = 0;

export function isElectron(): boolean {
    return (
        window.navigator.userAgent.includes("Electron") ||
        typeof window.require === "function"
    );
}

export function preloadFallingIcons(): void {
    fallingIconList.forEach((icon) => {
        const iconPath = `/plugins/siyuan-homepage/asset/fallingIcon/${icon}.png`.replace(
            /\\/g,
            "/",
        );
        fallingIconCache[icon] = iconPath;
    });
}

function getMinInterval(density: string): number {
    switch (density) {
        case "low":
            return 2000;
        case "high":
            return 200;
        case "medium":
        default:
            return 100;
    }
}

function getDuration(speed: string): number {
    switch (speed) {
        case "low":
            return 10;
        case "high":
            return 2;
        case "medium":
        default:
            return 5;
    }
}

function animateVisibilityCheck(flake: HTMLImageElement): void {
    const check = () => {
        const rect = flake.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.85) {
            flake.style.display = "none";
            fallingFlakesPool.push(flake);
        } else {
            requestAnimationFrame(check);
        }
    };
    check();
}

export function createFallingFlake(config: FallingEffectConfig): void {
    if (!config.advanced || !config.FallEffectsEnabled) return;

    // 非全局模式改用 .falling-container 避免滚动条问题
    const container = config.GlobalFallingEffectsEnabled
        ? document.body
        : document.querySelector(".falling-container");
    if (!container) return;

    const activeFlakes = container.querySelectorAll("img.falling-flake").length;
    if (activeFlakes >= maxFallingElement) return;

    const iconSrc =
        fallingIconCache[config.FallingIcon] || fallingIconCache["snow"];

    let flake: HTMLImageElement;

    if (fallingFlakesPool.length > 0) {
        flake = fallingFlakesPool.pop()!;
        flake.style.display = "block";
    } else {
        flake = document.createElement("img");
        flake.className = "falling-flake";
        flake.style.position = "fixed";
        flake.style.zIndex = "9999";
        flake.style.pointerEvents = "none";
        flake.style.opacity = "1";
    }

    const duration = getDuration(config.FallingSpeed);
    flake.style.animation = `falling ${duration}s linear forwards`;
    flake.style.animationTimingFunction = "linear";
    flake.style.animationFillMode = "forwards";
    flake.src = iconSrc;

    const randomSize = Math.floor(Math.random() * 20) + 10;
    flake.style.width = `${randomSize}px`;
    flake.style.height = "auto";

    const wind = `${(Math.random() - 0.5) * 100}px`;
    const rotation = `${Math.random() * 360}deg`;
    flake.style.setProperty("--wind", wind);
    flake.style.setProperty("--rotation", rotation);

    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;

    const startX = Math.random() * containerWidth;
    flake.style.left = `${startX}px`;
    flake.style.top = "-10vh";
    flake.style.position = "absolute";

    animateVisibilityCheck(flake);

    flake.addEventListener("animationiteration", () => {
        const rect = flake.getBoundingClientRect();
        const isInViewport =
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth;

        if (!isInViewport) {
            flake.style.display = "none";
            fallingFlakesPool.push(flake);
        }
    });

    container.appendChild(flake);
}

export function animateFalling(
    timestamp: number,
    config: FallingEffectConfig,
): number {
    const minInterval = getMinInterval(config.FallingDensity);
    if (!lastTime || timestamp - lastTime > minInterval) {
        createFallingFlake(config);
        lastTime = timestamp;
    }
    animationFrameId = requestAnimationFrame((ts) =>
        animateFalling(ts, config),
    );
    return animationFrameId;
}

export function stopFallingAnimation(): void {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

export function cleanupFallingEffects(): void {
    stopFallingAnimation();
    document
        .querySelectorAll("img.falling-flake")
        .forEach((el) => el.remove());
    fallingFlakesPool.length = 0;
    lastTime = 0;
}