const STORAGE_KEY = "syhomepage-device-id";

export interface DeviceInfo {
    deviceId: string;
    deviceName: string;
    platform: string;
    arch: string;
    hostname: string;
    isMobile: boolean;
    appId?: string;
}

let cachedDeviceId: string | null = null;
let cachedDeviceInfo: DeviceInfo | null = null;

export function isDesktopDeviceProfileEnabled(): boolean {
    return !((window as any).siyuan?.isMobile === true);
}

export function getLocalDeviceId(): string | null {
    if (!isDesktopDeviceProfileEnabled()) {
        return null;
    }

    if (cachedDeviceId) {
        return cachedDeviceId;
    }

    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
        cachedDeviceId = storedId;
        return storedId;
    }

    const newId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, newId);
    cachedDeviceId = newId;
    return newId;
}

function getSystemInfo(): { platform: string; arch: string; hostname: string } {
    let platform = "unknown";
    let arch = "unknown";
    let hostname = "unknown";

    try {
        const requireFn = (window as any).require;
        if (typeof requireFn === "function") {
            const nodeOs = requireFn("node:os");
            if (nodeOs) {
                platform = nodeOs.platform() || platform;
                arch = nodeOs.arch() || arch;
                hostname = nodeOs.hostname() || hostname;
            }
        }
    } catch {
        // ignore
    }

    if (platform === "unknown") {
        platform = navigator.platform || "unknown";
    }
    if (arch === "unknown") {
        arch = (navigator as any).userAgentData?.platform || "unknown";
    }
    if (hostname === "unknown") {
        hostname = `${platform}-${screen.width}x${screen.height}`;
    }

    return { platform, arch, hostname };
}

export function getCurrentDeviceInfo(): DeviceInfo {
    if (cachedDeviceInfo) {
        return cachedDeviceInfo;
    }

    const isMobile = !isDesktopDeviceProfileEnabled();
    const deviceId = isMobile ? "" : (getLocalDeviceId() || "");
    const { platform, arch, hostname } = getSystemInfo();

    const deviceName = hostname !== "unknown" 
        ? hostname 
        : `${platform}-${screen.width}x${screen.height}`;

    const appId = (window as any).siyuan?.appId || undefined;

    cachedDeviceInfo = {
        deviceId,
        deviceName,
        platform,
        arch,
        hostname,
        isMobile,
        appId,
    };

    return cachedDeviceInfo;
}

export interface DeviceProfile {
    deviceId: string;
    deviceName: string;
    platform: string;
    arch: string;
    hostname: string;
    isMobile: boolean;
    lastSeenAt: string;
    layout?: {
        widgetLayoutNumber: number;
        widgetGap: number;
    };
}

export interface DeviceProfilesMap {
    [deviceId: string]: DeviceProfile;
}

export function createDeviceProfile(
    deviceInfo: DeviceInfo,
    layout?: { widgetLayoutNumber: number; widgetGap: number }
): DeviceProfile {
    const profile: DeviceProfile = {
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        platform: deviceInfo.platform,
        arch: deviceInfo.arch,
        hostname: deviceInfo.hostname,
        isMobile: deviceInfo.isMobile,
        lastSeenAt: new Date().toISOString(),
    };
    if (layout) {
        profile.layout = layout;
    }
    return profile;
}

export function updateDeviceProfile(
    existingProfile: DeviceProfile,
    deviceInfo: DeviceInfo
): DeviceProfile {
    return {
        ...existingProfile,
        deviceName: deviceInfo.deviceName,
        platform: deviceInfo.platform,
        arch: deviceInfo.arch,
        hostname: deviceInfo.hostname,
        isMobile: deviceInfo.isMobile,
        lastSeenAt: new Date().toISOString(),
    };
}

export function clearDeviceCache(): void {
    cachedDeviceId = null;
    cachedDeviceInfo = null;
}

/**
 * 同机匹配：根据 hostname/platform/arch/isMobile 查找已存在的同机 profile
 * 用于修复 localStorage 漂移导致的重复设备登记
 */
export function findExistingDeviceByHardware(
    profiles: DeviceProfilesMap,
    deviceInfo: DeviceInfo
): string | null {
    for (const [deviceId, profile] of Object.entries(profiles)) {
        // 必须完全匹配的关键硬件标识
        if (
            profile.hostname === deviceInfo.hostname &&
            profile.platform === deviceInfo.platform &&
            profile.arch === deviceInfo.arch &&
            profile.isMobile === deviceInfo.isMobile
        ) {
            // 辅助验证 deviceName（允许一方为 unknown）
            const nameMatch =
                profile.deviceName === deviceInfo.deviceName ||
                profile.deviceName === "unknown" ||
                deviceInfo.deviceName === "unknown";
            
            if (nameMatch) {
                return deviceId;
            }
        }
    }
    return null;
}

/**
 * 清理重复设备：按硬件标识分组，每组只保留 lastSeenAt 最新的一条
 * 返回被删除的 deviceId 列表
 */
export function deduplicateDeviceProfiles(
    profiles: DeviceProfilesMap
): { cleanedProfiles: DeviceProfilesMap; deletedIds: string[] } {
    const groups = new Map<string, { deviceId: string; profile: DeviceProfile }[]>();
    
    // 按硬件标识分组
    for (const [deviceId, profile] of Object.entries(profiles)) {
        const key = `${profile.hostname}|${profile.platform}|${profile.arch}|${profile.isMobile}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push({ deviceId, profile });
    }
    
    const cleanedProfiles: DeviceProfilesMap = {};
    const deletedIds: string[] = [];
    
    // 每组只保留最新的一条
    for (const entries of groups.values()) {
        if (entries.length === 0) continue;
        
        // 按 lastSeenAt 倒序排序
        entries.sort((a, b) => {
            const timeA = new Date(a.profile.lastSeenAt || 0).getTime();
            const timeB = new Date(b.profile.lastSeenAt || 0).getTime();
            return timeB - timeA;
        });
        
        // 保留最新的
        const [latest, ...duplicates] = entries;
        cleanedProfiles[latest.deviceId] = latest.profile;
        
        // 记录要删除的
        for (const dup of duplicates) {
            deletedIds.push(dup.deviceId);
        }
    }
    
    return { cleanedProfiles, deletedIds };
}