import { getImage } from "@/components/tools/getImage";
import type { DeviceProfilesMap } from "./utils/deviceProfile";
import { getLocalDeviceId, isDesktopDeviceProfileEnabled } from "./utils/deviceProfile";
import type { BannerDeviceProfile } from "./homepageSetting/config";

export type TitleIconType = "emoji" | "image";
export type TitleIconStyle = "square" | "round" | "circle";
export type BannerGlobalType = "custom" | "bing";
export type FallingDensity = "low" | "medium" | "high";
export type FallingSpeed = "low" | "medium" | "high";

export interface HomepageButtonItem {
    id: number;
    label: string;
    checked: boolean;
    shortcut: string;
    order: number;
}

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
    tempTitleIconStyle: TitleIconStyle;
    statsInfoText: string;
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
    FallingDensity: FallingDensity;
    FallingSpeed: FallingSpeed;
    bannerHeight: number;
    bannerType?: string;
    buttonsList: HomepageButtonItem[];
    deviceProfiles: DeviceProfilesMap;
    bannerDeviceProfiles: Record<string, BannerDeviceProfile>;
}

export interface BannerImageResult {
    bannerImgSrc: string;
    remoteBannerImageData: string;
}

const DEFAULT_BUTTONS: HomepageButtonItem[] = [
    { id: 1728000000000, label: "🔍 搜索笔记", checked: true, shortcut: "Ctrl+P", order: 0 },
    { id: 1728000001000, label: "📅 今日日记", checked: true, shortcut: "Alt+5", order: 1 },
    { id: 1728000002000, label: "➕ 添加组件", checked: true, shortcut: "", order: 2 },
    { id: 1728000003000, label: "⚙ 主页设置", checked: true, shortcut: "", order: 3 },
];

export const defaultButtonsList = DEFAULT_BUTTONS.map((item) => ({ ...item }));

const VALID_TITLE_ICON_TYPES: TitleIconType[] = ["emoji", "image"];
const VALID_TITLE_ICON_STYLES: TitleIconStyle[] = ["square", "round", "circle"];
const VALID_BANNER_GLOBAL_TYPES: BannerGlobalType[] = ["custom", "bing"];
const VALID_FALLING_DENSITIES: FallingDensity[] = ["low", "medium", "high"];
const VALID_FALLING_SPEEDS: FallingSpeed[] = ["low", "medium", "high"];

const DEFAULT_HOMEPAGE_CONFIG: Omit<HomepageConfig, 'deviceProfiles' | 'bannerDeviceProfiles'> & { deviceProfiles: DeviceProfilesMap; bannerDeviceProfiles: Record<string, BannerDeviceProfile> } = {
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
    tempTitleIconStyle: "square",
    statsInfoText: "",
    footerEnabled: true,
    footerContent: "",
    mouseIcon: "default",
    MouseTrailEnabled: false,
    mouseGlobalEnabled: true,
    ClickEffectEnabled: false,
    ClickEffectContent: "",
    FallEffectsEnabled: false,
    GlobalFallingEffectsEnabled: false,
    FallingIcon: "snow",
    FallingDensity: "medium",
    FallingSpeed: "medium",
    bannerHeight: 300,
    buttonsList: DEFAULT_BUTTONS.map((item) => ({ ...item })),
    deviceProfiles: {},
    bannerDeviceProfiles: {},
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

function normalizeBoolean(value: unknown, defaultValue: boolean): boolean {
    return typeof value === "boolean" ? value : defaultValue;
}

function normalizeButtonsList(rawList: unknown): HomepageButtonItem[] {
    if (!Array.isArray(rawList) || rawList.length === 0) {
        return DEFAULT_BUTTONS.map((item) => ({ ...item }));
    }

    return rawList.map((item, index): HomepageButtonItem => {
        const raw = item as Record<string, unknown>;
        return {
            id: normalizeNumber(raw?.id, Date.now() + index),
            label: normalizeString(raw?.label, ""),
            checked: normalizeBoolean(raw?.checked, true),
            shortcut: normalizeString(raw?.shortcut, ""),
            order: normalizeNumber(raw?.order, index),
        };
    });
}

function normalizeDeviceProfiles(value: unknown): DeviceProfilesMap {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value as DeviceProfilesMap;
    }
    return {};
}

