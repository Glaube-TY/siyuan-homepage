import type { RobotProviderId } from "./robot-provider";

/** 配对捕获状态：捕获下一条私聊，展示后由用户决定是否加入白名单。 */
export interface RobotPairingCaptureState {
  enabled: boolean;
  provider: RobotProviderId;
  expiresAt: number;
  capturedAt?: number;
  senderId?: string;
  senderName?: string;
  chatId?: string;
}

/** Provider 级准入配置。 */
export interface RobotAdmissionSettings {
  privateChatAllowed: boolean;
  groupChatAllowed: boolean;
  groupRequireMention: boolean;
  allowedSenderIds: string[];
  allowedChatIds: string[];
}
