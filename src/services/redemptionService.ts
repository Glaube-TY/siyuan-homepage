/**
 * 会员兑换码服务
 *
 * 负责与兑换服务器通信：POST /api/redeem
 * 返回真实 SH 激活码，由调用方通过 advanced.activateLicense() 保存和激活。
 *
 * 不得包含：订单、支付、二维码、claimToken、爱发电 API。
 */

import {
    DEFAULT_BASE_URL,
    DEFAULT_TIMEOUT_MS,
    MembershipServiceError,
    assertValidBaseUrl,
    businessCodeToErrorCode,
    extractRetryAfter,
    fetchWithTimeout,
    membershipMessage,
    normalizeBaseUrl,
    safeParseJson,
    unwrapSuccessData,
    type MembershipServiceErrorCode,
} from "./membershipService";

export { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, normalizeBaseUrl };

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
    addedDays: number;
    /** 兑换前剩余天数（续费时） */
    previousRemainingDays: number;
    /** 是否为续费 */
    isRenewal: boolean;
    /** 是否为同账号重复兑换 */
    reused: boolean;
    /** 当前会员是否为永久 */
    isLifetime: boolean;
    /** 签发日期 YYYYMMDD */
    issuedDate: string;
    /** 兑换时间 ISO 字符串 */
    redeemedAt: string;
}

/** @deprecated 请改用 MembershipServiceErrorCode（兼容旧引用，不新增使用） */
export type RedeemErrorCode = Exclude<
    MembershipServiceErrorCode,
    | "INVALID_USER_CODE"
    | "SIGNING_KEY_UNAVAILABLE"
    | "SERVER_PROTOCOL_ERROR"
    | "RATE_LIMITED"
    | "TIMEOUT"
>;

/** @deprecated 请改用 MembershipServiceError */
export class RedeemError extends Error {
    readonly code: RedeemErrorCode;
    readonly httpStatus?: number;
    readonly businessCode?: string;

    constructor(details: {
        code: RedeemErrorCode;
        message: string;
        httpStatus?: number;
        businessCode?: string;
    }) {
        super(details.message);
        this.name = "RedeemError";
        this.code = details.code;
        this.httpStatus = details.httpStatus;
        this.businessCode = details.businessCode;
    }
}

const ALLOWED_PLAN_KEYS = new Set(["month", "year", "lifetime", "custom"]);

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isValidIssuedDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{8}$/.test(value)) return false;
    const year = Number(value.substring(0, 4));
    const month = Number(value.substring(4, 6));
    const day = Number(value.substring(6, 8));
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidIsoDate(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) return false;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return false;
    try {
        return new Date(timestamp).toISOString() === value;
    } catch {
        return false;
    }
}

function isValidSH(value: unknown): value is string {
    return isNonEmptyString(value) && value.trim().startsWith("SH.");
}

function protocolError(message = "服务器返回的兑换结果格式异常。"): MembershipServiceError {
    return new MembershipServiceError({
        code: "SERVER_PROTOCOL_ERROR",
        message,
    });
}

function parseRedeemPayload(payload: any): RedeemResponse {
    if (!payload || typeof payload !== "object") {
        throw protocolError();
    }

    const license = payload.license;
    if (!isValidSH(license)) {
        throw protocolError("服务器返回的授权不是有效的 SH 激活码。");
    }

    const planKey = payload.planKey;
    if (!isNonEmptyString(planKey) || !ALLOWED_PLAN_KEYS.has(planKey)) {
        throw protocolError("服务器返回的套餐标识无效。");
    }

    const planName = payload.planName;
    if (!isNonEmptyString(planName)) {
        throw protocolError("服务器返回的套餐名称无效。");
    }

    if (!isNonNegativeInteger(payload.durationDays)) {
        throw protocolError("服务器返回的有效天数无效。");
    }

    if (typeof payload.isLifetime !== "boolean") {
        throw protocolError("服务器返回的永久会员标识无效。");
    }

    if (payload.isLifetime !== (payload.durationDays === 0)) {
        throw protocolError("服务器返回的永久会员标识与有效天数不一致。");
    }

    if (typeof payload.isRenewal !== "boolean") {
        throw protocolError("服务器返回的续费标识无效。");
    }

    if (typeof payload.reused !== "boolean") {
        throw protocolError("服务器返回的重复兑换标识无效。");
    }

    if (payload.reused === true) {
        // 重复找回只校验当前状态一致性，不根据历史 planKey 强制判断会员类型
        if (payload.addedDays !== 0) {
            throw protocolError("重复找回响应的新增天数必须为 0。");
        }
        if (payload.isRenewal !== false) {
            throw protocolError("重复找回响应不能标记为续费。");
        }
    } else {
        // 正常兑换时，历史 planKey 与当前状态应一致
        if (planKey === "lifetime") {
            if (!payload.isLifetime) {
                throw protocolError("永久套餐响应必须标记为永久会员。");
            }
        } else {
            if (payload.isLifetime) {
                throw protocolError("非永久套餐响应不能标记为永久会员。");
            }
        }
    }

    if (!isNonNegativeInteger(payload.addedDays)) {
        throw protocolError("服务器返回的新增天数无效。");
    }

    if (!isNonNegativeInteger(payload.previousRemainingDays)) {
        throw protocolError("服务器返回的兑换前剩余天数无效。");
    }

    if (!isValidIssuedDate(payload.issuedDate)) {
        throw protocolError("服务器返回的签发日期无效。");
    }

    if (!isValidIsoDate(payload.redeemedAt)) {
        throw protocolError("服务器返回的兑换时间无效。");
    }

    return {
        license: license.trim(),
        planKey,
        planName,
        durationDays: payload.durationDays,
        addedDays: payload.addedDays,
        previousRemainingDays: payload.previousRemainingDays,
        isRenewal: payload.isRenewal,
        reused: payload.reused,
        isLifetime: payload.isLifetime,
        issuedDate: payload.issuedDate,
        redeemedAt: payload.redeemedAt,
    };
}

export async function redeemMembership(
    baseUrl: string,
    request: RedeemRequest,
): Promise<RedeemResponse> {
    const normalized = assertValidBaseUrl(baseUrl);

    const response = await fetchWithTimeout(
        `${normalized}/api/redeem`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(request),
        },
        DEFAULT_TIMEOUT_MS,
        "redeem",
    );

    const data = await safeParseJson(response, "redeem");

    if (!response.ok) {
        const businessCode =
            data && typeof data === "object" ? String(data.code || "") : undefined;
        const httpStatus = response.status;

        if (httpStatus === 429) {
            const retryAfter = extractRetryAfter(response);
            throw new MembershipServiceError({
                code: "RATE_LIMITED",
                message: membershipMessage("RATE_LIMITED", { retryAfter, context: "redeem" }),
                httpStatus,
                retryAfter,
                businessCode,
            });
        }

        const errorCode = businessCodeToErrorCode(businessCode);
        throw new MembershipServiceError({
            code: errorCode,
            message: membershipMessage(errorCode, { context: "redeem" }),
            httpStatus,
            businessCode,
        });
    }

    const payload = unwrapSuccessData(data, response.status);
    return parseRedeemPayload(payload);
}