function normalizeBannerDeviceProfiles(value: unknown): Record<string, BannerDeviceProfile> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const result: Record<string, BannerDeviceProfile> = {};
    const raw = value as Record<string, unknown>;
    for (const [deviceId, profile] of Object.entries(raw)) {
        if (typeof profile !== "object" || profile === null) continue;
        const rawProfile = profile as Record<string, unknown>;
        const normalized: BannerDeviceProfile = {};
        if (rawProfile.bannerHeight !== undefined) {
            const height = normalizeNumber(rawProfile.bannerHeight, 300, 50, 1000);
            if (height !== 300) normalized.bannerHeight = height;
        }
        if (rawProfile.scrollTop !== undefined) {
            const scroll = normalizeNumber(rawProfile.scrollTop, 0, 0, 10000);
            if (scroll !== 0) normalized.scrollTop = scroll;
        }
        result[deviceId] = normalized;
    }
    return result;
}

// 注意：getDeviceLayout 已废弃，请使用 loadWidgetLayoutSettings(plugin) 从 widgetLayout.json 读取
// 保留此函数仅为兼容旧代码，新代码不应再使用

export async function loadHomepageConfig(plugin: any): Promise<HomepageConfig> {
    const config = (await plugin.loadData("homepageSettingConfig.json")) || {};

    // 注意：widgetLayoutNumber/widgetGap 已从本配置移除
    // 请使用 loadWidgetLayoutSettings(plugin) 从 widgetLayout.json 读取

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
        tempTitleIconStyle: normalizeEnum(config.tempTitleIconStyle, VALID_TITLE_ICON_STYLES, DEFAULT_HOMEPAGE_CONFIG.tempTitleIconStyle),
        statsInfoText: normalizeString(config.statsInfoText, DEFAULT_HOMEPAGE_CONFIG.statsInfoText),
        footerEnabled: config.footerEnabled ?? DEFAULT_HOMEPAGE_CONFIG.footerEnabled,
        footerContent: normalizeString(config.footerContent, DEFAULT_HOMEPAGE_CONFIG.footerContent),
        mouseIcon: normalizeString(config.mouseIcon, DEFAULT_HOMEPAGE_CONFIG.mouseIcon),
        MouseTrailEnabled: config.MouseTrailEnabled ?? DEFAULT_HOMEPAGE_CONFIG.MouseTrailEnabled,
        mouseGlobalEnabled: config.mouseGlobalEnabled ?? DEFAULT_HOMEPAGE_CONFIG.mouseGlobalEnabled,
        ClickEffectEnabled: config.ClickEffectEnabled ?? DEFAULT_HOMEPAGE_CONFIG.ClickEffectEnabled,
        ClickEffectContent: normalizeString(config.ClickEffectContent, DEFAULT_HOMEPAGE_CONFIG.ClickEffectContent),
        FallEffectsEnabled: config.FallEffectsEnabled ?? DEFAULT_HOMEPAGE_CONFIG.FallEffectsEnabled,
        GlobalFallingEffectsEnabled: config.GlobalFallingEffectsEnabled ?? DEFAULT_HOMEPAGE_CONFIG.GlobalFallingEffectsEnabled,
        FallingIcon: normalizeString(config.FallingIcon, DEFAULT_HOMEPAGE_CONFIG.FallingIcon),
        FallingDensity: normalizeEnum(config.FallingDensity, VALID_FALLING_DENSITIES, DEFAULT_HOMEPAGE_CONFIG.FallingDensity),
        FallingSpeed: normalizeEnum(config.FallingSpeed, VALID_FALLING_SPEEDS, DEFAULT_HOMEPAGE_CONFIG.FallingSpeed),
        bannerHeight: normalizeNumber(config.bannerHeight, DEFAULT_HOMEPAGE_CONFIG.bannerHeight, 50, 1000),
        bannerType: config.bannerType ? normalizeString(config.bannerType, "") : undefined,
        buttonsList: normalizeButtonsList(config.buttonsList),
        deviceProfiles: normalizeDeviceProfiles(config.deviceProfiles),
        bannerDeviceProfiles: normalizeBannerDeviceProfiles(config.bannerDeviceProfiles),
    };
}

