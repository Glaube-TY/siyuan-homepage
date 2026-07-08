import type { ButtonItem } from './types';
import type { DeviceProfilesMap } from '../utils/deviceProfile';
import type { HomepageStatusTextMode } from '../status-text-config';
import type { SelectionAiToolbarSettings } from '@/features/kb/services/selection-ai/selection-ai-types';
import type { MobileQuickActionSetting, MobileQuickActionsPosition } from '../mobileQuickActions/mobileQuickActionsConfig';
import type {
    ComponentMigrationStatus,
    NotebookOption,
} from '@/components/utils/widgetBlock/widget/common/componentMigrationTypes';
export type { ComponentMigrationStatus, NotebookOption };

export type DocPreviewMode = "preview" | "wysiwyg";
export type HomepageTitleAlign = "left" | "center" | "right";
export type QuickButtonStyle = "default" | "flat" | "glass";
export type BannerGlassColorMode = "theme" | "custom";
export type BackgroundImageType = "local" | "remote";
export type ComponentSectionsNavAlign = "left" | "center" | "right";

export interface ComponentSection {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}

export const DEFAULT_HOMEPAGE_TITLE_ALIGN: HomepageTitleAlign = "center";
export const DEFAULT_QUICK_BUTTON_STYLE: QuickButtonStyle = "default";
export const DEFAULT_BANNER_INTEGRATED_COLOR = "#ffffff";
export const DEFAULT_BANNER_GLASS_COLOR_MODE: BannerGlassColorMode = "theme";
export const DEFAULT_BANNER_GLASS_COLOR = "#ffffff";
export const DEFAULT_BANNER_GLASS_OPACITY = 18;
export const DEFAULT_BANNER_GLASS_BLUR = 12;
export const DEFAULT_BACKGROUND_IMAGE_TYPE: BackgroundImageType = "local";
export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 35;
export const DEFAULT_BACKGROUND_IMAGE_BLUR = 0;
export const DEFAULT_COMPONENT_SECTION_ID = "overview";
export const DEFAULT_COMPONENT_SECTION_NAME = "总览";
export const DEFAULT_COMPONENT_SECTIONS_NAV_ALIGN: ComponentSectionsNavAlign = "left";

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

export function normalizeBackgroundImageType(value: unknown): BackgroundImageType {
    if (value === "local" || value === "remote") {
        return value;
    }
    return DEFAULT_BACKGROUND_IMAGE_TYPE;
}

export function normalizeBackgroundImageOpacity(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_BACKGROUND_IMAGE_OPACITY;
    return Math.min(100, Math.max(0, Math.round(num)));
}

export function normalizeBackgroundImageBlur(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_BACKGROUND_IMAGE_BLUR;
    return Math.min(40, Math.max(0, Math.round(num)));
}

export function normalizeComponentSectionsNavAlign(value: unknown): ComponentSectionsNavAlign {
    if (value === "left" || value === "center" || value === "right") {
        return value;
    }
    return DEFAULT_COMPONENT_SECTIONS_NAV_ALIGN;
}

export function normalizeNotebookOptions(value: unknown): NotebookOption[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
            label: typeof item.label === "string" ? item.label : "",
            value: typeof item.value === "string" ? item.value : "",
        }))
        .filter((item) => item.value);
}

export function normalizeComponentMigrationStatus(value: unknown): ComponentMigrationStatus {
    if (!value || typeof value !== "object") {
        return { lastStatus: "idle" };
    }
    const raw = value as Record<string, unknown>;
    const status = raw.lastStatus;
    const normalizedStatus: ComponentMigrationStatus["lastStatus"] =
        status === "success" || status === "error" ? status : "idle";
    return {
        lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : undefined,
        lastStatus: normalizedStatus,
        lastMessage: typeof raw.lastMessage === "string" ? raw.lastMessage : undefined,
        migratedCount: typeof raw.migratedCount === "number" ? Math.max(0, raw.migratedCount) : undefined,
        skippedCount: typeof raw.skippedCount === "number" ? Math.max(0, raw.skippedCount) : undefined,
        cleanedCount: typeof raw.cleanedCount === "number" ? Math.max(0, raw.cleanedCount) : undefined,
        cleanupFailedCount: typeof raw.cleanupFailedCount === "number" ? Math.max(0, raw.cleanupFailedCount) : undefined,
        refreshedCount: typeof raw.refreshedCount === "number" ? Math.max(0, raw.refreshedCount) : undefined,
        removedCount: typeof raw.removedCount === "number" ? Math.max(0, raw.removedCount) : undefined,
    };
}

