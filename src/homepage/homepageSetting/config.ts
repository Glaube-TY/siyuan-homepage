import type { ButtonItem } from './types';

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
    statsInfoText: string;
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
}

export async function loadHomepageSettingConfig(plugin: any): Promise<HomepageSettingConfig | null> {
    return await plugin.loadData("homepageSettingConfig.json");
}

export async function saveHomepageSettingConfig(plugin: any, config: HomepageSettingConfig): Promise<void> {
    await plugin.saveData("homepageSettingConfig.json", config);
}