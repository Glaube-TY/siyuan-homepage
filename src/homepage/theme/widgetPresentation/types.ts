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

export type WidgetContentVariantResolver = (content: unknown) => string | undefined;

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
    /**
     * 从实例配置解析稳定的内容形态语义，例如 timedate.dial。
     * 主题只消费解析后的语义，不直接读取组件私有配置或 DOM 结构。
     */
    resolveContentVariant?: WidgetContentVariantResolver;
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

/**
 * 主题统一管理 Widget 外壳时可覆盖的视觉令牌。
 *
 * 这里只接受 CSS 值，不包含布局属性；运行时会把令牌挂到主页根节点，
 * 不会写入 Widget 的 style，也不会进入布局持久化。
 */
export interface WidgetShellTokens {
    background?: string;
    border?: string;
    borderRadius?: string;
    boxShadow?: string;
}

export interface WidgetShellExclusions {
    widgetTypes?: readonly string[];
    kinds?: readonly WidgetKind[];
    presentationIds?: readonly string[];
    scopes?: readonly WidgetPresentationScope[];
    contentVariants?: readonly string[];
}

export interface WidgetShellDefinition {
    id: string;
    tokens?: Readonly<WidgetShellTokens>;
    /** 视觉变体数量；运行时只生成稳定的 DOM 语义编号，不写入配置。 */
    variants?: number;
    exclude?: Readonly<WidgetShellExclusions>;
}

export interface WidgetPresentationManifest {
    contractVersion: typeof WIDGET_PRESENTATION_CONTRACT_VERSION;
    generic?: WidgetPresentationDescriptor;
    kinds?: Partial<Record<WidgetKind, WidgetPresentationDescriptor>>;
    widgets?: Readonly<Record<string, WidgetPresentationDescriptor>>;
    icons?: Readonly<Record<string, string>>;
    shell?: Readonly<WidgetShellDefinition>;
}

export interface ResolvedWidgetShell {
    readonly id: string;
    readonly state: "applied" | "excluded";
    readonly tokens?: Readonly<WidgetShellTokens>;
    readonly variants: number;
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
    readonly contentVariant?: string;
    readonly resolvedIcon?: string;
    readonly renderer?: Component<any>;
    readonly shell?: ResolvedWidgetShell;
    readonly fallbackTrail: readonly WidgetPresentationLevel[];
}

export interface WidgetPresentationContext extends ResolvedWidgetPresentation {
    readonly placement: WidgetPlacement;
    readonly surface: "desktop-homepage" | "other";
    readonly appearancePolicy: "user-configurable" | "theme-controlled";
    readonly reducedMotion: boolean;
}
