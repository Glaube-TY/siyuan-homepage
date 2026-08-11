import {
    WIDGET_PRESENTATION_CONTRACT_VERSION,
    type WidgetKind,
    type WidgetPresentationDescriptor,
    type WidgetPresentationManifest,
    type WidgetPresentationScope,
    type WidgetShellDefinition,
    type WidgetShellTokens,
} from "./types";

const WIDGET_KINDS = new Set<WidgetKind>([
    "list", "task", "stat", "chart", "calendar", "note", "media", "utility", "embed", "complex", "custom",
]);
const PRESENTATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const PRESENTATION_MODES = new Set(["specific", "kind", "generic", "semantic"]);
const PRESENTATION_SCOPES = new Set(["full", "chrome", "native"]);
const SHELL_TOKEN_KEYS = new Set<keyof WidgetShellTokens>(["background", "border", "borderRadius", "boxShadow"]);
const UNSAFE_SHELL_TOKEN_VALUE = /[;{}<>\r\n]/;

function validateDescriptor(descriptor: unknown, path: string): asserts descriptor is WidgetPresentationDescriptor {
    if (!descriptor || typeof descriptor !== "object") throw new Error(`${path} 必须是对象`);
    const value = descriptor as WidgetPresentationDescriptor;
    if (typeof value.id !== "string" || !PRESENTATION_ID_PATTERN.test(value.id)) {
        throw new Error(`${path}.id 非法: ${String(value.id)}`);
    }
    if (value.mode !== undefined && !PRESENTATION_MODES.has(value.mode)) {
        throw new Error(`${path}.mode 非法: ${String(value.mode)}`);
    }
    if (value.scope !== undefined && !PRESENTATION_SCOPES.has(value.scope)) {
        throw new Error(`${path}.scope 非法: ${String(value.scope)}`);
    }
    if (value.renderer && typeof value.renderer.component !== "function") {
        throw new Error(`${path}.renderer.component 必须是 Svelte Component`);
    }
    if (value.renderer?.safeForStateful !== undefined && typeof value.renderer.safeForStateful !== "boolean") {
        throw new Error(`${path}.renderer.safeForStateful 必须是布尔值`);
    }
}

function validateStringArray(values: unknown, path: string, validator?: (value: string) => boolean): asserts values is readonly string[] {
    if (!Array.isArray(values)) throw new Error(`${path} 必须是数组`);
    for (const value of values) {
        if (typeof value !== "string" || !value.trim() || (validator && !validator(value))) {
            throw new Error(`${path} 包含非法值: ${String(value)}`);
        }
    }
}

function validateShell(shell: unknown): asserts shell is WidgetShellDefinition {
    if (!shell || typeof shell !== "object") throw new Error("widgetPresentation.shell 必须是对象");
    const value = shell as WidgetShellDefinition;
    if (typeof value.id !== "string" || !PRESENTATION_ID_PATTERN.test(value.id)) {
        throw new Error(`widgetPresentation.shell.id 非法: ${String(value.id)}`);
    }
    if (value.variants !== undefined && (!Number.isInteger(value.variants) || value.variants < 1 || value.variants > 12)) {
        throw new Error("widgetPresentation.shell.variants 必须是 1 到 12 的整数");
    }
    if (value.tokens !== undefined) {
        if (!value.tokens || typeof value.tokens !== "object" || Array.isArray(value.tokens)) {
            throw new Error("widgetPresentation.shell.tokens 必须是对象");
        }
        for (const [key, tokenValue] of Object.entries(value.tokens)) {
            if (!SHELL_TOKEN_KEYS.has(key as keyof WidgetShellTokens)) {
                throw new Error(`widgetPresentation.shell.tokens 包含未知令牌: ${key}`);
            }
            if (typeof tokenValue !== "string" || !tokenValue.trim() || tokenValue.length > 2048 || UNSAFE_SHELL_TOKEN_VALUE.test(tokenValue)) {
                throw new Error(`widgetPresentation.shell.tokens.${key} 不是安全的 CSS 值`);
            }
        }
    }
    if (value.exclude !== undefined) {
        if (!value.exclude || typeof value.exclude !== "object" || Array.isArray(value.exclude)) {
            throw new Error("widgetPresentation.shell.exclude 必须是对象");
        }
        if (value.exclude.widgetTypes !== undefined) {
            validateStringArray(value.exclude.widgetTypes, "widgetPresentation.shell.exclude.widgetTypes");
        }
        if (value.exclude.kinds !== undefined) {
            validateStringArray(value.exclude.kinds, "widgetPresentation.shell.exclude.kinds", (kind) => WIDGET_KINDS.has(kind as WidgetKind));
        }
        if (value.exclude.presentationIds !== undefined) {
            validateStringArray(value.exclude.presentationIds, "widgetPresentation.shell.exclude.presentationIds", (id) => PRESENTATION_ID_PATTERN.test(id));
        }
        if (value.exclude.scopes !== undefined) {
            validateStringArray(value.exclude.scopes, "widgetPresentation.shell.exclude.scopes", (scope) => PRESENTATION_SCOPES.has(scope as WidgetPresentationScope));
        }
    }
}

