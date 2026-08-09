import type { RobotKernelHost } from "./kernel-host";
import type { RobotKernelRuntime } from "./kernel-runtime";
import type { NormalizedRobotMessage } from "../features/robot-assistant/contracts/robot-message";
import type { RobotProviderStatus, RobotProviderAvailability } from "../features/robot-assistant/contracts/robot-provider";

const ROBOT_PROVIDER_STATUSES = new Set<string>([
  "disabled", "disconnected", "connecting", "waiting_qr", "waiting_scan", "waiting_verify_code",
  "connected", "reconnecting", "reauth_required", "error", "offline",
]);
const ROBOT_PROVIDER_AVAILABILITIES = new Set<string>([
  "available", "electron_runtime_unavailable", "kernel_runtime_unavailable", "not_configured",
]);

export interface RobotKernelRpcOptions {
  /** WeChat Provider 相关 RPC（Increment 6 接线）。 */
  wechat?: {
    startLogin?(): Promise<unknown>;
    getLoginState?(): Promise<unknown>;
    submitVerifyCode?(payload: unknown): Promise<unknown>;
    logout?(): Promise<unknown>;
  };
}

/**
 * 注册 Robot Kernel RPC。
 * 状态更新以前端 notification 为主；页面进入时主动 get 一次 snapshot。
 */
