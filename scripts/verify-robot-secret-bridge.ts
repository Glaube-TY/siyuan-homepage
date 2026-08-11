import assert from "node:assert/strict";

import { resolveElectronProviderCredentials } from "../src/features/robot-assistant/runtime/robot-electron-credentials";
import { RobotSecretVaultStore } from "../src/features/robot-assistant/security/robot-secret-vault-store";
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

console.log("Robot provider secret bridge checks passed.");
