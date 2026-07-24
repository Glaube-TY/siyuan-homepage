import { getFrontend } from "siyuan";
import { getSiyuanSystemConfig, type SiyuanSystemConfig } from "@/api";

// 四个前端专属键 + 一个只读旧通用键（仅兼容 4.8.4 正式发布版）。
// - desktop/desktop-window → syhomepage-device-id-desktop
// - browser-desktop       → syhomepage-device-id-browser-desktop
// - mobile (原生)          → syhomepage-device-id-native-mobile
// - browser-mobile        → syhomepage-device-id-browser-mobile
const STORAGE_KEY_DESKTOP = "syhomepage-device-id-desktop";
const STORAGE_KEY_BROWSER_DESKTOP = "syhomepage-device-id-browser-desktop";
const STORAGE_KEY_NATIVE_MOBILE = "syhomepage-device-id-native-mobile";
const STORAGE_KEY_BROWSER_MOBILE = "syhomepage-device-id-browser-mobile";
/** 4.8.4 旧通用键，只读兼容，永不被覆盖或删除。 */
const LEGACY_STORAGE_KEY = "syhomepage-device-id";

function storageKey(frontend: string): string {
    if (frontend === "desktop" || frontend === "desktop-window") return STORAGE_KEY_DESKTOP;
    if (frontend === "browser-desktop") return STORAGE_KEY_BROWSER_DESKTOP;
    if (frontend === "mobile") return STORAGE_KEY_NATIVE_MOBILE;
    return STORAGE_KEY_BROWSER_MOBILE; // browser-mobile
}

/** 当前前端新创建设备 ID 必须符合的前缀。 */
function getRequiredIdPrefix(frontend: string): string | null {
    if (frontend === "desktop" || frontend === "desktop-window") return "desktop-";
    if (frontend === "browser-desktop") return "browser-";
    if (frontend === "mobile") return "mobile-";
    return "browser-mobile-"; // browser-mobile
}

/** browser-desktop 前缀为 browser-，但拒绝 browser-mobile-。 */
function validateNewDeviceIdPrefix(value: string, frontend: string): boolean {
    if (frontend === "browser-desktop") {
        return value.startsWith("browser-") && !value.startsWith("browser-mobile-");
    }
    const prefix = getRequiredIdPrefix(frontend);
    if (!prefix) return false;
    return value.startsWith(prefix);
}

export interface DeviceInfo {
    /** 当前设备物理身份。desktop: desktop-{hash(system.id)}; browser-desktop: browser-{uuid}; native-mobile: mobile-{hash}; browser-mobile: browser-mobile-{uuid} */
    physicalDeviceId: string;
    /** 仅用于匹配 4.8.4 root profile 的旧设备 ID 候选。 */
    legacyProfileCandidateIds: string[];
    /** 设备名称，来自 system.name */
    deviceName: string;
    /** 操作系统，来自 system.os */
    os: string;
    /** 操作系统平台，来自 system.osPlatform */
    osPlatform: string;
    /** 前端类型，来自 getFrontend() */
    frontend: string;
}

let cachedDeviceInfo: DeviceInfo | null = null;
let deviceIdentityInitializationPromise: Promise<DeviceInfo> | null = null;

export interface DeviceProfile {
    deviceId: string;
    deviceName?: string;
    platform: string;
    arch: string;
    hostname: string;
    isMobile: boolean;
    lastSeenAt?: string;
}

export interface DeviceProfilesMap {
    [profileKey: string]: DeviceProfile;
}

/** 同步判断是否为移动端（基于 getFrontend()）。 */
export function isMobileDevice(): boolean {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile";
}

/** 同步判断是否启用桌面设备画像（PC+侧边栏逐设备独立）。 */
export function isDesktopDeviceProfileEnabled(): boolean {
    return !isMobileDevice();
}

