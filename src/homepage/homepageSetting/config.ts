import type { ButtonItem } from './types';
import type { DeviceProfilesMap } from '../utils/deviceProfile';
import type { HomepageStatusTextMode } from '../status-text-config';
import type { SelectionAiToolbarSettings } from '@/features/kb/services/selection-ai/selection-ai-types';

export type DocPreviewMode = "preview" | "wysiwyg";

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
