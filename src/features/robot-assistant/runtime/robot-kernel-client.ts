/**
 * 前端 Robot 客户端 → Kernel Robot Core 的 JSON-RPC 桥。
 *
 * 使用官方 `siyuan` 客户端类型：
 * - `plugin.kernel: IKernelPlugin`（`plugin.kernel.state.code`、`plugin.kernel.rpc`）
 * - `plugin.kernel.rpc.call["robot.getStatus"](payload)` → 调用内核方法
 * - `plugin.kernel.rpc.bind("robot.outbound", handler)` → 订阅内核推送通知
 * - `plugin.eventBus.on("kernel-plugin-state-change", handler)` → 内核插件状态变化
 *
 * Kernel Plugin 状态码：-1 inactive / 0 ready / 1 loading / 2 running / 3 stopping / 4 stopped / 5 error。
 */

import type { IKernelPlugin, IKernelPluginState } from "siyuan";

export const KERNEL_STATE_INACTIVE = -1;
export const KERNEL_STATE_READY = 0;
export const KERNEL_STATE_LOADING = 1;
export const KERNEL_STATE_RUNNING = 2;
export const KERNEL_STATE_STOPPING = 3;
export const KERNEL_STATE_STOPPED = 4;
export const KERNEL_STATE_ERROR = 5;

export type KernelRuntimeState = -1 | 0 | 1 | 2 | 3 | 4 | 5;

/** 从插件实例读取 kernel 接口（缺失返回 null）。 */
export function getPluginKernelPort(plugin: unknown): IKernelPlugin | null {
  const kernel = (plugin as { kernel?: IKernelPlugin } | null | undefined)?.kernel;
  return kernel && typeof kernel === "object" ? kernel : null;
}

/** 当前内核插件状态（code 非 2 即不可调用）。 */
export function getKernelStateCode(plugin: unknown): KernelRuntimeState | null {
  const kernel = getPluginKernelPort(plugin);
  if (!kernel?.state) return null;
  return kernel.state.code as KernelRuntimeState;
}

export class RobotKernelClient {
  constructor(private readonly kernel: IKernelPlugin | null) {}

  /** 内核插件是否 running 且可调用。 */
  get available(): boolean {
    return this.kernel?.state?.code === KERNEL_STATE_RUNNING;
  }

  /** 调用内核 RPC。方法不存在 / 内核不可用时抛错。 */
  async call<T = unknown>(method: string, payload?: unknown): Promise<T> {
    const handler = this.kernel?.rpc?.call?.[method];
    if (typeof handler !== "function") {
      throw new Error(`Kernel RPC ${method} 不可用`);
    }
    return (await handler(payload)) as T;
  }

  /** 订阅内核推送通知；返回取消订阅函数。 */
  subscribe(event: string, handler: (payload: unknown) => void): () => void {
    const rpc = this.kernel?.rpc;
    if (!rpc || typeof rpc.bind !== "function") return () => {};
    const wrapped = (...args: unknown[]) => handler(args[0]);
    try {
      rpc.bind(event, wrapped as never);
    } catch {
      return () => {};
    }
    return () => {
      if (typeof rpc.unbind === "function") {
        try {
          rpc.unbind(event, wrapped as never);
        } catch {
          // 忽略解绑错误
        }
      }
    };
  }
}

/** 将状态码映射为可读文案（供设置页 / 调试）。 */
export function kernelStateLabel(code: KernelRuntimeState | null | undefined): string {
  switch (code) {
    case KERNEL_STATE_INACTIVE: return "inactive";
    case KERNEL_STATE_READY: return "ready";
    case KERNEL_STATE_LOADING: return "loading";
    case KERNEL_STATE_RUNNING: return "running";
    case KERNEL_STATE_STOPPING: return "stopping";
    case KERNEL_STATE_STOPPED: return "stopped";
    case KERNEL_STATE_ERROR: return "error";
    default: return "unknown";
  }
}

export type { IKernelPluginState };