export interface BannerDisplaySettings {
    bannerHeight: number;
    scrollTop: number;
    source: string;
    deviceId?: string;
}

export async function loadBannerDisplaySettings(plugin: any): Promise<BannerDisplaySettings> {
    const config = (await plugin.loadData("homepageSettingConfig.json")) || {};
    const globalBannerHeight = normalizeNumber(config.bannerHeight, 300, 50, 1000);

    // 桌面端：尝试读取设备特定的配置
    if (isDesktopDeviceProfileEnabled()) {
        const deviceId = getLocalDeviceId();
        if (deviceId && config.bannerDeviceProfiles?.[deviceId]) {
            const profile = config.bannerDeviceProfiles[deviceId] as BannerDeviceProfile;
            const deviceHeight = profile.bannerHeight !== undefined
                ? normalizeNumber(profile.bannerHeight, globalBannerHeight, 50, 1000)
                : globalBannerHeight;
            const deviceScrollTop = profile.scrollTop;

            return {
                bannerHeight: deviceHeight,
                scrollTop: deviceScrollTop ?? 0,
                source: `device profile (${deviceId})`,
                deviceId,
            };
        }
    }

    // 回退：读取旧的 bannerPosition.json
    let scrollTop = 0;
    try {
        const oldPosition = await plugin.loadData("bannerPosition.json");
        if (oldPosition && typeof oldPosition.scrollTop === "number") {
            scrollTop = normalizeNumber(oldPosition.scrollTop, 0, 0, 10000);
        }
    } catch {
        // 忽略读取错误
    }

    return {
        bannerHeight: globalBannerHeight,
        scrollTop,
        source: "global",
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
    const config = (await plugin.loadData("homepageSettingConfig.json")) || {};

    // 桌面端：保存到设备特定的 profile
    if (isDesktopDeviceProfileEnabled()) {
        const deviceId = getLocalDeviceId();
        if (deviceId) {
            if (!config.bannerDeviceProfiles) {
                config.bannerDeviceProfiles = {};
            }
            if (!config.bannerDeviceProfiles[deviceId]) {
                config.bannerDeviceProfiles[deviceId] = {};
            }

            if (partialSettings.bannerHeight !== undefined) {
                config.bannerDeviceProfiles[deviceId].bannerHeight = normalizeNumber(
                    partialSettings.bannerHeight,
                    300,
                    50,
                    1000
                );
            }
            if (partialSettings.scrollTop !== undefined) {
                config.bannerDeviceProfiles[deviceId].scrollTop = normalizeNumber(
                    partialSettings.scrollTop,
                    0,
                    0,
                    10000
                );
            }

            await plugin.saveData("homepageSettingConfig.json", config);
            return;
        }
    }

    // 移动端或无设备ID：保存到全局配置
    if (partialSettings.bannerHeight !== undefined) {
        config.bannerHeight = normalizeNumber(partialSettings.bannerHeight, 300, 50, 1000);
    }
    await plugin.saveData("homepageSettingConfig.json", config);

    // scrollTop 仍保存到旧文件以保持兼容
    if (partialSettings.scrollTop !== undefined) {
        await plugin.saveData("bannerPosition.json", {
            scrollTop: normalizeNumber(partialSettings.scrollTop, 0, 0, 10000),
        });
    }
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

    const isElectron =
        window.navigator.userAgent.includes("Electron") ||
        typeof (window as any).require === "function";

    if (config.bannerGlobalType === "custom") {
        if (config.bannerType === "local") {
            bannerImgSrc = config.bannerLocalData;
        } else if (config.bannerType === "remote") {
            if (!isElectron && config.bannerRemoteUrl) {
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
                if (!isElectron) {
                    remoteBannerImageData = await getImage(bingImageUrl);
                }
                bannerImgSrc = remoteBannerImageData || bingImageUrl;
            }
        } else {
            bannerImgSrc = "/plugins/siyuan-homepage/asset/bannerImg/notVIP.jpg";
        }
    }

    return { bannerImgSrc, remoteBannerImageData };
}

export function resolveButtonsList(config: HomepageConfig): HomepageButtonItem[] {
    if (!config.buttonsList || config.buttonsList.length === 0) {
        return DEFAULT_BUTTONS.map((item) => ({ ...item }));
    }
    return config.buttonsList.map((item) => ({ ...item }));
}