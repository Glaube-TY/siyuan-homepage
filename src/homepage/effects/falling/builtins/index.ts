import { fallingEffectRegistry } from "../registry";
import { spriteDriftFallingEffect } from "./spriteDrift";

let builtinFallingEffectsRegistered = false;

export function ensureBuiltinFallingEffectsRegistered(): void {
    if (builtinFallingEffectsRegistered) return;
    if (!fallingEffectRegistry.has(spriteDriftFallingEffect.id)) {
        fallingEffectRegistry.register(spriteDriftFallingEffect);
    }
    builtinFallingEffectsRegistered = true;
}

export { spriteDriftFallingEffect };
