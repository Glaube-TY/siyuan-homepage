import type { RobotProviderId, RobotProviderRuntimeStatus } from "./robot-provider";
import type { NormalizedRobotMessage, RobotOutboundMessage } from "./robot-message";

/**
 * Robot Provider 契约：平台 Transport 只负责登录/鉴权、收消息、标准化、发回复、连接状态与重连。
 * Provider 不得直接调用记账 / 日记 / 知识库 / 主页工具等业务逻辑——所有业务进入 Robot Core。
 */
export interface RobotProvider {
  readonly id: RobotProviderId;
  readonly runtimeKind: "kernel" | "electron";

  /** 连接（Electron provider 或 Kernel provider 各自实现）。 */
  connect(): Promise<RobotProviderRuntimeStatus>;

  /** 断开连接并停止接收消息。 */
  disconnect(): Promise<void>;

  /** 返回当前运行状态（快照，不含凭据）。 */
  getStatus(): RobotProviderRuntimeStatus;

  /** 发送出站消息。 */
  send(message: RobotOutboundMessage): Promise<{ ok: boolean; errorCode?: string; message?: string }>;

  /** 注册消息处理器；每次只能注册一个。 */
  setMessageHandler(handler: (message: NormalizedRobotMessage) => void | Promise<void>): void;

  /** 释放资源、取消长轮询 / 心跳、解绑事件。 */
  dispose(): Promise<void>;
}
