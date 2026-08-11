import { resolveWidgetPresentationIcon } from "./iconResolver";
import type {
    ResolvedWidgetPresentation,
    WidgetDefinition,
    WidgetPresentationDescriptor,
    WidgetPresentationLevel,
    WidgetPresentationManifest,
    WidgetPresentationMode,
    WidgetPresentationScope,
    ResolvedWidgetShell,
} from "./types";

interface ResolveWidgetPresentationOptions {
    themeId: string;
    definition: WidgetDefinition;
    contentVariant?: string;
    manifest?: WidgetPresentationManifest;
    classicManifest?: WidgetPresentationManifest;
}

function rendererFor(definition: WidgetDefinition, descriptor: WidgetPresentationDescriptor): WidgetPresentationDescriptor["renderer"] | undefined {
    if (!descriptor.renderer || !definition.capabilities.rendererOverride) return undefined;
    if (definition.capabilities.stateful && descriptor.renderer.safeForStateful !== true) return undefined;
    return descriptor.renderer;
}

function resolveShell(
    options: ResolveWidgetPresentationOptions,
    presentationId: string,
    scope: WidgetPresentationScope,
): ResolvedWidgetShell | undefined {
    const shell = options.manifest?.shell;
    if (!shell) return undefined;
    const exclude = shell.exclude;
    const excluded = Boolean(
        exclude?.widgetTypes?.includes(options.definition.type)
        || exclude?.kinds?.includes(options.definition.kind)
        || exclude?.presentationIds?.includes(presentationId)
        || exclude?.scopes?.includes(scope)
        || exclude?.contentVariants?.includes(options.contentVariant ?? ""),
    );
    return Object.freeze({
        id: shell.id,
        state: excluded ? "excluded" : "applied",
        tokens: shell.tokens,
        variants: shell.variants ?? 1,
    });
}

function resolved(
    options: ResolveWidgetPresentationOptions,
    descriptor: WidgetPresentationDescriptor,
    level: WidgetPresentationLevel,
    mode: WidgetPresentationMode,
    trail: WidgetPresentationLevel[],
): ResolvedWidgetPresentation {
    const renderer = rendererFor(options.definition, descriptor);
    const scope = descriptor.scope ?? options.definition.defaultPresentationScope;
    return Object.freeze({
        themeId: options.themeId,
        widgetType: options.definition.type,
        widgetKind: options.definition.kind,
        presentationId: descriptor.id,
        scope,
        mode,
        level,
        semanticLabel: options.definition.semanticLabel,
        semanticIcon: options.definition.semanticIcon,
        contentVariant: options.contentVariant,
        resolvedIcon: resolveWidgetPresentationIcon(options.definition.semanticIcon, options.manifest),
        renderer: renderer?.component,
        shell: resolveShell(options, descriptor.id, scope),
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

export function resolveLegacyWidgetPresentation(
    themeId: string,
    definition: WidgetDefinition,
    contentVariant?: string,
): ResolvedWidgetPresentation {
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
        contentVariant,
        resolvedIcon: resolveWidgetPresentationIcon(definition.semanticIcon),
        shell: undefined,
        fallbackTrail: Object.freeze(["legacy"] as WidgetPresentationLevel[]),
    });
}
