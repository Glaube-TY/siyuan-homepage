import { getImage } from "@/components/tools/getImage";
import { getCurrentDeviceViewContext } from "./deviceView/deviceViewContext";
import { ensureCurrentDeviceViewMigrated } from "./deviceView/deviceViewMigration";
import { readDeviceViewSettings, updateDeviceViewSettings } from "./deviceView/deviceViewStorage";
import {
    DeviceViewMigrationBlockedError,
    DeviceViewTemporarilyIncompleteError,
    recordDeviceViewBlockedState,
} from "./deviceView/deviceViewErrors";
import type { DeviceViewSurface } from "./deviceView/deviceViewTypes";
import {
    DEFAULT_BANNER_INTEGRATED_COLOR,
    DEFAULT_BANNER_GLASS_BLUR,
    DEFAULT_BANNER_GLASS_COLOR,
    DEFAULT_BANNER_GLASS_COLOR_MODE,
    DEFAULT_BANNER_GLASS_OPACITY,
    DEFAULT_HOMEPAGE_TITLE_ALIGN,
    DEFAULT_QUICK_BUTTON_STYLE,
    DEFAULT_BACKGROUND_IMAGE_BLUR,
    DEFAULT_BACKGROUND_IMAGE_OPACITY,
    DEFAULT_BACKGROUND_IMAGE_TYPE,
    normalizeBannerGlassBlur,
    normalizeBannerGlassColor,
    normalizeBannerGlassColorMode,
    normalizeBannerGlassOpacity,
    normalizeBannerIntegratedColor,
    normalizeBackgroundImageBlur,
    normalizeBackgroundImageOpacity,
    normalizeBackgroundImageType,
    normalizeComponentSections,
    normalizeComponentSectionsNavAlign,
    normalizeHomepageTitleAlign,
    normalizeQuickButtonStyle,
    type BackgroundImageType,
    type BannerGlassColorMode,
    type ComponentSection,
    type ComponentSectionsNavAlign,
    type HomepageTitleAlign,
    type QuickButtonStyle,
} from "./homepageSetting/config";
import { createDefaultButtons, normalizeButtonsList as normalizeButtonsListFromRegistry, type HomepageButtonItem } from "./buttonRegistry";
import {
    DEFAULT_STATS_INFO_TEXT,
    DEFAULT_STATUS_AI_MAX_CHARS,
    DEFAULT_STATUS_AI_PROMPT,
    DEFAULT_STATUS_AI_STAT_KEYS,
    normalizeHomepageStatusTextMode,
    normalizeStatsInfoText,
    normalizeStatusAiMaxChars,
    normalizeStatusAiModelId,
    normalizeStatusAiPrompt,
    normalizeStatusAiThinkingEnabled,
    normalizeStatusAiStatKeys,
    type HomepageStatusStatKey,
    type HomepageStatusTextMode,
} from "./status-text-config";
export type { HomepageButtonItem } from "./buttonRegistry";
export type { HomepageStatusTextMode } from "./status-text-config";

export type TitleIconType = "emoji" | "image";
export type TitleIconStyle = "square" | "round" | "circle";
export type BannerGlobalType = "custom" | "bing";
export type FallingDensity = "low" | "medium" | "high";
export type FallingSpeed = "low" | "medium" | "high";

