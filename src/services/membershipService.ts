/**
 * 会员激活/同步/连接公共网络层
 *
 * 提供：
 * - 统一会员服务错误模型 MembershipServiceError
 * - 严格 normalizeBaseUrl（仅允许 http/https origin，拒绝凭据/query/hash）
 * - 共享 fetchWithTimeout / safeParseJson
 * - 服务连接状态探测 testServiceConnection
 * - 激活确认 best-effort confirmActivationBestEffort
 *
 * 不得包含：订单、支付、二维码、claimToken、爱发电 API。
 * 不得保存兑换码、SH、USER_CODE 或服务器响应。
 */

export const DEFAULT_BASE_URL = "http://192.168.1.106:3001";
export const DEFAULT_TIMEOUT_MS = 15000;
export const MAX_MEMBERSHIP_RESPONSE_BYTES = 64 * 1024;

export type MembershipServiceErrorCode =
    | "NETWORK_ERROR"
    | "TIMEOUT"
    | "SERVER_PROTOCOL_ERROR"
    | "RATE_LIMITED"
    | "REDEMPTION_CODE_NOT_FOUND"
    | "CODE_BOUND_TO_OTHER_USER"
    | "CODE_REPLACED_BY_NEWER_CODE"
    | "MEMBERSHIP_REVOKED"
    | "MEMBERSHIP_ALREADY_LIFETIME"
    | "BOUND_LICENSE_UNAVAILABLE"
    | "ACTIVE_MEMBERSHIP_NOT_FOUND"
    | "RECOVERY_LICENSE_UNAVAILABLE"
    | "INVALID_LICENSE"
    | "LICENSE_EXPIRED"
    | "SERVER_MEMBERSHIP_ALREADY_EXISTS"
    | "LICENSE_NOT_ACTIVE"
    | "RESTORE_RESTART_PENDING"
    | "DATABASE_PERSIST_RESTORE_FAILED"
    | "INVALID_REDEMPTION_CODE_FORMAT"
    | "REDEMPTION_CODE_ALREADY_REDEEMED"
    | "INVALID_USER_CODE"
    | "SIGNING_KEY_UNAVAILABLE"
    | "DATABASE_WRITE_BLOCKED"
    | "DATABASE_PERSIST_FAILED"
    | "INTERNAL_ERROR";

export interface MembershipServiceErrorDetails {
    code: MembershipServiceErrorCode;
    message: string;
    httpStatus?: number;
    retryAfter?: number;
    businessCode?: string;
}

export class MembershipServiceError extends Error {
    readonly code: MembershipServiceErrorCode;
    readonly httpStatus?: number;
    readonly retryAfter?: number;
    readonly businessCode?: string;

    constructor(details: MembershipServiceErrorDetails) {
        super(details.message);
        this.name = "MembershipServiceError";
        this.code = details.code;
        this.httpStatus = details.httpStatus;
        this.retryAfter = details.retryAfter;
        this.businessCode = details.businessCode;
    }
}

export function normalizeBaseUrl(baseUrl: string): string {
    const trimmed = (baseUrl || "").trim();
    if (!trimmed) return "";

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return "";
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (url.search || url.hash) return "";

    return url.origin;
}

export function extractRetryAfter(response: Response): number | undefined {
    const raw = response.headers.get("retry-after");
    if (!raw) return undefined;
    const value = Number(raw.trim());
    if (Number.isFinite(value) && value >= 0) return Math.ceil(value);
    return undefined;
}