function normalizeComponentSectionId(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

export function normalizeComponentSections(value: unknown): ComponentSection[] {
    const now = Date.now();
    const source = Array.isArray(value) ? value : [];
    const result: ComponentSection[] = [];
    const usedIds = new Set<string>();

    for (const item of source) {
        if (typeof item !== "object" || item === null) continue;
        const raw = item as Record<string, unknown>;
        const id = normalizeComponentSectionId(raw.id);
        if (!id || usedIds.has(id)) continue;
        const name = typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : (id === DEFAULT_COMPONENT_SECTION_ID ? DEFAULT_COMPONENT_SECTION_NAME : "新分区");
        const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
            ? raw.createdAt
            : now;
        const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
            ? raw.updatedAt
            : createdAt;
        result.push({ id, name, createdAt, updatedAt });
        usedIds.add(id);
    }

    if (!usedIds.has(DEFAULT_COMPONENT_SECTION_ID)) {
        result.unshift({
            id: DEFAULT_COMPONENT_SECTION_ID,
            name: DEFAULT_COMPONENT_SECTION_NAME,
            createdAt: now,
            updatedAt: now,
        });
    }

    return result.length > 0 ? result : [{
        id: DEFAULT_COMPONENT_SECTION_ID,
        name: DEFAULT_COMPONENT_SECTION_NAME,
        createdAt: now,
        updatedAt: now,
    }];
}

export interface BannerDeviceProfile {
    bannerHeight?: number;
    scrollTop?: number;
}

export interface HomepageSettingConfig {
    autoOpenHomepage: boolean;
    sidebarEnabled: boolean;
    autoOpenMobileHomepage: boolean;
    mobileQuickActionsEnabled?: boolean;
    mobileQuickActionsButtonSize?: number;
    mobileQuickActionsPosition?: MobileQuickActionsPosition;
    mobileQuickActionItems?: MobileQuickActionSetting[];
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
    backgroundImageEnabled?: boolean;
    backgroundImageGlobalEnabled?: boolean;
    backgroundImageType?: BackgroundImageType;
    backgroundImageLocalData?: string | null;
    backgroundImageRemoteUrl?: string;
    backgroundImageOpacity?: number;
    backgroundImageBlur?: number;
    FallEffectsEnabled: boolean;
    GlobalFallingEffectsEnabled: boolean;
    FallingIcon: string;
    FallingDensity: string;
    FallingSpeed: string;
    deviceProfiles?: DeviceProfilesMap;
    bannerDeviceProfiles?: Record<string, BannerDeviceProfile>;
    defaultDocPreviewMode?: DocPreviewMode;
    componentSectionsEnabled?: boolean;
    componentSections?: ComponentSection[];
    componentSectionsNavAlign?: ComponentSectionsNavAlign;
    aiKbDockEnabled?: boolean;
    aiKbTabEnabled?: boolean;
    selectionAiToolbar?: SelectionAiToolbarSettings;

    // 范围配置
    tasksPlusSelectedNotebookIds?: NotebookOption[];
    reviewDocsSelectedNotebookIds?: NotebookOption[];

    // 迁移状态
    favoritesMigrationStatus?: ComponentMigrationStatus;
    reviewDocsMigrationStatus?: ComponentMigrationStatus;
    taskIndexMigrationStatus?: ComponentMigrationStatus;
    heatmapIndexStatus?: ComponentMigrationStatus;
    statIndexStatus?: ComponentMigrationStatus;
}

export async function loadHomepageSettingConfig(plugin: any): Promise<HomepageSettingConfig | null> {
    return await plugin.loadData("homepageSettingConfig.json");
}

export async function saveHomepageSettingConfig(plugin: any, config: HomepageSettingConfig): Promise<void> {
    await plugin.saveData("homepageSettingConfig.json", config);
}
