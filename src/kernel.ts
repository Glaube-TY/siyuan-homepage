import "./kernel/kernel-polyfills";

/**
 * SiYuan Kernel Plugin 入口（构建为插件根目录 kernel.js）。
 *
 * 官方模式：`const api: kernel.ISiyuan = siyuan;` + `api.plugin.lifecycle.*`。
 *
 * 故障隔离设计：
 * - `robot.ping` / `robot.getBootstrapStatus` 在任何情况下可用（Kernel Plugin 生命周期独立）。
 * - Robot runtime 初始化失败只把 bootstrap 置为 error，绝不 re-throw 到 Kernel lifecycle，
 *   因此 Kernel Plugin 保持 stateCode=2。
 * - onrunning 仅在 bootstrap=ready 且全局启用时才启动 Provider（本轮微信 skeleton 暂不自动连接）。
 */

import type * as kernel from "siyuan/kernel";
import { createRobotKernel, disposeRobotKernel } from "./kernel/kernel-entry";
import { createSiyuanKernelHost } from "./kernel/siyuan-kernel-host";

const api: kernel.ISiyuan = siyuan;

type RobotKernelRuntime = Awaited<ReturnType<typeof createRobotKernel>>;
type RobotBootstrapState = "idle" | "initializing" | "ready" | "error";

let runtime: RobotKernelRuntime | null = null;
let bootstrapState: RobotBootstrapState = "idle";
let bootstrapError: string | null = null;

/** 最小 RPC：验证 Kernel Plugin → RPC → Client 基础链路，不依赖任何业务配置。 */
async function ping(): Promise<Record<string, unknown>> {
  return {
    ok: true,
    plugin: api.plugin.name,
    version: api.plugin.version,
    platform: api.plugin.platform,
    runtime: "kernel",
    timestamp: Date.now(),
  };
}

/** 告诉前端 Robot bootstrap 状态（Robot 错误 ≠ Kernel Plugin 错误）。 */
async function getBootstrapStatus(): Promise<Record<string, unknown>> {
  return {
    ok: true,
    state: bootstrapState,
    ...(bootstrapError ? { error: bootstrapError } : {}),
  };
}

/** 错误脱敏：只保留类型 + 截断的 message，不泄露堆栈 / 密钥。 */
function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}

/** 初始化 Robot runtime；失败只置 bootstrap=error，不 throw。 */
async function bootstrapRobot(): Promise<void> {
  bootstrapState = "initializing";
  try {
    const host = createSiyuanKernelHost(api);
    if (!host) {
      bootstrapState = "error";
      bootstrapError = "siyuan kernel API 不可用";
      await api.logger.error(`[${api.plugin.name}] siyuan kernel API 不可用`);
      return;
    }
    runtime = await createRobotKernel(host, {});
    bootstrapState = "ready";
    bootstrapError = null;
    await api.logger.info(`[${api.plugin.name}] robot kernel ready`);
  } catch (error) {
    bootstrapState = "error";
    bootstrapError = sanitizeError(error);
    await api.logger.error(`[${api.plugin.name}] robot bootstrap failed`, bootstrapError);
  }
}

api.plugin.lifecycle.onload = async (): Promise<void> => {
  try {
    await api.logger.info(`[${api.plugin.name}] kernel plugin loading`);
    await api.rpc.bind("robot.ping", ping, "SiYuan Homepage Robot Kernel ping");
    await api.rpc.bind("robot.getBootstrapStatus", getBootstrapStatus, "SiYuan Homepage Robot bootstrap status");
  } catch (error) {
    // 基础 RPC 注册失败才值得让 Kernel Plugin 失败；但尽量保持插件存活。
    await api.logger.error(`[${api.plugin.name}] kernel plugin onload failed`, error);
    return;
  }

  // 尝试初始化 Robot runtime；失败只影响 bootstrap，不影响 Kernel Plugin state。
  await bootstrapRobot();
};

api.plugin.lifecycle.onrunning = async (): Promise<void> => {
  await api.logger.info(`[${api.plugin.name}] kernel plugin running`);
  // 仅在 bootstrap=ready 且全局启用时启动 Provider（本轮微信 skeleton 不自动连接）。
  if (runtime && bootstrapState === "ready" && runtime.getSettings().enabled) {
    await runtime.start();
  }
};

api.plugin.lifecycle.onunload = async (): Promise<void> => {
  const current = runtime;
  runtime = null;
  bootstrapState = "idle";
  bootstrapError = null;
  if (current) {
    try {
      await disposeRobotKernel(current);
    } catch (error) {
      await api.logger.warn(`[${api.plugin.name}] kernel plugin unload failed`, error);
    }
  }
  for (const name of ["robot.ping", "robot.getBootstrapStatus"]) {
    try {
      await api.rpc.unbind(name);
    } catch {
      // 忽略解绑错误
    }
  }
  await api.logger.info(`[${api.plugin.name}] kernel plugin unloading`);
};
