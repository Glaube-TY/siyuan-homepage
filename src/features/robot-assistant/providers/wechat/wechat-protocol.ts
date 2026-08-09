import type { NormalizedRobotMessage } from "../../contracts/robot-message";
import type { RobotProviderId } from "../../contracts/robot-provider";

/**
 * 微信 Provider 协议类型与消息标准化（纯函数）。
 *
 * 适配腾讯官方 `openclaw-weixin` 已公开 HTTP JSON 协议。endpoint 路径与字段名
 * 集中在 `WECHAT_PROTOCOL_ENDPOINTS` / payload builder 中，并与官方实现保持一致。
 */

export const WECHAT_PROTOCOL_ENDPOINTS = {
  /** 发起扫码登录，返回二维码。 */
  startLogin: "ilink/bot/get_bot_qrcode?bot_type=3",
  /** 轮询登录状态。 */
  getLoginState: "ilink/bot/get_qrcode_status",
  /** 长轮询拉取消息。 */
  getUpdates: "ilink/bot/getupdates",
  /** 发送文本回复。 */
  sendMessage: "ilink/bot/sendmessage",
  /** 获取配置。 */
  getConfig: "ilink/bot/getconfig",
  /** 发送“正在输入”。 */
  sendTyping: "ilink/bot/sendtyping",
  notifyStart: "ilink/bot/msg/notifystart",
  notifyStop: "ilink/bot/msg/notifystop",
} as const;

export type WeChatLoginStatus =
  | "wait"
  | "scaned"
  | "confirmed"
  | "expired"
  | "need_verifycode"
  | "verify_code_blocked"
  | "scaned_but_redirect"
  | "binded_redirect";

export interface WeChatQrLoginResult {
  sessionKey: string;
  qrcodeUrl: string;
  qrcodeContent?: string;
  /** 过期时间（ms 时间戳）。 */
  expiration: number;
  status: WeChatLoginStatus;
  /** 是否需要输入手机微信上显示的数字。 */
  verifyCodeHint?: boolean;
}

export interface WeChatLoginStateSnapshot {
  status: WeChatLoginStatus;
  /** 当前待扫码内容；用于设置页重新打开时恢复二维码。 */
  qrcodeContent?: string;
  scanned?: boolean;
  confirmed?: boolean;
  accountId?: string;
  displayName?: string;
  needVerifyCode?: boolean;
}

export interface WeChatCredential {
  accountId: string;
  botToken: string;
  baseUrl: string;
  userId?: string;
  routeTag?: string;
  displayName?: string;
}

export interface WeChatUpdate {
  type: "USER" | "BOT" | "OTHER";
  fromUserId: string;
  messageId: string;
  sessionId: string;
  contextToken?: string;
  text?: string;
  messageKind: "text" | "image" | "voice" | "video" | "file" | "other";
}

export interface WeChatGetUpdatesRequest {
  authType: string;
  token: string;
  uin: string;
  baseInfo: Record<string, unknown>;
  previousGetUpdatesBuf: string | null;
}

export interface WeChatGetUpdatesResult {
  getUpdatesBuf: string | null;
  longPollingTimeoutMs: number;
  updates: WeChatUpdate[];
  /** session 失效（token invalid / session timeout）→ 停止轮询，进入 reauth_required。 */
  sessionInvalid: boolean;
}

/** 长轮询外层请求超时：略高于服务器 long poll，但不能超过 Kernel HTTP transport 稳定边界。 */
export function wechatPollTimeoutMs(serverLongPollMs: number, kernelSafeBoundMs: number): number {
  const base = Number.isFinite(serverLongPollMs) && serverLongPollMs > 0 ? serverLongPollMs : 30_000;
  return Math.min(Math.max(base + 10_000, 40_000), kernelSafeBoundMs);
}

export function normalizeWeChatMessage(input: {
  providerId: RobotProviderId;
  accountId: string;
  update: WeChatUpdate;
  receivedAt: number;
}): NormalizedRobotMessage {
  return {
    provider: input.providerId,
    accountId: input.accountId,
    messageId: input.update.messageId,
    senderId: input.update.fromUserId,
    // iLink sendmessage 需要 to_user_id；私聊因此以 sender id 作为 chatId。
    chatId: input.update.fromUserId || input.update.sessionId,
    chatType: "private",
    text: input.update.text ?? "",
    messageType: input.update.messageKind === "text"
      ? "text"
      : input.update.messageKind === "image"
        ? "image"
        : input.update.messageKind === "voice"
          ? "voice"
          : input.update.messageKind === "video"
            ? "video"
            : input.update.messageKind === "file"
              ? "file"
              : "unsupported",
    isFromBot: input.update.type === "BOT",
    isMentioned: false,
    contextToken: input.update.contextToken,
    receivedAt: input.receivedAt,
  };
}
