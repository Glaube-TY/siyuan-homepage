// @ts-ignore
import * as CryptoJS from 'crypto-js';
import { getSiyuanCloudIdentity } from "@/api";
import {
    type LicenseVerifyResult,
    invalid,
    isSignedLicense,
    verifySignedLicense,
    makeUserCodeV2,
} from "./licenseSy2";
export type { LicenseVerifyResult } from "./licenseSy2";

export interface VIPIdentity {
    USER_NAME: string;
    USER_ID: string;
    USER_CODE: string;
    USER_CODE_V2: string;
    IDENTITY_SOURCE: string;
}

const LEGACY_AES_SECRET_KEY = "tWMV80B17zb91Sps8nXc330yiJGNxDgR";
const LEGACY_COMPAT_END = new Date(2026, 7, 31, 23, 59, 59, 999).getTime();

// 所有 license.syhomepage 的写入共用同一条队列，避免旧快照覆盖新 SH。
let licenseMutationTail: Promise<void> = Promise.resolve();

function runLicenseMutation<T>(task: () => Promise<T>): Promise<T> {
    const result = licenseMutationTail.then(task, task);
    // 队列本身始终恢复为可执行状态；调用方仍收到本任务的真实结果或异常。
    licenseMutationTail = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

function isLegacyAesCompatActive(now = Date.now()): boolean {
    return now <= LEGACY_COMPAT_END;
}

/**
 * 解析激活码 payload（支持用户名包含横杠）
 * 格式：userName-userId-planOrReserved-dueDateStr-glaflagty
 * 其中 userName 可以包含多个横杠
 */
function parseLicensePayload(decryptedCode: string): {
    userName: string;
    userId: string;
    planOrReserved: string;
    dueDateStr: string;
    flag: string;
} | null {
    const parts = decryptedCode.split('-');

    // 至少要有 5 段：userName(可能多段)-userId-planOrReserved-dueDateStr-flag
    if (parts.length < 5) {
        return null;
    }

    // 最后一段必须是 glaflagty
    const flag = parts[parts.length - 1];
    if (flag !== 'glaflagty') {
        return null;
    }

    // 从右往左取固定字段
    const dueDateStr = parts[parts.length - 2];
    const planOrReserved = parts[parts.length - 3];
    const userId = parts[parts.length - 4];

    // 用户名是剩下的所有部分（可能包含横杠）
    const userName = parts.slice(0, parts.length - 4).join('-');

    // 用户名为空视为非法
    if (!userName) {
        return null;
    }

    return {
        userName,
        userId,
        planOrReserved,
        dueDateStr,
        flag
    };
}

function makeVerifyCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return "homepage" + Array(10).fill(0).map(() => {
        return chars[Math.floor(Math.random() * chars.length)];
    }).join("");
}