export interface HomepageConfig {
    bannerEnabled: boolean;
    bannerGlobalType: BannerGlobalType;
    bannerLocalData: string;
    bannerRemoteUrl: string;
    bingApiType: string;
    showIcon: boolean;
    TitleIconEmoji: string;
    TitleIconImage: string | null;
    titleIconType: TitleIconType;
    customTitle: string;
    bannerTitleIntegrated: boolean;
    homepageTitleAlign: HomepageTitleAlign;
    quickButtonStyle: QuickButtonStyle;
    bannerTitleColor: string;
    bannerStatusColor: string;
    bannerButtonColor: string;
    bannerGlassEnabled: boolean;
    bannerGlassColorMode: BannerGlassColorMode;
    bannerGlassColor: string;
    bannerGlassOpacity: number;
    bannerGlassBlur: number;
    tempTitleIconStyle: TitleIconStyle;
    statsInfoText: string;
    statusTextMode: HomepageStatusTextMode;
    statusAiPrompt: string;
    statusAiMaxChars: number;
    statusAiProviderId: string;
    statusAiModelId: string;
    statusAiThinkingEnabled: boolean;
    statusAiStatKeys: HomepageStatusStatKey[];
    footerEnabled: boolean;
    footerContent: string;
    mouseIcon: string;
    MouseTrailEnabled: boolean;
    mouseGlobalEnabled: boolean;
    ClickEffectEnabled: boolean;
    ClickEffectContent: string;
    backgroundImageEnabled: boolean;
    backgroundImageGlobalEnabled: boolean;
    backgroundImageType: BackgroundImageType;
    backgroundImageLocalData: string | null;
    backgroundImageRemoteUrl: string;
    backgroundImageOpacity: number;
    backgroundImageBlur: number;
    FallEffectsEnabled: boolean;
    GlobalFallingEffectsEnabled: boolean;
    FallingIcon: string;
    FallingDensity: FallingDensity;
    FallingSpeed: FallingSpeed;
    bannerHeight: number;
    bannerType?: string;
    buttonsList: HomepageButtonItem[];
    componentSectionsEnabled: boolean;
    componentSections: ComponentSection[];
    componentSectionsNavAlign: ComponentSectionsNavAlign;
}

export interface StrictHomepageConfigRead {
    data: Record<string, unknown>;
    fileExists: boolean;
}

/**
 * 用于任何可能继续写盘的初始化流程。只有“文件明确不存在”才返回空配置；
 * 文件存在但为空、损坏或暂时不可读时一律抛错，调用方不得据此保存默认值。
 */
export async function loadHomepageConfigDataStrict(
    plugin: any,
    surface: DeviceViewSurface = "desktop-homepage",
): Promise<StrictHomepageConfigRead> {
    const context = getCurrentDeviceViewContext(plugin, surface);
    try {
        await ensureCurrentDeviceViewMigrated(context);
    } catch (error) {
        if (error instanceof DeviceViewMigrationBlockedError) {
            recordDeviceViewBlockedState(error);
            throw error;
        }
        throw error;
    }
    let settings: Awaited<ReturnType<typeof readDeviceViewSettings>>;
    try {
        settings = await readDeviceViewSettings(context);
    } catch (error) {
        if (error instanceof DeviceViewMigrationBlockedError) {
            recordDeviceViewBlockedState(error);
            throw error;
        }
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: "view",
        });
    }
    if (!settings) {
        throw new DeviceViewTemporarilyIncompleteError({
            deviceId: context.scopeId,
            surface: context.surface,
            missingType: "view",
        });
    }
    return { data: settings.config, fileExists: true };
}

export interface BannerImageResult {
    bannerImgSrc: string;
    remoteBannerImageData: string;
}

export interface BackgroundImageResult {
    backgroundImageSrc: string;
    remoteBackgroundImageData: string;
}

export const defaultButtonsList = createDefaultButtons();

const VALID_TITLE_ICON_TYPES: TitleIconType[] = ["emoji", "image"];
const VALID_TITLE_ICON_STYLES: TitleIconStyle[] = ["square", "round", "circle"];
const VALID_BANNER_GLOBAL_TYPES: BannerGlobalType[] = ["custom", "bing"];
const VALID_FALLING_DENSITIES: FallingDensity[] = ["low", "medium", "high"];
const VALID_FALLING_SPEEDS: FallingSpeed[] = ["low", "medium", "high"];
const MIN_BANNER_SCROLL_TOP = -10000;
const MAX_BANNER_SCROLL_TOP = 10000;

