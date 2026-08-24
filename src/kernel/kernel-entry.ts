import type { RobotKernelHost } from "./kernel-host";
import { RobotKernelRuntime, type RobotKernelRuntimeOptions } from "./kernel-runtime";
import { registerRobotKernelRpc, type RobotKernelRpcOptions } from "./kernel-rpc";
import { createKernelWeChatHttpPort } from "../features/robot-assistant/providers/wechat/wechat-http-port";
import { createKernelWeChatCredentialStorage } from "../features/robot-assistant/providers/wechat/wechat-credential-storage";
import { WeChatKernelProvider } from "../features/robot-assistant/providers/wechat/wechat-kernel-provider";
import { buildRobotKernelToolRegistry } from "../features/robot-assistant/agent/build-robot-kernel-tool-registry";
import { KernelEntitlementService } from "./kernel-entitlement";
import { setSiyuanRuntimePort } from "../runtime/siyuan-runtime-port";
import { createWebSearchSettingsBinding } from "../features/kb/services/agent-workbench/tools/web-search/web-search-router";

/**
 * Kernel entry：只负责组装，不写业务逻辑。
 * 流程：初始化存储 → 挂载微信 Provider → 注册 RPC → 恢复运行时 → 生命周期清理。
 *
 * 真实 `siyuan.*` 由调用方构造 `RobotKernelHost` 注入；本文件不依赖 window / Svelte / DOM / child_process。
 */
export interface RobotKernelEntryOptions {
  toolRegistry?: RobotKernelRuntimeOptions["toolRegistry"];
  getModelApiKey?(): Promise<string | null>;
  isEntitlementAvailable?(): Promise<boolean>;
  /** 覆盖微信 Provider 的依赖（测试 / 协议适配注入）。 */
  wechatProviderFactory?: (host: RobotKernelHost) => WeChatKernelProvider;
}

export async function createRobotKernel(host: RobotKernelHost, options: RobotKernelEntryOptions): Promise<RobotKernelRuntime> {
  setSiyuanRuntimePort({
    post: (path, payload) => host.siyuanPost(path, payload),
    getFile: (path) => host.siyuanGetFile(path),
    putFile: (path, isDir, file) => host.siyuanPutFile(path, isDir, file),
  });
  const entitlement = new KernelEntitlementService(host);
  const webSearchSettingsBinding = createWebSearchSettingsBinding();
  const runtime = new RobotKernelRuntime(host, {
    toolRegistry: options.toolRegistry ?? await buildRobotKernelToolRegistry({ host, webSearchSettingsBinding }),
    webSearchSettingsBinding,
    ...(options.getModelApiKey ? { getModelApiKey: options.getModelApiKey } : {}),
    isEntitlementAvailable: options.isEntitlementAvailable ?? (() => entitlement.isAvailable()),
  });
  await runtime.initialize();

  // 挂载微信 Kernel Provider（微信是主渠道，Kernel 常驻）。
  const wechat = options.wechatProviderFactory
    ? options.wechatProviderFactory(host)
    : new WeChatKernelProvider({
        http: createKernelWeChatHttpPort(host),
        storage: createKernelWeChatCredentialStorage(host),
        kernelPollTimeoutBoundMs: 60_000,
        onStatusChange: (status) => host.notify("robot.providerStatusChanged", status),
        onLoginChange: (state) => host.notify("robot.wechat.loginChanged", state),
        onDispatchError: (error, update) => host.log.error({
          provider: "wechat",
          status: "message_dispatch_failed",
          errorCode: "wechat_dispatch_failed",
          messageIdHash: update.messageId ? `${update.messageId.slice(0, 3)}***${update.messageId.slice(-2)}` : "unknown",
          message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180),
        }),
        timeout: (fn, ms) => host.timeout(fn, ms),
      });
  runtime.mountWechatProvider(wechat);

  const wechatRpc: RobotKernelRpcOptions["wechat"] = {
    startLogin: () => wechat.startLogin(),
    getLoginState: async () => {
      const state = await wechat.getLoginState();
      if (state.status === "confirmed" && state.accountId) {
        const current = runtime.getSettings();
        await runtime.saveSettings({
          ...current,
          wechat: { ...current.wechat, accountId: state.accountId, ...(state.displayName ? { displayName: state.displayName } : {}) },
        });
      } else if (state.status === "binded_redirect" && runtime.getSettings().activeProvider !== "wechat") {
        // 允许预先完成微信绑定，但非当前渠道不能继续长轮询消息。
        await wechat.disconnect();
      }
      return state;
    },
    submitVerifyCode: (payload) => {
      const code = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).code === "string"
        ? String((payload as Record<string, unknown>).code)
        : "";
      return wechat.submitVerifyCode(code);
    },
    logout: async () => {
      await wechat.logout();
      const current = runtime.getSettings();
      const { accountId: _accountId, displayName: _displayName, ...wechatSettings } = current.wechat;
      await runtime.saveSettings({
        ...current,
        wechat: wechatSettings,
      });
    },
  };
  await registerRobotKernelRpc(host, runtime, { wechat: wechatRpc });
  return runtime;
}

/** 卸载/关停时调用。 */
export async function disposeRobotKernel(runtime: RobotKernelRuntime): Promise<void> {
  await runtime.dispose();
}
