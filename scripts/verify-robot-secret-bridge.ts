import assert from "node:assert/strict";

import { resolveElectronProviderCredentials } from "../src/features/robot-assistant/runtime/robot-electron-credentials";
import { RobotSecretVaultStore } from "../src/features/robot-assistant/security/robot-secret-vault-store";
import { isRobotEnvelope } from "../src/features/robot-assistant/security/robot-secret-vault";
import { RobotSettingsClient } from "../src/features/robot-assistant/settings/robot-settings-client";
import { createDefaultRobotAssistantSettings } from "../src/features/robot-assistant/settings/robot-settings-types";

const rawStorage = new Map<string, string>();
const vault = new RobotSecretVaultStore({
  get: async (key) => rawStorage.get(key) ?? null,
  put: async (key, value) => { rawStorage.set(key, value); },
});

const storage = {
  async loadData(name: string): Promise<unknown> {
    const raw = rawStorage.get(name);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  },
  async saveData(name: string, value: unknown): Promise<void> {
    rawStorage.set(name, JSON.stringify(value));
  },
};

// Kernel 生成的 envelope 必须能被 Electron Provider 使用同一主密钥解开。
const settings = createDefaultRobotAssistantSettings();
settings.qq.appId = "qq-app";
settings.qq.encryptedAppSecret = await vault.encryptExternalSecret("qq-test-secret");
const credentials = await resolveElectronProviderCredentials(storage, settings, "qq");
assert.deepEqual(credentials, { appId: "qq-app", appSecret: "qq-test-secret" });

// QQ 与飞书一样，旧明文/旧 KB 密文必须迁移为 Robot Vault envelope。
const legacySettings = createDefaultRobotAssistantSettings();
legacySettings.qq.appId = "legacy-qq-app";
legacySettings.qq.encryptedAppSecret = "legacy-qq-secret";
let savedSettings = legacySettings;
const kernel = {
  available: true,
  subscribe: () => () => undefined,
  async call(method: string, payload?: unknown): Promise<unknown> {
    if (method === "robot.getSettings") return { ok: true, settings: legacySettings };
    if (method === "robot.encryptProviderSecret") {
      const plaintext = String((payload as { plaintext?: string } | undefined)?.plaintext ?? "");
      return { ok: true, envelope: await vault.encryptExternalSecret(plaintext) };
    }
    if (method === "robot.saveSettings") {
      savedSettings = payload as typeof legacySettings;
      return { ok: true, settings: savedSettings };
    }
    throw new Error(`Unexpected RPC: ${method}`);
  },
};
const client = new RobotSettingsClient(kernel as never, storage);
const migrated = await client.getSettings();
assert.equal(isRobotEnvelope(migrated.qq.encryptedAppSecret), true);
assert.equal(isRobotEnvelope(savedSettings.qq.encryptedAppSecret), true);

console.log("Robot provider secret bridge checks passed.");
