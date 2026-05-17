import { getLocalDeviceId, isDesktopDeviceProfileEnabled } from "@/homepage/utils/deviceProfile";
import { loadWidgetLayoutSettings } from "@/components/utils/widgetBlock/utils/layout-shared";

export interface TemplateRuntimeContext {
    deviceId: string | null;
    isDesktopProfileEnabled: boolean;
    currentColumns: number;
    currentGap: number;
    layoutSettingsSource: string;
    hasWidgetLayout: boolean;
    profileExists: boolean;
    profileWidgetCount: number;
    hiddenWidgetCount: number;
}

async function safeLoadWidgetLayout(plugin: any): Promise<any> {
    try {
        const layout = await plugin.loadData("widgetLayout.json");
        return layout;
    } catch {
        console.warn("[TemplateContext] 读取 widgetLayout.json 失败");
        return null;
    }
}

export async function getTemplateRuntimeContext(
    plugin: any,
): Promise<TemplateRuntimeContext> {
    const isDesktopProfileEnabled = isDesktopDeviceProfileEnabled();
    const deviceId = isDesktopProfileEnabled ? getLocalDeviceId() : null;

    const layoutSettings = await loadWidgetLayoutSettings(plugin);

    const layout = await safeLoadWidgetLayout(plugin) as {
        profiles?: Record<string, {
            order?: Array<{ id: string }>;
            hiddenWidgetIds?: string[];
        }>;
    } | null;

    const profile = layout?.profiles?.[deviceId ?? ""];
    const profileExists = !!profile;
    const profileWidgetCount = profile?.order?.length ?? 0;
    const hiddenWidgetCount = profile?.hiddenWidgetIds?.length ?? 0;

    return {
        deviceId,
        isDesktopProfileEnabled,
        currentColumns: layoutSettings.widgetLayoutNumber,
        currentGap: layoutSettings.widgetGap,
        layoutSettingsSource: layoutSettings.source,
        hasWidgetLayout: !!layout,
        profileExists,
        profileWidgetCount,
        hiddenWidgetCount,
    };
}