export function businessCodeToErrorCode(businessCode: string | undefined): MembershipServiceErrorCode {
    const code = typeof businessCode === "string" ? businessCode.trim().toUpperCase() : "";
    switch (code) {
        case "REDEMPTION_CODE_NOT_FOUND":
            return "REDEMPTION_CODE_NOT_FOUND";
        case "CODE_BOUND_TO_OTHER_USER":
            return "CODE_BOUND_TO_OTHER_USER";
        case "CODE_REPLACED_BY_NEWER_CODE":
            return "CODE_REPLACED_BY_NEWER_CODE";
        case "MEMBERSHIP_REVOKED":
            return "MEMBERSHIP_REVOKED";
        case "MEMBERSHIP_ALREADY_LIFETIME":
            return "MEMBERSHIP_ALREADY_LIFETIME";
        case "BOUND_LICENSE_UNAVAILABLE":
            return "BOUND_LICENSE_UNAVAILABLE";
        case "ACTIVE_MEMBERSHIP_NOT_FOUND":
            return "ACTIVE_MEMBERSHIP_NOT_FOUND";
        case "RECOVERY_LICENSE_UNAVAILABLE":
            return "RECOVERY_LICENSE_UNAVAILABLE";
        case "INVALID_LICENSE":
            return "INVALID_LICENSE";
        case "LICENSE_EXPIRED":
            return "LICENSE_EXPIRED";
        case "SERVER_MEMBERSHIP_ALREADY_EXISTS":
            return "SERVER_MEMBERSHIP_ALREADY_EXISTS";
        case "LICENSE_NOT_ACTIVE":
            return "LICENSE_NOT_ACTIVE";
        case "RESTORE_RESTART_PENDING":
            return "RESTORE_RESTART_PENDING";
        case "DATABASE_PERSIST_RESTORE_FAILED":
            return "DATABASE_PERSIST_RESTORE_FAILED";
        case "INVALID_REDEMPTION_CODE_FORMAT":
            return "INVALID_REDEMPTION_CODE_FORMAT";
        case "REDEMPTION_CODE_ALREADY_REDEEMED":
            return "REDEMPTION_CODE_ALREADY_REDEEMED";
        case "INVALID_USER_CODE":
            return "INVALID_USER_CODE";
        case "SIGNING_KEY_UNAVAILABLE":
            return "SIGNING_KEY_UNAVAILABLE";
        case "DATABASE_WRITE_BLOCKED":
            return "DATABASE_WRITE_BLOCKED";
        case "DATABASE_PERSIST_FAILED":
            return "DATABASE_PERSIST_FAILED";
        default:
            return "INTERNAL_ERROR";
    }
}

function formatRetryAfter(retryAfter: number | undefined): string | undefined {
    if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0) {
        return `${retryAfter}`;
    }
    return undefined;
}