const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
    bannerEnabled: true,
    bannerGlobalType: "custom",
    bannerLocalData: "",
    bannerRemoteUrl: "",
    bingApiType: "POD_UHD",
    showIcon: true,
    TitleIconEmoji: "",
    TitleIconImage: null,
    titleIconType: "emoji",
    customTitle: "思源笔记首页",
    bannerTitleIntegrated: false,
    homepageTitleAlign: DEFAULT_HOMEPAGE_TITLE_ALIGN,
    quickButtonStyle: DEFAULT_QUICK_BUTTON_STYLE,
    bannerTitleColor: DEFAULT_BANNER_INTEGRATED_COLOR,
    bannerStatusColor: DEFAULT_BANNER_INTEGRATED_COLOR,
    bannerButtonColor: DEFAULT_BANNER_INTEGRATED_COLOR,
    bannerGlassEnabled: false,
    bannerGlassColorMode: DEFAULT_BANNER_GLASS_COLOR_MODE,
    bannerGlassColor: DEFAULT_BANNER_GLASS_COLOR,
    bannerGlassOpacity: DEFAULT_BANNER_GLASS_OPACITY,
    bannerGlassBlur: DEFAULT_BANNER_GLASS_BLUR,
    tempTitleIconStyle: "square",
    statsInfoText: DEFAULT_STATS_INFO_TEXT,
    statusTextMode: "custom",
    statusAiPrompt: DEFAULT_STATUS_AI_PROMPT,
    statusAiMaxChars: DEFAULT_STATUS_AI_MAX_CHARS,
    statusAiProviderId: "",
    statusAiModelId: "",
    statusAiThinkingEnabled: false,
    statusAiStatKeys: [...DEFAULT_STATUS_AI_STAT_KEYS],
    footerEnabled: true,
    footerContent: "",
    mouseIcon: "default",
    MouseTrailEnabled: false,
    mouseGlobalEnabled: true,
    ClickEffectEnabled: false,
    ClickEffectContent: "",
    backgroundImageEnabled: false,
    backgroundImageGlobalEnabled: false,
    backgroundImageType: DEFAULT_BACKGROUND_IMAGE_TYPE,
    backgroundImageLocalData: null,
    backgroundImageRemoteUrl: "",
    backgroundImageOpacity: DEFAULT_BACKGROUND_IMAGE_OPACITY,
    backgroundImageBlur: DEFAULT_BACKGROUND_IMAGE_BLUR,
    FallEffectsEnabled: false,
    GlobalFallingEffectsEnabled: false,
    FallingIcon: "snow",
    FallingDensity: "medium",
    FallingSpeed: "medium",
    bannerHeight: 300,
    buttonsList: createDefaultButtons(),
    componentSectionsEnabled: false,
    componentSections: normalizeComponentSections(undefined),
    componentSectionsNavAlign: "left",
};

function normalizeNumber(value: unknown, defaultValue: number, min?: number, max?: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return defaultValue;
    let result = num;
    if (min !== undefined && result < min) result = min;
    if (max !== undefined && result > max) result = max;
    return result;
}

function normalizeString(value: unknown, defaultValue: string): string {
    return typeof value === "string" ? value : defaultValue;
}

