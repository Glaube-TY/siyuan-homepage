/**
 * SH 激活码纯函数模块
 *
 * 只包含激活码解析、签名 base64url 解码、issuedDate 校验、expiresAt 计算、验签消息构造等纯函数。
 * 业务入口（updateVIP / verifyLicense / activateLicense / deleteLicense）保留在 advanced.ts。
 *
 * SH 激活码格式：SH.<payload>.<signature>
 * - payload = base64url("accountKey|durationDays|issuedDate")
 * - accountKey = base64url(SHA256("siyuan-homepage|account|" + userId)) 前 16 字符
 * - 签名消息：SH|accountKey|durationDays|issuedDate
 * - 签名：ECDSA secp256k1, SHA-256, raw compact r+s 64 bytes, base64url 编码
 */

// @ts-ignore
import * as CryptoJS from "crypto-js";
import { ec as EC } from "elliptic";

// ── 常量 ─────────────────────────────────────────────────────────────────────

export const PRODUCT_ID = "siyuan-homepage";
export const LICENSE_PREFIX = "SH.";

// 只放公钥，不放私钥
export const PUBLIC_KEY =
    "044a11e6f7bc8394412bb905501ebbb58c8161ca14dcc9ca724e1f2648d75e9a89a562385730ae5d54dd6b36d245e1a09343da17cbfea4d19af0d329bd222ecc7f";

export const ec = new EC("secp256k1");

const ACCOUNT_KEY_SALT = "siyuan-homepage|account|";
const ACCOUNT_KEY_LENGTH = 16;

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface LicenseUserInfo {
    name: string;
    userId: string;
    due: string;
    remainingDays: number;
    isExpired: boolean;
    isLifetime?: boolean;
}

export interface LicenseVerifyResult {
    valid: boolean;
    code: number;
    error?: string;
    userInfo?: LicenseUserInfo;
    licenseVersion?: 1 | 2;
    legacy?: boolean;
    legacyDeprecated?: boolean;
}

// ── 辅助函数 ─────────────────────────────────────────────────────────────────

export function invalid(code: number, error: string): LicenseVerifyResult {
    return { valid: false, code, error };
}

// ── base64url 工具 ───────────────────────────────────────────────────────────

