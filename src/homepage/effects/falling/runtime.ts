import { resolveFallingIconSource } from "./assets";
import { ensureBuiltinFallingEffectsRegistered } from "./builtins";
import { resolveFallingEffectDefinition } from "./registry";
import type {
    FallingEffectRenderer,
    FallingEffectRuntimeConfig,
    FallingEffectViewport,
} from "./types";

const PARTICLE_BUDGET = 48;
const TARGET_FRAME_INTERVAL_MS = 1000 / 40;
const MAX_FRAME_DELTA_MS = 50;
const MAX_CANVAS_PIXELS = 3_200_000;
const MAX_PIXEL_RATIO = 1.5;
const MIN_PIXEL_RATIO = 0.6;
const LOCAL_CONTAINER_SELECTOR = ".shp-falling-container";
const CANVAS_CLASS = "shp-falling-canvas";

function resolveCanvasPixelRatio(width: number, height: number): number {
    const deviceRatio = Math.max(window.devicePixelRatio || 1, MIN_PIXEL_RATIO);
    const pixelBudgetRatio = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(width * height, 1));
    return Math.max(
        MIN_PIXEL_RATIO,
        Math.min(deviceRatio, MAX_PIXEL_RATIO, pixelBudgetRatio),
    );
}

class FallingEffectRuntime {
    readonly #reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    #requestedConfig: FallingEffectRuntimeConfig | null = null;
    #target: HTMLElement | null = null;
    #canvas: HTMLCanvasElement | null = null;
    #context: CanvasRenderingContext2D | null = null;
    #renderer: FallingEffectRenderer | null = null;
    #effectiveEffectId = "";
    #configured = false;
    #animationFrameId: number | null = null;
    #resizeFrameId: number | null = null;
    #resizeObserver: ResizeObserver | null = null;
    #viewport: FallingEffectViewport = { width: 0, height: 0, pixelRatio: 1 };
    #lastRenderTimestamp = 0;

    constructor() {
        this.#reducedMotionQuery.addEventListener("change", this.#handleReducedMotionChange);
    }