function normalizeStringOrNull(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function normalizeEnum<T extends string>(value: unknown, validValues: T[], defaultValue: T): T {
    if (typeof value === "string" && (validValues as string[]).includes(value)) {
        return value as T;
    }
    return defaultValue;
}

function normalizeButtonsList(rawList: unknown): HomepageButtonItem[] {
    return normalizeButtonsListFromRegistry(rawList);
}

// 注意：getDeviceLayout 已废弃，请使用当前设备视图布局读取接口。
// 保留此函数仅为兼容旧代码，新代码不应再使用

export function normalizeHomepageConfigData(config: any): HomepageConfig {
    return {
        bannerEnabled: config.bannerEnabled !== false,
        bannerGlobalType: normalizeEnum(config.bannerGlobalType, VALID_BANNER_GLOBAL_TYPES, DEFAULT_HOMEPAGE_CONFIG.bannerGlobalType),
        bannerLocalData: normalizeString(config.bannerLocalData, DEFAULT_HOMEPAGE_CONFIG.bannerLocalData),
        bannerRemoteUrl: normalizeString(config.bannerRemoteUrl, DEFAULT_HOMEPAGE_CONFIG.bannerRemoteUrl),
        bingApiType: normalizeString(config.bingApiType, DEFAULT_HOMEPAGE_CONFIG.bingApiType),
        showIcon: config.showIcon !== false,
        TitleIconEmoji: normalizeString(config.TitleIconEmoji, DEFAULT_HOMEPAGE_CONFIG.TitleIconEmoji),
        TitleIconImage: normalizeStringOrNull(config.TitleIconImage),
        titleIconType: normalizeEnum(config.titleIconType, VALID_TITLE_ICON_TYPES, DEFAULT_HOMEPAGE_CONFIG.titleIconType),
        customTitle: normalizeString(config.customTitle, DEFAULT_HOMEPAGE_CONFIG.customTitle),
        bannerTitleIntegrated: config.bannerTitleIntegrated === true,
        homepageTitleAlign: normalizeHomepageTitleAlign(config.homepageTitleAlign),
        quickButtonStyle: normalizeQuickButtonStyle(config.quickButtonStyle),
        bannerTitleColor: normalizeBannerIntegratedColor(config.bannerTitleColor),
        bannerStatusColor: normalizeBannerIntegratedColor(config.bannerStatusColor),
        bannerButtonColor: normalizeBannerIntegratedColor(config.bannerButtonColor),
        bannerGlassEnabled: config.bannerGlassEnabled === true,
        bannerGlassColorMode: normalizeBannerGlassColorMode(config.bannerGlassColorMode),
        bannerGlassColor: normalizeBannerGlassColor(config.bannerGlassColor),
        bannerGlassOpacity: normalizeBannerGlassOpacity(config.bannerGlassOpacity),
        bannerGlassBlur: normalizeBannerGlassBlur(config.bannerGlassBlur),
        tempTitleIconStyle: normalizeEnum(config.tempTitleIconStyle, VALID_TITLE_ICON_STYLES, DEFAULT_HOMEPAGE_CONFIG.tempTitleIconStyle),
        statsInfoText: normalizeStatsInfoText(config.statsInfoText),
        statusTextMode: normalizeHomepageStatusTextMode(config.statusTextMode),
        statusAiPrompt: normalizeStatusAiPrompt(config.statusAiPrompt),
        statusAiMaxChars: normalizeStatusAiMaxChars(config.statusAiMaxChars),
        statusAiProviderId: normalizeStatusAiModelId(config.statusAiProviderId),
        statusAiModelId: normalizeStatusAiModelId(config.statusAiModelId),
        statusAiThinkingEnabled: normalizeStatusAiThinkingEnabled(config.statusAiThinkingEnabled),
        statusAiStatKeys: normalizeStatusAiStatKeys(config.statusAiStatKeys),
        footerEnabled: config.footerEnabled ?? DEFAULT_HOMEPAGE_CONFIG.footerEnabled,
        footerContent: normalizeString(config.footerContent, DEFAULT_HOMEPAGE_CONFIG.footerContent),
        mouseIcon: normalizeString(config.mouseIcon, DEFAULT_HOMEPAGE_CONFIG.mouseIcon),
        MouseTrailEnabled: config.MouseTrailEnabled ?? DEFAULT_HOMEPAGE_CONFIG.MouseTrailEnabled,
        mouseGlobalEnabled: config.mouseGlobalEnabled ?? DEFAULT_HOMEPAGE_CONFIG.mouseGlobalEnabled,
        ClickEffectEnabled: config.ClickEffectEnabled ?? DEFAULT_HOMEPAGE_CONFIG.ClickEffectEnabled,
        ClickEffectContent: normalizeString(config.ClickEffectContent, DEFAULT_HOMEPAGE_CONFIG.ClickEffectContent),
        backgroundImageEnabled: config.backgroundImageEnabled === true,
        backgroundImageGlobalEnabled: config.backgroundImageGlobalEnabled === true,
        backgroundImageType: normalizeBackgroundImageType(config.backgroundImageType),
        backgroundImageLocalData: normalizeStringOrNull(config.backgroundImageLocalData),
        backgroundImageRemoteUrl: normalizeString(config.backgroundImageRemoteUrl, DEFAULT_HOMEPAGE_CONFIG.backgroundImageRemoteUrl),
        backgroundImageOpacity: normalizeBackgroundImageOpacity(config.backgroundImageOpacity),
        backgroundImageBlur: normalizeBackgroundImageBlur(config.backgroundImageBlur),
        FallEffectsEnabled: config.FallEffectsEnabled ?? DEFAULT_HOMEPAGE_CONFIG.FallEffectsEnabled,
        GlobalFallingEffectsEnabled: config.GlobalFallingEffectsEnabled ?? DEFAULT_HOMEPAGE_CONFIG.GlobalFallingEffectsEnabled,
        FallingIcon: normalizeString(config.FallingIcon, DEFAULT_HOMEPAGE_CONFIG.FallingIcon),
        FallingDensity: normalizeEnum(config.FallingDensity, VALID_FALLING_DENSITIES, DEFAULT_HOMEPAGE_CONFIG.FallingDensity),
        FallingSpeed: normalizeEnum(config.FallingSpeed, VALID_FALLING_SPEEDS, DEFAULT_HOMEPAGE_CONFIG.FallingSpeed),
        bannerHeight: normalizeNumber(config.bannerHeight, DEFAULT_HOMEPAGE_CONFIG.bannerHeight, 50, 1000),
        bannerType: config.bannerType ? normalizeString(config.bannerType, "") : undefined,
        buttonsList: normalizeButtonsList(config.buttonsList),
        componentSectionsEnabled: config.componentSectionsEnabled === true,
        componentSections: normalizeComponentSections(config.componentSections),
        componentSectionsNavAlign: normalizeComponentSectionsNavAlign(config.componentSectionsNavAlign),
    };
}

export async function loadHomepageConfig(plugin: any): Promise<HomepageConfig> {
    let config: any = {};
    try {
        config = (await loadHomepageConfigDataStrict(plugin)).data;
    } catch (error) {
        // 展示层可以使用内存默认值，但该回退对象绝不能进入任何保存流程。
        console.warn("[Homepage] 主页配置暂时不可读，本轮仅使用内存默认值:", error);
    }

    // 注意：widgetLayoutNumber/widgetGap 已从本配置移除
    // 列数和间距由当前设备 desktop-homepage/layout.json 提供。

    return normalizeHomepageConfigData(config);
}

export interface BannerDisplaySettings {
    bannerHeight: number;
    scrollTop: number;
    source: string;
    deviceId?: string;
}

export async function loadBannerDisplaySettings(plugin: any): Promise<BannerDisplaySettings> {
    let config: Record<string, any> = {};
    try {
        config = (await loadHomepageConfigDataStrict(plugin)).data;
    } catch (error) {
        console.warn("[Homepage] 横幅设备配置暂时不可读，本轮仅使用展示默认值:", error);
    }
    const globalBannerHeight = normalizeNumber(config.bannerHeight, 300, 50, 1000);

    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    return {
        bannerHeight: globalBannerHeight,
        scrollTop: normalizeNumber(config.bannerScrollTop, 0, MIN_BANNER_SCROLL_TOP, MAX_BANNER_SCROLL_TOP),
        source: `device view (${context.scopeId})`,
        deviceId: context.scopeId,
    };
}

export interface BannerDisplaySettingsPartial {
    bannerHeight?: number;
    scrollTop?: number;
}

export async function saveBannerDisplaySettings(
    plugin: any,
    partialSettings: BannerDisplaySettingsPartial
): Promise<void> {
    await loadHomepageConfigDataStrict(plugin);
    const context = getCurrentDeviceViewContext(plugin, "desktop-homepage");
    const current = await readDeviceViewSettings(context);
    if (!current) throw new Error("当前设备 desktop-homepage 的 view.json 缺失");
    await updateDeviceViewSettings(context, (config) => ({
        ...config,
        ...(partialSettings.bannerHeight !== undefined ? {
            bannerHeight: normalizeNumber(partialSettings.bannerHeight, 300, 50, 1000),
        } : {}),
        ...(partialSettings.scrollTop !== undefined ? {
            bannerScrollTop: normalizeNumber(partialSettings.scrollTop, 0, MIN_BANNER_SCROLL_TOP, MAX_BANNER_SCROLL_TOP),
        } : {}),
    }), { expectedRevision: current.revision });
}

export async function resolveBannerImage(
    config: HomepageConfig,
    advanced: boolean,
): Promise<BannerImageResult> {
    let bannerImgSrc = "";
    let remoteBannerImageData = "";

    if (!config.bannerEnabled) {
        return { bannerImgSrc, remoteBannerImageData };
    }

    if (config.bannerGlobalType === "custom") {
        if (config.bannerType === "local") {
            bannerImgSrc = config.bannerLocalData;
        } else if (config.bannerType === "remote") {
            if (config.bannerRemoteUrl) {
                remoteBannerImageData = await getImage(config.bannerRemoteUrl);
            }
            bannerImgSrc = remoteBannerImageData || config.bannerRemoteUrl;
        }
    } else if (config.bannerGlobalType === "bing") {
        if (advanced) {
            const bingUrlMap: Record<string, string> = {
                POD_UHD: "https://bing.img.run/uhd.php",
                POD_1K: "https://bing.img.run/1920x1080.php",
                POD_Normal: "https://bing.img.run/1366x768.php",
                rand_uhd: "https://bing.img.run/rand_uhd.php",
                rand_1K: "https://bing.img.run/rand.php",
                rand_Normal: "https://bing.img.run/rand_1366x768.php",
                ECY1: "https://www.dmoe.cc/random.php",
                RAND1: "https://api.btstu.cn/sjbz/api.php",
            };
            const bingImageUrl = bingUrlMap[config.bingApiType];
            if (bingImageUrl) {
                remoteBannerImageData = await getImage(bingImageUrl);
                bannerImgSrc = remoteBannerImageData || bingImageUrl;
            }
        } else {
            bannerImgSrc = "/plugins/siyuan-homepage/asset/bannerImg/notVIP.jpg";
        }
    }

    return { bannerImgSrc, remoteBannerImageData };
}

export async function resolveBackgroundImage(
    config: HomepageConfig,
    advanced: boolean,
): Promise<BackgroundImageResult> {
    let backgroundImageSrc = "";
    let remoteBackgroundImageData = "";

    if (!advanced || !config.backgroundImageEnabled) {
        return { backgroundImageSrc, remoteBackgroundImageData };
    }

    if (config.backgroundImageType === "local") {
        backgroundImageSrc = config.backgroundImageLocalData || "";
    } else if (config.backgroundImageType === "remote" && config.backgroundImageRemoteUrl) {
        remoteBackgroundImageData = await getImage(config.backgroundImageRemoteUrl);
        backgroundImageSrc = remoteBackgroundImageData || config.backgroundImageRemoteUrl;
    }

    return { backgroundImageSrc, remoteBackgroundImageData };
}

export function resolveButtonsList(config: HomepageConfig): HomepageButtonItem[] {
    if (!config.buttonsList || config.buttonsList.length === 0) {
        return createDefaultButtons();
    }
    return config.buttonsList.map((item) => ({ ...item }));
}
