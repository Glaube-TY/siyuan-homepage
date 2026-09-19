import type {
    ActivateLicenseServerManagementOptions,
    DeleteLicenseResult,
    SavedActivationCodeState,
    VIPIdentity,
} from "@/components/tools/advanced";
import type { LicenseUserInfo, LicenseVerifyResult } from "@/components/tools/licenseSy2";
import type { RecoverMembershipByIdentityResponse } from "@/services/membershipService";

export type HomepageMembershipRecoveryOutcome =
    | { kind: "recovered"; userInfo: LicenseUserInfo }
    | { kind: "local_valid"; userInfo: LicenseUserInfo }
    | { kind: "license_changed" }
    | { kind: "identity_changed" }
    | { kind: "cancelled" }
    | { kind: "cooldown"; retryAt: number }
    | { kind: "error"; error: unknown; verification?: LicenseVerifyResult };

export interface HomepageMembershipRecoveryDependencies {
    plugin: any;
    identity: VIPIdentity;
    expectedCurrentLicense?: string | null;
    pluginVersion: string;
    serviceOrigin: string;
    isCurrent: () => boolean;
    updateVIP: () => Promise<VIPIdentity>;
    readSavedActivationCodeState: (plugin: any) => Promise<SavedActivationCodeState>;
    verifySavedSignedLicenseReadOnly: (
        plugin: any,
        userName: string,
        userId: string,
    ) => Promise<LicenseVerifyResult>;
    recoverMembershipByIdentity: (request: {
        userCode: string;
        pluginVersion: string;
    }) => Promise<RecoverMembershipByIdentityResponse>;
    activateLicense: (
        plugin: any,
        activationCode: string,
        userName: string,
        userId: string,
        serverManagement?: ActivateLicenseServerManagementOptions,
    ) => Promise<LicenseVerifyResult>;
    deleteLicense: (plugin: any, expectedLicense?: string) => Promise<DeleteLicenseResult>;
}

function isSameIdentity(left: VIPIdentity, right: VIPIdentity): boolean {
    return Boolean(left.USER_ID) && left.USER_ID === right.USER_ID;
}

async function readCurrentLicense(
    dependencies: HomepageMembershipRecoveryDependencies,
    identity: VIPIdentity,
): Promise<HomepageMembershipRecoveryOutcome | null> {
    const saved = await dependencies.readSavedActivationCodeState(dependencies.plugin);
    if (saved.status === "error") {
        return { kind: "error", error: new Error("本地会员授权读取失败") };
    }

    if (saved.status === "missing") {
        return dependencies.expectedCurrentLicense === undefined || dependencies.expectedCurrentLicense === null
            ? null
            : { kind: "license_changed" };
    }

    const localResult = await dependencies.verifySavedSignedLicenseReadOnly(
        dependencies.plugin,
        identity.USER_NAME,
        identity.USER_ID,
    );
    if (localResult.valid && localResult.code === 0 && localResult.userInfo) {
        return { kind: "local_valid", userInfo: localResult.userInfo };
    }

    // An expired copy is the only old local state that a renewal response may replace.
    if (
        typeof dependencies.expectedCurrentLicense === "string" &&
        saved.code === dependencies.expectedCurrentLicense &&
        localResult.code === 31
    ) {
        return null;
    }

    return { kind: "license_changed" };
}

export async function recoverHomepageMembershipByIdentity(
    dependencies: HomepageMembershipRecoveryDependencies,
): Promise<HomepageMembershipRecoveryOutcome> {
    if (!dependencies.identity.USER_ID || !dependencies.identity.USER_CODE_V2) {
        return { kind: "error", error: new Error("思源账号身份尚未就绪") };
    }

    try {
        const recovery = await dependencies.recoverMembershipByIdentity({
            userCode: dependencies.identity.USER_CODE_V2,
            pluginVersion: dependencies.pluginVersion,
        });
        if (!dependencies.isCurrent()) return { kind: "cancelled" };

        const liveIdentity = await dependencies.updateVIP();
        if (!isSameIdentity(dependencies.identity, liveIdentity)) {
            return { kind: "identity_changed" };
        }

        const currentLicense = await readCurrentLicense(dependencies, liveIdentity);
        if (currentLicense) return currentLicense;
        if (!dependencies.isCurrent()) return { kind: "cancelled" };

        const latestIdentity = await dependencies.updateVIP();
        if (!isSameIdentity(dependencies.identity, latestIdentity)) {
            return { kind: "identity_changed" };
        }
        if (!dependencies.isCurrent()) return { kind: "cancelled" };

        const serverManagement: ActivateLicenseServerManagementOptions = {
            serverManagedSource: "identity_recovery",
            serverManagedServiceOrigin: dependencies.serviceOrigin,
        };
        if (dependencies.expectedCurrentLicense !== undefined) {
            serverManagement.expectedCurrentLicense = dependencies.expectedCurrentLicense;
        }

        const result = await dependencies.activateLicense(
            dependencies.plugin,
            recovery.license,
            latestIdentity.USER_NAME,
            latestIdentity.USER_ID,
            serverManagement,
        );
        if (!dependencies.isCurrent()) return { kind: "cancelled" };
        if (result.code === 53) return { kind: "license_changed" };
        if (!result.valid || !result.userInfo) {
            return {
                kind: "error",
                error: new Error("服务器恢复的激活码验证失败"),
                verification: result,
            };
        }

        const confirmedIdentity = await dependencies.updateVIP();
        if (!isSameIdentity(dependencies.identity, confirmedIdentity)) {
            try {
                const cleanupResult = await dependencies.deleteLicense(
                    dependencies.plugin,
                    recovery.license,
                );
                return cleanupResult === "license_changed"
                    ? { kind: "license_changed" }
                    : { kind: "identity_changed" };
            } catch (error) {
                return {
                    kind: "error",
                    error: new Error(
                        `账号切换后旧授权条件清理失败${error instanceof Error && error.message ? `: ${error.message}` : ""}`,
                    ),
                };
            }
        }

        return { kind: "recovered", userInfo: result.userInfo };
    } catch (error) {
        return { kind: "error", error };
    }
}
