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

const DEFAULT_TIMEOUT_MS = 15000;

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
    dueDate: string;
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

export function normalizeBaseUrl(baseUrl: string): string {
    const trimmed = (baseUrl || "").trim();
    if (!trimmed) return "";
    return trimmed.replace(/\/+$/, "");
}

export async function syncLicenseStatus(
    baseUrl: string,
    request: LicenseSyncRequest,
): Promise<LicenseSyncResponse> {
    const url = `${normalizeBaseUrl(baseUrl)}/api/licenses/sync`;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(request),
            signal: controller.signal,
        });

        let data: any;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error("服务器响应格式异常");
            }
        }

        if (!response.ok) {
            const code = data && typeof data === "object" ? data.code : undefined;
            const serverMessage =
                data && typeof data === "object"
                    ? data.message || data.msg || ""
                    : "";
            const detail = serverMessage
                ? `${serverMessage}${code !== undefined ? ` (code: ${code})` : ""}`
                : `HTTP ${response.status}`;
            throw new Error(detail);
        }

        const payload = data?.data ?? data;
        const status: string = String(payload?.status || "").toLowerCase();

        if (status === "active") {
            if (!payload?.license) {
                throw new Error("服务器返回 active 状态但未提供激活码");
            }
            return {
                status: "active",
                license: String(payload.license),
                changed: payload.changed === true,
                durationDays: Number(payload.durationDays || 0),
                issuedDate: String(payload.issuedDate || ""),
                isLifetime: payload.isLifetime === true,
                remainingDays: Number(payload.remainingDays || 0),
                dueDate: String(payload.dueDate || ""),
            };
        }

        if (status === "revoked") {
            return {
                status: "revoked",
                clearLocalLicense: payload.clearLocalLicense === true,
                message: String(payload.message || "会员授权已被管理员取消"),
            };
        }

        if (status === "expired") {
            return {
                status: "expired",
                message: payload.message ? String(payload.message) : undefined,
            };
        }

        // unmanaged or unknown
        return {
            status: "unmanaged",
            message: payload.message ? String(payload.message) : undefined,
        };
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === "AbortError") {
                throw new Error("暂时无法连接激活服务器，请稍后重试。");
            }
            if (
                error.message.includes("fetch") ||
                error.message.includes("NetworkError") ||
                error.message.includes("Failed to fetch")
            ) {
                throw new Error("暂时无法连接激活服务器，请稍后重试。");
            }
            throw error;
        }
        throw new Error("暂时无法连接激活服务器，请稍后重试。");
    } finally {
        window.clearTimeout(timer);
    }
}
