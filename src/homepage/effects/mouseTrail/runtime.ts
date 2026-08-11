import { ensureBuiltinMouseTrailEffectsRegistered } from "./builtins";
import { resolveMouseTrailEffectDefinition } from "./registry";
import {
    type MouseTrailRenderer,
    type MouseTrailRuntimeConfig,
} from "./types";

const PARTICLE_BUDGET = 36;
const MIN_EMIT_INTERVAL_MS = 20;
const MIN_EMIT_DISTANCE_PX = 7;
const MIN_EMIT_DISTANCE_SQUARED = MIN_EMIT_DISTANCE_PX * MIN_EMIT_DISTANCE_PX;
const TRAIL_LAYER_CLASS = "shp-mouse-trail-layer";

class MouseTrailRuntime {
    readonly #reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    #active = false;
    #global = false;
    #localRoot: HTMLElement | null = null;
    #layer: HTMLElement | null = null;
    #renderer: MouseTrailRenderer | null = null;
    #effectiveEffectId = "";
    #requestedConfig: MouseTrailRuntimeConfig | null = null;
    #animationFrameId: number | null = null;
    #hasPendingPoint = false;
    #latestX = 0;
    #latestY = 0;
    #hasLastSample = false;
    #lastX = 0;
    #lastY = 0;
    #lastTimestamp = 0;

    constructor() {
        this.#reducedMotionQuery.addEventListener("change", this.#handleReducedMotionChange);
    }

    configure(config: MouseTrailRuntimeConfig): void {
        this.#requestedConfig = config;
        this.#global = config.global;
        this.#localRoot = config.localRoot ?? this.#localRoot;
        const shouldActivate = config.enabled && !this.#reducedMotionQuery.matches;
        if (!shouldActivate) {
            this.#deactivate();
            return;
        }

        const definition = resolveMouseTrailEffectDefinition(config.preferredEffectId);
        if (!definition) {
            this.#deactivate();
            console.warn("[MouseTrail] 没有可用的鼠标尾流特效，已安全停用");
            return;
        }

        if (!this.#active) {
            document.addEventListener("pointermove", this.#handlePointerMove, { passive: true });
            document.addEventListener("visibilitychange", this.#handleVisibilityChange);
            this.#active = true;
        }
        if (this.#effectiveEffectId === definition.id && this.#renderer && this.#layer) return;

        this.#destroyRenderer();
        const layer = document.createElement("div");
        layer.className = TRAIL_LAYER_CLASS;
        layer.dataset.mouseTrailEffect = definition.id;
        layer.setAttribute("aria-hidden", "true");
        document.body.appendChild(layer);
        this.#layer = layer;
        this.#renderer = definition.createRenderer({ layer, particleBudget: PARTICLE_BUDGET });
        this.#effectiveEffectId = definition.id;
        this.#resetSampling();
    }

    destroy(): void {
        this.#deactivate();
        this.#reducedMotionQuery.removeEventListener("change", this.#handleReducedMotionChange);
        this.#localRoot = null;
        this.#requestedConfig = null;
    }

    readonly #handlePointerMove = (event: PointerEvent): void => {
        if (!this.#active || document.hidden || event.isPrimary === false) return;
        if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        if (!this.#global && !this.#isInsideLocalRoot(event.target)) return;

        this.#latestX = event.clientX;
        this.#latestY = event.clientY;
        this.#hasPendingPoint = true;
        if (this.#animationFrameId === null) {
            this.#animationFrameId = window.requestAnimationFrame(this.#flushLatestPoint);
        }
    };

    readonly #flushLatestPoint = (timestamp: number): void => {
        this.#animationFrameId = null;
        if (!this.#active || !this.#renderer || !this.#hasPendingPoint) return;
        this.#hasPendingPoint = false;

        const deltaX = this.#latestX - this.#lastX;
        const deltaY = this.#latestY - this.#lastY;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        const elapsedMs = timestamp - this.#lastTimestamp;
        if (this.#hasLastSample && (
            elapsedMs < MIN_EMIT_INTERVAL_MS
            || distanceSquared < MIN_EMIT_DISTANCE_SQUARED
        )) return;

        const distance = this.#hasLastSample ? Math.sqrt(distanceSquared) : 0;
        this.#renderer.emit({
            x: this.#latestX,
            y: this.#latestY,
            deltaX: this.#hasLastSample ? deltaX : 0,
            deltaY: this.#hasLastSample ? deltaY : 0,
            distance,
            elapsedMs: this.#hasLastSample ? Math.max(elapsedMs, 1) : 0,
            timestamp,
        });
        this.#lastX = this.#latestX;
        this.#lastY = this.#latestY;
        this.#lastTimestamp = timestamp;
        this.#hasLastSample = true;
    };

    readonly #handleVisibilityChange = (): void => {
        if (document.hidden) {
            this.#renderer?.clear();
            this.#resetSampling();
        }
    };

    readonly #handleReducedMotionChange = (): void => {
        if (this.#reducedMotionQuery.matches) {
            this.#deactivate();
        } else if (this.#requestedConfig) {
            this.configure(this.#requestedConfig);
        }
    };

    #isInsideLocalRoot(target: EventTarget | null): boolean {
        if (!this.#localRoot?.isConnected) {
            this.#localRoot = document.querySelector<HTMLElement>(".homepage-container");
        }
        return target instanceof Node && Boolean(this.#localRoot?.contains(target));
    }

    #deactivate(): void {
        if (this.#active) {
            document.removeEventListener("pointermove", this.#handlePointerMove);
            document.removeEventListener("visibilitychange", this.#handleVisibilityChange);
        }
        this.#active = false;
        this.#destroyRenderer();
        this.#resetSampling();
    }

    #destroyRenderer(): void {
        this.#renderer?.destroy();
        this.#renderer = null;
        this.#layer?.remove();
        this.#layer = null;
        this.#effectiveEffectId = "";
    }

    #resetSampling(): void {
        if (this.#animationFrameId !== null) {
            window.cancelAnimationFrame(this.#animationFrameId);
            this.#animationFrameId = null;
        }
        this.#hasPendingPoint = false;
        this.#hasLastSample = false;
        this.#lastX = 0;
        this.#lastY = 0;
        this.#lastTimestamp = 0;
    }
}

let activeRuntime: MouseTrailRuntime | null = null;

export function updateMouseTrailRuntime(config: MouseTrailRuntimeConfig): void {
    ensureBuiltinMouseTrailEffectsRegistered();
    activeRuntime ??= new MouseTrailRuntime();
    activeRuntime.configure(config);
}

export function cleanupMouseTrailRuntime(): void {
    activeRuntime?.destroy();
    activeRuntime = null;
}