function createSafeDeviceId(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    if (typeof globalThis.crypto?.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
    throw new Error("当前运行环境缺少安全随机数能力，无法创建设备身份");
}

function isValidDeviceId(value: string): boolean {
    return value.length > 0
        && value.length <= 160
        && value !== "."
        && value !== ".."
        && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

export function stableHardwareHash(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 设备身份存储访问失败；调用方必须只停用设备视图。 */
export class DeviceIdentityStorageError extends Error {
    public readonly operation: "read" | "write";
    public readonly storageKey: string;
    public readonly cause: unknown;

    constructor(operation: "read" | "write", storageKey: string, cause: unknown) {
        super(`设备身份 localStorage ${operation === "read" ? "读取" : "写入"}失败（${storageKey}），已拒绝访问设备视图`);
        this.name = "DeviceIdentityStorageError";
        this.operation = operation;
        this.storageKey = storageKey;
        this.cause = cause;
    }
}

export class DeviceIdentityStoredValueError extends Error {
    public readonly storageKey: string;

    constructor(storageKey: string) {
        super(`设备身份 localStorage 存在非法值（${storageKey}），已拒绝覆盖并阻断设备视图`);
        this.name = "DeviceIdentityStoredValueError";
        this.storageKey = storageKey;
    }
}

export type StoredDeviceIdReadResult =
    | { status: "missing" }
    | { status: "valid"; value: string }
    | { status: "invalid" }
    | { status: "read-error"; error: DeviceIdentityStorageError };

/** 读取单个授权键；missing、invalid 与 read-error 严格分离。 */
export function readStoredDeviceId(
    key: string,
    validate: (value: string) => boolean = isValidDeviceId,
): StoredDeviceIdReadResult {
    try {
        const value = localStorage.getItem(key);
        if (value === null) return { status: "missing" };
        if (!value || !isValidDeviceId(value) || !validate(value)) return { status: "invalid" };
        return { status: "valid", value };
    } catch (error) {
        return {
            status: "read-error",
            error: new DeviceIdentityStorageError("read", key, error),
        };
    }
}

interface StoredPhysicalDeviceIds {
    currentFrontendStoredId: string | null;
    legacy484StoredId: string | null;
    legacyProfileCandidateIds: string[];
}

/** 分别读取当前最终版身份与 4.8.4 root profile 精确候选。 */
function collectStoredPhysicalDeviceIds(frontend: string): StoredPhysicalDeviceIds {
    const currentKey = storageKey(frontend);
    const currentResult = readStoredDeviceId(
        currentKey,
        (value) => validateNewDeviceIdPrefix(value, frontend) && value !== "mobile-shared",
    );
    const legacyResult = readStoredDeviceId(LEGACY_STORAGE_KEY);
    for (const [key, result] of [
        [currentKey, currentResult],
        [LEGACY_STORAGE_KEY, legacyResult],
    ] as const) {
        if (result.status === "invalid") throw new DeviceIdentityStoredValueError(key);
        if (result.status === "read-error") throw result.error;
    }
    const currentFrontendStoredId = currentResult.status === "valid" ? currentResult.value : null;
    const legacy484StoredId = legacyResult.status === "valid" ? legacyResult.value : null;
    return {
        currentFrontendStoredId,
        legacy484StoredId,
        legacyProfileCandidateIds: legacy484StoredId ? [legacy484StoredId] : [],
    };
}

function persistDeviceId(deviceId: string, frontend: string): void {
    const key = storageKey(frontend);
    try {
        localStorage.setItem(key, deviceId);
        if (localStorage.getItem(key) !== deviceId) {
            throw new Error("设备身份写入后校验失败");
        }
    } catch (error) {
        throw new DeviceIdentityStorageError("write", key, error);
    }
}

/**
 * 异步初始化设备身份。必须在任何设备视图操作前调用。
 *
 * 规则（基于 getFrontend()）：
 * - desktop / desktop-window:   physical = desktop-{stableHash(system.id)}，scope = physical
 * - browser-desktop:            physical = browser-{client-uuid}，scope = physical
 * - mobile (原生):               physical = mobile-{hash}，scope = mobile-shared
 * - browser-mobile:             physical = browser-mobile-{uuid}，scope = mobile-shared
 *
 * 4.8.4 旧通用键只读，仅作为 root profile 匹配候选。
 */
async function initializeDeviceIdentity(): Promise<DeviceInfo> {
    const frontend = getFrontend();
    const isNativeDesktop = frontend === "desktop" || frontend === "desktop-window";
    const isBrowserDesktop = frontend === "browser-desktop";
    const isMobileFrontend = frontend === "mobile";

    let systemConfig: SiyuanSystemConfig | null = null;
    if (isNativeDesktop || isMobileFrontend) {
        systemConfig = await getSiyuanSystemConfig();
    }

    const {
        currentFrontendStoredId,
        legacy484StoredId,
        legacyProfileCandidateIds,
    } = collectStoredPhysicalDeviceIds(frontend);

    let physicalDeviceId: string;
    let deviceName: string;
    let os: string;
    let osPlatform: string;

    if (isNativeDesktop) {
        if (!systemConfig) throw new Error("原生桌面环境无法读取思源 system.id");
        const scopeHash = stableHardwareHash(systemConfig.id);
        physicalDeviceId = `desktop-${scopeHash}`;
        deviceName = systemConfig.name || "Desktop";
        os = systemConfig.os;
        osPlatform = systemConfig.osPlatform;
        if (currentFrontendStoredId !== physicalDeviceId) {
            persistDeviceId(physicalDeviceId, frontend);
        }
    } else if (isBrowserDesktop) {
        // browser-desktop：专属键值必须具有 browser- 前缀（拒绝 desktop- 和 browser-mobile-）。
        if (
            currentFrontendStoredId
            && currentFrontendStoredId.startsWith("browser-")
            && !currentFrontendStoredId.startsWith("browser-mobile-")
            && currentFrontendStoredId !== "mobile-shared"
        ) {
            physicalDeviceId = currentFrontendStoredId;
        } else {
            physicalDeviceId = `browser-${createSafeDeviceId()}`;
            persistDeviceId(physicalDeviceId, frontend);
        }
        deviceName = systemConfig?.name || "Browser";
        os = systemConfig?.os || "unknown";
        osPlatform = systemConfig?.osPlatform || "unknown";
    } else if (isMobileFrontend) {
        if (!systemConfig) throw new Error("移动端无法读取思源 system.id");
        const mobileHash = stableHardwareHash(systemConfig.id);
        physicalDeviceId = `mobile-${mobileHash}`;
        deviceName = systemConfig.name || "Mobile";
        os = systemConfig.os;
        osPlatform = systemConfig.osPlatform;
        if (currentFrontendStoredId !== physicalDeviceId) {
            persistDeviceId(physicalDeviceId, frontend);
        }
    } else {
        // browser-mobile：客户端随机 ID。拒绝 desktop-/mobile- 前缀。
        if (
            currentFrontendStoredId
            && currentFrontendStoredId.startsWith("browser-mobile-")
            && currentFrontendStoredId !== "mobile-shared"
        ) {
            physicalDeviceId = currentFrontendStoredId;
        } else {
            physicalDeviceId = `browser-mobile-${createSafeDeviceId()}`;
            persistDeviceId(physicalDeviceId, frontend);
        }
        deviceName = systemConfig?.name || "Browser Mobile";
        os = systemConfig?.os || "unknown";
        osPlatform = systemConfig?.osPlatform || "unknown";
    }

    // 新建设备 ID 必须符合前端专属前缀。
    if (!validateNewDeviceIdPrefix(physicalDeviceId, frontend)) {
        clearDeviceCache();
        throw new Error(`生成的设备物理身份 (${physicalDeviceId}) 与当前前端 (${frontend}) 不匹配`);
    }

    // 原生桌面：物理 ID 不等于 mobile-shared。
    if (isNativeDesktop && physicalDeviceId === "mobile-shared") {
        clearDeviceCache();
        throw new Error("原生桌面 physical ID 不能为 mobile-shared");
    }

    cachedDeviceInfo = {
        physicalDeviceId,
        legacyProfileCandidateIds: legacyProfileCandidateIds.filter(
            (id) => id !== physicalDeviceId && id === legacy484StoredId,
        ),
        deviceName,
        os,
        osPlatform,
        frontend,
    };

    return cachedDeviceInfo;
}

export function ensureDeviceIdentityReady(): Promise<DeviceInfo> {
    if (cachedDeviceInfo) return Promise.resolve(cachedDeviceInfo);
    if (deviceIdentityInitializationPromise) return deviceIdentityInitializationPromise;

    const initialization = initializeDeviceIdentity();
    deviceIdentityInitializationPromise = initialization;
    const clearInFlight = () => {
        if (deviceIdentityInitializationPromise === initialization) {
            deviceIdentityInitializationPromise = null;
        }
    };
    void initialization.then(clearInFlight, clearInFlight);
    return initialization;
}

export function getCurrentDeviceInfo(): DeviceInfo {
    if (cachedDeviceInfo) return cachedDeviceInfo;
    throw new Error(
        "设备身份尚未初始化：请先 await ensureDeviceIdentityReady() 再调用 getCurrentDeviceInfo。",
    );
}

export function clearDeviceCache(): void {
    cachedDeviceInfo = null;
}
