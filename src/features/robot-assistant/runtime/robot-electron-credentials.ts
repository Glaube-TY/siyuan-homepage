/**
 * Electron Provider 凭证解析（渲染端）。
 *
 * 飞书 / QQ 的 App Secret 以 `robot:enc:v1` envelope 加密后存入 v2 设置，
 * 主密钥 `robot-secret-key-v1` 与 Kernel Secret Vault 同存于 plugin scoped storage。
 * Electron Provider 运行在渲染进程，因此渲染端用 `plugin.loadData/saveData`
 * （与 Kernel `siyuan.storage` 同一 storage root）读取主密钥并解密，
 * 供 `create({ appId, appSecret })` 构造 provider。
 *
 * 任何一步失败返回 null（provider 上报 not_configured，UI 提示重新填写）。
 */

import {
  ROBOT_MASTER_SECRET_KEY,
  decryptRobotSecret,
  generateRobotMasterSecret,
} from "../security/robot-secret-vault";
import type { RobotAssistantSettings } from "../settings/robot-settings-types";

export interface ElectronProviderCredentials {
  appId: string;
  appSecret: string;
}

/** 渲染端 plugin storage 访问端口（loadData/saveData）。 */
export interface ElectronCredentialStoragePort {
  loadData(name: string): Promise<unknown>;
  saveData(name: string, value: unknown): Promise<unknown>;
}

/** 读取主密钥；缺失时生成并持久化（与 Kernel RobotSecretVaultStore 行为一致）。 */
async function getOrCreateMasterSecret(storage: ElectronCredentialStoragePort): Promise<string | null> {
  try {
    const existing = await storage.loadData(ROBOT_MASTER_SECRET_KEY);
    if (typeof existing === "string" && existing.trim()) {
      return existing.trim();
    }
    if (existing && typeof existing === "object") {
      const value = (existing as Record<string, unknown>).value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // 读取失败时尝试生成
  }
  try {
    const generated = generateRobotMasterSecret();
    await storage.saveData(ROBOT_MASTER_SECRET_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

export async function resolveElectronProviderCredentials(
  storage: ElectronCredentialStoragePort,
  settings: RobotAssistantSettings | null,
  providerId: "feishu" | "qq",
): Promise<ElectronProviderCredentials | null> {
  if (!settings) return null;
  const section = settings[providerId];
  if (!section || typeof section !== "object") return null;
  const appId = typeof section.appId === "string" ? section.appId.trim() : "";
  const envelope = typeof section.encryptedAppSecret === "string" ? section.encryptedAppSecret.trim() : "";
  if (!appId || !envelope) return null;

  const master = await getOrCreateMasterSecret(storage);
  if (!master) return null;

  const result = decryptRobotSecret(master, envelope);
  if (!result.ok || !result.plaintext) return null;
  return { appId, appSecret: result.plaintext };
}
