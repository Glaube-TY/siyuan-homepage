import type { LicenseUserInfo } from "@/components/tools/licenseSy2";

export const HOMEPAGE_ENTITLEMENT_CHANGED_EVENT = "homepage-entitlement-changed";

export type HomepageEntitlementStatus = "pending" | "granted" | "denied" | "error";

export interface HomepageEntitlementSnapshot {
    status: HomepageEntitlementStatus;
    advanced: boolean;
    checkedAt: number;
    validUntil: number | null;
    userId: string;
    revision: number;
    degraded: boolean;
    reason: string;
}

type EntitlementPlugin = {
    ADVANCED?: boolean;
};

const subscribers = new Set<(snapshot: HomepageEntitlementSnapshot) => void>();

let currentSnapshot: HomepageEntitlementSnapshot = Object.freeze({
    status: "pending",
    advanced: false,
    checkedAt: 0,
    validUntil: null,
    userId: "",
    revision: 0,
    degraded: false,
    reason: "",
});

function isGrantStillValid(snapshot: HomepageEntitlementSnapshot, now = Date.now()): boolean {
    return snapshot.status === "granted"
        && snapshot.advanced
        && (snapshot.validUntil === null || now < snapshot.validUntil);
}

function publish(
    plugin: EntitlementPlugin,
    next: Omit<HomepageEntitlementSnapshot, "revision">,
): HomepageEntitlementSnapshot {
    const previous = currentSnapshot;
    const previousAdvanced = isGrantStillValid(previous);
    const nextAdvanced = next.status === "granted"
        && next.advanced
        && (next.validUntil === null || Date.now() < next.validUntil);
    const normalizedNext = nextAdvanced || next.status !== "granted"
        ? { ...next, advanced: nextAdvanced }
        : { ...next, status: "denied" as const, advanced: false, degraded: false, reason: "会员授权已过期" };
    const meaningfulChange = previous.status !== normalizedNext.status
        || previousAdvanced !== normalizedNext.advanced
        || previous.validUntil !== normalizedNext.validUntil
        || previous.userId !== normalizedNext.userId
        || previous.degraded !== normalizedNext.degraded
        || previous.reason !== normalizedNext.reason;
    currentSnapshot = Object.freeze({
        ...normalizedNext,
        revision: meaningfulChange ? previous.revision + 1 : previous.revision,
    });
    plugin.ADVANCED = currentSnapshot.advanced;

    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(HOMEPAGE_ENTITLEMENT_CHANGED_EVENT, {
            detail: currentSnapshot,
        }));
        if (!previousAdvanced && currentSnapshot.advanced) {
            window.dispatchEvent(new CustomEvent("homepage-advanced-ready"));
        } else if (previousAdvanced && !currentSnapshot.advanced) {
            window.dispatchEvent(new CustomEvent("homepage-advanced-unavailable"));
        }
    }
    subscribers.forEach((subscriber) => subscriber(currentSnapshot));
    return currentSnapshot;
}

export function resetHomepageEntitlement(plugin: EntitlementPlugin): HomepageEntitlementSnapshot {
    return publish(plugin, {
        status: "pending",
        advanced: false,
        checkedAt: 0,
        validUntil: null,
        userId: "",
        degraded: false,
        reason: "",
    });
}

export function markHomepageEntitlementPending(plugin: EntitlementPlugin): HomepageEntitlementSnapshot {
    if (isGrantStillValid(currentSnapshot)) return currentSnapshot;
    return publish(plugin, {
        status: "pending",
        advanced: false,
        checkedAt: currentSnapshot.checkedAt,
        validUntil: null,
        userId: "",
        degraded: false,
        reason: "",
    });
}

export function grantHomepageEntitlement(
    plugin: EntitlementPlugin,
    userInfo: LicenseUserInfo,
): HomepageEntitlementSnapshot {
    return publish(plugin, {
        status: "granted",
        advanced: true,
        checkedAt: Date.now(),
        validUntil: resolveLicenseValidUntil(userInfo),
        userId: String(userInfo.userId || ""),
        degraded: false,
        reason: "",
    });
}

export function denyHomepageEntitlement(
    plugin: EntitlementPlugin,
    reason = "",
): HomepageEntitlementSnapshot {
    return publish(plugin, {
        status: "denied",
        advanced: false,
        checkedAt: Date.now(),
        validUntil: null,
        userId: "",
        degraded: false,
        reason,
    });
}

export function failHomepageEntitlementCheck(
    plugin: EntitlementPlugin,
    reason = "",
): HomepageEntitlementSnapshot {
    if (isGrantStillValid(currentSnapshot)) {
        return publish(plugin, {
            ...currentSnapshot,
            checkedAt: Date.now(),
            degraded: true,
            reason,
        });
    }
    return publish(plugin, {
        status: "error",
        advanced: false,
        checkedAt: Date.now(),
        validUntil: null,
        userId: "",
        degraded: false,
        reason,
    });
}

export function getHomepageEntitlementSnapshot(): HomepageEntitlementSnapshot {
    if (currentSnapshot.advanced && !isGrantStillValid(currentSnapshot)) {
        return Object.freeze({
            ...currentSnapshot,
            status: "denied",
            advanced: false,
            degraded: false,
            reason: "会员授权已过期",
        });
    }
    return currentSnapshot;
}

export function isHomepageEntitlementGranted(): boolean {
    return getHomepageEntitlementSnapshot().advanced;
}

export async function ensureHomepageEntitlementGranted(plugin: {
    waitForHomepageEntitlementReady?: () => Promise<void>;
}): Promise<boolean> {
    if (typeof plugin?.waitForHomepageEntitlementReady === "function") {
        await plugin.waitForHomepageEntitlementReady();
    }
    return isHomepageEntitlementGranted();
}

export function subscribeHomepageEntitlement(
    subscriber: (snapshot: HomepageEntitlementSnapshot) => void,
): () => void {
    subscribers.add(subscriber);
    subscriber(getHomepageEntitlementSnapshot());
    return () => subscribers.delete(subscriber);
}

export function resolveHomepageEntitlementMessage(featureLabel: string): string {
    const snapshot = getHomepageEntitlementSnapshot();
    if (snapshot.status === "pending") {
        return `正在校验会员状态，暂时无法打开${featureLabel}，请稍后重试。`;
    }
    if (snapshot.status === "error") {
        return `会员状态暂时无法确认，${featureLabel}已安全停用并会自动重试。`;
    }
    return `${featureLabel}为高级会员专属功能，请在「主页设置」→「会员服务」中开通后使用`;
}

export function resolveLicenseValidUntil(userInfo: LicenseUserInfo): number | null {
    if (userInfo.isLifetime === true || userInfo.durationDays === 0) return null;
    const issuedDate = String(userInfo.issuedDate || "");
    const durationDays = Number(userInfo.durationDays);
    if (!/^\d{8}$/.test(issuedDate) || !Number.isInteger(durationDays) || durationDays <= 0) {
        return Date.now();
    }
    const year = Number(issuedDate.slice(0, 4));
    const month = Number(issuedDate.slice(4, 6));
    const day = Number(issuedDate.slice(6, 8));
    return new Date(year, month - 1, day + durationDays, 0, 0, 0, 0).getTime();
}

export async function withEntitlementTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    label: string,
): Promise<T> {
    let timer: number | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
            }),
        ]);
    } finally {
        if (typeof timer === "number") window.clearTimeout(timer);
    }
}