export function base64UrlDecodeToBytes(input: string): Uint8Array {
    const base64 = input
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(input.length / 4) * 4, "=");

    const binary = atob(base64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

export function base64UrlEncodeUtf8(input: string): string {
    const bytes = new TextEncoder().encode(input);
    return base64UrlEncodeBytes(bytes);
}

export function base64UrlDecodeUtf8(input: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(input)) {
        throw new Error("invalid base64url");
    }

    const bytes = base64UrlDecodeToBytes(input);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// ── accountKey 工具 ──────────────────────────────────────────────────────────

/**
 * 从 userId 计算稳定的 accountKey。
 * accountKey = base64url(SHA256("siyuan-homepage|account|" + userId)) 前 16 字符。
 * 用于激活码中隐藏 userId，验签时用当前登录 USER_ID 重新计算 expectedAccountKey 比较。
 */
export function makeAccountKey(userId: string): string {
    const digest = CryptoJS.SHA256(ACCOUNT_KEY_SALT + userId).toString(CryptoJS.enc.Hex);
    // 将 hex 转为 bytes，再 base64url 编码
    const bytes = new Uint8Array(digest.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const encoded = base64UrlEncodeBytes(bytes);
    return encoded.substring(0, ACCOUNT_KEY_LENGTH);
}

// ── 激活码辅助 ───────────────────────────────────────────────────────────────

export function isSignedLicense(code: string): boolean {
    return typeof code === "string" && code.trim().startsWith(LICENSE_PREFIX);
}

export function parseIssuedDate(dateStr: string): Date | null {
    if (!/^\d{8}$/.test(dateStr)) {
        return null;
    }

    const year = Number(dateStr.substring(0, 4));
    const month = Number(dateStr.substring(4, 6));
    const day = Number(dateStr.substring(6, 8));
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

export function makeUserCodeV2(USER_NAME: string, USER_ID: string): string {
    const payload = {
        v: 1,
        product: PRODUCT_ID,
        userId: USER_ID,
        userName: USER_NAME,
        createdAt: Math.floor(Date.now() / 1000),
    };

    return `SYHPU1.${base64UrlEncodeUtf8(JSON.stringify(payload))}`;
}

// ── 激活码验签 ───────────────────────────────────────────────────────────────

/**
 * SH 激活码格式: SH.<payload>.<signature>
 * payload: base64url("accountKey|durationDays|issuedDate")
 * 签名消息: SH|accountKey|durationDays|issuedDate
 * 签名格式: raw compact r+s 64 bytes, base64url 编码
 *
 * accountKey 由 userId 通过 makeAccountKey() 单向计算，不暴露 userId 明文。
 * 验签时用当前登录 USER_ID 重新计算 expectedAccountKey，与激活码中的 accountKey 比较。
 *
 * 到期判断:
 *   durationDays === 0 → 永久
 *   durationDays > 0  → 从 issuedDate 00:00:00 起算 durationDays 天，
 *                        到期时间点 = issuedDate + durationDays 天的 00:00:00，
 *                        Date.now() >= 该时间点即视为过期。
 */
export function verifySignedLicense(
    activationCode: string,
    USER_NAME: string,
    USER_ID: string
): LicenseVerifyResult {
    try {
        const rawCode = activationCode.trim();

        if (!rawCode.startsWith(LICENSE_PREFIX)) {
            return invalid(20, "❌ 激活码格式错误！");
        }

        const body = rawCode.slice(LICENSE_PREFIX.length);
        const lastDotIndex = body.lastIndexOf(".");

        if (lastDotIndex <= 0 || lastDotIndex >= body.length - 1) {
            return invalid(21, "❌ 激活码格式错误！");
        }

        const payloadPart = body.substring(0, lastDotIndex);
        const signatureB64Url = body.substring(lastDotIndex + 1);

        if (!payloadPart || !signatureB64Url) {
            return invalid(22, "❌ 激活码内容不完整！");
        }

        // 解码 payload: base64url("accountKey|durationDays|issuedDate")
        let payloadText: string;
        try {
            payloadText = base64UrlDecodeUtf8(payloadPart);
        } catch {
            return invalid(21, "❌ 激活码格式错误！");
        }

        const payloadSegments = payloadText.split("|");
        if (payloadSegments.length !== 3) {
            return invalid(21, "❌ 激活码格式错误！");
        }

        const [accountKey, durationDaysStr, issuedDateStr] = payloadSegments;

        if (!accountKey) {
            return invalid(21, "❌ 激活码格式错误！");
        }

        // 构造签名消息并验签。验签消息不直接签 payload 字符串，以保持签发工具和插件端一致。
        const signMessage = `SH|${accountKey}|${durationDaysStr}|${issuedDateStr}`;
        const digestHex = CryptoJS.SHA256(signMessage).toString(CryptoJS.enc.Hex);

        // 解码 base64url 签名为 raw compact (r+s 64 bytes)
        let signatureBytes: Uint8Array;
        try {
            signatureBytes = base64UrlDecodeToBytes(signatureB64Url);
        } catch {
            return invalid(30, "❌ 激活码无效！");
        }

        if (signatureBytes.length !== 64) {
            return invalid(30, "❌ 激活码无效！");
        }

        const rHex = Array.from(signatureBytes.slice(0, 32))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        const sHex = Array.from(signatureBytes.slice(32, 64))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        const key = ec.keyFromPublic(PUBLIC_KEY, "hex");
        const ok = key.verify(digestHex, { r: rHex, s: sHex });

        if (!ok) {
            return invalid(30, "❌ 激活码无效！");
        }

        // 校验 durationDays。必须使用规范数字文本，避免 30 被改写成 030 后仍落到同一授权含义。
        const durationDays = Number(durationDaysStr);
        if (
            !Number.isFinite(durationDays) ||
            durationDays < 0 ||
            !Number.isInteger(durationDays) ||
            String(durationDays) !== durationDaysStr
        ) {
            return invalid(28, "❌ 激活码有效天数不正确！");
        }

        // 校验 issuedDate 格式和真实日期
        const issuedDate = parseIssuedDate(issuedDateStr);
        if (!issuedDate) {
            return invalid(29, "❌ 激活码日期不正确！");
        }

        // 校验 accountKey 匹配：用当前 USER_ID 计算 expectedAccountKey
        const expectedAccountKey = makeAccountKey(USER_ID);
        if (accountKey !== expectedAccountKey) {
            return invalid(25, "❌ 账户不匹配！");
        }

        // 计算到期时间和剩余天数
        const isLifetime = durationDays === 0;
        let remainingDays = 999999;
        let due = "永久";

        if (!isLifetime) {
            // expiresAtDate = issuedDate 00:00:00 + durationDays 天 → 到期日 00:00:00
            const expiresAtDate = new Date(
                issuedDate.getFullYear(),
                issuedDate.getMonth(),
                issuedDate.getDate() + durationDays,
                0, 0, 0, 0
            );

            // 到期判断: Date.now() >= 到期时间点即过期
            if (Date.now() >= expiresAtDate.getTime()) {
                return invalid(31, "❌ 激活码已过期！");
            }

            // remainingDays 仅供显示，用 Math.ceil 向上取整
            remainingDays = Math.ceil((expiresAtDate.getTime() - Date.now()) / (1000 * 3600 * 24));

            due = `${expiresAtDate.getFullYear()}年${expiresAtDate.getMonth() + 1}月${expiresAtDate.getDate()}日`;
        }

        return {
            valid: true,
            code: 0,
            licenseVersion: 2,
            legacy: false,
            legacyDeprecated: false,
            userInfo: {
                name: USER_NAME,
                userId: USER_ID,
                due,
                remainingDays,
                isExpired: false,
                isLifetime,
            },
        };
    } catch (error) {
        console.error("[Homepage] 激活码校验失败:", error);
        return invalid(32, "❌ 激活码解析失败！");
    }
}
