import type { Component } from "svelte";

export const WIDGET_PRESENTATION_CONTRACT_VERSION = 1 as const;

export type WidgetKind =
    | "list"
    | "task"
    | "stat"
    | "chart"
    | "calendar"
    | "note"
    | "media"
    | "utility"
    | "embed"
    | "complex"
    | "custom";

export type WidgetPlacement =
    | "homepage"
    | "sidebar"
    | "mobile"
    | "mobile-runtime"
    | "preview"
    | "dock";

export type WidgetPresentationScope = "full" | "chrome" | "native";

export type WidgetSemanticPart =
    | "root"
    | "header"
    | "icon"
    | "title"
    | "actions"
    | "body"
    | "list"
    | "item"
    | "primary"
    | "secondary"
    | "meta"
    | "empty"
    | "loading"
    | "error";

export interface WidgetPresentationCapabilities {
    cssTokens: boolean;
    semanticParts: boolean;
    themeIcon: boolean;
    rendererOverride: boolean;
    stateful: boolean;
}

export interface WidgetResponsiveProfile {
    compact: number;
    wide: number;
}

export interface WidgetDefinition {
    type: string;
    kind: WidgetKind;
    component: Component<any>;
    requiresPlugin: boolean;
    semanticLabel: string;
    semanticIcon: string;
    supportedPlacements: readonly WidgetPlacement[];
    defaultPresentationScope: WidgetPresentationScope;
    capabilities: Readonly<WidgetPresentationCapabilities>;
    presentationContractVersion?: typeof WIDGET_PRESENTATION_CONTRACT_VERSION;
    responsiveProfile?: Readonly<WidgetResponsiveProfile>;
    historicalDefaultTitles?: readonly string[];
}

export type WidgetPresentationMode = "specific" | "kind" | "generic" | "semantic" | "classic" | "legacy";
export type WidgetPresentationLevel = "theme-widget" | "theme-kind" | "theme-generic" | "semantic" | "classic" | "legacy";

export interface WidgetRendererOverride {
    component: Component<any>;
    safeForStateful?: boolean;
}

export interface WidgetPresentationDescriptor {
    id: string;
    mode?: Exclude<WidgetPresentationMode, "classic" | "legacy">;
    scope?: WidgetPresentationScope;
    renderer?: WidgetRendererOverride;
}

export interface WidgetPresentationManifest {
    contractVersion: typeof WIDGET_PRESENTATION_CONTRACT_VERSION;
    generic?: WidgetPresentationDescriptor;
    kinds?: Partial<Record<WidgetKind, WidgetPresentationDescriptor>>;
    widgets?: Readonly<Record<string, WidgetPresentationDescriptor>>;
    icons?: Readonly<Record<string, string>>;
}

export interface ResolvedWidgetPresentation {
    readonly themeId: string;
    readonly widgetType: string;
    readonly widgetKind: WidgetKind;
    readonly presentationId: string;
    readonly scope: WidgetPresentationScope;
    readonly mode: WidgetPresentationMode;
    readonly level: WidgetPresentationLevel;
    readonly semanticLabel: string;
    readonly semanticIcon: string;
    readonly resolvedIcon?: string;
    readonly renderer?: Component<any>;
    readonly fallbackTrail: readonly WidgetPresentationLevel[];
}

export interface WidgetPresentationContext extends ResolvedWidgetPresentation {
    readonly placement: WidgetPlacement;
    readonly surface: "desktop-homepage" | "other";
    readonly appearancePolicy: "user-configurable" | "theme-controlled";
    readonly reducedMotion: boolean;
}
