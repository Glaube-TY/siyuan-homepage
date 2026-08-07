import {
    decryptSecretCipherText,
    encryptSecretPlainText,
    isEncryptedSecret,
    setKbSensitiveSecretCryptoPlugin,
} from "../../../../../features/kb/services/settings/kb-sensitive-secret-crypto";

export const MUSIC_CLOUD_SETTINGS_FILE = "music-player-cloud-settings-v1.json";

export interface MusicCloudProfile {
    id: string;
    provider: "subsonic";
    name: string;
    localBaseUrl: string;
    remoteBaseUrl: string;
    username: string;
    encryptedPassword: string;
    createdAt: number;
    updatedAt: number;
}

export interface MusicCloudSettingsData {
    version: 1;
    profile: MusicCloudProfile | null;
}

export interface MusicCloudProfileInput {
    id?: string;
    name?: string;
    localBaseUrl?: string;
    remoteBaseUrl?: string;
    username?: string;
    password?: string;
    clearPassword?: boolean;
}

export interface NormalizedCloudUrl {
    url: string;
    warning?: "remote_http";
}

export function normalizeCloudBaseUrl(
    rawValue: string,
    kind: "local" | "remote",
    options: { addLocalHttpScheme?: boolean } = {},
): NormalizedCloudUrl {
    let value = String(rawValue || "").trim();
    if (!value) return { url: "" };
    if (kind === "local" && options.addLocalHttpScheme && !/^[a-z][a-z\d+.-]*:/i.test(value)) {
        value = `http://${value}`;
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${kind === "local" ? "本地" : "远程"}地址格式无效。`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("NAS 音乐地址只允许使用 HTTP 或 HTTPS。" );
    }
    if (parsed.username || parsed.password) {
        throw new Error("NAS 音乐地址不能内嵌用户名或密码。" );
    }
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "";
    const normalized = parsed.toString().replace(/\/$/, "");
    return {
        url: normalized,
        warning: kind === "remote" && parsed.protocol === "http:" ? "remote_http" : undefined,
    };
}

function generateProfileId(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    const random = Math.random().toString(36).slice(2);
    return `music-${Date.now().toString(36)}-${random}`;
}

function normalizeStoredProfile(raw: unknown): MusicCloudProfile | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (typeof record.password === "string" || typeof record.p === "string") return null;
    const encryptedPassword = typeof record.encryptedPassword === "string" ? record.encryptedPassword : "";
    // 绝不接受旧文件或手工修改后出现的明文密码。
    if (encryptedPassword && !isEncryptedSecret(encryptedPassword)) return null;
    let localBaseUrl = "";
    let remoteBaseUrl = "";
    try {
        localBaseUrl = normalizeCloudBaseUrl(typeof record.localBaseUrl === "string" ? record.localBaseUrl : "", "local").url;
        remoteBaseUrl = normalizeCloudBaseUrl(typeof record.remoteBaseUrl === "string" ? record.remoteBaseUrl : "", "remote").url;
    } catch { return null; }
    if (!localBaseUrl && !remoteBaseUrl) return null;
    return {
        id: typeof record.id === "string" && record.id ? record.id : generateProfileId(),
        provider: "subsonic",
        name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : "NAS 音乐",
        localBaseUrl,
        remoteBaseUrl,
        username: typeof record.username === "string" ? record.username : "",
        encryptedPassword,
        createdAt: Number.isFinite(record.createdAt) ? Number(record.createdAt) : Date.now(),
        updatedAt: Number.isFinite(record.updatedAt) ? Number(record.updatedAt) : Date.now(),
    };
}

export class MusicCloudSettingsStore {
    private loaded = false;
    private data: MusicCloudSettingsData = { version: 1, profile: null };

    constructor(private readonly plugin: any) {
        setKbSensitiveSecretCryptoPlugin(plugin);
    }

    async load(): Promise<MusicCloudSettingsData> {
        if (this.loaded) return this.getData();
        try {
            const raw = await this.plugin.loadData(MUSIC_CLOUD_SETTINGS_FILE);
            const profile = normalizeStoredProfile(raw?.profile);
            this.data = { version: 1, profile };
        } catch {
            this.data = { version: 1, profile: null };
        }
        this.loaded = true;
        return this.getData();
    }

    getData(): MusicCloudSettingsData {
        return {
            version: 1,
            profile: this.data.profile ? { ...this.data.profile } : null,
        };
    }

    async getPassword(): Promise<string> {
        const cipherText = this.data.profile?.encryptedPassword || "";
        if (!cipherText) return "";
        try { return await decryptSecretCipherText(cipherText); }
        catch { throw new Error("NAS 密码解密失败，请重新输入并保存。" ); }
    }

    async saveProfile(input: MusicCloudProfileInput): Promise<MusicCloudProfile> {
        if (!this.loaded) await this.load();
        const previous = this.data.profile;
        const local = normalizeCloudBaseUrl(input.localBaseUrl || "", "local", { addLocalHttpScheme: true });
        const remote = normalizeCloudBaseUrl(input.remoteBaseUrl || "", "remote");
        if (!local.url && !remote.url) throw new Error("请至少配置一个 NAS 音乐地址。" );
        const username = String(input.username || "").trim();
        if (!username) throw new Error("请输入 NAS 音乐用户名。" );

        let encryptedPassword = previous?.encryptedPassword || "";
        if (input.clearPassword) {
            encryptedPassword = "";
        } else if (typeof input.password === "string" && input.password.length > 0) {
            try {
                encryptedPassword = await encryptSecretPlainText(input.password);
            } catch {
                throw new Error("当前环境无法安全保存 NAS 密码。" );
            }
        }
        if (!encryptedPassword && !input.clearPassword) throw new Error("请输入 NAS 音乐密码。" );
        if (encryptedPassword && !isEncryptedSecret(encryptedPassword)) {
            throw new Error("当前环境无法安全保存 NAS 密码。" );
        }

        const now = Date.now();
        const profile: MusicCloudProfile = {
            id: previous?.id || input.id || generateProfileId(),
            provider: "subsonic",
            name: String(input.name || previous?.name || "NAS 音乐").trim() || "NAS 音乐",
            localBaseUrl: local.url,
            remoteBaseUrl: remote.url,
            username,
            encryptedPassword,
            createdAt: previous?.createdAt || now,
            updatedAt: now,
        };
        await this.plugin.saveData(MUSIC_CLOUD_SETTINGS_FILE, { version: 1, profile });
        this.data = { version: 1, profile };
        return { ...profile };
    }

    async clear(): Promise<void> {
        await this.plugin.saveData(MUSIC_CLOUD_SETTINGS_FILE, { version: 1, profile: null });
        this.data = { version: 1, profile: null };
        this.loaded = true;
    }
}
