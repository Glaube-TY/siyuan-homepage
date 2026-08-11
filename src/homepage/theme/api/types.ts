import type { Component } from "svelte";
import type { HOMEPAGE_THEME_API_VERSION } from "./themeApiVersion";
import type { WidgetPresentationManifest } from "../widgetPresentation/types";

export type HomepageThemeAccess = "free" | "vip";
export type HomepageThemeSurface = "desktop-homepage";
export type HomepageWidgetAppearancePolicy = "user-configurable" | "theme-controlled";
export type HomepageThemeFallbackReason =
    | "not_registered"
    | "unsupported_surface"
    | "vip_required"
    | "invalid_definition";

export interface HomepageThemePublicMeta {
    id: string;
    name: string;
    description?: string;
    version: string;
    author: string;
    access: HomepageThemeAccess;
    preview?: {
        thumbnail?: string;
        tags?: readonly string[];
    };
}

export interface HomepageIdentityModel {
    title: string;
    showIcon: boolean;
    icon: Readonly<{
        type: "emoji" | "image";
        emoji?: string;
        imageSrc?: string;
        style: "square" | "round" | "circle";
    }>;
}

export interface HomepageStatusModel {
    text: string;
    mode: "custom" | "ai";
    runtimeState: string;
    refreshing: boolean;
    errorMessage?: string;
    refresh(): Promise<void>;
}

export interface HomepageBannerModel {
    enabled: boolean;
    imageSrc: string;
    height: number;
    integrated: boolean;
    imageElement?: HTMLImageElement;
    setImageElement(element: HTMLImageElement | undefined): void;
    resetPosition(): Promise<void>;
}

export interface HomepageActionDescriptor {
    id: string;
    sourceId: number;
    action: string;
    label: string;
    iconName: string;
    shortcut?: string;
    order: number;
    placement: "primary" | "overflow";
    custom: boolean;
}

export interface HomepageActionsModel {
    items: readonly HomepageActionDescriptor[];
    invoke(id: string): Promise<void>;
}

export interface HomepageSectionsModel {
    enabled: boolean;
    items: readonly Readonly<{
        id: string;
        name: string;
        active: boolean;
    }>[];
    navAlign: "left" | "center" | "right";
    select(sectionId: string): Promise<void>;
}

export interface HomepageFooterPresentationState {
    visible: boolean;
    mode: "default" | "custom";
    html?: string;
}

export type HomepagePersistentRegionName = "workspace" | "footer";
export type HomepageContextRegion = "title" | "status" | "actions" | "banner" | "footer";

export interface HomepageThemeRegionFacade {
    attach(name: HomepagePersistentRegionName, anchor: HTMLElement): void;
    detach(name: HomepagePersistentRegionName, anchor: HTMLElement): void;
}

export interface HomepageThemeAppearanceContext {
    preferredThemeId: string;
    effectiveThemeId: string;
    fallbackReason?: HomepageThemeFallbackReason;
    settings: Readonly<Record<string, unknown>>;
}

export interface HomepageThemeProps {
    theme: Readonly<HomepageThemePublicMeta>;
    identity: Readonly<HomepageIdentityModel>;
    banner: Readonly<HomepageBannerModel>;
    status: Readonly<HomepageStatusModel>;
    actions: Readonly<HomepageActionsModel>;
    sections: Readonly<HomepageSectionsModel>;
    footer: Readonly<HomepageFooterPresentationState>;
    regions: HomepageThemeRegionFacade;
    appearance: Readonly<HomepageThemeAppearanceContext>;
}

export interface HomepageThemeDefinition {
    apiVersion: typeof HOMEPAGE_THEME_API_VERSION;
    id: string;
    name: string;
    description?: string;
    version: string;
    author: string;
    access: HomepageThemeAccess;
    surfaces: readonly HomepageThemeSurface[];
    renderer: Component<HomepageThemeProps>;
    preview?: HomepageThemePublicMeta["preview"];
    widgetPresentation?: WidgetPresentationManifest;
    features?: {
        banner?: boolean;
        customThemeSettings?: boolean;
        widgetAppearance?: HomepageWidgetAppearancePolicy;
    };
}

export interface ThemeResolution {
    preferredThemeId: string;
    effectiveThemeId: string;
    definition: HomepageThemeDefinition;
    fallbackReason?: HomepageThemeFallbackReason;
}