export async function registerRobotKernelRpc(host: RobotKernelHost, runtime: RobotKernelRuntime, options: RobotKernelRpcOptions = {}): Promise<void> {
  const bindings: Promise<void>[] = [];
  const rpc = (method: string, handler: (payload: unknown) => Promise<unknown> | unknown) => {
    bindings.push(host.registerRpc(method, async (payload) => {
      try {
        return await handler(payload);
      } catch (error) {
        host.log.error({ status: "rpc_error", errorCode: method, message: error instanceof Error ? error.message.slice(0, 200) : String(error) });
        return { ok: false, errorCode: "rpc_error", message: error instanceof Error ? error.message : String(error) };
      }
    }));
  };

  rpc("robot.getStatus", async () => ({
    ok: true,
    status: runtime.status,
    model: await runtime.getAgentModelStatus(),
    providers: ["wechat", "feishu", "qq"].map((id) => runtime.getProviderStatus(id as "wechat" | "feishu" | "qq")),
    runtimeDevice: runtime.getRuntimeDevice(),
    runtimeOwner: runtime.getSettings().runtimeOwner,
  }));

  rpc("robot.getSettings", () => ({ ok: true, settings: runtime.getSettings() }));
  rpc("robot.saveSettings", async (payload) => {
    const settings = payload && typeof payload === "object" ? payload as Parameters<RobotKernelRuntime["saveSettings"]>[0] : undefined;
    if (!settings) return { ok: false, errorCode: "invalid_settings" };
    const saved = await runtime.saveSettings(settings);
    return { ok: true, settings: saved };
  });

  rpc("robot.start", () => runtime.start());
  rpc("robot.stop", () => runtime.stop());
  rpc("robot.restart", () => runtime.restart());

  rpc("robot.getCapabilities", () => ({
    ok: true,
    capabilities: {
      kernelRuntime: true,
      wechat: true,
      feishuElectron: true,
      qqElectron: true,
      textOnly: true,
      tools: runtime.getToolCapabilities(),
    },
  }));

  rpc("robot.getHistory", async (payload) => {
    const limit = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).limit === "number"
      ? (payload as Record<string, unknown>).limit as number
      : 50;
    return { ok: true, items: await runtime.getHistory(Math.max(1, Math.min(500, limit))) };
  });
  rpc("robot.clearHistory", () => runtime.clearHistory());

  rpc("robot.getSessions", () => runtime.getSessions());
  rpc("robot.resetSession", async (payload) => {
    const key = payload && typeof payload === "object" ? payload as { provider: string; accountId: string; chatId: string; senderId?: string } : undefined;
    if (!key) return { ok: false, errorCode: "invalid_session_key" };
    await runtime.resetSession(key);
    return { ok: true };
  });
  rpc("robot.activateSession", async (payload) => {
    const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const key = value.key && typeof value.key === "object"
      ? value.key as { provider: string; accountId: string; chatId: string; senderId?: string }
      : undefined;
    const conversationId = typeof value.conversationId === "string" ? value.conversationId : "";
    if (!key || !conversationId) return { ok: false, errorCode: "invalid_session" };
    return { ok: await runtime.activateSession(key, conversationId) };
  });
  rpc("robot.renameSession", async (payload) => {
    const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const conversationId = typeof value.conversationId === "string" ? value.conversationId : "";
    const title = typeof value.title === "string" ? value.title : "";
    if (!conversationId || !title.trim()) return { ok: false, errorCode: "invalid_session_title" };
    return { ok: await runtime.renameSession(conversationId, title) };
  });
  rpc("robot.deleteSession", async (payload) => {
    const conversationId = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).conversationId === "string"
      ? String((payload as Record<string, unknown>).conversationId)
      : "";
    if (!conversationId) return { ok: false, errorCode: "invalid_session" };
    return { ok: await runtime.deleteSession(conversationId) };
  });

  // 配对：generic Kernel service（Provider-independent）。
  rpc("robot.startPairing", async (payload) => {
    const provider = payload && typeof payload === "object" && (payload as Record<string, unknown>).provider;
    if (provider !== "wechat" && provider !== "feishu" && provider !== "qq") {
      return { ok: false, errorCode: "invalid_provider" };
    }
    const ttlMs = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).ttlMs === "number"
      ? (payload as Record<string, unknown>).ttlMs as number
      : undefined;
    const state = await runtime.startPairing(provider, ttlMs);
    return { ok: true, pairing: state };
  });
  rpc("robot.getPairing", async () => ({ ok: true, pairing: await runtime.getPairing() }));
  rpc("robot.approvePairing", async (payload) => {
    const p = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const provider = p.provider;
    if (provider !== "wechat" && provider !== "feishu" && provider !== "qq") {
      return { ok: false, errorCode: "invalid_provider" };
    }
    const senderId = typeof p.senderId === "string" ? p.senderId : undefined;
    const chatId = typeof p.chatId === "string" ? p.chatId : undefined;
    return await runtime.approvePairing(provider, senderId, chatId);
  });
  rpc("robot.cancelPairing", async () => {
    await runtime.cancelPairing();
    return { ok: true };
  });

  rpc("robot.ingestExternalMessage", (payload) => {
    if (!payload || typeof payload !== "object") return { ok: false, errorCode: "invalid_message" };
    // 飞书 / QQ 的事件回调必须尽快返回，否则平台会认为事件没有被消费并重投。
    // Agent turn 可能等待远端用户确认数分钟；若 RPC 一直等待整段 turn，后续“确认”
    // 和设置页的会话查询都会排在同一条 Kernel RPC 链路后面，形成确认超时死锁。
    // 这里只确认“已接收”，实际业务仍由 Robot Core 在 Kernel 后台完成。
    void runtime.ingestExternalMessage(payload as NormalizedRobotMessage).catch((error) => {
      host.log.error({
        status: "external_message_ingest_failed",
        errorCode: "robot.ingestExternalMessage",
        message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      });
    });
    return { ok: true, accepted: true };
  });

  // Electron Provider（飞书 / QQ）状态注册：前端加载 bundle 后上报，Kernel 只记录状态不运行。
  rpc("robot.registerElectronProvider", async (payload) => {
    const p = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const provider = p.provider;
    if (provider !== "feishu" && provider !== "qq") return { ok: false, errorCode: "invalid_provider" };
    const status = p.status && typeof p.status === "object" ? p.status as Record<string, unknown> : {};
    const statusValue = typeof status.status === "string" && ROBOT_PROVIDER_STATUSES.has(status.status)
      ? status.status as RobotProviderStatus
      : "offline";
    const availability = typeof status.availability === "string" && ROBOT_PROVIDER_AVAILABILITIES.has(status.availability)
      ? status.availability as RobotProviderAvailability
      : "electron_runtime_unavailable";
    const account = status.account && typeof status.account === "object"
      && typeof (status.account as Record<string, unknown>).accountId === "string"
      ? {
          accountId: String((status.account as Record<string, unknown>).accountId),
          authenticated: true,
          ...(typeof (status.account as Record<string, unknown>).displayName === "string"
            ? { displayName: String((status.account as Record<string, unknown>).displayName) }
            : {}),
        }
      : undefined;
    await runtime.updateElectronProviderStatus(provider, {
      provider,
      runtimeKind: "electron",
      availability,
      status: statusValue,
      updatedAt: typeof status.updatedAt === "number" ? status.updatedAt : Date.now(),
      ...(account ? { account } : {}),
    });
    return { ok: true };
  });

  rpc("robot.syncAgentRuntimeConfig", async (payload) => {
    await runtime.syncAgentRuntimeConfig(payload);
    return { ok: true };
  });

  // Agent 模型 API Key 同步：明文只经本地 RPC 进入 Kernel Secret Vault（加密落盘）。
  rpc("robot.syncAgentApiKey", async (payload) => {
    const apiKey = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).apiKey === "string"
      ? (payload as Record<string, unknown>).apiKey as string
      : "";
    await runtime.syncAgentApiKey(apiKey);
    return { ok: true };
  });

  // 确认：由 RobotCore 挂起确认处理；设置页 / 管理端可按 confirmationId 批准或取消。
  rpc("robot.confirm", async (payload) => {
    const confirmationId = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).confirmationId === "string"
      ? (payload as Record<string, unknown>).confirmationId as string
      : "";
    if (!confirmationId) return { ok: false, errorCode: "invalid_confirmation_id" };
    return await runtime.confirmConfirmation(confirmationId);
  });
  rpc("robot.cancelConfirmation", async (payload) => {
    const confirmationId = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).confirmationId === "string"
      ? (payload as Record<string, unknown>).confirmationId as string
      : "";
    if (!confirmationId) return { ok: false, errorCode: "invalid_confirmation_id" };
    return await runtime.cancelConfirmation(confirmationId);
  });

  rpc("robot.wechat.startLogin", () => options.wechat?.startLogin?.() ?? { ok: false, errorCode: "not_implemented" });
  rpc("robot.wechat.getLoginState", () => options.wechat?.getLoginState?.() ?? { ok: false, errorCode: "not_implemented" });
  rpc("robot.wechat.submitVerifyCode", (payload) => options.wechat?.submitVerifyCode?.(payload) ?? { ok: false, errorCode: "not_implemented" });
  rpc("robot.wechat.logout", () => options.wechat?.logout?.() ?? { ok: false, errorCode: "not_implemented" });
  await Promise.all(bindings);
}
