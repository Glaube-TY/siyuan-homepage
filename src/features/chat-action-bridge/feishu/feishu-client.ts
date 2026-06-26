import type { ChatActionRuntimeSettings } from "../types";
import { sendFeishuLocalGatewayReply } from "./feishu-local-gateway-client";

export async function sendFeishuTextMessage(
  settings: ChatActionRuntimeSettings,
  chatId: string,
  text: string,
): Promise<void> {
  await sendFeishuLocalGatewayReply(settings, chatId, text);
}