export function membershipMessage(
    code: MembershipServiceErrorCode,
    options?: { retryAfter?: number; context?: MembershipOperationContext }
): string {
    switch (code) {
        case "REDEMPTION_CODE_NOT_FOUND":
            return "兑换码不存在、输入错误或已经失效，请检查后重试。";
        case "CODE_BOUND_TO_OTHER_USER":
            return "该兑换码已被其他账号使用，请使用购买时对应的账号兑换。";
        case "CODE_REPLACED_BY_NEWER_CODE":
            return "该兑换码已被后续兑换码替代，请使用最近一次兑换码找回会员状态。";
        case "MEMBERSHIP_REVOKED":
            return "当前账号的会员授权已被管理员清理，请使用新的兑换码或联系管理员。";
        case "MEMBERSHIP_ALREADY_LIFETIME":
            return "当前账号已经是永久会员，本次兑换码未被使用。";
        case "BOUND_LICENSE_UNAVAILABLE":
            return "该找回兑换码对应的会员授权已被清理，请使用新的兑换码或联系作者。";
        case "ACTIVE_MEMBERSHIP_NOT_FOUND":
            return "服务器中未找到当前账号的有效会员。如已购买，请输入兑换码激活或联系作者。";
        case "RECOVERY_LICENSE_UNAVAILABLE":
            return "服务器中未找到当前账号的有效会员。如已购买，请输入兑换码激活或联系作者。";
        case "INVALID_LICENSE":
            switch (options?.context) {
                case "registration":
                    return "本地 SH 授权验证失败，无法登记到会员服务器。";
                case "sync":
                    return "当前本地会员授权验证失败，无法同步服务器状态。";
                case "recovery":
                    return "服务器返回的会员授权未通过本地验证，请稍后重试或联系作者。";
                case "redeem":
                    return "服务器返回的会员授权未通过本地验证，请保留当前兑换码并联系作者，不要重新购买。";
                default:
                    return "本地 SH 授权验证失败，无法登记到会员服务器。";
            }
        case "LICENSE_EXPIRED":
            switch (options?.context) {
                case "registration":
                    return "当前本地 SH 已过期，无法登记到会员服务器。";
                case "sync":
                    return "当前本地会员授权已过期，无法同步服务器状态。";
                case "recovery":
                    return "服务器返回的会员授权已过期，请使用新的兑换码或联系作者。";
                case "redeem":
                    return "服务器返回的会员授权已过期，请保留当前兑换码并联系作者，不要重新购买。";
                default:
                    return "当前本地 SH 已过期，无法登记到会员服务器。";
            }
        case "LICENSE_NOT_ACTIVE":
            switch (options?.context) {
                case "registration":
                case "sync":
                    return "该本地 SH 在服务器中已不是当前有效授权，请点击刷新会员状态获取服务器当前授权。";
                case "recovery":
                    return "服务器返回的会员授权已不是当前有效授权，请使用新的兑换码或联系作者。";
                case "redeem":
                    return "服务器返回的会员授权已不是当前有效授权，请保留当前兑换码并联系作者，不要重新购买。";
                default:
                    return "该本地 SH 在服务器中已不是当前有效授权，请点击刷新会员状态获取服务器当前授权。";
            }
        case "SERVER_MEMBERSHIP_ALREADY_EXISTS":
            return "服务器已有当前账号的会员授权，请点击刷新会员状态。";
        case "RESTORE_RESTART_PENDING":
            return "激活服务器正在恢复数据并重启，请稍后重试。";
        case "DATABASE_PERSIST_RESTORE_FAILED":
            return "激活服务器数据库暂时不可用，请稍后联系作者。";
        case "INVALID_REDEMPTION_CODE_FORMAT":
            return "兑换码格式不正确，请检查复制内容。";
        case "REDEMPTION_CODE_ALREADY_REDEEMED":
            return "该兑换码已经被使用，请使用当前账号最近一次兑换码找回，或点击刷新/恢复会员状态。";
        case "INVALID_USER_CODE":
            return "当前账号识别信息无效，请重新登录思源后重试。";
        case "SIGNING_KEY_UNAVAILABLE":
            return "激活服务暂未完成配置，请联系作者。";
        case "DATABASE_WRITE_BLOCKED":
        case "DATABASE_PERSIST_FAILED":
            return options?.context === "redeem" || !options?.context
                ? "激活服务器正在维护，请稍后重试。本次不要购买新兑换码。"
                : "激活服务器正在维护，请稍后重试。";
        case "RATE_LIMITED":
            return options?.retryAfter
                ? `请求过于频繁，请在 ${formatRetryAfter(options.retryAfter)} 秒后重试。`
                : "请求过于频繁，请稍后重试。";
        case "TIMEOUT":
        case "NETWORK_ERROR":
            switch (options?.context) {
                case "registration":
                    return "暂时无法连接会员服务器，本地授权仍可离线使用。";
                case "recovery":
                case "sync":
                    return "暂时无法连接激活服务器，本地会员不会受到影响，请稍后重试。";
                case "connection_test":
                    return "连接超时或地址错误。";
                default:
                    return "暂时无法连接激活服务器。若刚才已经提交兑换，请稍后重新输入同一兑换码找回，不要购买新兑换码。";
            }
        case "SERVER_PROTOCOL_ERROR":
            return "服务器响应格式异常，请稍后重试。";
        case "INTERNAL_ERROR":
        default:
            return "激活服务器出现内部错误，请稍后重试。";
    }
}

export async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    context?: MembershipOperationContext,
): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        return response;
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new MembershipServiceError({
                code: "TIMEOUT",
                message: membershipMessage("TIMEOUT", { context }),
            });
        }

        const isNetworkError =
            error instanceof Error &&
            (/fetch|NetworkError|Failed to fetch/i.test(error.message) ||
                /networkerror|failed to fetch/i.test(error.message));

        if (isNetworkError) {
            throw new MembershipServiceError({
                code: "NETWORK_ERROR",
                message: membershipMessage("NETWORK_ERROR", { context }),
            });
        }

        throw new MembershipServiceError({
            code: "NETWORK_ERROR",
            message: membershipMessage("NETWORK_ERROR", { context }),
        });
    } finally {
        window.clearTimeout(timer);
    }
}

class ResponseBodyTimeoutError extends Error {
    constructor() {
        super("response body read timeout");
        this.name = "ResponseBodyTimeoutError";
    }
}