export function validateWidgetPresentationManifest(manifest: unknown): asserts manifest is WidgetPresentationManifest {
    if (!manifest || typeof manifest !== "object") throw new Error("Widget Presentation Manifest 必须是对象");
    const value = manifest as WidgetPresentationManifest;
    if (value.contractVersion !== WIDGET_PRESENTATION_CONTRACT_VERSION) {
        throw new Error(`不支持的 Widget Presentation Contract 版本: ${String(value.contractVersion)}`);
    }
    if (value.generic) validateDescriptor(value.generic, "widgetPresentation.generic");
    if (value.kinds) {
        for (const [kind, descriptor] of Object.entries(value.kinds)) {
            if (!WIDGET_KINDS.has(kind as WidgetKind)) throw new Error(`未知 Widget kind: ${kind}`);
            validateDescriptor(descriptor, `widgetPresentation.kinds.${kind}`);
        }
    }
    if (value.widgets) {
        for (const [widgetType, descriptor] of Object.entries(value.widgets)) {
            if (!widgetType.trim()) throw new Error("widgetPresentation.widgets 包含空 Widget type");
            validateDescriptor(descriptor, `widgetPresentation.widgets.${widgetType}`);
        }
    }
    if (value.icons) {
        for (const [semanticIcon, iconValue] of Object.entries(value.icons)) {
            if (!semanticIcon.trim() || typeof iconValue !== "string" || !iconValue.trim()) {
                throw new Error(`widgetPresentation.icons.${semanticIcon} 必须是非空字符串`);
            }
        }
    }
    if (value.shell) validateShell(value.shell);
}

function freezeManifest(manifest: WidgetPresentationManifest): WidgetPresentationManifest {
    const freezeDescriptor = (descriptor: WidgetPresentationDescriptor): WidgetPresentationDescriptor => Object.freeze({
        ...descriptor,
        renderer: descriptor.renderer ? Object.freeze({ ...descriptor.renderer }) : undefined,
    });
    return Object.freeze({
        ...manifest,
        generic: manifest.generic ? freezeDescriptor(manifest.generic) : undefined,
        kinds: manifest.kinds ? Object.freeze(Object.fromEntries(
            Object.entries(manifest.kinds).map(([key, value]) => [key, value ? freezeDescriptor(value) : value]),
        )) : undefined,
        widgets: manifest.widgets ? Object.freeze(Object.fromEntries(
            Object.entries(manifest.widgets).map(([key, value]) => [key, freezeDescriptor(value)]),
        )) : undefined,
        icons: manifest.icons ? Object.freeze({ ...manifest.icons }) : undefined,
        shell: manifest.shell ? Object.freeze({
            ...manifest.shell,
            tokens: manifest.shell.tokens ? Object.freeze({ ...manifest.shell.tokens }) : undefined,
            exclude: manifest.shell.exclude ? Object.freeze({
                ...manifest.shell.exclude,
                widgetTypes: manifest.shell.exclude.widgetTypes ? Object.freeze([...manifest.shell.exclude.widgetTypes]) : undefined,
                kinds: manifest.shell.exclude.kinds ? Object.freeze([...manifest.shell.exclude.kinds]) : undefined,
                presentationIds: manifest.shell.exclude.presentationIds ? Object.freeze([...manifest.shell.exclude.presentationIds]) : undefined,
                scopes: manifest.shell.exclude.scopes ? Object.freeze([...manifest.shell.exclude.scopes]) : undefined,
            }) : undefined,
        }) : undefined,
    });
}

export class WidgetPresentationRegistry {
    readonly #manifests = new Map<string, WidgetPresentationManifest>();

    register(themeId: string, manifest: unknown): WidgetPresentationManifest | undefined {
        if (manifest === undefined) return undefined;
        try {
            validateWidgetPresentationManifest(manifest);
            const frozen = freezeManifest(manifest);
            this.#manifests.set(themeId, frozen);
            return frozen;
        } catch (error) {
            console.error("[WidgetPresentation] 主题 Manifest 无效，已回退兼容 Presentation", {
                themeId,
                error,
            });
            return undefined;
        }
    }

    get(themeId: string): WidgetPresentationManifest | undefined {
        return this.#manifests.get(themeId);
    }
}
