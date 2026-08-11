import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    DEFAULT_MOUSE_TRAIL_EFFECT_ID,
    MOUSE_TRAIL_EFFECT_API_VERSION,
    MouseTrailEffectRegistry,
    ensureBuiltinMouseTrailEffectsRegistered,
    mouseTrailEffectRegistry,
    registerMouseTrailEffect,
    resolveMouseTrailEffectDefinition,
    type MouseTrailEffectDefinition,
} from "../src/homepage/effects/mouseTrail/index";

const noopRenderer: MouseTrailEffectDefinition["createRenderer"] = () => ({
    emit: () => undefined,
    clear: () => undefined,
    destroy: () => undefined,
});

ensureBuiltinMouseTrailEffectsRegistered();
const builtin = mouseTrailEffectRegistry.get(DEFAULT_MOUSE_TRAIL_EFFECT_ID);
assert.ok(builtin, "built-in glow mouse trail must be registered");
assert.equal(builtin.apiVersion, MOUSE_TRAIL_EFFECT_API_VERSION);
assert.equal(Object.isFrozen(builtin), true, "registered definitions must be immutable");
assert.equal(Object.isFrozen(mouseTrailEffectRegistry.list()), true, "registry lists must be immutable");

const verifierEffect: MouseTrailEffectDefinition = {
    id: "verify.light-trail",
    apiVersion: MOUSE_TRAIL_EFFECT_API_VERSION,
    label: "验证尾流",
    createRenderer: noopRenderer,
};
const unregisterVerifier = registerMouseTrailEffect(verifierEffect);
assert.equal(resolveMouseTrailEffectDefinition(verifierEffect.id)?.id, verifierEffect.id);
assert.throws(() => registerMouseTrailEffect(verifierEffect), /已注册/);
unregisterVerifier();
assert.equal(
    resolveMouseTrailEffectDefinition(verifierEffect.id)?.id,
    DEFAULT_MOUSE_TRAIL_EFFECT_ID,
    "missing preferred effects must fall back without changing the preferred id",
);

const isolatedRegistry = new MouseTrailEffectRegistry();
assert.throws(() => isolatedRegistry.register({ ...verifierEffect, id: "INVALID ID" }), /不合法/);
assert.throws(
    () => isolatedRegistry.register({ ...verifierEffect, apiVersion: 2 as 1 }),
    /API 版本/,
);
assert.throws(
    () => registerMouseTrailEffect({ ...verifierEffect, id: "builtin.reserved" }),
    /内置命名空间/,
);

const runtimeSource = readFileSync(
    join(process.cwd(), "src/homepage/effects/mouseTrail/runtime.ts"),
    "utf8",
);
const legacyFacadeSource = readFileSync(
    join(process.cwd(), "src/homepage/effects/mouseEffects.ts"),
    "utf8",
);
assert.match(runtimeSource, /addEventListener\("pointermove"/);
assert.match(runtimeSource, /requestAnimationFrame/);
assert.match(runtimeSource, /MIN_EMIT_INTERVAL_MS/);
assert.match(runtimeSource, /MIN_EMIT_DISTANCE_PX/);
assert.doesNotMatch(runtimeSource, /setTimeout|setInterval/);
assert.doesNotMatch(legacyFacadeSource, /trailElements|createMouseTrail/);

console.log("Mouse trail effect framework verification passed.");