export async function safeParseJson(
    response: Response,
    context?: MembershipOperationContext,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<any> {
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader.trim());
        if (Number.isFinite(contentLength) && contentLength > MAX_MEMBERSHIP_RESPONSE_BYTES) {
            response.body?.cancel().catch(() => {});
            throw new MembershipServiceError({
                code: "SERVER_PROTOCOL_ERROR",
                message: membershipMessage("SERVER_PROTOCOL_ERROR"),
                httpStatus: response.status,
            });
        }
    }

    let raw: string;
    try {
        raw = await readResponseTextWithLimit(response, MAX_MEMBERSHIP_RESPONSE_BYTES, timeoutMs);
    } catch (error) {
        if (error instanceof ResponseBodyTimeoutError) {
            throw new MembershipServiceError({
                code: "TIMEOUT",
                message: membershipMessage("TIMEOUT", { context }),
                httpStatus: response.status,
            });
        }
        throw new MembershipServiceError({
            code: "SERVER_PROTOCOL_ERROR",
            message: membershipMessage("SERVER_PROTOCOL_ERROR"),
            httpStatus: response.status,
        });
    }

    if (!raw.trim()) {
        throw new MembershipServiceError({
            code: "SERVER_PROTOCOL_ERROR",
            message: membershipMessage("SERVER_PROTOCOL_ERROR"),
            httpStatus: response.status,
        });
    }

    try {
        return JSON.parse(raw);
    } catch {
        throw new MembershipServiceError({
            code: "SERVER_PROTOCOL_ERROR",
            message: membershipMessage("SERVER_PROTOCOL_ERROR"),
            httpStatus: response.status,
        });
    }
}

