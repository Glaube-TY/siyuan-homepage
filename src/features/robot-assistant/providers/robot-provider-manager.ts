import type { RobotProvider } from "../contracts/robot-provider-contract";
import type { RobotOutboundMessage } from "../contracts/robot-message";
import type { RobotProviderId, RobotProviderRuntimeStatus } from "../contracts/robot-provider";

/**
 * Provider 管理器：注册 Kernel 侧 Provider（微信），并记录 Electron Provider 的注册状态。
 * 失败隔离：单个 Provider 失败不影响其他 Provider。
 */
export interface RobotProviderManager {
  register(provider: RobotProvider): void;
  unregister(providerId: RobotProviderId): void;
  get(providerId: RobotProviderId): RobotProvider | null;
  getStatus(providerId: RobotProviderId): RobotProviderRuntimeStatus;
  listStatus(): RobotProviderRuntimeStatus[];
  /** 发送出站消息：优先 Kernel 侧 Provider，否则返回 false 由调用方转发前端。 */
  send(message: RobotOutboundMessage): Promise<{ ok: boolean; forwardedToClient: boolean; errorCode?: string; message?: string }>;
  dispose(): Promise<void>;
}

export class InMemoryRobotProviderManager implements RobotProviderManager {
  private readonly providers = new Map<string, RobotProvider>();

  register(provider: RobotProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: RobotProviderId): void {
    const provider = this.providers.get(providerId);
    if (provider) void provider.dispose();
    this.providers.delete(providerId);
  }

  get(providerId: RobotProviderId): RobotProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  getStatus(providerId: RobotProviderId): RobotProviderRuntimeStatus {
    const provider = this.providers.get(providerId);
    if (provider) return provider.getStatus();
    return {
      provider: providerId,
      runtimeKind: providerId === "wechat" ? "kernel" : "electron",
      availability: providerId === "wechat" ? "kernel_runtime_unavailable" : "electron_runtime_unavailable",
      status: "offline",
      updatedAt: Date.now(),
      message: providerId === "wechat" ? "微信 Kernel Provider 未注册" : "桌面 Provider 未连接",
    };
  }

  listStatus(): RobotProviderRuntimeStatus[] {
    return Array.from(this.providers.keys())
      .map((id) => this.getStatus(id as RobotProviderId));
  }

  async send(message: RobotOutboundMessage): Promise<{ ok: boolean; forwardedToClient: boolean; errorCode?: string; message?: string }> {
    const provider = this.providers.get(message.provider);
    if (provider) {
      const result = await provider.send(message);
      return {
        ok: result.ok,
        forwardedToClient: false,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.message ? { message: result.message } : {}),
      };
    }
    return { ok: false, forwardedToClient: true };
  }

  async dispose(): Promise<void> {
    await Promise.all(Array.from(this.providers.values()).map((provider) => provider.dispose()));
    this.providers.clear();
  }
}
