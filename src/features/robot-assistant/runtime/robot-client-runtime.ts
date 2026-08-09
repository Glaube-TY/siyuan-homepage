/**
 * 前端 Robot 客户端运行时。
 *
 * 职责（方案 §src/index.ts、§Electron Provider 注册、§前端关闭与 Provider 状态）：
 * - 桥接 Kernel RPC：入站消息 → `robot.ingestExternalMessage`；出站 `robot.outbound` → Provider.sendText。
 * - Electron Provider（飞书 / QQ）：检测 Electron + window.require，加载 bundle，
 *   读取解密后的凭证，connect，并上报状态给 Kernel。
 * - 状态同步：`robot.statusChanged` / `robot.providerStatusChanged` 变化时刷新 Electron Provider。
 * - 生命周期：插件 unload 时 disconnect 并上报 offline。
 */

import { RobotKernelClient } from "./robot-kernel-client";
import { loadElectronProviderModule, type ElectronProviderApi, type ElectronProviderModule } from "./robot-electron-provider-loader";
import {
  resolveElectronProviderCredentials,
  type ElectronCredentialStoragePort,
} from "./robot-electron-credentials";
import type { RobotAssistantSettings } from "../settings/robot-settings-types";
import type { RobotProviderId } from "../contracts/robot-provider";
import type { NormalizedRobotMessage, RobotOutboundMessage } from "../contracts/robot-message";

export interface RobotClientRuntimeLogger {
  info?(entry: { status?: string; provider?: string; message?: string }): void;
  warn?(entry: { status?: string; provider?: string; message?: string }): void;
  error?(entry: { status?: string; provider?: string; message?: string }): void;
}

export interface RobotClientRuntimeDeps {
  /** 插件名（用于定位 runtime bundle 路径）。 */
  pluginName: string;
  kernel: RobotKernelClient;
  storage: ElectronCredentialStoragePort;
  isElectron(): boolean;
  /** Provider bundle 加载器（测试注入用；缺省走 window.require 实现）。 */
  loadProviderModule?(providerId: "feishu" | "qq"): Promise<ElectronProviderModule | null>;
  logger?: RobotClientRuntimeLogger;
}

export class RobotClientRuntime {
  private readonly providers = new Map<"feishu" | "qq", { api: ElectronProviderApi }>();
  private readonly unsubscribes: Array<() => void> = [];
  private started = false;
  private settings: RobotAssistantSettings | null = null;

  constructor(private readonly deps: RobotClientRuntimeDeps) {}

  async start(): Promise<void> {
    if (this.started) return;

    if (!this.deps.kernel.available) {
      this.deps.logger?.warn?.({ status: "kernel_unavailable" });
      return;
    }
    this.started = true;

    this.unsubscribes.push(this.deps.kernel.subscribe("robot.outbound", (payload) => {
      void this.handleOutbound(payload);
    }));
    this.unsubscribes.push(this.deps.kernel.subscribe("robot.statusChanged", () => {
      void this.refreshElectronProviders();
    }));
    this.unsubscribes.push(this.deps.kernel.subscribe("robot.providerStatusChanged", () => {
      void this.refreshElectronProviders();
    }));

    await this.refreshElectronProviders();
  }

