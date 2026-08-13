import type { RobotProviderId } from "./robot-provider";

/**
 * 统一入站机器人消息（平台无关）。
 * 取代旧 `FeishuNormalizedMessage`，所有 Provider 标准化后进入 Robot Core。
 */

export type RobotChatType = "private" | "group" | "unknown";

/** 本轮正式处理文本；图片/语音/视频/文件识别为 unsupported，不回送 Agent。 */
export type RobotMessageType =
  | "text"
  | "image"
  | "voice"
  | "video"
  | "file"
  | "sticker"
  | "other"
  | "unsupported";

export interface NormalizedRobotMessage {
  provider: RobotProviderId;
  accountId: string;
  messageId: string;
  eventId?: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatType: RobotChatType;
  /** 纯文本内容（仅 text 消息）。 */
  text: string;
  messageType: RobotMessageType;
  isFromBot: boolean;
  isMentioned: boolean;
  /** 微信等平台用于回复保持上下文。 */
  contextToken?: string;
  replyToMessageId?: string;
  receivedAt: number;
  /**
   * 平台原始事件的安全摘要。只保留用于诊断 / 去重的脱敏信息，
   * 不得把完整平台事件长期写入历史。
   */
  rawMeta?: Record<string, unknown>;
}

/** 统一出站消息。 */
export interface RobotOutboundMessage {
  /** Electron Provider 回传实际发送结果时使用；普通会话消息不需要。 */
  deliveryId?: string;
  provider: RobotProviderId;
  accountId: string;
  chatId: string;
  replyToMessageId?: string;
  contextToken?: string;
  /** 支持多段顺序发送。 */
  text: string;
  kind: "text" | "confirmation" | "status" | "error";
}

export const ROBOT_OUTBOUND_RESULT_EVENT = "robot-outbound-result";

export const ROBOT_TEXT_UNSUPPORTED_REPLY = "当前机器人助手暂支持文本消息。";
