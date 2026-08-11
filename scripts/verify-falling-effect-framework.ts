import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    DEFAULT_FALLING_EFFECT_ID,
    FALLING_EFFECT_API_VERSION,
    FallingEffectRegistry,
    ensureBuiltinFallingEffectsRegistered,
    fallingEffectRegistry,
    registerFallingEffect,
    resolveFallingEffectDefinition,
    type FallingEffectDefinition,
} from "../src/homepage/effects/falling/index";

const noopRenderer: FallingEffectDefinition["createRenderer"] = () => ({
    configure: () => undefined,
    resize: () => undefined,
    frame: () => undefined,
    clear: () => undefined,
    destroy: () => undefined,
});

ensureBuiltinFallingEffectsRegistered();
const builtin = fallingEffectRegistry.get(DEFAULT_FALLING_EFFECT_ID);
assert.ok(builtin, "built-in falling effect must be registered");
assert.equal(builtin.apiVersion, FALLING_EFFECT_API_VERSION);
assert.equal(Object.isFrozen(builtin), true, "registered definitions must be immutable");
assert.equal(Object.isFrozen(fallingEffectRegistry.list()), true, "registry lists must be immutable");

const verifierEffect: FallingEffectDefinition = {
    id: "verify.light-fall",
    apiVersion: FALLING_EFFECT_API_VERSION,
    label: "验证飘落",
    createRenderer: noopRenderer,
};
const unregisterVerifier = registerFallingEffect(verifierEffect);
assert.equal(resolveFallingEffectDefinition(verifierEffect.id)?.id, verifierEffect.id);
assert.throws(() => registerFallingEffect(verifierEffect), /已注册/);
unregisterVerifier();
assert.equal(
    resolveFallingEffectDefinition(verifierEffect.id)?.id,
    DEFAULT_FALLING_EFFECT_ID,
    "missing preferred effects must fall back without changing the preferred id",
);

const isolatedRegistry = new FallingEffectRegistry();
assert.throws(() => isolatedRegistry.register({ ...verifierEffect, id: "INVALID ID" }), /不合法/);
assert.throws(
    () => isolatedRegistry.register({ ...verifierEffect, apiVersion: 2 as 1 }),
    /API 版本/,
);
assert.throws(
    () => registerFallingEffect({ ...verifierEffect, id: "builtin.reserved" }),
    /内置命名空间/,
);

const runtimeSource = readFileSync(
    join(process.cwd(), "src/homepage/effects/falling/runtime.ts"),
    "utf8",
);
const rendererSource = readFileSync(
    join(process.cwd(), "src/homepage/effects/falling/builtins/spriteDrift.ts"),
    "utf8",
);
const legacyFacadeSource = readFileSync(
    join(process.cwd(), "src/homepage/effects/fallingEffects.ts"),
    "utf8",
);
const homepageSource = readFileSync(
    join(process.cwd(), "src/homepage/homepage.svelte"),
    "utf8",
);

assert.match(runtimeSource, /requestAnimationFrame/);
assert.match(runtimeSource, /ResizeObserver/);
assert.match(runtimeSource, /visibilitychange/);
assert.match(runtimeSource, /MAX_CANVAS_PIXELS/);
assert.match(runtimeSource, /PARTICLE_BUDGET/);
assert.doesNotMatch(runtimeSource, /setTimeout|setInterval/);
assert.match(rendererSource, /particleBudget/);
assert.match(rendererSource, /clearRect/);
assert.match(rendererSource, /drawImage/);
assert.doesNotMatch(rendererSource, /requestAnimationFrame|setTimeout|setInterval|getBoundingClientRect|querySelectorAll/);
assert.doesNotMatch(legacyFacadeSource, /animationiteration|maxFallingElement|querySelectorAll|createFallingFlake/);
assert.match(homepageSource, /updateFallingEffects/);
assert.doesNotMatch(homepageSource, /Array\(20\)|shp-falling-flake/);

console.log("Falling effect framework verification passed.");
