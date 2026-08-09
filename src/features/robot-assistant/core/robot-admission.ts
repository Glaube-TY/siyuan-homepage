import type { RobotAdmissionSettings } from "../contracts/robot-pairing";
import type { NormalizedRobotMessage } from "../contracts/robot-message";

/**
 * 统一准入判断（平台无关）。每个 Provider 收到消息后都先进入这里，
 * 不得在 Provider 内部各自实现白名单逻辑。
 *
 * 未授权消息默认静默忽略；配对捕获模式由调用方另行处理（捕获下一条私聊）。
 */
export type RobotAdmissionDecision = "allowed" | "ignored";

export function decideRobotAdmission(
  message: NormalizedRobotMessage,
  admission: RobotAdmissionSettings,
): RobotAdmissionDecision {
  if (message.isFromBot) return "ignored";
  if (message.chatType === "group" && !admission.groupChatAllowed) return "ignored";
  if (message.chatType === "private" && !admission.privateChatAllowed) return "ignored";
  if (message.chatType === "group" && admission.groupRequireMention && !message.isMentioned) return "ignored";
  // 安全默认：没有任何白名单时不触发 Agent，必须先通过配对捕获授权。
  if (admission.allowedChatIds.length === 0 && admission.allowedSenderIds.length === 0) return "ignored";
  if (admission.allowedChatIds.length > 0 && !admission.allowedChatIds.includes(message.chatId)) return "ignored";
  if (admission.allowedSenderIds.length > 0 && !admission.allowedSenderIds.includes(message.senderId)) return "ignored";
  return "allowed";
}
