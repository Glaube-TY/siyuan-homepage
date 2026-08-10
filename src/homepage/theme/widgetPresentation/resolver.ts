import { resolveWidgetPresentationIcon } from "./iconResolver";
import type {
    ResolvedWidgetPresentation,
    WidgetDefinition,
    WidgetPresentationDescriptor,
    WidgetPresentationLevel,
    WidgetPresentationManifest,
    WidgetPresentationMode,
} from "./types";

interface ResolveWidgetPresentationOptions {
    themeId: string;
    definition: WidgetDefinition;
    manifest?: WidgetPresentationManifest;
    classicManifest?: WidgetPresentationManifest;
}

function rendererFor(definition: WidgetDefinition, descriptor: WidgetPresentationDescriptor): WidgetPresentationDescriptor["renderer"] | undefined {
    if (!descriptor.renderer || !definition.capabilities.rendererOverride) return undefined;
    if (definition.capabilities.stateful && descriptor.renderer.safeForStateful !== true) return undefined;
    return descriptor.renderer;
}

function resolved(
    options: ResolveWidgetPresentationOptions,
    descriptor: WidgetPresentationDescriptor,
    level: WidgetPresentationLevel,
    mode: WidgetPresentationMode,
    trail: WidgetPresentationLevel[],
): ResolvedWidgetPresentation {
    const renderer = rendererFor(options.definition, descriptor);
    return Object.freeze({
        themeId: options.themeId,
        widgetType: options.definition.type,
        widgetKind: options.definition.kind,
        presentationId: descriptor.id,
        scope: descriptor.scope ?? options.definition.defaultPresentationScope,
        mode,
        level,
        semanticLabel: options.definition.semanticLabel,
        semanticIcon: options.definition.semanticIcon,
        resolvedIcon: resolveWidgetPresentationIcon(options.definition.semanticIcon, options.manifest),
        renderer: renderer?.component,
        fallbackTrail: Object.freeze([...trail, level]),
    });
}

export function resolveWidgetPresentation(options: ResolveWidgetPresentationOptions): ResolvedWidgetPresentation {
    const trail: WidgetPresentationLevel[] = [];
    const widgetSpecific = options.manifest?.widgets?.[options.definition.type];
    if (widgetSpecific) return resolved(options, widgetSpecific, "theme-widget", widgetSpecific.mode ?? "specific", trail);
    trail.push("theme-widget");

    const kindPresentation = options.manifest?.kinds?.[options.definition.kind];
    if (kindPresentation) return resolved(options, kindPresentation, "theme-kind", kindPresentation.mode ?? "kind", trail);
    trail.push("theme-kind");

    if (options.manifest?.generic) {
        return resolved(options, options.manifest.generic, "theme-generic", options.manifest.generic.mode ?? "generic", trail);
    }
    trail.push("theme-generic");

    if (options.definition.capabilities.semanticParts) {
        return resolved(options, { id: "compat.semantic" }, "semantic", "semantic", trail);
    }
    trail.push("semantic");

    const classicSpecific = options.classicManifest?.widgets?.[options.definition.type]
        ?? options.classicManifest?.kinds?.[options.definition.kind]
        ?? options.classicManifest?.generic;
    if (classicSpecific) return resolved(options, classicSpecific, "classic", "classic", trail);
    trail.push("classic");

    return resolved(options, { id: "compat.legacy" }, "legacy", "legacy", trail);
}

export function resolveLegacyWidgetPresentation(themeId: string, definition: WidgetDefinition): ResolvedWidgetPresentation {
    return Object.freeze({
        themeId,
        widgetType: definition.type,
        widgetKind: definition.kind,
        presentationId: "compat.legacy",
        scope: definition.defaultPresentationScope,
        mode: "legacy",
        level: "legacy",
        semanticLabel: definition.semanticLabel,
        semanticIcon: definition.semanticIcon,
        resolvedIcon: resolveWidgetPresentationIcon(definition.semanticIcon),
        fallbackTrail: Object.freeze(["legacy"] as WidgetPresentationLevel[]),
    });
}
