import { readDeviceViewLayout } from "@/homepage/deviceView/deviceViewStorage";
import { loadWidgetInstanceConfig } from "@/homepage/deviceView/widgetInstanceRepository";
import type { DeviceViewContext } from "@/homepage/deviceView/deviceViewTypes";

/** 只检查当前设备、当前 surface，避免跨界面实例 ID 互相污染。 */
export async function checkExistingMusicPlayer(
    _plugin: any,
    currentBlockId: string,
    context: DeviceViewContext,
): Promise<{ exists: boolean; existingBlockId?: string }> {
    const layout = await readDeviceViewLayout(context);
    if (!layout) return { exists: false };
    for (const item of layout.order) {
        if (item.id === currentBlockId) continue;
        const config = await loadWidgetInstanceConfig(context, item.id);
        if (config?.type === "musicPlayer") return { exists: true, existingBlockId: item.id };
    }
    return { exists: false };
}
