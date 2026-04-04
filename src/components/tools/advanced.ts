// @ts-ignore
import * as CryptoJS from 'crypto-js';
import { showMessage } from "siyuan";

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
    const parts = decryptedCode.split('-');

    if (parts.length !== 5 || parts[4] !== 'glaflagty') {
        return {
            valid: false,
            code: 3,
            error: "❌ 激活码无效！"
        };
    }

    if (parts[0] !== USER_NAME || parts[1] !== USER_ID) {
        return {
            valid: false,
            code: 4,
            error: "❌ 账户不匹配！"
        };
    }

    const dueDate = (() => {
        try {
            const dateStr = parts[3];
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
        name: parts[0],
        userId: parts[1],
    }
    await plugin.saveData("license.syhomepage", saveData);

    return {
        valid: true,
        code: 0,
        userInfo: {
            name: parts[0],
            userId: parts[1],
            due: `${parts[3].substring(0, 4)}年${parseInt(parts[3].substring(4, 6))}月${parseInt(parts[3].substring(6, 8))}日`,
            remainingDays: remainingDays,
            isExpired: remainingDays < 0
        }
    };
}

export async function deleteLicense(plugin: any) {
    await plugin.client.removeFile({ path: "data/storage/petal/siyuan-homepage/license.syhomepage" });
}