async function readResponseTextWithLimit(
    response: Response,
    limitBytes: number,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
    const body = response.body;
    if (!body) {
        return "";
    }

    const deadline = Date.now() + timeoutMs;
    let timer: number | undefined;

    function remainingMs(): number {
        return Math.max(0, deadline - Date.now());
    }

    function startBodyTimeout(): Promise<never> {
        return new Promise((_, reject) => {
            const ms = remainingMs();
            if (ms <= 0) {
                reject(new ResponseBodyTimeoutError());
                return;
            }
            timer = window.setTimeout(() => {
                timer = undefined;
                reject(new ResponseBodyTimeoutError());
            }, ms);
        });
    }

    function clearBodyTimer(): void {
        if (typeof timer === "number") {
            window.clearTimeout(timer);
            timer = undefined;
        }
    }

    if (typeof body.getReader === "function") {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        try {
            reader = body.getReader();

            while (true) {
                if (remainingMs() <= 0) {
                    throw new ResponseBodyTimeoutError();
                }

                const { done, value } = await Promise.race([
                    reader.read(),
                    startBodyTimeout(),
                ]);
                clearBodyTimer();

                if (done) break;

                if (value && value.length > 0) {
                    totalBytes += value.length;
                    if (totalBytes > limitBytes) {
                        throw new Error("response too large");
                    }
                    chunks.push(value);
                }
            }

            return decoder.decode(concatUint8Arrays(chunks));
        } catch (error) {
            await reader?.cancel().catch(() => {});
            throw error;
        } finally {
            clearBodyTimer();
            try {
                reader?.releaseLock();
            } catch {
                // ignore
            }
        }
    }

    // 兼容路径：不支持 ReadableStream 的运行环境
    try {
        if (remainingMs() <= 0) {
            throw new ResponseBodyTimeoutError();
        }
        const buffer = await Promise.race([
            response.arrayBuffer(),
            startBodyTimeout(),
        ]);
        clearBodyTimer();
        if (buffer.byteLength > limitBytes) {
            throw new Error("response too large");
        }
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (error) {
        clearBodyTimer();
        // 兼容路径同样应尽力释放响应体；取消失败不能覆盖原始超时或协议错误。
        response.body?.cancel().catch(() => {});
        throw error;
    }
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
    if (chunks.length === 0) return new Uint8Array(0);
    if (chunks.length === 1) return chunks[0];

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

export function assertValidBaseUrl(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) {
        throw new MembershipServiceError({
            code: "SERVER_PROTOCOL_ERROR",
            message: "服务器地址格式不正确，请检查协议和地址。",
        });
    }
    return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 统一解包会员接口成功响应。
 * 正式协议统一为 { code: 0, data: { ... } }，不满足时抛出 SERVER_PROTOCOL_ERROR。
 */
export function unwrapSuccessData(
    responseJson: unknown,
    httpStatus?: number,
): Record<string, unknown> {
    if (!isPlainObject(responseJson) || responseJson.code !== 0 || !isPlainObject(responseJson.data)) {
        throw new MembershipServiceError({
            code: "SERVER_PROTOCOL_ERROR",
            message: membershipMessage("SERVER_PROTOCOL_ERROR"),
            httpStatus,
        });
    }
    return responseJson.data as Record<string, unknown>;
}

// ── 服务连接探测 ───────────────────────────────────────────────────────────

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export interface ServiceStatusResult {
    status: "ok" | "not_ready" | "incompatible" | "unreachable";
    message: string;
    details?: {
        online: boolean;
        ready: boolean;
        canIssueLicense: boolean;
        capabilities: {
            redemptionV1?: boolean;
            licenseSyncV1?: boolean;
            identityRecoveryV1?: boolean;
            existingSignedLicenseRegistrationV1?: boolean;
            activationConfirmV1?: boolean;
        };
        supportedPlans?: string[];
    };
}

export async function testServiceConnection(baseUrl: string): Promise<ServiceStatusResult> {
    let normalized: string;
    try {
        normalized = assertValidBaseUrl(baseUrl);
    } catch {
        return {
            status: "unreachable",
            message: "地址格式不正确，请检查协议和地址。",
        };
    }

    try {
        const response = await fetchWithTimeout(
            `${normalized}/api/status`,
            {
                method: "GET",
                headers: { Accept: "application/json" },
            },
            DEFAULT_TIMEOUT_MS
        );

        let data: unknown;
        try {
            data = await safeParseJson(response, "connection_test");
        } catch (error) {
            if (error instanceof MembershipServiceError) {
                if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
                    return {
                        status: "unreachable",
                        message: membershipMessage(error.code, { context: "connection_test" }),
                    };
                }
            }
            return {
                status: "incompatible",
                message: "该地址不是兼容的会员激活服务器。",
            };
        }

        const businessCode = isPlainObject(data) ? String(data.code || "") : undefined;

        // 503 维护状态优先处理：返回具体维护或未就绪提示，不暴露内部 message
        if (response.status === 503) {
            const codeUpper = businessCode?.trim().toUpperCase();
            if (
                codeUpper === "RESTORE_RESTART_PENDING" ||
                codeUpper === "DATABASE_WRITE_BLOCKED" ||
                codeUpper === "SIGNING_KEY_UNAVAILABLE"
            ) {
                const errorCode = businessCodeToErrorCode(codeUpper);
                return {
                    status: "not_ready",
                    message: membershipMessage(errorCode),
                };
            }
        }

        // 严格外层协议校验：正式协议统一为 { code: 0, data: { ... } }
        if (!isPlainObject(data) || data.code !== 0 || !isPlainObject(data.data)) {
            return {
                status: "incompatible",
                message: "该地址不是兼容的会员激活服务器。",
            };
        }

        const payload = data.data;

        if (
            payload.service !== "siyuan-homepage-license-server" ||
            payload.apiVersion !== 2 ||
            typeof payload.online !== "boolean" ||
            typeof payload.ready !== "boolean" ||
            typeof payload.canIssueLicense !== "boolean" ||
            typeof payload.databaseReadable !== "boolean" ||
            typeof payload.databaseWriteBlocked !== "boolean" ||
            typeof payload.restoreRestartPending !== "boolean" ||
            !isPlainObject(payload.capabilities) ||
            !isStringArray(payload.supportedPlans)
        ) {
            return {
                status: "incompatible",
                message: "该地址不是兼容的会员激活服务器。",
            };
        }

        const capabilities = payload.capabilities as {
            redemptionV1?: boolean;
            licenseSyncV1?: boolean;
            identityRecoveryV1?: boolean;
            existingSignedLicenseRegistrationV1?: boolean;
            activationConfirmV1?: boolean;
        };

        const supportedPlans = payload.supportedPlans.map((plan) => plan.trim().toLowerCase());
        const requiredPlans = ["month", "year", "lifetime"];
        const hasAllRequiredPlans = requiredPlans.every((plan) => supportedPlans.includes(plan));

        const hasRedemption = capabilities.redemptionV1 === true;
        const hasSync = capabilities.licenseSyncV1 === true;
        const hasIdentityRecovery = capabilities.identityRecoveryV1 === true;
        const hasExistingRegistration = capabilities.existingSignedLicenseRegistrationV1 === true;
        const hasConfirm = capabilities.activationConfirmV1 === true;

        const details = {
            online: payload.online,
            ready: payload.ready,
            canIssueLicense: payload.canIssueLicense,
            capabilities,
            supportedPlans: payload.supportedPlans,
        };

        // 协议能力校验：缺少标准套餐或仍返回 quarter 均视为不兼容
        if (!hasAllRequiredPlans || supportedPlans.includes("quarter")) {
            return {
                status: "incompatible",
                message: "该地址不是兼容的会员激活服务器。",
                details,
            };
        }

        if (
            !hasRedemption ||
            !hasSync ||
            !hasIdentityRecovery ||
            !hasExistingRegistration ||
            !hasConfirm
        ) {
            return {
                status: "incompatible",
                message: "该地址不是兼容的会员激活服务器。",
                details,
            };
        }

        // 服务器未就绪原因按优先级展示
        if (payload.restoreRestartPending) {
            return {
                status: "not_ready",
                message: "激活服务器正在恢复数据并重启，请稍后重试。",
                details,
            };
        }
        if (!payload.databaseReadable) {
            return {
                status: "not_ready",
                message: "激活服务器数据库暂时不可用，请联系作者。",
                details,
            };
        }
        if (payload.databaseWriteBlocked) {
            return {
                status: "not_ready",
                message: "激活服务器数据库已进入保护状态，请稍后联系作者。",
                details,
            };
        }
        if (!payload.canIssueLicense) {
            return {
                status: "not_ready",
                message: "服务器在线，但尚未配置兼容的 SH 私钥。",
                details,
            };
        }
        if (!payload.ready) {
            return {
                status: "not_ready",
                message: "激活服务器暂未就绪，请稍后重试。",
                details,
            };
        }
        if (!payload.online) {
            return {
                status: "unreachable",
                message: "服务器当前不在线。",
                details,
            };
        }

        return {
            status: "ok",
            message: "连接正常，可兑换、同步、恢复会员和登记已有 SH。",
            details,
        };
    } catch (error) {
        if (error instanceof MembershipServiceError) {
            if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
                return {
                    status: "unreachable",
                    message: "连接超时或地址错误。",
                };
            }
            // 协议解析类错误统一归类为不兼容，避免被误解为网络断开
            return {
                status: "incompatible",
                message: "该地址不是兼容的会员激活服务器。",
            };
        }
        return {
            status: "unreachable",
            message: "连接超时或地址错误。",
        };
    }
}

