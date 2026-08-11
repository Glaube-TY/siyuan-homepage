import type { RobotKernelHost } from "./kernel-host";
import type { RobotSecretStoragePort } from "../features/robot-assistant/security/robot-secret-vault-store";
import type { RobotAssistantSettings } from "../features/robot-assistant/settings/robot-settings-types";
import type { RobotModelConfigStore, RobotAgentRuntimeConfigSnapshot } from "../features/robot-assistant/runtime/robot-model-config";
import { normalizeV2Settings } from "../features/robot-assistant/settings/robot-settings-migration";

export const KERNEL_STORAGE_SETTINGS_KEY = "robot-assistant-v2";
export const KERNEL_STORAGE_MODEL_CONFIG_KEY = "robot-runtime-model-config";

/** Robot Secret Vault 的 Kernel 存储端口（同一 plugin scoped storage root）。 */
export function createKernelSecretStoragePort(host: RobotKernelHost): RobotSecretStoragePort {
  return {
    get: (key) => host.storage.get(key),
    put: (key, value) => host.storage.set(key, value),
  };
}

/** Robot 设置 Kernel 存储。 */
export interface RobotSettingsKernelStore {
  load(): Promise<RobotAssistantSettings>;
  save(settings: RobotAssistantSettings): Promise<void>;
}

export function createRobotSettingsKernelStore(host: RobotKernelHost): RobotSettingsKernelStore {
  return {
    async load(): Promise<RobotAssistantSettings> {
      const raw = await host.storage.get(KERNEL_STORAGE_SETTINGS_KEY);
      if (raw) {
        try {
          return normalizeV2Settings(JSON.parse(raw));
        } catch {
          return normalizeV2Settings(null);
        }
      }
      return normalizeV2Settings(null);
    },
    async save(settings: RobotAssistantSettings): Promise<void> {
      await host.storage.set(KERNEL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    },
  };
}

/** Kernel 模型配置快照存储。 */
export function createKernelModelConfigStore(host: RobotKernelHost): RobotModelConfigStore {
  return {
    async get(): Promise<RobotAgentRuntimeConfigSnapshot | null> {
      const raw = await host.storage.get(KERNEL_STORAGE_MODEL_CONFIG_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
          && typeof (parsed as Record<string, unknown>).providerId === "string"
          && typeof (parsed as Record<string, unknown>).modelId === "string") {
          return parsed as RobotAgentRuntimeConfigSnapshot;
        }
      } catch {
        // ignore corrupt
      }
      return null;
    },
    async set(snapshot: RobotAgentRuntimeConfigSnapshot): Promise<void> {
      await host.storage.set(KERNEL_STORAGE_MODEL_CONFIG_KEY, JSON.stringify(snapshot));
    },
    async clear(): Promise<void> {
      await host.storage.set(KERNEL_STORAGE_MODEL_CONFIG_KEY, "");
    },
  };
}