    configure(config: FallingEffectRuntimeConfig): void {
        this.#requestedConfig = config;
        const shouldActivate = config.enabled && !this.#reducedMotionQuery.matches;
        if (!shouldActivate) {
            this.#deactivate();
            return;
        }

        ensureBuiltinFallingEffectsRegistered();
        const definition = resolveFallingEffectDefinition(config.preferredEffectId);
        const target = this.#resolveTarget(config);
        if (!definition || !target) {
            this.#deactivate();
            if (!definition) console.warn("[FallingEffect] 没有可用的飘落特效，已安全停用");
            return;
        }

        const needsRendererRebuild = !this.#renderer
            || !this.#canvas
            || target !== this.#target
            || definition.id !== this.#effectiveEffectId;

        if (needsRendererRebuild) {
            this.#detachRuntimeListeners();
            this.#destroyRenderer();
            const canvas = document.createElement("canvas");
            canvas.className = CANVAS_CLASS;
            canvas.dataset.fallingEffect = definition.id;
            canvas.dataset.fallingScope = config.global ? "global" : "homepage";
            canvas.setAttribute("aria-hidden", "true");
            const context = canvas.getContext("2d", {
                alpha: true,
                desynchronized: true,
            });
            if (!context) {
                console.warn("[FallingEffect] 当前环境不支持 Canvas 2D，已安全停用");
                this.#configured = false;
                return;
            }

            target.appendChild(canvas);
            this.#target = target;
            this.#canvas = canvas;
            this.#context = context;
            try {
                this.#renderer = definition.createRenderer({
                    canvas,
                    context,
                    particleBudget: PARTICLE_BUDGET,
                });
            } catch (error) {
                console.warn(`[FallingEffect] 特效初始化失败: ${definition.id}`, error);
                canvas.remove();
                this.#canvas = null;
                this.#context = null;
                this.#target = null;
                this.#configured = false;
                return;
            }
            this.#effectiveEffectId = definition.id;
            this.#configured = true;
            this.#attachRuntimeListeners(config.global);
        } else if (this.#canvas) {
            this.#canvas.dataset.fallingScope = config.global ? "global" : "homepage";
        }

        try {
            this.#renderer?.configure({
                iconSrc: resolveFallingIconSource(config.icon),
                density: config.density,
                speed: config.speed,
            });
        } catch (error) {
            console.warn(`[FallingEffect] 特效配置失败: ${definition.id}`, error);
            this.#deactivate();
            return;
        }
        this.#resizeNow();
        this.#resume();
    }

    destroy(): void {
        this.#requestedConfig = null;
        this.#deactivate();
        this.#reducedMotionQuery.removeEventListener("change", this.#handleReducedMotionChange);
    }

    readonly #handleVisibilityChange = (): void => {
        if (document.hidden) {
            this.#pause(true);
            return;
        }
        this.#scheduleResize();
        this.#resume();
    };

    readonly #handleWindowResize = (): void => {
        this.#scheduleResize();
    };

    readonly #handleReducedMotionChange = (): void => {
        if (this.#reducedMotionQuery.matches) {
            this.#deactivate();
        } else if (this.#requestedConfig) {
            this.configure(this.#requestedConfig);
        }
    };

    readonly #handleResizeObserved = (): void => {
        this.#scheduleResize();
    };

    readonly #renderFrame = (timestamp: number): void => {
        this.#animationFrameId = null;
        if (!this.#configured || !this.#renderer || !this.#isRenderable()) return;

        const elapsed = this.#lastRenderTimestamp > 0
            ? timestamp - this.#lastRenderTimestamp
            : TARGET_FRAME_INTERVAL_MS;
        if (elapsed >= TARGET_FRAME_INTERVAL_MS) {
            const deltaMs = Math.min(Math.max(elapsed, 1), MAX_FRAME_DELTA_MS);
            try {
                this.#renderer.frame({ timestamp, deltaMs, viewport: this.#viewport });
            } catch (error) {
                console.warn(`[FallingEffect] 特效渲染失败: ${this.#effectiveEffectId}`, error);
                this.#deactivate();
                return;
            }
            this.#lastRenderTimestamp = timestamp;
        }
        this.#animationFrameId = window.requestAnimationFrame(this.#renderFrame);
    };

    #resolveTarget(config: FallingEffectRuntimeConfig): HTMLElement | null {
        if (config.global) return document.body;
        const localRoot = config.localRoot?.isConnected
            ? config.localRoot
            : document.querySelector<HTMLElement>(".homepage-container");
        return localRoot?.querySelector<HTMLElement>(LOCAL_CONTAINER_SELECTOR) ?? null;
    }

    #attachRuntimeListeners(global: boolean): void {
        document.addEventListener("visibilitychange", this.#handleVisibilityChange);
        window.addEventListener("resize", this.#handleWindowResize, { passive: true });
        if (!global && this.#target && typeof ResizeObserver !== "undefined") {
            this.#resizeObserver = new ResizeObserver(this.#handleResizeObserved);
            this.#resizeObserver.observe(this.#target);
        }
    }

    #detachRuntimeListeners(): void {
        document.removeEventListener("visibilitychange", this.#handleVisibilityChange);
        window.removeEventListener("resize", this.#handleWindowResize);
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = null;
    }

    #scheduleResize(): void {
        if (!this.#configured || this.#resizeFrameId !== null) return;
        this.#resizeFrameId = window.requestAnimationFrame(() => {
            this.#resizeFrameId = null;
            this.#resizeNow();
            this.#resume();
        });
    }

    #resizeNow(): void {
        if (!this.#canvas || !this.#target || !this.#context) return;
        const global = this.#requestedConfig?.global === true;
        const width = Math.max(0, Math.round(global ? window.innerWidth : this.#target.clientWidth));
        const height = Math.max(0, Math.round(global ? window.innerHeight : this.#target.clientHeight));
        if (width <= 1 || height <= 1) {
            this.#viewport = { width: 0, height: 0, pixelRatio: 1 };
            this.#pause(true);
            return;
        }

        const pixelRatio = resolveCanvasPixelRatio(width, height);
        const backingWidth = Math.max(1, Math.round(width * pixelRatio));
        const backingHeight = Math.max(1, Math.round(height * pixelRatio));
        if (this.#canvas.width !== backingWidth) this.#canvas.width = backingWidth;
        if (this.#canvas.height !== backingHeight) this.#canvas.height = backingHeight;
        this.#canvas.style.width = `${width}px`;
        this.#canvas.style.height = `${height}px`;
        this.#context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        this.#viewport = { width, height, pixelRatio };
        try {
            this.#renderer?.resize(this.#viewport);
        } catch (error) {
            console.warn(`[FallingEffect] 特效尺寸更新失败: ${this.#effectiveEffectId}`, error);
            this.#deactivate();
        }
    }

    #isRenderable(): boolean {
        return !document.hidden
            && Boolean(this.#target?.isConnected)
            && this.#viewport.width > 1
            && this.#viewport.height > 1;
    }

    #resume(): void {
        if (!this.#configured || this.#animationFrameId !== null || !this.#isRenderable()) return;
        this.#lastRenderTimestamp = 0;
        this.#animationFrameId = window.requestAnimationFrame(this.#renderFrame);
    }

    #pause(clear: boolean): void {
        if (this.#animationFrameId !== null) {
            window.cancelAnimationFrame(this.#animationFrameId);
            this.#animationFrameId = null;
        }
        this.#lastRenderTimestamp = 0;
        if (clear) {
            try {
                this.#renderer?.clear();
            } catch (error) {
                console.warn(`[FallingEffect] 特效清理失败: ${this.#effectiveEffectId}`, error);
            }
        }
    }

    #deactivate(): void {
        this.#configured = false;
        this.#detachRuntimeListeners();
        this.#destroyRenderer();
    }

    #destroyRenderer(): void {
        this.#pause(true);
        if (this.#resizeFrameId !== null) {
            window.cancelAnimationFrame(this.#resizeFrameId);
            this.#resizeFrameId = null;
        }
        try {
            this.#renderer?.destroy();
        } catch (error) {
            console.warn(`[FallingEffect] 特效销毁失败: ${this.#effectiveEffectId}`, error);
        }
        this.#renderer = null;
        this.#canvas?.remove();
        this.#canvas = null;
        this.#context = null;
        this.#target = null;
        this.#effectiveEffectId = "";
        this.#viewport = { width: 0, height: 0, pixelRatio: 1 };
    }
}

let activeRuntime: FallingEffectRuntime | null = null;

export function updateFallingEffectRuntime(config: FallingEffectRuntimeConfig): void {
    activeRuntime ??= new FallingEffectRuntime();
    activeRuntime.configure(config);
}

export function cleanupFallingEffectRuntime(): void {
    activeRuntime?.destroy();
    activeRuntime = null;
}
