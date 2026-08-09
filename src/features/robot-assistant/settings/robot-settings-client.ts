/**
 * Robot 设置页客户端服务：封装对 Kernel Robot Core 的全部 RPC 调用，
 * 以及渲染端对飞书 / QQ App Secret 的加密（与 Kernel Secret Vault 同一主密钥）。
 *
 * 供 `RobotAssistantSettingsTab.svelte` 使用；逻辑独立于 Svelte，可在 Node 测试。
 */

import { RobotKernelClient } from "../runtime/robot-kernel-client";
import type { ElectronCredentialStoragePort } from "../runtime/robot-electron-credentials";
import {
  ROBOT_MASTER_SECRET_KEY,
  encryptRobotSecret,
  generateRobotMasterSecret,
  isRobotEnvelope,
} from "../security/robot-secret-vault";
import { createDefaultRobotAssistantSettings, type RobotAssistantSettings, type RobotRuntimeOwner } from "./robot-settings-types";
import { normalizeV2Settings } from "./robot-settings-migration";
import { decryptSecretCipherText, isEncryptedSecret } from "../../kb/services/settings/kb-sensitive-secret-crypto";
import type { RobotProviderId } from "../contracts/robot-provider";
import type { RobotStatus } from "../contracts/robot-provider";

export interface RobotStatusSnapshot {
  ok?: boolean;
  status?: RobotStatus;
  providers?: Array<{ provider: RobotProviderId; status: string; availability: string }>;
  model?: { configured?: boolean; providerId?: string; modelId?: string; providerType?: string };
  runtimeDevice?: RobotRuntimeOwner | null;
  runtimeOwner?: RobotRuntimeOwner | null;
}

export class RobotSettingsClient {
  constructor(
    private readonly kernel: RobotKernelClient,
    private readonly storage: ElectronCredentialStoragePort,
  ) {}

  get available(): boolean {
    return this.kernel.available;
  }

  subscribe(event: string, handler: (payload: unknown) => void): () => void {
    return this.kernel.subscribe(event, handler);
  }

  async getStatus(): Promise<RobotStatusSnapshot | null> {
    try {
      return (await this.kernel.call("robot.getStatus")) as RobotStatusSnapshot;
    } catch {
      return null;
    }
  }

  /** Robot bootstrap 状态（Robot 错误与 Kernel Plugin 错误相互隔离）。 */
  async getBootstrapStatus(): Promise<{ state?: string; error?: string } | null> {
    try {
      return (await this.kernel.call("robot.getBootstrapStatus")) as { state?: string; error?: string };
    } catch {
      return null;
    }
  }

  async getSettings(): Promise<RobotAssistantSettings> {
    try {
      const raw = (await this.kernel.call("robot.getSettings")) as unknown;
      const wrapped = raw as { ok?: boolean; settings?: RobotAssistantSettings } | null;
      const candidate = wrapped && typeof wrapped === "object" && "settings" in wrapped && wrapped.settings
        ? wrapped.settings
        : (raw as RobotAssistantSettings | null);
      if (candidate && typeof candidate === "object" && candidate.version === 2) {
        const normalized = normalizeV2Settings(candidate);
        await this.migrateLegacyFeishuSecret(normalized);
        return normalized;
      }
    } catch {
      // 内核不可用时回退默认值
    }
    return createDefaultRobotAssistantSettings();
  }

  /** v1 的 kb AES-GCM 密文只在浏览器可解；解密一次后转存 Robot Vault envelope。 */
  private async migrateLegacyFeishuSecret(settings: RobotAssistantSettings): Promise<void> {
    const legacy = settings.feishu.encryptedAppSecret.trim();
    if (!legacy || isRobotEnvelope(legacy)) return;
    try {
      const plaintext = isEncryptedSecret(legacy) ? await decryptSecretCipherText(legacy) : legacy;
      const envelope = await this.encryptSecret(plaintext);
      if (!envelope) throw new Error("robot_secret_encrypt_failed");
      settings.feishu.encryptedAppSecret = envelope;
      await this.saveSettings(settings);
    } catch {
      // 明确清空不可恢复密文，使 UI 显示需要重新填写，而不把旧密文误当成明文。
      settings.feishu.encryptedAppSecret = "";
      await this.saveSettings(settings).catch(() => undefined);
    }
  }

