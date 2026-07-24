import { getCurrentDeviceInfo } from "@/homepage/utils/deviceProfile";
import type { DeviceViewContext, DeviceViewSurface } from "./deviceViewTypes";
import { resolveDeviceViewScopeId } from "./deviceViewPaths";

/**
 * 获取当前设备视图 context。
 * PC 端逐设备独立，移动端使用 "mobile-shared" scope。
 * 调用前必须确保已通过 ensureDeviceIdentityReady() 完成设备身份初始化。
 */
export function getCurrentDeviceViewContext(plugin: any, surface: DeviceViewSurface): DeviceViewContext {
    const info = getCurrentDeviceInfo();
    const physicalDeviceId = info.physicalDeviceId;
    if (!physicalDeviceId) throw new Error("当前物理设备 ID 为空，拒绝访问设备视图");
    const scopeId = resolveDeviceViewScopeId(physicalDeviceId, surface);
    return {
        plugin,
        physicalDeviceId,
        legacyProfileCandidateIds: info.legacyProfileCandidateIds,
        scopeId,
        surface,
        isMobileShared: scopeId === "mobile-shared",
    };
}
