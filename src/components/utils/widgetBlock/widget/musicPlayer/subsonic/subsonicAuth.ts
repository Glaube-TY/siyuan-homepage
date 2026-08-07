import CryptoJS from "crypto-js";

export interface SubsonicAuthParams {
    u: string;
    t: string;
    s: string;
}

export function createSubsonicSalt(byteLength = 12): string {
    const safeLength = Math.max(6, byteLength);
    const bytes = new Uint8Array(safeLength);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createSubsonicToken(password: string, salt: string): string {
    return CryptoJS.MD5(`${password}${salt}`).toString(CryptoJS.enc.Hex).toLowerCase();
}

export function createSubsonicAuthParams(username: string, password: string): SubsonicAuthParams {
    const salt = createSubsonicSalt();
    return { u: username, t: createSubsonicToken(password, salt), s: salt };
}
