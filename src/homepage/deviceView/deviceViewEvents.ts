import type { DeviceViewContext, DeviceViewSurface } from "./deviceViewTypes";

export const DEVICE_VIEW_CHANGED_EVENT = "siyuan-homepage-device-view-changed";

export interface DeviceViewChangedDetail {
    deviceId: string;
    surface: DeviceViewSurface;
    reason: "layout" | "widget" | "settings" | "migration";
}

export function dispatchDeviceViewChanged(context: DeviceViewContext, reason: DeviceViewChangedDetail["reason"]): void {
    window.dispatchEvent(new CustomEvent<DeviceViewChangedDetail>(DEVICE_VIEW_CHANGED_EVENT, {
        detail: { deviceId: context.scopeId, surface: context.surface, reason },
    }));
}
