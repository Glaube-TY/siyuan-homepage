// @ts-ignore
import * as CryptoJS from 'crypto-js';
import { showMessage } from "siyuan";
import { getSiyuanCloudIdentity } from "@/api";
import {
    type LicenseVerifyResult,
    invalid,
    isSignedLicense,
    verifySignedLicense,
    makeUserCodeV2,
} from "./licenseSy2";
export type { LicenseVerifyResult } from "./licenseSy2";

const LEGACY_AES_SECRET_KEY = "tWMV80B17zb91Sps8nXc330yiJGNxDgR";
const LEGACY_COMPAT_END = new Date(2026, 7, 31, 23, 59, 59, 999).getTime();

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
            "❌ 旧版激活方式兼容期已结束，请联系作者换发新版激活码！"
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

export async function updateVIP() {
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

    let VIPconf: { [key: string]: any } = {
        USER_NAME: USER_NAME,
        USER_ID: USER_ID,
        USER_CODE: USER_CODE,
        USER_CODE_V2: userCodeV2,
        IDENTITY_SOURCE: identity.source,
    };

    return VIPconf;
}

export async function saveVIPConfData(plugin: any, ActivationCode: string): Promise<boolean> {
    try {
        const data = {
            ActivationCode,
        }
        await plugin.saveData("license.syhomepage", data);
        return true;
    } catch (error) {
        console.error("[Homepage] 激活码保存失败:", error);
        showMessage("❌ 激活码保存失败！");
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

    const data = (await plugin.loadData("license.syhomepage")) || {};
    const ActivationCode = data?.ActivationCode;

    if (!ActivationCode) {
        return invalid(2, "❌ 请输入激活码！");
    }

    const code = String(ActivationCode).trim();

    if (!code) {
        return invalid(2, "❌ 请输入激活码！");
    }

    const result = isSignedLicense(code)
        ? verifySignedLicense(code, USER_NAME, USER_ID)
        : verifyLegacyAesLicenseV1(code, USER_NAME, USER_ID);

    if (!result.valid || !result.userInfo) {
        return result;
    }

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
    }

    await plugin.saveData("license.syhomepage", saveData);

    return result;
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

    const oldData = (await plugin.loadData("license.syhomepage")) || {};
    const saveData = {
        ...oldData,
        ActivationCode: code,
        licenseFormat: "SH",
        licenseVersion: 2,
        legacy: false,
        legacyDeprecated: false,
        verifyCode: makeVerifyCode(),
        name: result.userInfo.name,
        userId: result.userInfo.userId,
        due: result.userInfo.due,
        remainingDays: result.userInfo.remainingDays,
        isLifetime: result.userInfo.isLifetime === true,
    }

    await plugin.saveData("license.syhomepage", saveData);

    return result;
}

export async function deleteLicense(plugin: any) {
    await plugin.client.removeFile({ path: "data/storage/petal/siyuan-homepage/license.syhomepage" });
}