  async stop(): Promise<void> {
    for (const unsubscribe of this.unsubscribes.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // 忽略解绑错误
      }
    }
    for (const providerId of Array.from(this.providers.keys())) {
      await this.unregisterElectronProvider(providerId);
    }
    this.settings = null;
    this.started = false;
  }

  async refreshElectronProviders(): Promise<void> {
    if (!this.deps.isElectron()) return;
    let settings: RobotAssistantSettings | null = null;
    try {
      const runtime = (await this.deps.kernel.call("robot.getStatus")) as { status?: string } | null;
      if (!runtime || runtime.status !== "running") {
        for (const providerId of Array.from(this.providers.keys())) {
          await this.unregisterElectronProvider(providerId);
        }
        return;
      }
      const raw = (await this.deps.kernel.call("robot.getSettings")) as { ok?: boolean; settings?: RobotAssistantSettings };
      settings = raw && typeof raw === "object" && raw.settings && typeof raw.settings === "object"
        ? raw.settings
        : null;
    } catch {
      this.deps.logger?.warn?.({ status: "get_settings_failed" });
      return;
    }
    if (!settings) return;
    this.settings = settings;

    const enabled = new Set<"feishu" | "qq">();
    if (settings.activeProvider === "feishu" || settings.activeProvider === "qq") {
      enabled.add(settings.activeProvider);
    }

    for (const providerId of Array.from(this.providers.keys())) {
      if (!enabled.has(providerId)) {
        await this.unregisterElectronProvider(providerId);
      }
    }
    for (const id of enabled) {
      if (!this.providers.has(id)) {
        await this.registerElectronProvider(id);
      }
    }
  }

  private async registerElectronProvider(providerId: "feishu" | "qq"): Promise<void> {
    const module = this.deps.loadProviderModule
      ? await this.deps.loadProviderModule(providerId)
      : await loadElectronProviderModule(this.deps.pluginName, providerId);
    if (!module) {
      this.deps.logger?.warn?.({ provider: providerId, status: "electron_runtime_unavailable" });
      await this.reportProviderStatus(providerId, {
        provider: providerId,
        runtimeKind: "electron",
        availability: "electron_runtime_unavailable",
        status: "offline",
        updatedAt: Date.now(),
      });
      return;
    }

    const credentials = await resolveElectronProviderCredentials(this.deps.storage, this.settings, providerId);
    if (!credentials) {
      this.deps.logger?.warn?.({ provider: providerId, status: "not_configured" });
      await this.reportProviderStatus(providerId, {
        provider: providerId,
        runtimeKind: "electron",
        availability: "not_configured",
        status: "disconnected",
        updatedAt: Date.now(),
      });
      return;
    }

    let api: ElectronProviderApi;
    try {
      api = module.create({ appId: credentials.appId, appSecret: credentials.appSecret, accountId: credentials.appId });
    } catch {
      this.deps.logger?.error?.({ provider: providerId, status: "create_failed" });
      await this.reportProviderStatus(providerId, {
        provider: providerId,
        runtimeKind: "electron",
        availability: "electron_runtime_unavailable",
        status: "error",
        updatedAt: Date.now(),
      });
      return;
    }

    api.setMessageHandler((raw) => this.handleInboundMessage(raw));
    api.setStatusHandler?.((status) => {
      void this.reportProviderStatus(providerId, status);
    });
    this.providers.set(providerId, { api });

    try {
      await api.connect();
    } catch {
      // connect 内部会设置 status=error；继续上报其状态
    }
    await this.reportProviderStatus(providerId, api.getStatus() as Record<string, unknown>);
  }

  private async unregisterElectronProvider(providerId: "feishu" | "qq"): Promise<void> {
    const entry = this.providers.get(providerId);
    if (entry) {
      try {
        await entry.api.disconnect();
      } catch {
        // 忽略关闭错误
      }
    }
    this.providers.delete(providerId);
    await this.reportProviderStatus(providerId, {
      provider: providerId,
      runtimeKind: "electron",
      availability: "electron_runtime_unavailable",
      status: "offline",
      updatedAt: Date.now(),
    });
  }

  private async handleInboundMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== "object") return;
    const provider = (raw as { provider?: unknown }).provider;
    if (provider !== this.settings?.activeProvider) return;
    try {
      await this.deps.kernel.call("robot.ingestExternalMessage", raw as NormalizedRobotMessage);
    } catch (error) {
      this.deps.logger?.error?.({ status: "ingest_failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async handleOutbound(payload: unknown): Promise<void> {
    const message = payload as RobotOutboundMessage | null | undefined;
    if (!message || typeof message !== "object") return;
    if (message.provider !== "feishu" && message.provider !== "qq") return;
    const provider = this.providers.get(message.provider);
    if (!provider) return;
    try {
      await provider.api.sendText({
        chatId: message.chatId,
        text: message.text,
        ...(message.replyToMessageId ? { replyToMessageId: message.replyToMessageId } : {}),
        ...(message.contextToken ? { contextToken: message.contextToken } : {}),
      });
    } catch (error) {
      this.deps.logger?.error?.({ provider: message.provider, status: "send_failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async reportProviderStatus(providerId: RobotProviderId, status: Record<string, unknown>): Promise<void> {
    if (!this.deps.kernel.available) return;
    try {
      await this.deps.kernel.call("robot.registerElectronProvider", { provider: providerId, status });
    } catch {
      // 状态上报失败不阻断
    }
  }
}
