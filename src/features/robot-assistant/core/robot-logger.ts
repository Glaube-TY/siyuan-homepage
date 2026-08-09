import type { RobotProviderId } from "../contracts/robot-provider";

/**
 * 机器人调试日志（环境无关）。
 * 允许 provider / status / messageId hash / tool name / action / duration / error code。
 * 禁止 App Secret、API Key、WeChat bot token、Authorization、X-WECHAT-UIN、完整用户文本/工具参数/文档内容。
 */

export interface RobotLogEntry {
  provider?: RobotProviderId;
  status?: string;
  messageIdHash?: string;
  toolName?: string;
  action?: string;
  durationMs?: number;
  errorCode?: string;
  message?: string;
}

export interface RobotDebugLogger {
  info(entry: RobotLogEntry): void;
  warn(entry: RobotLogEntry): void;
  error(entry: RobotLogEntry): void;
}

/** 短 ID 哈希（非安全用途，仅用于日志关联，不含原文）。 */
export function shortIdHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const NOOP_ROBOT_LOGGER: RobotDebugLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
