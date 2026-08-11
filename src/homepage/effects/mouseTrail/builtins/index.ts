import { mouseTrailEffectRegistry } from "../registry";
import { glowMouseTrailEffect } from "./glow";

let registered = false;

export function ensureBuiltinMouseTrailEffectsRegistered(): void {
    if (registered) return;
    if (!mouseTrailEffectRegistry.has(glowMouseTrailEffect.id)) {
        mouseTrailEffectRegistry.register(glowMouseTrailEffect);
    }
    registered = true;
}
