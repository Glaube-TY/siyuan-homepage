import type { RobotKernelHost } from "../kernel/kernel-host";
import { createKernelHttpPort } from "../kernel/kernel-http-port";
import {
  createKernelModelConfigStore,
  createKernelSecretStoragePort,
  createRobotSettingsKernelStore,
  type RobotSettingsKernelStore,
} from "../kernel/kernel-stores";
import { KernelRobotSessionStore, KernelRobotConfirmationStore, KernelRobotHistoryStore, KernelRobotPairingStore } from "../kernel/kernel-kv-stores";
import { KernelRobotDedup } from "../kernel/kernel-dedup";
import { RobotSecretVaultStore } from "../features/robot-assistant/security/robot-secret-vault-store";
import { KernelRobotAgentRuntime } from "../features/robot-assistant/agent/kernel-robot-agent-runtime";
import { RobotCore } from "../features/robot-assistant/core/robot-core";
import { KernelAgentHttpTransport } from "../features/kb/services/agent-core/providers/agent-http-transport";
import { InMemoryRobotProviderManager, type RobotProviderManager } from "../features/robot-assistant/providers/robot-provider-manager";
import type { NativeToolRegistry } from "../features/kb/services/agent-core/tools/native-tool-registry";
import type { RobotAssistantSettings, RobotRuntimeOwner } from "../features/robot-assistant/settings/robot-settings-types";
import type { RobotModelConfigStore } from "../features/robot-assistant/runtime/robot-model-config";
import type { NormalizedRobotMessage, RobotOutboundMessage } from "../features/robot-assistant/contracts/robot-message";
import type { RobotProviderId, RobotProviderRuntimeStatus, RobotStatus } from "../features/robot-assistant/contracts/robot-provider";
import type { RobotAdmissionSettings } from "../features/robot-assistant/contracts/robot-pairing";
import type { RobotPairingCaptureState } from "../features/robot-assistant/contracts/robot-pairing";
import type { RobotConfirmationOutcome } from "../features/robot-assistant/core/robot-core";
import { createDefaultRobotAdmission, createDefaultRobotAssistantSettings } from "../features/robot-assistant/settings/robot-settings-types";
import { normalizeV2Settings } from "../features/robot-assistant/settings/robot-settings-migration";
import { normalizeRobotAgentRuntimeConfig } from "../features/robot-assistant/runtime/robot-model-config";
import { RobotSessionService } from "../features/robot-assistant/session/robot-session-service";
import type { WeChatKernelProvider } from "../features/robot-assistant/providers/wechat/wechat-kernel-provider";
import { createRobotId } from "../features/robot-assistant/contracts/robot-id";

export const ROBOT_MODEL_API_KEY_SECRET = "model-api-key";

export interface RobotKernelRuntimeOptions {
  toolRegistry: NativeToolRegistry;
  /** 由 secret vault 读取模型 API Key；null 时表示未配置。缺省从 vault 读取。 */
  getModelApiKey?(): Promise<string | null>;
  providerManager?: RobotProviderManager;
  isEntitlementAvailable?(): Promise<boolean>;
}

