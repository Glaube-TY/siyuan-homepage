import {
    DEFAULT_MOUSE_TRAIL_EFFECT_ID,
    MOUSE_TRAIL_EFFECT_API_VERSION,
    type MouseTrailEffectDefinition,
} from "./types";

const EFFECT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function validateMouseTrailEffectDefinition(definition: MouseTrailEffectDefinition): void {
    if (!definition || typeof definition !== "object") {
        throw new Error("鼠标尾流特效定义不能为空");
    }
    if (typeof definition.id !== "string" || !EFFECT_ID_PATTERN.test(definition.id)) {
        throw new Error(`鼠标尾流特效 ID 不合法: ${definition.id}`);
    }
    if (definition.apiVersion !== MOUSE_TRAIL_EFFECT_API_VERSION) {
        throw new Error(`鼠标尾流特效 API 版本不兼容: ${definition.id}`);
    }
    if (typeof definition.label !== "string" || !definition.label.trim()) {
        throw new Error(`鼠标尾流特效名称不能为空: ${definition.id}`);
    }
    if (typeof definition.createRenderer !== "function") {
        throw new Error(`鼠标尾流特效缺少 renderer 工厂: ${definition.id}`);
    }
}

export class MouseTrailEffectRegistry {
    readonly #definitions = new Map<string, MouseTrailEffectDefinition>();

    register(definition: MouseTrailEffectDefinition): void {
        validateMouseTrailEffectDefinition(definition);
        if (this.#definitions.has(definition.id)) {
            throw new Error(`鼠标尾流特效 ID 已注册: ${definition.id}`);
        }
        this.#definitions.set(definition.id, Object.freeze({ ...definition }));
    }

    unregister(id: string): boolean {
        return this.#definitions.delete(id);
    }

    get(id: string): MouseTrailEffectDefinition | undefined {
        return this.#definitions.get(id);
    }

    has(id: string): boolean {
        return this.#definitions.has(id);
    }

    list(): readonly MouseTrailEffectDefinition[] {
        return Object.freeze([...this.#definitions.values()]);
    }
}

export const mouseTrailEffectRegistry = new MouseTrailEffectRegistry();

export function registerMouseTrailEffect(definition: MouseTrailEffectDefinition): () => void {
    if (typeof definition?.id === "string" && definition.id.startsWith("builtin.")) {
        throw new Error(`第三方鼠标尾流特效不能使用内置命名空间: ${definition.id}`);
    }
    mouseTrailEffectRegistry.register(definition);
    return () => mouseTrailEffectRegistry.unregister(definition.id);
}

export function resolveMouseTrailEffectDefinition(
    preferredEffectId?: string,
): MouseTrailEffectDefinition | undefined {
    return mouseTrailEffectRegistry.get(preferredEffectId || "")
        ?? mouseTrailEffectRegistry.get(DEFAULT_MOUSE_TRAIL_EFFECT_ID);
}
