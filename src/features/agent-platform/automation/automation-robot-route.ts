import type { RobotOutboundMessage } from "@/features/robot-assistant/contracts/robot-message";

export function encodeAutomationRobotRoute(route: Pick<RobotOutboundMessage, "provider" | "accountId" | "chatId">): string {
  return [route.provider, route.accountId, route.chatId].map(encodeURIComponent).join("|");
}

export function decodeAutomationRobotRoute(routeRef: string): Pick<RobotOutboundMessage, "provider" | "accountId" | "chatId"> {
  const [provider, accountId, chatId, ...rest] = routeRef.split("|").map(decodeURIComponent);
  if (rest.length || !accountId || !chatId || !["wechat", "feishu", "qq"].includes(provider)) throw new Error("机器人投递路由无效。");
  return { provider: provider as RobotOutboundMessage["provider"], accountId, chatId };
}
