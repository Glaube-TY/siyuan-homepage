import { homepageThemeRegistry, CLASSIC_HOMEPAGE_THEME_ID } from "../registry/themeRegistry";
import { resolveLegacyWidgetPresentation, resolveWidgetPresentation } from "./resolver";
import type {
    ResolvedWidgetPresentation,
    WidgetDefinition,
    WidgetPlacement,
    WidgetPresentationContext,
} from "./types";
import { resolveWidgetShellVariant } from "./shell";

type PresentationListener = (context: WidgetPresentationContext) => void;
const PRESENTATION_CONTEXTS = new WeakMap<HTMLElement, WidgetPresentationContext>();
const PRESENTATION_LISTENERS = new WeakMap<HTMLElement, Set<PresentationListener>>();
const CONTENT_VARIANT_PATTERN = /^[a-z0-9][a-z0-9._-]{1,95}$/;

function isReducedMotion(): boolean {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function presentationRoot(element: HTMLElement): HTMLElement | null {
    return element.closest<HTMLElement>(".homepage-container[data-hp-theme]");
}

function notifyPresentation(element: HTMLElement, context: WidgetPresentationContext): void {
    for (const listener of PRESENTATION_LISTENERS.get(element) ?? []) {
        try {
            listener(context);
        } catch (error) {
            console.error("[WidgetPresentation] Context 订阅回调失败", {
                themeId: context.themeId,
                widgetType: context.widgetType,
                widgetId: element.id,
                level: context.level,
                error,
            });
        }
    }
    element.dispatchEvent(new CustomEvent("widget-presentation-change", { detail: context }));
}

function exposePresentation(element: HTMLElement, resolved: ResolvedWidgetPresentation, placement: WidgetPlacement): WidgetPresentationContext {
    const root = presentationRoot(element);
    const surface = placement === "homepage" && root ? "desktop-homepage" : "other";
    const appearancePolicy = root?.dataset.hpWidgetAppearancePolicy === "theme-controlled"
        ? "theme-controlled"
        : "user-configurable";
    const context: WidgetPresentationContext = Object.freeze({
        ...resolved,
        placement,
        surface,
        appearancePolicy,
        reducedMotion: isReducedMotion(),
    });

    element.dataset.widgetKind = resolved.widgetKind;
    element.dataset.widgetPlacement = placement;
    element.dataset.widgetPresentation = resolved.presentationId;
    element.dataset.widgetPresentationScope = resolved.scope;
    element.dataset.widgetPresentationMode = resolved.mode;
    element.dataset.widgetPresentationLevel = resolved.level;
    if (resolved.contentVariant) element.dataset.widgetContentVariant = resolved.contentVariant;
    else delete element.dataset.widgetContentVariant;
    if (resolved.resolvedIcon) element.dataset.widgetPresentationIcon = resolved.resolvedIcon;
    else delete element.dataset.widgetPresentationIcon;
    if (resolved.shell) {
        element.dataset.hpWidgetShell = resolved.shell.id;
        element.dataset.hpWidgetShellState = resolved.shell.state;
        if (resolved.shell.state === "applied") {
            element.dataset.hpWidgetShellVariant = String(resolveWidgetShellVariant(
                `${element.id}|${resolved.widgetType}`,
                resolved.shell.variants,
            ));
        } else {
            delete element.dataset.hpWidgetShellVariant;
        }
    } else {
        delete element.dataset.hpWidgetShell;
        delete element.dataset.hpWidgetShellState;
        delete element.dataset.hpWidgetShellVariant;
    }
    PRESENTATION_CONTEXTS.set(element, context);
    notifyPresentation(element, context);
    return context;
}

export function applyWidgetPresentation(
    element: HTMLElement,
    definition: WidgetDefinition,
    placement: WidgetPlacement = "homepage",
    contentConfig?: unknown,
): WidgetPresentationContext {
    const root = presentationRoot(element);
    const themeId = root?.dataset.hpTheme || CLASSIC_HOMEPAGE_THEME_ID;
    let contentVariant = element.dataset.widgetContentVariant;
    if (contentConfig !== undefined) {
        contentVariant = undefined;
        try {
            const candidate = definition.resolveContentVariant?.(contentConfig);
            if (candidate !== undefined) {
                if (!CONTENT_VARIANT_PATTERN.test(candidate)) {
                    console.warn("[WidgetPresentation] Widget content variant 非法，已忽略", {
                        widgetType: definition.type,
                        contentVariant: candidate,
                    });
                } else {
                    contentVariant = candidate;
                }
            }
        } catch (error) {
            console.error("[WidgetPresentation] Widget content variant 解析失败，已忽略", {
                widgetType: definition.type,
                error,
            });
        }
    }
    if (placement !== "homepage" || !root) {
        return exposePresentation(element, resolveLegacyWidgetPresentation(themeId, definition, contentVariant), placement);
    }

    try {
        const manifest = homepageThemeRegistry.widgetPresentations.get(themeId);
        const classicManifest = homepageThemeRegistry.widgetPresentations.get(CLASSIC_HOMEPAGE_THEME_ID);
        return exposePresentation(element, resolveWidgetPresentation({
            themeId,
            definition,
            contentVariant,
            manifest,
            classicManifest,
        }), placement);
    } catch (error) {
        console.error("[WidgetPresentation] Presentation 解析失败，已回退 Legacy", {
            themeId,
            widgetType: definition.type,
            widgetId: element.id,
            level: "legacy",
            error,
        });
        return exposePresentation(element, resolveLegacyWidgetPresentation(themeId, definition, contentVariant), placement);
    }
}

export function getWidgetPresentationContext(element: HTMLElement): WidgetPresentationContext | undefined {
    const widget = element.matches(".widget-block") ? element : element.closest<HTMLElement>(".widget-block");
    return widget ? PRESENTATION_CONTEXTS.get(widget) : undefined;
}

export function subscribeWidgetPresentation(
    element: HTMLElement,
    listener: PresentationListener,
): () => void {
    const widget = element.matches(".widget-block") ? element : element.closest<HTMLElement>(".widget-block");
    if (!widget) return () => undefined;
    const listeners = PRESENTATION_LISTENERS.get(widget) ?? new Set<PresentationListener>();
    listeners.add(listener);
    PRESENTATION_LISTENERS.set(widget, listeners);
    const context = PRESENTATION_CONTEXTS.get(widget);
    if (context) listener(context);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) PRESENTATION_LISTENERS.delete(widget);
    };
}
