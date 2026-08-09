import type { RobotKernelHost } from "../../../../kernel/kernel-host";
import type { WeChatCredential } from "./wechat-protocol";
import { RobotSecretVaultStore } from "../../security/robot-secret-vault-store";
import { createKernelSecretStoragePort } from "../../../../kernel/kernel-stores";

/** 微信凭据存储：token / uin / baseInfo 进 plugin scoped storage（不应在设置 JSON 明文）。 */
export interface WeChatCredentialStoragePort {
  getCredential(): Promise<WeChatCredential | null>;
  setCredential(credential: WeChatCredential): Promise<void>;
  clearCredential(): Promise<void>;
  getUpdatesBuf(): Promise<string | null>;
  setUpdatesBuf(buf: string | null): Promise<void>;
}

const LEGACY_KEY_CREDENTIAL = "wechat-credential-v1";
const SECRET_KEY_CREDENTIAL = "wechat-credential";
const KEY_UPDATES_BUF = "wechat-get-updates-buf-v1";

export function createKernelWeChatCredentialStorage(host: RobotKernelHost): WeChatCredentialStoragePort {
  const vault = new RobotSecretVaultStore(createKernelSecretStoragePort(host));
  return {
    async getCredential(): Promise<WeChatCredential | null> {
      let raw = await vault.readSecret(SECRET_KEY_CREDENTIAL);
      if (!raw) {
        // 一次性迁移早期开发包的明文凭据；迁移后立即清空旧文件。
        raw = await host.storage.get(LEGACY_KEY_CREDENTIAL);
        const legacy = parseCredential(raw);
        if (legacy) {
          await vault.saveSecret(SECRET_KEY_CREDENTIAL, JSON.stringify(legacy));
          await host.storage.set(LEGACY_KEY_CREDENTIAL, "");
          return legacy;
        }
      }
      if (!raw) return null;
      return parseCredential(raw);
    },
    async setCredential(credential: WeChatCredential): Promise<void> {
      await vault.saveSecret(SECRET_KEY_CREDENTIAL, JSON.stringify(credential));
      await host.storage.set(LEGACY_KEY_CREDENTIAL, "");
    },
    async clearCredential(): Promise<void> {
      await vault.deleteSecret(SECRET_KEY_CREDENTIAL);
      await host.storage.set(LEGACY_KEY_CREDENTIAL, "");
      await host.storage.set(KEY_UPDATES_BUF, "");
    },
    async getUpdatesBuf(): Promise<string | null> {
      const raw = await host.storage.get(KEY_UPDATES_BUF);
      return raw && raw.trim() ? raw : null;
    },
    async setUpdatesBuf(buf: string | null): Promise<void> {
      await host.storage.set(KEY_UPDATES_BUF, buf ?? "");
    },
  };
}

function parseCredential(raw: string | null): WeChatCredential | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = parsed as Record<string, unknown>;
      if (typeof value.botToken === "string" && value.botToken.trim()
        && typeof value.accountId === "string" && value.accountId.trim()
        && typeof value.baseUrl === "string" && value.baseUrl.trim()) {
        return value as unknown as WeChatCredential;
      }
    }
  } catch {
    // ignore corrupt
  }
  return null;
}
