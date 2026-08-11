import {
    cleanupFallingEffectRuntime,
    updateFallingEffectRuntime,
    type FallingDensity,
    type FallingSpeed,
} from "./falling";

export interface FallingEffectConfig {
    advanced: boolean;
    FallEffectsEnabled: boolean;
    GlobalFallingEffectsEnabled: boolean;
    FallingIcon: string;
    FallingDensity: string;
    FallingSpeed: string;
    preferredEffectId?: string;
}

function normalizeDensity(value: string): FallingDensity {
    return value === "low" || value === "high" ? value : "medium";
}

function normalizeSpeed(value: string): FallingSpeed {
    return value === "low" || value === "high" ? value : "medium";
}

export function updateFallingEffects(
    config: FallingEffectConfig,
    localRoot?: HTMLElement | null,
): void {
    updateFallingEffectRuntime({
        enabled: config.advanced && config.FallEffectsEnabled,
        global: config.GlobalFallingEffectsEnabled,
        icon: config.FallingIcon,
        density: normalizeDensity(config.FallingDensity),
        speed: normalizeSpeed(config.FallingSpeed),
        preferredEffectId: config.preferredEffectId,
        localRoot,
    });
}

export function cleanupFallingEffects(): void {
    cleanupFallingEffectRuntime();
}

export * from "./falling";
