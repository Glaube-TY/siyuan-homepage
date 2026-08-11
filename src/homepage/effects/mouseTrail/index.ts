export {
    MOUSE_TRAIL_EFFECT_API_VERSION,
    DEFAULT_MOUSE_TRAIL_EFFECT_ID,
    type MouseTrailEffectDefinition,
    type MouseTrailRenderer,
    type MouseTrailRendererContext,
    type MouseTrailRuntimeConfig,
    type MouseTrailSample,
} from "./types";
export {
    MouseTrailEffectRegistry,
    mouseTrailEffectRegistry,
    registerMouseTrailEffect,
    resolveMouseTrailEffectDefinition,
} from "./registry";
export { ensureBuiltinMouseTrailEffectsRegistered } from "./builtins";
export { updateMouseTrailRuntime, cleanupMouseTrailRuntime } from "./runtime";
