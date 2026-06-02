// @ts-ignore
import * as CryptoJS from 'crypto-js';
import { showMessage } from "siyuan";

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

export async function updateVIP() {
    const userconf = window.siyuan.user;
    const USER_NAME = userconf.userName;
    const USER_ID = userconf.userId;
    const USER_CODE = `${USER_NAME}-${USER_ID}`;
    const SECRET_KEY = 'tWMV80B17zb91Sps8nXc330yiJGNxDgR';
    const encryptedUserCode = CryptoJS.AES.encrypt(USER_CODE, SECRET_KEY).toString();

    let VIPconf: { [key: string]: any } = {
        USER_NAME: USER_NAME,
        USER_ID: USER_ID,
        ENCRYPTED_USER_CODE: encryptedUserCode
    };

    return VIPconf;
}

export async function saveVIPConfData(plugin: any, ActivationCode: string) {
    try {
        const data = {
            ActivationCode,
        }
        await plugin.saveData("license.syhomepage", data);
        return true;
    } catch (error) {
        showMessage("❌ 激活码保存失败！");
    }
}

export async function verifyLicense(plugin: any, USER_NAME: string, USER_ID: string) {
    if (!USER_NAME || !USER_ID) {
        return {
            valid: false,
            code: 1,
            error: "❌ 请先登录！"
        };
    }

    const data = await plugin.loadData("license.syhomepage");
    const ActivationCode = data?.ActivationCode;
    const SECRET_KEY = 'tWMV80B17zb91Sps8nXc330yiJGNxDgR';

    if (!ActivationCode) return {
        valid: false,
        code: 2,
        error: "❌ 请输入激活码！"
    };

    const bytes = CryptoJS.AES.decrypt(ActivationCode, SECRET_KEY);
    const decryptedCode = bytes.toString(CryptoJS.enc.Utf8);

    // 使用新的解析逻辑（支持用户名包含横杠）
    const parsed = parseLicensePayload(decryptedCode);

    if (!parsed) {
        return {
            valid: false,
            code: 3,
            error: "❌ 激活码无效！"
        };
    }

    if (parsed.userName !== USER_NAME || parsed.userId !== USER_ID) {
        return {
            valid: false,
            code: 4,
            error: "❌ 账户不匹配！"
        };
    }

    const dueDate = (() => {
        try {
            const dateStr = parsed.dueDateStr;
            const year = dateStr.substring(0, 4);
            const month = parseInt(dateStr.substring(4, 6)) - 1;
            const day = dateStr.substring(6, 8);
            return new Date(parseInt(year), month, parseInt(day));
        } catch (e) {
            return null;
        }
    })();

    const remainingDays = dueDate ?
        Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 3600 * 24)) :
        -1;

    if (remainingDays < 0) {
        return {
            valid: false,
            code: 5,
            error: "❌ 激活码已过期！"
        };
    }

    const saveData = {
        ...data,
        verifyCode: 'homepage' + Array(10).fill(0).map(() => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return chars[Math.floor(Math.random() * chars.length)];
        }).join(''),
        name: parsed.userName,
        userId: parsed.userId,
    }
    await plugin.saveData("license.syhomepage", saveData);

    return {
        valid: true,
        code: 0,
        userInfo: {
            name: parsed.userName,
            userId: parsed.userId,
            due: `${parsed.dueDateStr.substring(0, 4)}年${parseInt(parsed.dueDateStr.substring(4, 6))}月${parseInt(parsed.dueDateStr.substring(6, 8))}日`,
            remainingDays: remainingDays,
            isExpired: remainingDays < 0
        }
    };
}

export async function deleteLicense(plugin: any) {
    await plugin.client.removeFile({ path: "data/storage/petal/siyuan-homepage/license.syhomepage" });
}