  async saveSettings(settings: RobotAssistantSettings): Promise<RobotAssistantSettings> {
    const saved = (await this.kernel.call("robot.saveSettings", settings)) as { ok?: boolean; settings?: RobotAssistantSettings };
    return saved && saved.settings ? saved.settings : settings;
  }

  /** 用 Robot Secret Vault 主密钥加密明文（飞书 / QQ App Secret）。 */
  async encryptSecret(plaintext: string): Promise<string | null> {
    const trimmed = typeof plaintext === "string" ? plaintext.trim() : "";
    if (!trimmed) return null;
    const master = await this.getOrCreateMasterSecret();
    if (!master) return null;
    return encryptRobotSecret(master, trimmed);
  }

  private async getOrCreateMasterSecret(): Promise<string | null> {
    try {
      const existing = await this.storage.loadData(ROBOT_MASTER_SECRET_KEY);
      if (typeof existing === "string" && existing.trim()) return existing.trim();
      if (existing && typeof existing === "object") {
        const value = (existing as Record<string, unknown>).value;
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    } catch {
      // 读取失败时生成
    }
    try {
      const generated = generateRobotMasterSecret();
      await this.storage.saveData(ROBOT_MASTER_SECRET_KEY, generated);
      return generated;
    } catch {
      return null;
    }
  }

  // ── 全局开关 ──

  async start(): Promise<void> {
    await this.kernel.call("robot.start");
  }

  async stop(): Promise<void> {
    await this.kernel.call("robot.stop");
  }

  async restart(): Promise<void> {
    await this.kernel.call("robot.restart");
  }

  // ── 微信登录 ──

  async wechatStartLogin(): Promise<Record<string, unknown>> {
    return (await this.kernel.call("robot.wechat.startLogin")) as Record<string, unknown>;
  }

  async wechatGetLoginState(): Promise<Record<string, unknown>> {
    return (await this.kernel.call("robot.wechat.getLoginState")) as Record<string, unknown>;
  }

  async wechatSubmitVerifyCode(code: string): Promise<Record<string, unknown>> {
    return (await this.kernel.call("robot.wechat.submitVerifyCode", { code })) as Record<string, unknown>;
  }

  async wechatLogout(): Promise<Record<string, unknown>> {
    return (await this.kernel.call("robot.wechat.logout")) as Record<string, unknown>;
  }

  async getHistory(limit = 30): Promise<{ ok?: boolean; items?: Array<Record<string, unknown>> } | null> {
    try {
      return (await this.kernel.call("robot.getHistory", { limit })) as { ok?: boolean; items?: Array<Record<string, unknown>> };
    } catch {
      return null;
    }
  }

  async getSessions(): Promise<Array<Record<string, unknown>>> {
    try {
      const result = await this.kernel.call("robot.getSessions");
      return Array.isArray(result) ? result as Array<Record<string, unknown>> : [];
    } catch {
      return [];
    }
  }

  async resetSession(key: { provider: string; accountId: string; chatId: string; senderId?: string }): Promise<void> {
    await this.kernel.call("robot.resetSession", key);
  }

  async activateSession(key: { provider: string; accountId: string; chatId: string; senderId?: string }, conversationId: string): Promise<void> {
    await this.kernel.call("robot.activateSession", { key, conversationId });
  }

  async renameSession(conversationId: string, title: string): Promise<void> {
    await this.kernel.call("robot.renameSession", { conversationId, title });
  }

  async deleteSession(conversationId: string): Promise<void> {
    await this.kernel.call("robot.deleteSession", { conversationId });
  }

  // ── 配对捕获 ──

  async startPairing(provider: RobotProviderId): Promise<Record<string, unknown>> {
    return (await this.kernel.call("robot.startPairing", { provider })) as Record<string, unknown>;
  }

  async getPairing(): Promise<{ ok?: boolean; pairing?: Record<string, unknown> | null } | null> {
    try {
      return (await this.kernel.call("robot.getPairing")) as { ok?: boolean; pairing?: Record<string, unknown> | null };
    } catch {
      return null;
    }
  }

  async approvePairing(provider: RobotProviderId, senderId?: string, chatId?: string): Promise<Record<string, unknown>> {
    return (await this.kernel.call("robot.approvePairing", { provider, senderId, chatId })) as Record<string, unknown>;
  }

  async cancelPairing(): Promise<void> {
    await this.kernel.call("robot.cancelPairing");
  }
}
