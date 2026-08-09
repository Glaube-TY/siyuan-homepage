/**
 * 统一 Kernel 运行时状态桥（前端）。
 *
 * - 初始化读取 `plugin.kernel.state.code`
 * - 监听 `plugin.eventBus.on("kernel-plugin-state-change", handler)` 并在状态变化时通知订阅者
 * - 提供 `robot.ping` 探测与 `RobotKernelClient`
 * - 状态映射：-1 inactive / 0 ready / 1 loading / 2 running / 3 stopping / 4 stopped / 5 error
 *
 * 设置页与 RobotClientRuntime 统一通过本桥感知 Kernel 状态，避免各自零散判断。
 */

import type { IKernelPlugin, IKernelPluginState } from "siyuan";
import {
  getPluginKernelPort,
  KERNEL_STATE_ERROR,
  KERNEL_STATE_LOADING,
  KERNEL_STATE_RUNNING,
  RobotKernelClient,
  type KernelRuntimeState,
} from "./robot-kernel-client";

export type KernelBridgeStatus =
  | "unavailable"   // kernel 接口缺失 / state 不可读
  | "loading"       // 1 loading（或 0 ready 等待启动）
  | "running"       // 2 running
  | "stopped"       // -1/3/4 inactive/stopping/stopped
  | "error";        // 5 error

interface EventBusLike {
  on?(event: string, handler: (data: unknown) => void): unknown;
  off?(event: string, handler: (data: unknown) => void): unknown;
}

const KERNEL_STATE_CHANGE_EVENT = "kernel-plugin-state-change";

export class RobotKernelBridge {
  private readonly kernel: IKernelPlugin | null;
  private readonly kernelClient: RobotKernelClient;
  private readonly eventBus: EventBusLike | null;
  private stateCode: KernelRuntimeState | null;
  private readonly listeners = new Set<() => void>();
  private attached = false;
  private readonly eventHandler: (data: unknown) => void;

  constructor(plugin: unknown) {
    this.kernel = getPluginKernelPort(plugin);
    this.kernelClient = new RobotKernelClient(this.kernel);
    this.eventBus = (plugin as { eventBus?: EventBusLike } | null)?.eventBus ?? null;
    this.stateCode = this.kernel?.state?.code ?? null;
    this.eventHandler = (data: unknown) => {
      const detail = data && typeof data === "object" && "detail" in data
        ? (data as { detail?: unknown }).detail
        : data;
      const code = detail && typeof detail === "object"
        ? (detail as IKernelPluginState).code
        : undefined;
      if (typeof code === "number") {
        this.stateCode = code as KernelRuntimeState;
        this.emitChanged();
      }
    };
  }

  get client(): RobotKernelClient {
    return this.kernelClient;
  }

  get state(): KernelRuntimeState | null {
    return this.stateCode;
  }

  get status(): KernelBridgeStatus {
    switch (this.stateCode) {
      case KERNEL_STATE_RUNNING:
        return "running";
      case KERNEL_STATE_LOADING:
        return "loading";
      case KERNEL_STATE_ERROR:
        return "error";
      case 0:
      case -1:
      case 3:
      case 4:
        return "stopped";
      default:
        return "unavailable";
    }
  }

  /** 订阅状态变化；返回取消订阅函数。 */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    this.attach();
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** 探测 Kernel 链路：robot.ping。失败返回 null。 */
  async ping(): Promise<Record<string, unknown> | null> {
    if (!this.kernelClient.available) return null;
    try {
      const result = (await this.kernelClient.call("robot.ping")) as Record<string, unknown>;
      return result && result.ok === true ? result : null;
    } catch {
      return null;
    }
  }

  /** 当 Kernel 进入 running 时自动初始化（供客户端调用一次）。 */
  startWhenRunning(callback: () => void): () => void {
    if (this.status === "running") {
      callback();
    }
    return this.subscribe(() => {
      if (this.status === "running") callback();
    });
  }

  /** 移除全部订阅并解绑事件。 */
  dispose(): void {
    if (this.attached) {
      this.eventBus?.off?.(KERNEL_STATE_CHANGE_EVENT, this.eventHandler);
      this.attached = false;
    }
    this.listeners.clear();
  }

  private attach(): void {
    if (this.attached) return;
    this.attached = true;
    try {
      this.eventBus?.on?.(KERNEL_STATE_CHANGE_EVENT, this.eventHandler);
    } catch {
      // 事件桥不可用时仅依赖初始化快照
    }
  }

  private emitChanged(): void {
    for (const fn of Array.from(this.listeners)) {
      try {
        fn();
      } catch {
        // 订阅者异常不阻断其他订阅者
      }
    }
  }
}