export class RobotKernelRuntime {
  private readonly settingsStore: RobotSettingsKernelStore;
  private readonly modelConfigStore: RobotModelConfigStore;
  private readonly secretVault: RobotSecretVaultStore;
  private readonly sessionStore: KernelRobotSessionStore;
  private readonly confirmationStore: KernelRobotConfirmationStore;
  private readonly historyStore: KernelRobotHistoryStore;
  private readonly dedup: KernelRobotDedup;
  private readonly pairingStore: KernelRobotPairingStore;
  private readonly providerManager: RobotProviderManager;
  private readonly toolRegistry: NativeToolRegistry;
  /** Electron Provider（飞书 / QQ）状态注册表：由前端 RPC 上报，Kernel 只记录状态不运行。 */
  private readonly electronProviderStatuses = new Map<RobotProviderId, RobotProviderRuntimeStatus>();
  private readonly core: RobotCore;
  private wechatProvider: WeChatKernelProvider | null = null;
  private statusValue: RobotStatus = "stopped";
  private settings: RobotAssistantSettings;
  private runtimeDevice: RobotRuntimeOwner | null = null;
  private mobileRuntimeDevice = false;
  private cancelOwnershipCheck: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly host: RobotKernelHost, options: RobotKernelRuntimeOptions) {
    this.toolRegistry = options.toolRegistry;
    const secretStorage = createKernelSecretStoragePort(host);
    this.secretVault = new RobotSecretVaultStore(secretStorage);
    this.settingsStore = createRobotSettingsKernelStore(host);
    this.modelConfigStore = createKernelModelConfigStore(host);
    this.sessionStore = new KernelRobotSessionStore(host);
    this.confirmationStore = new KernelRobotConfirmationStore(host);
    this.historyStore = new KernelRobotHistoryStore(host);
    this.dedup = new KernelRobotDedup(host);
    this.pairingStore = new KernelRobotPairingStore(host);
    this.providerManager = options.providerManager ?? new InMemoryRobotProviderManager();

    const agentRuntime = new KernelRobotAgentRuntime({
      transport: new KernelAgentHttpTransport(createKernelHttpPort(host)),
      toolRegistry: options.toolRegistry,
      modelConfigStore: this.modelConfigStore,
      getApiKey: () => (options.getModelApiKey
        ? options.getModelApiKey()
        : this.secretVault.readSecret(ROBOT_MODEL_API_KEY_SECRET)),
      requestConfirmation: (confirmation, promptText) => this.core.requestConfirmation(confirmation, promptText),
      timeout: (fn, ms) => host.timeout(fn, ms),
    });

    this.core = new RobotCore({
      getSettings: async () => this.settings ?? (await this.reloadSettings()),
      isEntitlementAvailable: options.isEntitlementAvailable ?? (async () => false),
      getProviderAdmission: async (providerId) => this.getProviderAdmission(providerId as RobotProviderId),
      getProviderStatus: async (providerId) => this.getProviderStatus(providerId as RobotProviderId),
      getPairingState: async (providerId) => {
        const state = await this.pairingStore.get();
        return state && state.enabled && state.provider === providerId ? state : null;
      },
      capturePairingMessage: (message) => this.capturePairingMessage(message),
      sessionStore: this.sessionStore,
      historyStore: this.historyStore,
      confirmationStore: this.confirmationStore,
      dedup: this.dedup,
      agentRuntime,
      sendOutbound: (message) => this.sendOutbound(message),
      onHistoryChanged: () => this.host.notify("robot.historyChanged", {}),
      now: () => Date.now(),
      timeout: (fn, ms) => host.timeout(fn, ms),
      log: host.log,
    });
    this.settings = createDefaultRobotAssistantSettings();
  }

  private async reloadSettings(): Promise<RobotAssistantSettings> {
    this.settings = await this.settingsStore.load();
    this.historyStore.setLimit(this.settings.keepHistoryLimit);
    await this.historyStore.prune();
    return this.settings;
  }

  async initialize(): Promise<void> {
    this.disposed = false;
    await this.dedup.restore();
    await this.reloadSettings();
    await this.resolveRuntimeDevice();
    this.scheduleOwnershipCheck();
    // 提前统一主密钥存储格式，确保随后启动的 Electron Provider 可通过 Plugin.loadData 解密。
    await this.secretVault.getMasterSecret();
    const expiredConfirmations = await this.core.expirePersistedConfirmations();
    if (expiredConfirmations > 0) {
      this.host.log.info({
        status: "pending_confirmations_expired_after_restart",
        message: `count=${expiredConfirmations}`,
      });
    }
    this.host.log.info({ status: "kernel_initialized" });
  }

  get status(): RobotStatus {
    return this.statusValue;
  }

  async start(): Promise<void> {
    await this.initialize();
    if (this.isMobileRuntimeDevice()) {
      await this.disableMobileRuntime();
      return;
    }
    if (!this.settings.enabled) {
      this.statusValue = "disabled";
      this.host.notify("robot.statusChanged", { status: this.statusValue });
      return;
    }
    if (!this.isCurrentRuntimeOwner()) {
      await this.enterStandby();
      return;
    }
    await this.activateProviders();
  }

  /** 挂载微信 Kernel Provider（入口在 createRobotKernel 时调用）。 */
  mountWechatProvider(provider: WeChatKernelProvider): void {
    this.wechatProvider = provider;
    provider.setMessageHandler((message) => this.ingestExternalMessage(message));
    this.providerManager.register(provider);
    this.host.notify("robot.providerStatusChanged", provider.getStatus());
  }

  /** 暴露微信 Provider（供 robot.wechat.* RPC 接线）。 */
  getWechatProvider(): WeChatKernelProvider | null {
    return this.wechatProvider;
  }

  async stop(): Promise<void> {
    this.statusValue = "stopped";
    await this.wechatProvider?.disconnect();
    this.electronProviderStatuses.clear();
    this.host.notify("robot.statusChanged", { status: this.statusValue });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  getSettings(): RobotAssistantSettings {
    return this.settings;
  }

  async saveSettings(next: RobotAssistantSettings): Promise<RobotAssistantSettings> {
    const previous = this.settings;
    this.settings = normalizeV2Settings(next);
    this.clearInactiveElectronProviderStatuses();
    this.historyStore.setLimit(this.settings.keepHistoryLimit);
    await this.historyStore.prune();
    await this.settingsStore.save(this.settings);
    if (previous.activeProvider !== this.settings.activeProvider) {
      await this.pairingStore.clear();
      this.host.notify("robot.pairingChanged", { enabled: false });
    }
    if (this.isMobileRuntimeDevice()) {
      await this.disableMobileRuntime();
    } else if (!this.settings.enabled) {
      this.statusValue = "disabled";
      await this.wechatProvider?.disconnect();
      this.electronProviderStatuses.clear();
    } else if (!this.isCurrentRuntimeOwner()) {
      await this.enterStandby();
    } else if (this.statusValue !== "running") {
      await this.start();
    } else {
      await this.reconcileSelectedProvider(previous.activeProvider);
    }
    // 设置变化 → 前端刷新 Electron Provider 注册（启用/停用飞书、QQ 等）。
    this.host.notify("robot.statusChanged", { status: this.statusValue });
    return this.settings;
  }

  getRuntimeDevice(): RobotRuntimeOwner | null {
    return this.runtimeDevice ? { ...this.runtimeDevice } : null;
  }

  private isCurrentRuntimeOwner(): boolean {
    const owner = this.settings.runtimeOwner;
    if (!owner?.deviceId) return false;
    return Boolean(this.runtimeDevice?.deviceId && this.runtimeDevice.deviceId === owner.deviceId);
  }

  private isMobileRuntimeDevice(): boolean {
    return this.mobileRuntimeDevice;
  }

  private async disableMobileRuntime(): Promise<void> {
    this.statusValue = "disabled";
    await this.wechatProvider?.disconnect();
    this.electronProviderStatuses.clear();
    this.host.notify("robot.statusChanged", { status: this.statusValue });
  }

  private async enterStandby(): Promise<void> {
    this.statusValue = "standby";
    await this.wechatProvider?.disconnect();
    this.electronProviderStatuses.clear();
    this.host.notify("robot.statusChanged", { status: this.statusValue });
  }

  private async activateProviders(): Promise<void> {
    this.statusValue = "running";
    if (this.settings.activeProvider === "wechat" && this.wechatProvider) {
      this.providerManager.register(this.wechatProvider);
      await this.wechatProvider.connect();
    }
    this.host.notify("robot.statusChanged", { status: this.statusValue });
  }

  private async reconcileSelectedProvider(previousProvider: RobotAssistantSettings["activeProvider"]): Promise<void> {
    if (!this.wechatProvider) return;
    if (this.settings.activeProvider !== "wechat") {
      await this.wechatProvider.disconnect();
      return;
    }
    if (previousProvider !== "wechat") await this.wechatProvider.connect();
  }

  private clearInactiveElectronProviderStatuses(): void {
    for (const providerId of Array.from(this.electronProviderStatuses.keys())) {
      if (providerId !== this.settings.activeProvider) this.electronProviderStatuses.delete(providerId);
    }
  }

  private scheduleOwnershipCheck(): void {
    if (this.disposed) return;
    this.cancelOwnershipCheck?.();
    this.cancelOwnershipCheck = this.host.timeout(() => {
      void this.refreshRuntimeOwnership()
        .catch((error) => this.host.log.warn({
          status: "runtime_owner_refresh_failed",
          message: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
        }))
        .finally(() => this.scheduleOwnershipCheck());
    }, 10_000);
  }

  private async refreshRuntimeOwnership(): Promise<void> {
    const latest = await this.settingsStore.load();
    if (JSON.stringify(latest) === JSON.stringify(this.settings)) return;
    const previous = this.settings;
    this.settings = latest;
    this.clearInactiveElectronProviderStatuses();
    if (previous.activeProvider !== this.settings.activeProvider) {
      await this.pairingStore.clear();
      this.host.notify("robot.pairingChanged", { enabled: false });
    }
    this.historyStore.setLimit(this.settings.keepHistoryLimit);
    if (this.isMobileRuntimeDevice()) {
      await this.disableMobileRuntime();
      return;
    }
    if (!this.settings.enabled) {
      this.statusValue = "disabled";
      await this.wechatProvider?.disconnect();
      this.electronProviderStatuses.clear();
      this.host.notify("robot.statusChanged", { status: this.statusValue });
      return;
    }
    if (!this.isCurrentRuntimeOwner()) {
      if (this.statusValue === "running") await this.enterStandby();
      return;
    }
    if (this.statusValue !== "running") await this.activateProviders();
    else {
      await this.reconcileSelectedProvider(previous.activeProvider);
      this.host.notify("robot.statusChanged", { status: this.statusValue });
    }
  }

  private async resolveRuntimeDevice(): Promise<void> {
    try {
      const response = await this.host.siyuanPost("/api/system/getConf", {});
      const data = response.data && typeof response.data === "object"
        ? response.data as Record<string, unknown>
        : {};
      const conf = data.conf && typeof data.conf === "object" ? data.conf as Record<string, unknown> : {};
      const system = conf.system && typeof conf.system === "object" ? conf.system as Record<string, unknown> : {};
      const deviceId = typeof system.id === "string" ? system.id.trim() : "";
      const container = typeof system.container === "string" ? system.container.trim() : "";
      const os = typeof system.os === "string" ? system.os.trim() : "";
      this.mobileRuntimeDevice = /android|ios|iphone|ipad|harmony|mobile/.test(`${container}|${os}`.toLowerCase());
      if (!deviceId) return;
      this.runtimeDevice = {
        deviceId,
        deviceName: typeof system.name === "string" ? system.name.trim() : "",
        container,
      };
    } catch {
      this.runtimeDevice = null;
      this.mobileRuntimeDevice = false;
    }
  }

  async syncAgentRuntimeConfig(raw: unknown): Promise<void> {
    const normalized = normalizeRobotAgentRuntimeConfig(raw);
    if (normalized) await this.modelConfigStore.set(normalized);
  }

  async getAgentModelStatus(): Promise<{ configured: boolean; providerId?: string; modelId?: string; providerType?: string }> {
    const snapshot = await this.modelConfigStore.get();
    if (!snapshot) return { configured: false };
    return { configured: true, providerId: snapshot.providerId, modelId: snapshot.modelId, providerType: snapshot.providerType };
  }

  getToolCapabilities(): Array<{ name: string; readOnly: boolean }> {
    return this.toolRegistry.list().map((tool) => ({ name: tool.name, readOnly: tool.readOnly }));
  }

  /** 同步 Agent 模型 API Key 到 Robot Secret Vault（Kernel 不保存明文）。 */
  async syncAgentApiKey(apiKey: string): Promise<void> {
    const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
    if (!trimmed) {
      await this.secretVault.deleteSecret(ROBOT_MODEL_API_KEY_SECRET);
      return;
    }
    await this.secretVault.saveSecret(ROBOT_MODEL_API_KEY_SECRET, trimmed);
  }

  /**
   * 统一由 Kernel 为 Electron 渠道加密 App Secret。
   * 返回值仅为密文 envelope，明文不会写入设置、历史或日志。
   */
  async encryptProviderSecret(plaintext: string): Promise<string> {
    return this.secretVault.encryptExternalSecret(plaintext);
  }

  /** 检查飞书 / QQ 当前保存的 App ID 与 App Secret 是否可供运行端使用。 */
  async validateElectronProviderCredentials(providerId: "feishu" | "qq"): Promise<boolean> {
    const section = this.settings[providerId];
    const appId = typeof section.appId === "string" ? section.appId.trim() : "";
    const envelope = typeof section.encryptedAppSecret === "string" ? section.encryptedAppSecret.trim() : "";
    return Boolean(appId && envelope && await this.secretVault.canDecryptExternalSecret(envelope));
  }

  getProviderStatus(providerId: RobotProviderId): RobotProviderRuntimeStatus {
    const electron = this.electronProviderStatuses.get(providerId);
    if (electron) return electron;
    return this.providerManager.getStatus(providerId);
  }

  /** 前端注册 / 更新 Electron Provider（飞书 / QQ）状态。Kernel 不运行它们，只记录并通知。 */
  async updateElectronProviderStatus(providerId: RobotProviderId, status: RobotProviderRuntimeStatus): Promise<void> {
    if (providerId === "wechat") return;
    if (providerId !== this.settings.activeProvider) {
      this.electronProviderStatuses.delete(providerId);
      this.host.notify("robot.providerStatusChanged", this.getProviderStatus(providerId));
      return;
    }
    if (status && status.status === "offline") {
      this.electronProviderStatuses.delete(providerId);
    } else if (status) {
      this.electronProviderStatuses.set(providerId, { ...status, provider: providerId });
    }
    this.host.notify("robot.providerStatusChanged", this.getProviderStatus(providerId));
  }

  getProviderAdmission(providerId: RobotProviderId): RobotAdmissionSettings {
    const section = this.settings?.[providerId];
    return (section && "admission" in section ? section.admission : null) ?? createDefaultRobotAdmission();
  }

  async ingestExternalMessage(message: NormalizedRobotMessage): Promise<void> {
    if (this.statusValue !== "running") return;
    if (message.provider !== this.settings.activeProvider) return;
    await this.core.handleIncomingMessage(message);
  }

  async getHistory(limit: number): Promise<unknown[]> {
    return this.historyStore.list(limit);
  }

  async clearHistory(): Promise<void> {
    await this.historyStore.clear();
    this.host.notify("robot.historyChanged", {});
  }

  async getSessions(): Promise<unknown[]> {
    const sessions = await this.sessionStore.list();
    const activeIds = new Set(Object.values(await this.sessionStore.activeConversationIds()));
    return sessions.map((session) => ({
      key: session.key,
      conversationId: session.conversationId,
      title: session.title,
      active: activeIds.has(session.conversationId),
      messageCount: session.recentMessages.length,
      toolCallCount: session.toolCallSummaries.length,
      messages: session.recentMessages,
      toolCalls: session.toolCallSummaries,
      lastActivityAt: session.lastActivityAt,
      createdAt: session.createdAt,
      pendingConfirmation: Boolean(session.pendingConfirmationId),
      modelSnapshot: session.modelSnapshot,
    }));
  }

  async resetSession(key: { provider: string; accountId: string; chatId: string; senderId?: string }): Promise<void> {
    const sessionService = new RobotSessionService(this.sessionStore);
    await sessionService.create(sessionService.keyFromParts(key), createRobotId(), "新对话");
  }

  async activateSession(key: { provider: string; accountId: string; chatId: string; senderId?: string }, conversationId: string): Promise<boolean> {
    const sessionService = new RobotSessionService(this.sessionStore);
    return sessionService.activate(sessionService.keyFromParts(key), conversationId);
  }

  async renameSession(conversationId: string, title: string): Promise<boolean> {
    return new RobotSessionService(this.sessionStore).rename(conversationId, title);
  }

  async deleteSession(conversationId: string): Promise<boolean> {
    return new RobotSessionService(this.sessionStore).delete(conversationId);
  }

  // ── 配对捕获（Provider-independent，方案 §Robot Admission / 白名单） ──

  async startPairing(provider: RobotProviderId, ttlMs = 2 * 60 * 1000): Promise<RobotPairingCaptureState> {
    if (provider !== this.settings.activeProvider) {
      throw new Error("只能捕获当前使用机器人的消息，请先在总体设置中切换渠道");
    }
    const state: RobotPairingCaptureState = {
      enabled: true,
      provider,
      expiresAt: Date.now() + Math.max(ttlMs, 30_000),
    };
    await this.pairingStore.put(state);
    this.host.notify("robot.pairingChanged", state);
    return state;
  }

  async getPairing(): Promise<RobotPairingCaptureState | null> {
    const state = await this.pairingStore.get();
    if (!state?.enabled) return null;
    if (Date.now() > state.expiresAt) {
      await this.cancelPairing();
      return null;
    }
    return state;
  }

  /** 被 RobotCore 在捕获模式下调用；返回 true 表示已捕获并消费该消息。 */
  async capturePairingMessage(message: NormalizedRobotMessage): Promise<boolean> {
    const state = await this.pairingStore.get();
    if (!state?.enabled || state.provider !== message.provider) return false;
    if (Date.now() > state.expiresAt) {
      await this.cancelPairing();
      return false;
    }
    if (message.chatType !== "private" || message.messageType !== "text" || message.isFromBot) return false;

    const next: RobotPairingCaptureState = {
      ...state,
      capturedAt: Date.now(),
      senderId: message.senderId,
      ...(message.senderName ? { senderName: message.senderName } : {}),
      chatId: message.chatId,
    };
    await this.pairingStore.put(next);
    this.host.notify("robot.pairingChanged", next);

    await this.sendOutbound({
      provider: message.provider,
      accountId: message.accountId,
      chatId: message.chatId,
      replyToMessageId: message.messageId,
      contextToken: message.contextToken,
      text: "已捕获该账号，请回到思源设置页确认是否允许。",
      kind: "status",
    });
    return true;
  }

  async approvePairing(provider: RobotProviderId, senderId?: string, chatId?: string): Promise<{ ok: boolean; errorCode?: string }> {
    const state = await this.pairingStore.get();
    if (!state?.enabled) return { ok: false, errorCode: "no_active_pairing" };
    if (state.provider !== provider) return { ok: false, errorCode: "pairing_provider_mismatch" };

    const next: RobotAssistantSettings = { ...this.settings };
    if (provider === "wechat") {
      const section = next.wechat;
      const admission: RobotAdmissionSettings = {
        ...section.admission,
        allowedSenderIds: [...section.admission.allowedSenderIds],
        allowedChatIds: [...section.admission.allowedChatIds],
      };
      if (senderId && !admission.allowedSenderIds.includes(senderId)) admission.allowedSenderIds.push(senderId);
      if (chatId && !admission.allowedChatIds.includes(chatId)) admission.allowedChatIds.push(chatId);
      next.wechat = { ...section, admission };
    } else if (provider === "feishu") {
      const section = next.feishu;
      const admission: RobotAdmissionSettings = {
        ...section.admission,
        allowedSenderIds: [...section.admission.allowedSenderIds],
        allowedChatIds: [...section.admission.allowedChatIds],
      };
      if (senderId && !admission.allowedSenderIds.includes(senderId)) admission.allowedSenderIds.push(senderId);
      if (chatId && !admission.allowedChatIds.includes(chatId)) admission.allowedChatIds.push(chatId);
      next.feishu = { ...section, admission };
    } else if (provider === "qq") {
      const section = next.qq;
      const admission: RobotAdmissionSettings = {
        ...section.admission,
        allowedSenderIds: [...section.admission.allowedSenderIds],
        allowedChatIds: [...section.admission.allowedChatIds],
      };
      if (senderId && !admission.allowedSenderIds.includes(senderId)) admission.allowedSenderIds.push(senderId);
      if (chatId && !admission.allowedChatIds.includes(chatId)) admission.allowedChatIds.push(chatId);
      next.qq = { ...section, admission };
    } else {
      return { ok: false, errorCode: "unknown_provider" };
    }
    await this.saveSettings(next);

    await this.cancelPairing();
    return { ok: true };
  }

  async cancelPairing(): Promise<void> {
    await this.pairingStore.clear();
    this.host.notify("robot.pairingChanged", { enabled: false });
  }

  // ── 挂起确认（方案 §Kernel RPC: robot.confirm / robot.cancelConfirmation） ──

  async confirmConfirmation(confirmationId: string): Promise<{ ok: boolean; outcome?: RobotConfirmationOutcome; errorCode?: string }> {
    const outcome = await this.core.approvePendingConfirmation(confirmationId);
    if (!outcome) return { ok: false, errorCode: "no_pending_confirmation" };
    this.host.notify("robot.confirmationChanged", { confirmationId, outcome });
    return { ok: true, outcome };
  }

  async cancelConfirmation(confirmationId: string): Promise<{ ok: boolean; outcome?: RobotConfirmationOutcome; errorCode?: string }> {
    const outcome = await this.core.cancelPendingConfirmation(confirmationId);
    if (!outcome) return { ok: false, errorCode: "no_pending_confirmation" };
    this.host.notify("robot.confirmationChanged", { confirmationId, outcome: "rejected" });
    return { ok: true, outcome: "rejected" };
  }

  private async sendOutbound(message: RobotOutboundMessage): Promise<{ ok: boolean; errorCode?: string; message?: string }> {
    if (this.statusValue !== "running") {
      return { ok: false, errorCode: "runtime_not_active", message: "当前设备不是机器人运行设备" };
    }
    if (message.provider !== this.settings.activeProvider) {
      return { ok: false, errorCode: "provider_not_active", message: "该渠道当前未接入机器人内核" };
    }
    const result = await this.providerManager.send(message);
    if (!result.ok && result.forwardedToClient) {
      // Electron Provider（飞书 / QQ）由前端监听 robot.outbound 转发。
      this.host.notify("robot.outbound", message);
      return { ok: true };
    }
    if (!result.ok) {
      this.host.log.error({
        provider: message.provider,
        status: "outbound_failed",
        errorCode: result.errorCode ?? "provider_send_failed",
        message: result.message?.slice(0, 160),
      });
    }
    return {
      ok: result.ok,
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      ...(result.message ? { message: result.message } : {}),
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.cancelOwnershipCheck?.();
    this.cancelOwnershipCheck = null;
    await this.stop();
    await this.providerManager.dispose();
    await this.host.dispose?.();
  }
}

