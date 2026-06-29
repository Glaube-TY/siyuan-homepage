import type { ButtonItem } from './types';
import type { DeviceProfilesMap } from '../utils/deviceProfile';
import type { HomepageStatusTextMode } from '../status-text-config';
import type { SelectionAiToolbarSettings } from '@/features/kb/services/selection-ai/selection-ai-types';

export type DocPreviewMode = "preview" | "wysiwyg";
export type HomepageTitleAlign = "left" | "center" | "right";
export type QuickButtonStyle = "default" | "flat" | "glass";
export type BannerGlassColorMode = "theme" | "custom";

export const DEFAULT_HOMEPAGE_TITLE_ALIGN: HomepageTitleAlign = "center";
export const DEFAULT_QUICK_BUTTON_STYLE: QuickButtonStyle = "default";
export const DEFAULT_BANNER_INTEGRATED_COLOR = "#ffffff";
export const DEFAULT_BANNER_GLASS_COLOR_MODE: BannerGlassColorMode = "theme";
export const DEFAULT_BANNER_GLASS_COLOR = "#ffffff";
export const DEFAULT_BANNER_GLASS_OPACITY = 18;
export const DEFAULT_BANNER_GLASS_BLUR = 12;

export function normalizeHomepageTitleAlign(value: unknown): HomepageTitleAlign {
    if (value === "left" || value === "center" || value === "right") {
        return value;
    }
    return DEFAULT_HOMEPAGE_TITLE_ALIGN;
}

export function normalizeQuickButtonStyle(value: unknown): QuickButtonStyle {
    if (value === "default" || value === "flat" || value === "glass") {
        return value;
    }
    return DEFAULT_QUICK_BUTTON_STYLE;
}

export function normalizeBannerIntegratedColor(value: unknown): string {
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
        return value;
    }
    return DEFAULT_BANNER_INTEGRATED_COLOR;
}

export function normalizeBannerGlassColorMode(value: unknown): BannerGlassColorMode {
    if (value === "theme" || value === "custom") {
        return value;
    }
    return DEFAULT_BANNER_GLASS_COLOR_MODE;
}

export function normalizeBannerGlassColor(value: unknown): string {
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
        return value;
    }
    return DEFAULT_BANNER_GLASS_COLOR;
}

export function normalizeBannerGlassOpacity(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_BANNER_GLASS_OPACITY;
    return Math.min(80, Math.max(0, Math.round(num)));
}

export function normalizeBannerGlassBlur(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_BANNER_GLASS_BLUR;
    return Math.min(40, Math.max(0, Math.round(num)));
}

export interface BannerDeviceProfile {
    bannerHeight?: number;
    scrollTop?: number;
}

export interface HomepageSettingConfig {
    autoOpenHomepage: boolean;
    sidebarEnabled: boolean;
    autoOpenMobileHomepage: boolean;
    bannerEnabled: boolean;
    bannerGlobalType: string;
    bingApiType: string;
    bannerType: string;
    bannerLocalData: string | null;
    bannerRemoteUrl: string;
    bannerHeight: string;
    showIcon: boolean;
    titleIconType: string;
    TitleIconEmoji: string;
    TitleIconImage: string | null;
    tempTitleIconStyle: string;
    customTitle: string;
    bannerTitleIntegrated?: boolean;
    homepageTitleAlign?: HomepageTitleAlign;
    quickButtonStyle?: QuickButtonStyle;
    bannerTitleColor?: string;
    bannerStatusColor?: string;
    bannerButtonColor?: string;
    bannerGlassEnabled?: boolean;
    bannerGlassColorMode?: BannerGlassColorMode;
    bannerGlassColor?: string;
    bannerGlassOpacity?: number;
    bannerGlassBlur?: number;
    statsInfoText: string;
    statusTextMode?: HomepageStatusTextMode;
    statusAiPrompt?: string;
    statusAiMaxChars?: number;
    statusAiProviderId?: string;
    statusAiModelId?: string;
    statusAiThinkingEnabled?: boolean;
    buttonsList: ButtonItem[];
    selectedButton: ButtonItem | null;
    widgetLayoutNumber: number;
    widgetGap: number;
    quickNotesEnabled: boolean;
    quickNotesPosition: string;
    quickNotesTimestampEnabled: boolean;
    quickNotesAddPosition: string;
    taskEditorEnabled: boolean;
    footerEnabled: boolean;
    footerContent: string;
    mouseIcon: string;
    MouseTrailEnabled: boolean;
    mouseGlobalEnabled: boolean;
    ClickEffectEnabled: boolean;
    ClickEffectContent: string;
    FallEffectsEnabled: boolean;
    GlobalFallingEffectsEnabled: boolean;
    FallingIcon: string;
    FallingDensity: string;
    FallingSpeed: string;
    deviceProfiles?: DeviceProfilesMap;
    bannerDeviceProfiles?: Record<string, BannerDeviceProfile>;
    defaultDocPreviewMode?: DocPreviewMode;
    aiKbDockEnabled?: boolean;
    aiKbTabEnabled?: boolean;
    selectionAiToolbar?: SelectionAiToolbarSettings;
}

export async function loadHomepageSettingConfig(plugin: any): Promise<HomepageSettingConfig | null> {
    return await plugin.loadData("homepageSettingConfig.json");
}

export async function saveHomepageSettingConfig(plugin: any, config: HomepageSettingConfig): Promise<void> {
    await plugin.saveData("homepageSettingConfig.json", config);
}
