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

/**
 * 主题视角下的稳定呈现类别。
 *
 * 与 WidgetKind 的业务功能分类正交：主题只能依赖这里描述的视觉骨架，
 * 不需要知道组件是在处理任务、日历还是知识库。
 */
export type WidgetPresentationCategory =
    | "collection"
    | "metrics"
    | "visualization"
    | "editorial"
    | "media"
    | "control"
    | "embedded"
    | "workspace"
    | "intrinsic";

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
    presentationCategory: WidgetPresentationCategory;
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
    /** 该组件声明给主题使用的全部稳定展示变体。 */
    presentationVariants?: readonly string[];
    /**
     * 从实例配置解析稳定的内容形态语义，例如 timedate.dial。
     * 主题只消费解析后的语义，不直接读取组件私有配置或 DOM 结构。
     */
    resolveContentVariant?: WidgetContentVariantResolver;
}

export type WidgetPresentationMode = "specific" | "variant" | "category" | "kind" | "generic" | "semantic" | "classic" | "legacy";
export type WidgetPresentationLevel = "theme-variant" | "theme-widget" | "theme-category" | "theme-kind" | "theme-generic" | "semantic" | "classic" | "legacy";

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
    categories?: readonly WidgetPresentationCategory[];
    kinds?: readonly WidgetKind[];
    presentationIds?: readonly string[];
    scopes?: readonly WidgetPresentationScope[];
    presentationVariants?: readonly string[];
    /** @deprecated 使用 presentationVariants。 */
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
    categories?: Partial<Record<WidgetPresentationCategory, WidgetPresentationDescriptor>>;
    /** Key 为组件定义中注册的全局唯一展示变体，例如 custom-protyle.immersive。 */
    variants?: Readonly<Record<string, WidgetPresentationDescriptor>>;
    /** @deprecated 仅供旧主题兼容；新主题应使用 categories。 */
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
    readonly presentationCategory: WidgetPresentationCategory;
    readonly presentationId: string;
    readonly scope: WidgetPresentationScope;
    readonly mode: WidgetPresentationMode;
    readonly level: WidgetPresentationLevel;
    readonly semanticLabel: string;
    readonly semanticIcon: string;
    readonly presentationVariant?: string;
    /** @deprecated 使用 presentationVariant；暂留给旧主题和插件 API。 */
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
