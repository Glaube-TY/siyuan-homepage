import type { ButtonItem } from './types';
import type { HomepageStatusStatKey, HomepageStatusTextMode } from '../status-text-config';
import type { SelectionAiToolbarSettings } from '@/features/kb/services/selection-ai/selection-ai-types';
import type { MobileQuickActionSetting, MobileQuickActionsPosition } from '../mobileQuickActions/mobileQuickActionsConfig';
import type {
    ComponentMigrationStatus,
    NotebookOption,
} from '@/components/utils/widgetBlock/widget/common/componentMigrationTypes';
import { getCurrentDeviceViewContext } from '@/homepage/deviceView/deviceViewContext';
import { ensureCurrentDeviceViewMigrated } from '@/homepage/deviceView/deviceViewMigration';
import { readDeviceViewSettings, updateDeviceViewSettings } from '@/homepage/deviceView/deviceViewStorage';
import type { DeviceViewSurface } from '@/homepage/deviceView/deviceViewTypes';
import { cloneJsonSafeOmittingUndefinedObjectProperties } from '@/homepage/deviceView/jsonSafe';
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
// 历史常量：仅用于识别旧数据中的 overview/总览分栏。
// 最终 Schema 中 overview 与普通分栏完全平等，新代码不得再赋予其特殊行为。
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
        lastStatus: normalizedStatus,
        ...(typeof raw.lastRunAt === "string" ? { lastRunAt: raw.lastRunAt } : {}),
        ...(typeof raw.lastMessage === "string" ? { lastMessage: raw.lastMessage } : {}),
        ...(typeof raw.migratedCount === "number" ? { migratedCount: Math.max(0, raw.migratedCount) } : {}),
        ...(typeof raw.skippedCount === "number" ? { skippedCount: Math.max(0, raw.skippedCount) } : {}),
        ...(typeof raw.cleanedCount === "number" ? { cleanedCount: Math.max(0, raw.cleanedCount) } : {}),
        ...(typeof raw.cleanupFailedCount === "number" ? { cleanupFailedCount: Math.max(0, raw.cleanupFailedCount) } : {}),
        ...(typeof raw.refreshedCount === "number" ? { refreshedCount: Math.max(0, raw.refreshedCount) } : {}),
        ...(typeof raw.removedCount === "number" ? { removedCount: Math.max(0, raw.removedCount) } : {}),
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
            : "新分区";
        const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
            ? raw.createdAt
            : now;
        const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
            ? raw.updatedAt
            : createdAt;
        result.push({ id, name, createdAt, updatedAt });
        usedIds.add(id);
    }

    return result;
}

/**
 * 判断用户分栏是否真实生效。
 * 必须同时满足：高级功能开启、用户主动开启分栏开关、存在至少一个有效用户分栏。
 */
export function isComponentSectionsEffective(
    config: { componentSectionsEnabled?: boolean; componentSections?: unknown } | null | undefined,
    advancedEnabled: boolean,
): boolean {
    return advancedEnabled === true
        && config?.componentSectionsEnabled === true
        && normalizeComponentSections(config.componentSections).length > 0;
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
    statusAiStatKeys?: HomepageStatusStatKey[];
    buttonsList: ButtonItem[];
    selectedButton: ButtonItem | null;
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
    enhancedDiaryIndexStatus?: ComponentMigrationStatus;
}

export async function loadHomepageSettingConfig(
    plugin: any,
    surface: DeviceViewSurface = "desktop-homepage",
): Promise<HomepageSettingConfig | null> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    await ensureCurrentDeviceViewMigrated(context);
    const settings = await readDeviceViewSettings(context);
    return settings?.config as unknown as HomepageSettingConfig | null;
}

export async function saveHomepageSettingConfig(
    plugin: any,
    config: HomepageSettingConfig,
    surface: DeviceViewSurface = "desktop-homepage",
): Promise<void> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    await ensureCurrentDeviceViewMigrated(context);
    const current = await readDeviceViewSettings(context);
    if (!current) throw new Error(`当前设备 ${surface} 的 view.json 缺失`);
    const safeConfig = cloneJsonSafeOmittingUndefinedObjectProperties(
        config as unknown as Record<string, unknown>,
        "主页设置配置",
    );
    await updateDeviceViewSettings(
        context,
        () => safeConfig,
        { expectedRevision: current.revision },
    );
}
