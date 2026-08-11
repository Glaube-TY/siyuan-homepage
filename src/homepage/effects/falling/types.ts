export const FALLING_EFFECT_API_VERSION = 1 as const;
export const DEFAULT_FALLING_EFFECT_ID = "builtin.sprite-drift";

export type FallingDensity = "low" | "medium" | "high";
export type FallingSpeed = "low" | "medium" | "high";

export interface FallingEffectViewport {
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
}

export interface FallingEffectFrame {
    readonly timestamp: number;
    readonly deltaMs: number;
    readonly viewport: FallingEffectViewport;
}

export interface FallingEffectRendererConfig {
    readonly iconSrc: string;
    readonly density: FallingDensity;
    readonly speed: FallingSpeed;
}

export interface FallingEffectRendererContext {
    readonly canvas: HTMLCanvasElement;
    readonly context: CanvasRenderingContext2D;
    readonly particleBudget: number;
}

export interface FallingEffectRenderer {
    configure(config: FallingEffectRendererConfig): void;
    resize(viewport: FallingEffectViewport): void;
    frame(frame: FallingEffectFrame): void;
    clear(): void;
    destroy(): void;
}

export interface FallingEffectDefinition {
    readonly id: string;
    readonly apiVersion: typeof FALLING_EFFECT_API_VERSION;
    readonly label: string;
    readonly description?: string;
    createRenderer(context: FallingEffectRendererContext): FallingEffectRenderer;
}

export interface FallingEffectRuntimeConfig {
    readonly enabled: boolean;
    readonly global: boolean;
    readonly icon: string;
    readonly density: FallingDensity;
    readonly speed: FallingSpeed;
    readonly preferredEffectId?: string;
    readonly localRoot?: HTMLElement | null;
}
