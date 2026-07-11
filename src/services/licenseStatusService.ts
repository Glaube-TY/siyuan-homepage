/**
 * 会员授权状态同步服务
 *
 * 职责仅限：
 * - 规范化 baseUrl
 * - 调用 POST /api/licenses/sync
 * - 处理超时
 * - 处理服务器错误
 * - 返回结构化结果
 *
 * 不得包含：订单、支付、二维码、claimToken、爱发电 API。
 * 不得保存 currentLicense。
 * 不得打印完整 SH。
 */

import {
    DEFAULT_BASE_URL,
    DEFAULT_TIMEOUT_MS,
    MembershipServiceError,
    businessCodeToErrorCode,
    extractRetryAfter,
    fetchWithTimeout,
    membershipMessage,
    parseActiveMembershipProtocolFields,
    safeParseJson,
    unwrapSuccessData,
} from "./membershipService";

export interface LicenseSyncRequest {
    userCode: string;
    currentLicense: string;
    pluginVersion: string;
}

export type SyncStatus = "active" | "revoked" | "expired" | "unmanaged";

export interface LicenseSyncActiveResponse {
    status: "active";
    license: string;
    changed: boolean;
    durationDays: number;
    issuedDate: string;
    isLifetime: boolean;
    remainingDays: number;
    dueDate: string | null;
}

export interface LicenseSyncRevokedResponse {
    status: "revoked";
    clearLocalLicense: boolean;
    message: string;
}

export interface LicenseSyncExpiredResponse {
    status: "expired";
    message?: string;
}

export interface LicenseSyncUnmanagedResponse {
    status: "unmanaged";
    message?: string;
}

export type LicenseSyncResponse =
    | LicenseSyncActiveResponse
    | LicenseSyncRevokedResponse
    | LicenseSyncExpiredResponse
    | LicenseSyncUnmanagedResponse;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isValidSH(value: unknown): value is string {
    return isNonEmptyString(value) && value.trim().startsWith("SH.");
}

function syncProtocolError(message: string): MembershipServiceError {
    return new MembershipServiceError({
        code: "SERVER_PROTOCOL_ERROR",
        message,
    });
}

export async function syncLicenseStatus(
    request: LicenseSyncRequest,
): Promise<LicenseSyncResponse> {
    const response = await fetchWithTimeout(
        `${DEFAULT_BASE_URL}/api/licenses/sync`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(request),
        },
        DEFAULT_TIMEOUT_MS,
        "sync",
    );

    const data = await safeParseJson(response, "sync");

    if (!response.ok) {
        const businessCode =
            data && typeof data === "object" ? String(data.code || "") : undefined;
        const httpStatus = response.status;

        if (httpStatus === 429) {
            const retryAfter = extractRetryAfter(response);
            throw new MembershipServiceError({
                code: "RATE_LIMITED",
                message: membershipMessage("RATE_LIMITED", { retryAfter, context: "sync" }),
                httpStatus,
                retryAfter,
                businessCode,
            });
        }

        const errorCode = businessCodeToErrorCode(businessCode);
        throw new MembershipServiceError({
            code: errorCode,
            message: membershipMessage(errorCode, { context: "sync" }),
            httpStatus,
            businessCode,
        });
    }

    const payload = unwrapSuccessData(data, response.status);
    if (typeof payload.status !== "string") {
        throw syncProtocolError("服务器返回的 status 字段类型不正确。");
    }
    const status = payload.status;
    const validStatuses = ["active", "revoked", "expired", "unmanaged"];
    if (!validStatuses.includes(status)) {
        throw syncProtocolError("服务器返回的 status 字段值无效。");
    }

    if (status === "active") {
        if (!isValidSH(payload?.license)) {
            throw syncProtocolError("服务器返回 active 状态但未提供有效 SH 激活码。");
        }
        if (typeof payload?.changed !== "boolean") {
            throw syncProtocolError("服务器返回的 changed 字段类型不正确。");
        }

        const serverLicense = payload.license.trim();
        const localLicense = request.currentLicense.trim();
        const actuallyChanged = serverLicense !== localLicense;

        if (payload.changed !== actuallyChanged) {
            throw syncProtocolError("服务器返回的 changed 字段与授权实际变化不一致。");
        }

        const activeFields = parseActiveMembershipProtocolFields(payload, response.status);
        return {
            status: "active",
            license: serverLicense,
            changed: payload.changed,
            ...activeFields,
        };
    }

    if (status === "revoked") {
        if (typeof payload?.clearLocalLicense !== "boolean") {
            throw syncProtocolError("服务器返回的 clearLocalLicense 字段类型不正确。");
        }
        return {
            status: "revoked",
            clearLocalLicense: payload.clearLocalLicense,
            message: "服务器已取消当前会员授权，但未要求清除本地凭据。",
        };
    }

    if (status === "expired") {
        return {
            status: "expired",
            message: "服务器中未找到当前有效会员，本地授权将继续按自身有效期处理。",
        };
    }

    if (status === "unmanaged") {
        return {
            status: "unmanaged",
            message: "当前 SH 尚未由服务器管理，本地离线会员不会受到影响。",
        };
    }

    throw new MembershipServiceError({
        code: "SERVER_PROTOCOL_ERROR",
        message: "服务器返回了无法识别的会员状态。",
        httpStatus: response.status,
    });
}
