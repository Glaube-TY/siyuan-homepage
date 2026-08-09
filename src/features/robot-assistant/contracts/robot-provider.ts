/**
 * Robot Assistant 平台 Provider 基础类型。
 *
 * 目标：把当前 Feishu-only / Gateway / 固定 action 菜单的机器助手重构为
 * 多 Provider（微信 / 飞书 / QQ）、单 Robot Core、共享 Agent Core 的机器人助手平台。
 * 本文件只定义类型，不依赖 siyuan / window / Electron，可在 Kernel 与前端共同使用。
 */

/** 统一机器人 Provider 标识，取代旧 `ChatActionProvider = "feishu"`。 */
export type RobotProviderId = "wechat" | "feishu" | "qq";

/** Provider 运行所在运行时。 */
export type RobotRuntimeKind = "kernel" | "electron";

/** Provider 是否允许在当前运行时使用。 */
export type RobotProviderAvailability =
  | "available"
  | "electron_runtime_unavailable"
  | "kernel_runtime_unavailable"
  | "not_configured";

/** 单 Provider 连接/运行状态码。 */
export type RobotProviderStatus =
  | "disabled"
  | "disconnected"
  | "connecting"
  | "waiting_qr"
  | "waiting_scan"
  | "waiting_verify_code"
  | "connected"
  | "reconnecting"
  | "reauth_required"
  | "error"
  | "offline";

/** Robot 全局运行状态码。 */
export type RobotStatus =
  | "disabled"
  | "stopped"
  | "starting"
  | "running"
  | "error";

export interface RobotProviderAccountIdentity {
  /** Provider 内部账号标识（微信登录用户 id / 飞书 app id / QQ app id）。 */
  accountId: string;
  /** 展示名（登录后由 Provider 回填）。 */
  displayName?: string;
  /** 该账号是否已完成平台登录 / 鉴权。 */
  authenticated: boolean;
}

export interface RobotProviderRuntimeStatus {
  provider: RobotProviderId;
  runtimeKind: RobotRuntimeKind;
  availability: RobotProviderAvailability;
  status: RobotProviderStatus;
  account?: RobotProviderAccountIdentity;
  updatedAt: number;
  message?: string;
  detail?: string;
}

export const ROBOT_PROVIDER_IDS: readonly RobotProviderId[] = ["wechat", "feishu", "qq"];

export function isRobotProviderId(value: unknown): value is RobotProviderId {
  return typeof value === "string" && (ROBOT_PROVIDER_IDS as readonly string[]).includes(value);
}
