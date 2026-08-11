import {
    DEFAULT_FALLING_EFFECT_ID,
    FALLING_EFFECT_API_VERSION,
    type FallingEffectDefinition,
} from "./types";

const EFFECT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function validateFallingEffectDefinition(definition: FallingEffectDefinition): void {
    if (!definition || typeof definition !== "object") {
        throw new Error("飘落特效定义不能为空");
    }
    if (typeof definition.id !== "string" || !EFFECT_ID_PATTERN.test(definition.id)) {
        throw new Error(`飘落特效 ID 不合法: ${definition.id}`);
    }
    if (definition.apiVersion !== FALLING_EFFECT_API_VERSION) {
        throw new Error(`飘落特效 API 版本不兼容: ${definition.id}`);
    }
    if (typeof definition.label !== "string" || !definition.label.trim()) {
        throw new Error(`飘落特效名称不能为空: ${definition.id}`);
    }
    if (typeof definition.createRenderer !== "function") {
        throw new Error(`飘落特效缺少 renderer 工厂: ${definition.id}`);
    }
}

export class FallingEffectRegistry {
    readonly #definitions = new Map<string, FallingEffectDefinition>();

    register(definition: FallingEffectDefinition): void {
        validateFallingEffectDefinition(definition);
        if (this.#definitions.has(definition.id)) {
            throw new Error(`飘落特效 ID 已注册: ${definition.id}`);
        }
        this.#definitions.set(definition.id, Object.freeze({ ...definition }));
    }

    unregister(id: string): boolean {
        return this.#definitions.delete(id);
    }

    get(id: string): FallingEffectDefinition | undefined {
        return this.#definitions.get(id);
    }

    has(id: string): boolean {
        return this.#definitions.has(id);
    }

    list(): readonly FallingEffectDefinition[] {
        return Object.freeze([...this.#definitions.values()]);
    }
}

export const fallingEffectRegistry = new FallingEffectRegistry();

export function registerFallingEffect(definition: FallingEffectDefinition): () => void {
    if (typeof definition?.id === "string" && definition.id.startsWith("builtin.")) {
        throw new Error(`第三方飘落特效不能使用内置命名空间: ${definition.id}`);
    }
    fallingEffectRegistry.register(definition);
    return () => fallingEffectRegistry.unregister(definition.id);
}

export function resolveFallingEffectDefinition(
    preferredEffectId?: string,
): FallingEffectDefinition | undefined {
    return fallingEffectRegistry.get(preferredEffectId || "")
        ?? fallingEffectRegistry.get(DEFAULT_FALLING_EFFECT_ID);
}