export type MembershipOperationContext =
    | "redeem"
    | "recovery"
    | "sync"
    | "registration"
    | "connection_test";

// ── 账号身份恢复（仅由会员页用户手动触发）────────────────────────────────────

export interface RecoverMembershipByIdentityRequest {
    /** 当前思源账号生成的 SYHPU1 识别码 */
    userCode: string;
    pluginVersion: string;
}

export interface RecoverMembershipByIdentityResponse {
    status: "active";
    license: string;
    durationDays: number;
    issuedDate: string;
    isLifetime: boolean;
    remainingDays: number;
    dueDate: string | null;
    recovered: true;
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isValidCalendarDate(value: unknown, format: "yyyymmdd" | "yyyy-mm-dd"): value is string {
    if (typeof value !== "string") return false;

    let year: number;
    let month: number;
    let day: number;

    if (format === "yyyymmdd") {
        if (!/^\d{8}$/.test(value)) return false;
        year = Number(value.substring(0, 4));
        month = Number(value.substring(4, 6));
        day = Number(value.substring(6, 8));
    } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        [year, month, day] = value.split("-").map(Number);
    }

    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

export interface ActiveMembershipProtocolFields {
    durationDays: number;
    issuedDate: string;
    isLifetime: boolean;
    remainingDays: number;
    dueDate: string | null;
}

/** 通过固定公钥验签后的 SH 所携带的本地会员事实。 */
export interface SignedLicenseMembershipMetadata {
    durationDays: number;
    issuedDate: string;
    isLifetime: boolean;
}

/** 服务器仅作协议展示的会员字段；登记接口不返回 isLifetime。 */
export interface ServerMembershipMetadata {
    durationDays: number;
    issuedDate: string;
    isLifetime?: boolean;
}

/**
 * 服务器展示字段只能与已验签 SH 相互印证，绝不能覆盖本地会员事实。
 */
export function isServerMembershipMetadataConsistent(
    signed: SignedLicenseMembershipMetadata,
    server: ServerMembershipMetadata,
): boolean {
    return (
        signed.durationDays === server.durationDays &&
        signed.issuedDate === server.issuedDate &&
        (server.isLifetime === undefined || signed.isLifetime === server.isLifetime)
    );
}

/** 严格校验服务器对永久和有限会员使用的统一字段契约。 */
export function parseActiveMembershipProtocolFields(
    payload: any,
    httpStatus?: number,
): ActiveMembershipProtocolFields {
    const isBaseValid =
        !isNonNegativeInteger(payload?.durationDays) ||
        !isValidCalendarDate(payload?.issuedDate, "yyyymmdd") ||
        typeof payload?.isLifetime !== "boolean" ||
        !isNonNegativeInteger(payload?.remainingDays);
    const isLifetimeValid =
        payload?.durationDays === 0 &&
        payload?.isLifetime === true &&
        payload?.remainingDays === 0 &&
        payload?.dueDate === null;
    const isLimitedValid =
        Number.isInteger(payload?.durationDays) &&
        payload?.durationDays > 0 &&
        payload?.isLifetime === false &&
        Number.isInteger(payload?.remainingDays) &&
        payload?.remainingDays > 0 &&
        isValidCalendarDate(payload?.dueDate, "yyyy-mm-dd");

    if (isBaseValid || (!isLifetimeValid && !isLimitedValid)) {
        throw new MembershipServiceError({
            code: "SERVER_PROTOCOL_ERROR",
            message: membershipMessage("SERVER_PROTOCOL_ERROR"),
            httpStatus,
        });
    }

    return {
        durationDays: payload.durationDays,
        issuedDate: payload.issuedDate,
        isLifetime: payload.isLifetime,
        remainingDays: payload.remainingDays,
        dueDate: payload.dueDate,
    };
}

/**
 * 仅根据当前 SYHPU1 查询服务器已有的有效会员，不创建会员、不续期、不使用兑换码。
 * 服务端返回的 SH 必须由调用方再经过 advanced.activateLicense() 本地验签和保存。
 */
export async function recoverMembershipByIdentity(
    baseUrl: string,
    request: RecoverMembershipByIdentityRequest,
): Promise<RecoverMembershipByIdentityResponse> {
    const normalized = assertValidBaseUrl(baseUrl);
    let response: Response;
    try {
        response = await fetchWithTimeout(
            `${normalized}/api/licenses/recover`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    userCode: request.userCode,
                    pluginVersion: request.pluginVersion,
                }),
            },
            DEFAULT_TIMEOUT_MS,
            "recovery",
        );
    } catch (error) {
        if (error instanceof MembershipServiceError) {
            throw new MembershipServiceError({
                code: error.code,
                message: membershipMessage(error.code, {
                    retryAfter: error.retryAfter,
                    context: "recovery",
                }),
                httpStatus: error.httpStatus,
                retryAfter: error.retryAfter,
                businessCode: error.businessCode,
            });
        }
        throw error;
    }

    const data = await safeParseJson(response, "recovery");

    if (!response.ok) {
        const businessCode = isPlainObject(data) ? String(data.code || "") : undefined;
        const httpStatus = response.status;

        if (httpStatus === 429) {
            const retryAfter = extractRetryAfter(response);
            throw new MembershipServiceError({
                code: "RATE_LIMITED",
                message: membershipMessage("RATE_LIMITED", { retryAfter, context: "recovery" }),
                httpStatus,
                retryAfter,
                businessCode,
            });
        }

        const errorCode = businessCodeToErrorCode(businessCode);
        throw new MembershipServiceError({
            code: errorCode,
            message: membershipMessage(errorCode, { context: "recovery" }),
            httpStatus,
            businessCode,
        });
    }

    const payload = unwrapSuccessData(data, response.status);
    if (
        payload.status !== "active" ||
        !isNonEmptyString(payload.license) ||
        !String(payload.license).trim().startsWith("SH.") ||
        payload.recovered !== true
    ) {
        throw new MembershipServiceError({
            code: "SERVER_PROTOCOL_ERROR",
            message: membershipMessage("SERVER_PROTOCOL_ERROR", { context: "recovery" }),
            httpStatus: response.status,
        });
    }

    const activeFields = parseActiveMembershipProtocolFields(payload, response.status);

    return {
        status: "active",
        license: payload.license.trim(),
        ...activeFields,
        recovered: true,
    };
}

