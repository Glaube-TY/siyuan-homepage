import { WIDGET_PRESENTATION_CONTRACT_VERSION, type WidgetKind, type WidgetPresentationDescriptor, type WidgetPresentationManifest } from "./types";

const WIDGET_KINDS = new Set<WidgetKind>([
    "list", "task", "stat", "chart", "calendar", "note", "media", "utility", "embed", "complex", "custom",
]);
const PRESENTATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const PRESENTATION_MODES = new Set(["specific", "kind", "generic", "semantic"]);
const PRESENTATION_SCOPES = new Set(["full", "chrome", "native"]);

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