function parseLegacyDueDate(dateStr: string): Date | null {
    if (!/^\d{8}$/.test(dateStr)) {
        return null;
    }

    const year = Number(dateStr.substring(0, 4));
    const month = Number(dateStr.substring(4, 6));
    const day = Number(dateStr.substring(6, 8));
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function verifyLegacyAesLicenseV1(
    ActivationCode: string,
    USER_NAME: string,
    USER_ID: string
): LicenseVerifyResult {
    // 兼容期结束后直接返回，不再尝试解密或校验旧 AES 激活码。
    if (!isLegacyAesCompatActive()) {
        return invalid(
            40,
            "❌ 旧版激活方式兼容期已结束，请使用会员兑换码迁移新版授权。"
        );
    }

    try {
        const bytes = CryptoJS.AES.decrypt(ActivationCode, LEGACY_AES_SECRET_KEY);
        const decryptedCode = bytes.toString(CryptoJS.enc.Utf8);
        const parsed = parseLicensePayload(decryptedCode);

        if (!parsed) {
            return invalid(41, "❌ 激活码无效！");
        }

        if (parsed.userName !== USER_NAME || parsed.userId !== USER_ID) {
            return invalid(42, "❌ 账户不匹配！");
        }

        const dueDate = parseLegacyDueDate(parsed.dueDateStr);
        if (!dueDate) {
            return invalid(43, "❌ 激活码已过期！");
        }

        // 到期日期当天 23:59:59.999 前仍可用
        const dueDateEnd = new Date(
            dueDate.getFullYear(),
            dueDate.getMonth(),
            dueDate.getDate(),
            23, 59, 59, 999
        );

        if (Date.now() > dueDateEnd.getTime()) {
            return invalid(43, "❌ 激活码已过期！");
        }

        const remainingDays = Math.ceil((dueDateEnd.getTime() - Date.now()) / (1000 * 3600 * 24));

        return {
            valid: true,
            code: 0,
            licenseVersion: 1,
            legacy: true,
            legacyDeprecated: true,
            userInfo: {
                name: parsed.userName,
                userId: parsed.userId,
                due: `${parsed.dueDateStr.substring(0, 4)}年${parseInt(parsed.dueDateStr.substring(4, 6))}月${parseInt(parsed.dueDateStr.substring(6, 8))}日`,
                remainingDays,
                isExpired: false,
                isLifetime: remainingDays > 100000
            }
        };
    } catch (error) {
        console.error("[Homepage] 旧版本 AES 激活码校验失败:", error);
        return invalid(44, "❌ 旧版激活码无效！");
    }
}

export async function updateVIP(): Promise<VIPIdentity> {
    const identity = await getSiyuanCloudIdentity();

    if (!identity.userId) {
        return {
            USER_NAME: "",
            USER_ID: "",
            USER_CODE: "",
            USER_CODE_V2: "",
            IDENTITY_SOURCE: identity.source,
        };
    }

    const USER_NAME = identity.userName;
    const USER_ID = identity.userId;
    const USER_CODE = `${USER_NAME}-${USER_ID}`;
    const userCodeV2 = makeUserCodeV2(USER_NAME, USER_ID);

    const VIPconf: VIPIdentity = {
        USER_NAME: USER_NAME,
        USER_ID: USER_ID,
        USER_CODE: USER_CODE,
        USER_CODE_V2: userCodeV2,
        IDENTITY_SOURCE: identity.source,
    };

    return VIPconf;
}

/**
 * 只读读取本地保存的 ActivationCode。
 * 不修改 verifyLicense / activateLicense / SH 验签核心。
 */
export async function getSavedActivationCode(plugin: any): Promise<string> {
    try {
        const data = await plugin.loadData("license.syhomepage");
        const code = data?.ActivationCode;
        return typeof code === "string" ? code.trim() : "";
    } catch {
        return "";
    }
}

/**
 * 安全提取错误对象中的文本信息，统一用于文件不存在判断。
 * 递归读取一到两层，限制深度避免循环引用。
 * 不输出原始错误对象、插件数据路径或用户数据到 console。
 */
function extractErrorText(error: unknown, depth: number = 0): string {
    if (error === null || error === undefined) return "";
    if (depth > 2) return "";

    if (typeof error === "string") return error;

    if (typeof error !== "object") {
        try {
            return String(error);
        } catch {
            return "";
        }
    }

    const obj = error as Record<string, unknown>;
    const parts: string[] = [];

    // 优先收集直接字符串错误信息字段
    const stringFields = ["message", "msg", "error", "statusText"];
    for (const field of stringFields) {
        const val = obj[field];
        if (typeof val === "string" && val.trim()) {
            parts.push(val);
        }
    }

    // 收集数值类状态字段
    const numericFields = ["code", "status", "statusCode"];
    for (const field of numericFields) {
        const val = obj[field];
        if (typeof val === "number" || (typeof val === "string" && /^\d+$/.test(val))) {
            parts.push(String(val));
        }
    }

    // 递归读取嵌套的 cause/data 字段
    if (depth < 2) {
        for (const field of ["cause", "data"]) {
            const val = obj[field];
            if (val !== null && val !== undefined && typeof val === "object" && val !== error) {
                const nested = extractErrorText(val, depth + 1);
                if (nested) parts.push(nested);
            } else if (typeof val === "string" && val.trim()) {
                parts.push(val);
            }
        }
    }

    if (parts.length === 0) {
        try {
            return String(error);
        } catch {
            return "";
        }
    }

    return parts.join(" ");
}

/**
 * 统一的文件不存在判断，供所有本地授权文件操作复用。
 * 只识别明确的文件不存在语义，不把权限错误、磁盘错误或未知异常当作 missing。
 */
function isFileNotFoundError(error: unknown): boolean {
    if (error === null || error === undefined) return false;

    // 检查 status/statusCode 严格等于 404
    if (typeof error === "object") {
        const obj = error as Record<string, unknown>;
        const status = obj.status ?? obj.statusCode;
        if (status === 404 || status === "404") return true;

        // 递归检查嵌套的 cause/data 中的 404
        const checkNested404 = (val: unknown): boolean => {
            if (val === null || val === undefined || typeof val !== "object") return false;
            const o = val as Record<string, unknown>;
            if (o.status === 404 || o.statusCode === 404 ||
                o.status === "404" || o.statusCode === "404") return true;
            return false;
        };
        if (checkNested404(obj.cause) || checkNested404(obj.data)) return true;
    }

    const errorText = extractErrorText(error);
    if (!errorText) return false;

    // 明确的文件不存在语义判断
    return /ENOENT|no\s+such\s+file(\s+or\s+directory)?|file\s+not\s+found|not\s+found|does\s+not\s+exist|cannot\s+find\s+(the\s+)?file|cannot\s+find\s+path|文件不存在|文件未找到|未找到文件|找不到文件|找不到指定文件/i.test(errorText);
}

export type SavedActivationCodeState =
    | { status: "found"; code: string }
    | { status: "missing" }
    | { status: "error" };

/**
 * 检测 loadData 返回值是否为思源 API 错误响应（而非正常插件数据）。
 * API 错误响应典型特征：code 为非零数值、msg 为非空字符串、无 ActivationCode 字段。
 */
function isApiErrorResponse(data: unknown): boolean {
    if (data === null || data === undefined) return false;
    if (typeof data !== "object" || Array.isArray(data)) return false;
    const obj = data as Record<string, unknown>;
    const hasErrorCode = obj.code !== undefined && obj.code !== null
        && obj.code !== 0 && obj.code !== "0";
    const hasMsg = typeof obj.msg === "string" && obj.msg.trim() !== "";
    const hasActivationCode = typeof obj.ActivationCode === "string";
    return hasErrorCode && hasMsg && !hasActivationCode;
}

/**
 * 严格读取本地授权，供会员恢复和自动登记等关键流程使用。
 * 与兼容的 getSavedActivationCode 不同，读取失败不会伪装成"没有授权"。
 * 处理 plugin.loadData() 抛出的异常和返回的结构化 API 错误响应。
 */
export async function readSavedActivationCodeState(plugin: any): Promise<SavedActivationCodeState> {
    try {
        const data = await plugin.loadData("license.syhomepage");
        if (data == null) return { status: "missing" };

        // 思源 Plugin.loadData() 首次读取不存在的文件时，内部缓存为空字符串，不会抛异常。
        // 空字符串表示当前没有可用的本地授权数据，应进入身份恢复流程。
        if (data === "") return { status: "missing" };

        // 检测 loadData 返回的是否为思源 API 错误响应（如 { code: -1, msg: "文件不存在" }）
        if (isApiErrorResponse(data)) {
            // 按统一文件不存在判断处理：明确是文件不存在返回 missing，其他 API 错误返回 error
            if (isFileNotFoundError(data)) return { status: "missing" };
            return { status: "error" };
        }

        if (typeof data !== "object" || Array.isArray(data)) return { status: "error" };

        const code = data.ActivationCode;
        if (code == null || code === "") return { status: "missing" };
        if (typeof code !== "string") return { status: "error" };

        const normalized = code.trim();
        return normalized ? { status: "found", code: normalized } : { status: "missing" };
    } catch (error) {
        // 文件不存在时返回 missing，真实读取错误保持返回 error。
        if (isFileNotFoundError(error)) return { status: "missing" };
        return { status: "error" };
    }
}

/**
 * 只读验证已保存的新版 SH：不会写入 license.syhomepage 或展示元数据。
 * 旧 AES 兼容验证仍保留在 verifyLicense 中。
 */
export async function verifySavedSignedLicenseReadOnly(
    plugin: any,
    USER_NAME: string,
    USER_ID: string,
): Promise<LicenseVerifyResult> {
    if (!USER_NAME || !USER_ID) return invalid(1, "❌ 请先登录！");

    const saved = await readSavedActivationCodeState(plugin);
    if (saved.status === "error") {
        return invalid(52, "暂时无法读取本地会员授权，请检查思源数据目录后重试。本地会员数据未被修改。");
    }
    if (saved.status === "missing") return invalid(2, "❌ 请输入激活码！");
    if (!isSignedLicense(saved.code)) return invalid(50, "当前本地授权不是新版 SH 激活码。");

    return verifySignedLicense(saved.code, USER_NAME, USER_ID);
}

export type ServerManagedSource =
    | "redemption"
    | "identity_recovery"
    | "license_sync"
    | "existing_signed_sh";

export interface SavedLicenseManagementState {
    matchesExpectedLicense: boolean;
    serverManaged: boolean;
}

export type DeleteLicenseResult = "deleted" | "already_missing" | "license_changed";

function getLicenseHash(license: string): string {
    return CryptoJS.SHA256(license).toString(CryptoJS.enc.Hex);
}

/**
 * 仅返回当前 SH 的管理状态；不会暴露或复制保存的完整 SH。
 * expectedLicense 必须与本地 ActivationCode 完全一致，避免为已切换的授权写入旧标记。
 */
export async function getSavedLicenseManagementState(
    plugin: any,
    expectedLicense: string,
    expectedServiceOrigin: string,
): Promise<SavedLicenseManagementState> {
    try {
        const data = await plugin.loadData("license.syhomepage");
        const savedLicense = typeof data?.ActivationCode === "string"
            ? data.ActivationCode.trim()
            : "";
        const normalizedExpected = String(expectedLicense || "").trim();
        const matchesExpectedLicense = Boolean(savedLicense && savedLicense === normalizedExpected);
        const serverManaged =
            matchesExpectedLicense &&
            data?.serverManaged === true &&
            data?.serverManagedLicenseHash === getLicenseHash(normalizedExpected) &&
            data?.serverManagedServiceOrigin === expectedServiceOrigin;

        return { matchesExpectedLicense, serverManaged };
    } catch {
        return { matchesExpectedLicense: false, serverManaged: false };
    }
}

/**
 * 在服务器确认登记后写入非敏感管理元数据。失败不影响本地 SH 的有效性。
 */
export async function markCurrentLicenseServerManaged(
    plugin: any,
    expectedLicense: string,
    source: ServerManagedSource,
    serviceOrigin: string,
): Promise<boolean> {
    try {
        const normalizedExpected = String(expectedLicense || "").trim();
        return await runLicenseMutation(async () => {
            // 获取写入权后重新读取，绝不使用排队前的旧快照。
            const data = (await plugin.loadData("license.syhomepage")) || {};
            const savedLicense = typeof data.ActivationCode === "string"
                ? data.ActivationCode.trim()
                : "";

            if (!savedLicense || savedLicense !== normalizedExpected) {
                return false;
            }

            await plugin.saveData("license.syhomepage", {
                ...data,
                serverManaged: true,
                serverManagedAt: new Date().toISOString(),
                serverManagedSource: source,
                serverManagedLicenseHash: getLicenseHash(normalizedExpected),
                serverManagedServiceOrigin: serviceOrigin,
            });
            return true;
        });
    } catch {
        return false;
    }
}

export async function verifyLicense(
    plugin: any,
    USER_NAME: string,
    USER_ID: string
): Promise<LicenseVerifyResult> {
    if (!USER_NAME || !USER_ID) {
        return invalid(1, "❌ 请先登录！");
    }

    return runLicenseMutation(async () => {
        // 读取、验签和展示元数据回写在同一写入序列内完成。
        const data = (await plugin.loadData("license.syhomepage")) || {};
        const ActivationCode = data?.ActivationCode;
        if (!ActivationCode) return invalid(2, "❌ 请输入激活码！");

        const code = String(ActivationCode).trim();
        if (!code) return invalid(2, "❌ 请输入激活码！");

        const result = isSignedLicense(code)
            ? verifySignedLicense(code, USER_NAME, USER_ID)
            : verifyLegacyAesLicenseV1(code, USER_NAME, USER_ID);
        if (!result.valid || !result.userInfo) return result;

        const saveData = {
            ...data,
            ActivationCode: code,
            licenseFormat: result.licenseVersion === 2 ? "SH" : "AES",
            licenseVersion: result.licenseVersion,
            legacy: result.legacy === true,
            legacyDeprecated: result.legacyDeprecated === true,
            verifyCode: makeVerifyCode(),
            name: result.userInfo.name,
            userId: result.userInfo.userId,
            due: result.userInfo.due,
            remainingDays: result.userInfo.remainingDays,
            isLifetime: result.userInfo.isLifetime === true,
            durationDays: result.userInfo.durationDays,
            issuedDate: result.userInfo.issuedDate,
        };

        try {
            await plugin.saveData("license.syhomepage", saveData);
        } catch {
            // 非关键展示元数据保存失败，不应当把已验签有效的本地 SH 判为无效。
        }
        return result;
    });
}

export async function activateLicense(
    plugin: any,
    ActivationCode: string,
    USER_NAME: string,
    USER_ID: string
): Promise<LicenseVerifyResult> {
    if (!USER_NAME || !USER_ID) {
        return invalid(1, "❌ 请先登录！");
    }

    const code = String(ActivationCode || "").trim();

    if (!code) {
        return invalid(2, "❌ 请输入激活码！");
    }

    if (!isSignedLicense(code)) {
        return invalid(
            50,
            "❌ 请使用新版激活码。旧版激活码只能继续用于本地已保存的兼容数据，不能再手动输入激活。"
        );
    }

    const result = verifySignedLicense(code, USER_NAME, USER_ID);

    if (!result.valid || !result.userInfo) {
        return result;
    }

    try {
        await runLicenseMutation(async () => {
            // 获取写入权后读取最新数据，避免旧登记任务覆盖刚兑换的新 SH。
            const oldData = (await plugin.loadData("license.syhomepage")) || {};
            await plugin.saveData("license.syhomepage", {
                ...oldData,
                ActivationCode: code,
                licenseFormat: "SH",
                licenseVersion: 2,
                legacy: false,
                legacyDeprecated: false,
                verifyCode: makeVerifyCode(),
                name: result.userInfo!.name,
                userId: result.userInfo!.userId,
                due: result.userInfo!.due,
                remainingDays: result.userInfo!.remainingDays,
                isLifetime: result.userInfo!.isLifetime === true,
                durationDays: result.userInfo!.durationDays,
                issuedDate: result.userInfo!.issuedDate,
                // 新 SH 不能继承旧授权的服务器管理标记。
                serverManaged: false,
                serverManagedAt: null,
                serverManagedSource: "",
                serverManagedLicenseHash: "",
                serverManagedServiceOrigin: "",
            });
        });
    } catch {
        return invalid(
            51,
            "激活码已通过验证，但本地授权保存失败，请检查思源数据目录写入权限后重试。"
        );
    }

    return result;
}

/**
 * 在写入队列内条件删除本地授权。
 * expectedLicense 仅供撤销同步和自动清理使用，防止旧任务删除新保存的 SH。
 */
export async function deleteLicense(
    plugin: any,
    expectedLicense?: string,
): Promise<DeleteLicenseResult> {
    return runLicenseMutation(async () => {
        const normalizedExpected = typeof expectedLicense === "string"
            ? expectedLicense.trim()
            : "";

        // 获取写入权后重新读取最新数据，不使用排队前的旧快照。
        // 首次读取必须捕获文件不存在异常，避免被调用方误显示为"删除失败"。
        let data: any;
        try {
            data = await plugin.loadData("license.syhomepage");
        } catch (error) {
            // 文件不存在可以直接返回；权限错误、磁盘错误等必须向上抛出。
            if (isFileNotFoundError(error)) return "already_missing";
            throw error;
        }

        // 文件存在但返回非对象数据，或 ActivationCode 字段类型异常
        const currentLicense = typeof data?.ActivationCode === "string"
            ? data.ActivationCode.trim()
            : "";

        const isDataCorrupted = typeof data !== "object" || data === null || Array.isArray(data)
            || typeof data.ActivationCode !== "string";

        if (normalizedExpected) {
            // 带 expectedLicense 的撤销同步：必须能安全确认当前授权。
            if (isDataCorrupted) {
                throw new Error("本地授权数据异常，无法安全确认当前授权。");
            }
            if (!currentLicense) return "already_missing";
            if (currentLicense !== normalizedExpected) return "license_changed";
        } else {
            // 手动注销：文件存在即尝试删除，包括损坏数据（不要伪装成文件不存在）。
            if (!currentLicense && !isDataCorrupted) return "already_missing";
        }

        // 使用思源 Plugin API 删除，不再直接操作插件数据目录物理路径。
        try {
            await plugin.removeData("license.syhomepage");
        } catch (error) {
            // 文件已不存在可视为已达目标，其他错误必须向上抛出。
            if (isFileNotFoundError(error)) return "already_missing";
            throw error;
        }

        // 删除后重新读取确认实际结果，不能虚假返回成功。
        try {
            const confirmData = await plugin.loadData("license.syhomepage");
            // loadData 返回 null/undefined 表示文件已不存在。
            if (confirmData == null) return "deleted";

            const savedCode = typeof confirmData.ActivationCode === "string"
                ? confirmData.ActivationCode.trim()
                : "";
            if (!savedCode) return "deleted";

            // 删除后仍保存着原 expectedLicense，不能虚假返回成功。
            if (normalizedExpected && savedCode === normalizedExpected) {
                throw new Error("本地授权删除后仍存在原授权数据");
            }

            // 删除后出现另一份不同 ActivationCode（新 SH 在删除间隙被写入）。
            return "license_changed";
        } catch (readError) {
            // loadData 因文件不存在抛出错误 => 删除成功。
            if (isFileNotFoundError(readError)) return "deleted";
            // 真实读取错误不能当作删除成功，继续向上抛出。
            throw readError;
        }
    });
}
