export const MOUSE_TRAIL_EFFECT_API_VERSION = 1 as const;
export const DEFAULT_MOUSE_TRAIL_EFFECT_ID = "builtin.glow";

export interface MouseTrailSample {
    readonly x: number;
    readonly y: number;
    readonly deltaX: number;
    readonly deltaY: number;
    readonly distance: number;
    readonly elapsedMs: number;
    readonly timestamp: number;
}

export interface MouseTrailRendererContext {
    readonly layer: HTMLElement;
    readonly particleBudget: number;
}

export interface MouseTrailRenderer {
    emit(sample: MouseTrailSample): void;
    clear(): void;
    destroy(): void;
}

export interface MouseTrailEffectDefinition {
    readonly id: string;
    readonly apiVersion: typeof MOUSE_TRAIL_EFFECT_API_VERSION;
    readonly label: string;
    readonly description?: string;
    createRenderer(context: MouseTrailRendererContext): MouseTrailRenderer;
}

export interface MouseTrailRuntimeConfig {
    readonly enabled: boolean;
    readonly global: boolean;
    readonly preferredEffectId?: string;
    readonly localRoot?: HTMLElement | null;
}
