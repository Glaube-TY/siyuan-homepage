/**
 * 会员兑换码服务
 *
 * 负责与兑换服务器通信：POST /api/redeem
 * 返回真实 SH 激活码，由调用方通过 advanced.activateLicense() 保存和激活。
 *
 * 不得包含：订单、支付、二维码、claimToken、爱发电 API。
 */

const DEFAULT_BASE_URL = "http://192.168.1.106:3001";
const DEFAULT_TIMEOUT_MS = 15000;

export interface RedeemRequest {
    /** SYHPU1 用户识别码，由插件内部自动生成 */
    userCode: string;
    /** 爱发电系统自动发送的会员兑换码 */
    redemptionCode: string;
    /** 插件版本号 */
    pluginVersion: string;
}

export interface RedeemResponse {
    /** 真实 SH 激活码 */
    license: string;
    /** 套餐标识 */
    planKey: string;
    /** 套餐名称 */
    planName: string;
    /** 有效天数，0 表示永久 */
    durationDays: number;
    /** 本次新增天数（续费时） */
    addedDays?: number;
    /** 兑换前剩余天数（续费时） */
    previousRemainingDays?: number;
    /** 是否为续费 */
    isRenewal?: boolean;
    /** 是否为同账号重复兑换 */
    reused: boolean;
    /** 签发日期 YYYYMMDD */
    issuedDate?: string;
    /** 兑换时间 ISO 字符串 */
    redeemedAt: string;
}

export type RedeemErrorCode =
    | "CODE_REPLACED_BY_NEWER_CODE"
    | "MEMBERSHIP_REVOKED"
    | "USER_DELETED"
    | "CODE_BOUND_TO_OTHER_USER"
    | "SERVER_ERROR"
    | "NETWORK_ERROR";

export interface RedeemErrorDetails {
    code: RedeemErrorCode;
    message: string;
    httpStatus?: number;
    businessCode?: string;
}

export class RedeemError extends Error {
    readonly code: RedeemErrorCode;
    readonly httpStatus?: number;
    readonly businessCode?: string;

    constructor(details: RedeemErrorDetails) {
        super(details.message);
        this.name = "RedeemError";
        this.code = details.code;
        this.httpStatus = details.httpStatus;
        this.businessCode = details.businessCode;
    }
}

function normalizeBaseUrl(baseUrl: string): string {
    const trimmed = (baseUrl || "").trim();
    if (!trimmed) return DEFAULT_BASE_URL;
    return trimmed.replace(/\/+$/, "");
}

export async function redeemMembership(
    baseUrl: string,
    request: RedeemRequest,
): Promise<RedeemResponse> {
    const url = `${normalizeBaseUrl(baseUrl)}/api/redeem`;

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
            const businessCode =
                data && typeof data === "object" ? String(data.code || "") : "";
            const serverMessage =
                data && typeof data === "object"
                    ? data.message || data.msg || ""
                    : "";

            const codeMap: Record<string, RedeemErrorCode> = {
                CODE_REPLACED_BY_NEWER_CODE: "CODE_REPLACED_BY_NEWER_CODE",
                MEMBERSHIP_REVOKED: "MEMBERSHIP_REVOKED",
                USER_DELETED: "USER_DELETED",
                CODE_BOUND_TO_OTHER_USER: "CODE_BOUND_TO_OTHER_USER",
            };

            const redeemCode = codeMap[businessCode] || "SERVER_ERROR";
            const messageMap: Record<string, string> = {
                CODE_REPLACED_BY_NEWER_CODE:
                    "该兑换码已被后续兑换码替代，请使用最近一次兑换码找回会员状态。",
                MEMBERSHIP_REVOKED:
                    "当前账号的会员授权已被管理员清理，请使用新的兑换码或联系管理员。",
                USER_DELETED: "当前账号已被管理员删除，请联系管理员恢复。",
                CODE_BOUND_TO_OTHER_USER:
                    "该兑换码已被其他账号使用，请使用购买时对应的账号兑换。",
            };

            throw new RedeemError({
                code: redeemCode,
                message: messageMap[businessCode] || serverMessage || `HTTP ${response.status}`,
                httpStatus: response.status,
                businessCode,
            });
        }

        const payload = data?.data ?? data;

        if (!payload?.license) {
            throw new RedeemError({
                code: "SERVER_ERROR",
                message: "服务器未返回激活码",
            });
        }

        return {
            license: String(payload.license),
            planKey: String(payload.planKey || ""),
            planName: String(payload.planName || ""),
            durationDays: Number(payload.durationDays || 0),
            addedDays: payload.addedDays !== undefined ? Number(payload.addedDays) : undefined,
            previousRemainingDays: payload.previousRemainingDays !== undefined
                ? Number(payload.previousRemainingDays)
                : undefined,
            isRenewal: payload.isRenewal === true,
            reused: payload.reused === true,
            issuedDate: payload.issuedDate ? String(payload.issuedDate) : undefined,
            redeemedAt: String(payload.redeemedAt || new Date().toISOString()),
        };
    } catch (error) {
        if (error instanceof RedeemError) {
            throw error;
        }

        if (error instanceof Error) {
            if (error.name === "AbortError") {
                throw new RedeemError({
                    code: "NETWORK_ERROR",
                    message: "暂时无法连接激活服务器，请稍后重试。",
                });
            }
            if (
                error.message.includes("fetch") ||
                error.message.includes("NetworkError") ||
                error.message.includes("Failed to fetch")
            ) {
                throw new RedeemError({
                    code: "NETWORK_ERROR",
                    message: "暂时无法连接激活服务器，请稍后重试。",
                });
            }
        }

        throw new RedeemError({
            code: "NETWORK_ERROR",
            message: "暂时无法连接激活服务器，请稍后重试。",
        });
    } finally {
        window.clearTimeout(timer);
    }
}

export { normalizeBaseUrl, DEFAULT_BASE_URL };