// ── 既有 SH 登记（仅会员设置页单次 best-effort 或用户手动刷新）──────────────

export interface RegisterExistingSignedLicenseRequest {
    /** 当前思源账号生成的 SYHPU1 识别码 */
    userCode: string;
    /** 本地已验签有效的真实 SH；服务端自行验签并解析 */
    currentLicense: string;
    pluginVersion: string;
}

export interface RegisterExistingSignedLicenseResponse {
    registered: boolean;
    alreadyRegistered: boolean;
    durationDays: number;
    issuedDate: string;
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === "boolean";
}

function registrationProtocolError(
    message = "服务器返回的登记结果格式异常。",
): MembershipServiceError {
    return new MembershipServiceError({
        code: "SERVER_PROTOCOL_ERROR",
        message,
    });
}

/**
 * 将本地有效 SH 纳入服务器管理。不会创建会员、续期或改写本地授权。
 * 调用方须确保 currentLicense 是本地已经通过固定公钥验签的 SH。
 */
export async function registerExistingSignedLicense(
    baseUrl: string,
    request: RegisterExistingSignedLicenseRequest,
): Promise<RegisterExistingSignedLicenseResponse> {
    const normalized = assertValidBaseUrl(baseUrl);
    const response = await fetchWithTimeout(
        `${normalized}/api/licenses/register-existing`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                userCode: request.userCode,
                currentLicense: request.currentLicense,
                pluginVersion: request.pluginVersion,
            }),
        },
        DEFAULT_TIMEOUT_MS,
        "registration",
    );

    const data = await safeParseJson(response, "registration");

    if (!response.ok) {
        const businessCode = isPlainObject(data) ? String(data.code || "") : undefined;
        const httpStatus = response.status;

        if (httpStatus === 429) {
            const retryAfter = extractRetryAfter(response);
            throw new MembershipServiceError({
                code: "RATE_LIMITED",
                message: membershipMessage("RATE_LIMITED", { retryAfter, context: "registration" }),
                httpStatus,
                retryAfter,
                businessCode,
            });
        }

        const errorCode = businessCodeToErrorCode(businessCode);
        throw new MembershipServiceError({
            code: errorCode,
            message: membershipMessage(errorCode, { context: "registration" }),
            httpStatus,
            businessCode,
        });
    }

    const payload = unwrapSuccessData(data, response.status);
    const registered = payload.registered;
    const alreadyRegistered = payload.alreadyRegistered;

    if (!isBoolean(registered) || !isBoolean(alreadyRegistered)) {
        throw registrationProtocolError("服务器返回的登记状态字段类型不正确。");
    }

    if (registered === alreadyRegistered) {
        throw registrationProtocolError("服务器返回的登记状态互相矛盾。");
    }

    // 服务器返回的会员字段仅做协议校验，不用于改写本地授权。
    if (!isNonNegativeInteger(payload.durationDays)) {
        throw registrationProtocolError("服务器返回的有效天数无效。");
    }
    if (!isValidCalendarDate(payload.issuedDate, "yyyymmdd")) {
        throw registrationProtocolError("服务器返回的签发日期无效。");
    }

    return {
        registered,
        alreadyRegistered,
        durationDays: payload.durationDays,
        issuedDate: payload.issuedDate,
    };
}

// ── 激活确认（best-effort）─────────────────────────────────────────────────

export interface ConfirmActivationRequest {
    license: string;
    userId: string;
    pluginVersion: string;
}

/**
 * 在本地 SH 已成功保存后尽力向服务器确认激活。
 * 任何失败都静默忽略：不撤销本地激活、不显示激活失败、不删除 SH、不重试。
 */
export async function confirmActivationBestEffort(
    baseUrl: string,
    request: ConfirmActivationRequest
): Promise<void> {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) return;

    try {
        const response = await fetchWithTimeout(
            `${normalized}/api/activations/confirm`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(request),
            },
            DEFAULT_TIMEOUT_MS
        );

        // HTTP 4xx/5xx 不能当作确认成功，直接静默结束。
        if (!response.ok) {
            response.body?.cancel().catch(() => {});
            return;
        }

        // 确认成功也不处理响应体；安全释放响应体以避免资源泄漏。
        response.body?.cancel().catch(() => {});
    } catch {
        // 静默忽略：确认失败不影响本地授权
    }
}
