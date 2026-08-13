import type { RobotOutboundMessage } from "@/features/robot-assistant/contracts/robot-message";

export type AutomationRobotRoute = Pick<RobotOutboundMessage, "provider" | "accountId" | "chatId"> & { senderId?: string };

export function encodeAutomationRobotRoute(route: AutomationRobotRoute): string {
  return [route.provider, route.accountId, route.chatId, route.senderId ?? ""].map(encodeURIComponent).join("|");
}

export function decodeAutomationRobotRoute(routeRef: string): AutomationRobotRoute {
  const [provider, accountId, chatId, senderId = "", ...rest] = routeRef.split("|").map(decodeURIComponent);
  if (rest.length || !accountId || !chatId || !["wechat", "feishu", "qq"].includes(provider)) throw new Error("机器人投递路由无效。");
  return { provider: provider as RobotOutboundMessage["provider"], accountId, chatId, ...(senderId ? { senderId } : {}) };
}

/** 远程机器人创建/改投任务时，投递会话始终由运行时决定，不能信任模型传入的隐藏路由。 */
export function bindAutomationRobotResult(args: Record<string, unknown>, routeRef: string, conversationId?: string): Record<string, unknown> {
  if (args.action !== "create" && args.action !== "update") return args;
  const nested = args.args && typeof args.args === "object" && !Array.isArray(args.args)
    ? args.args as Record<string, unknown>
    : {};
  return { ...args, args: { ...nested, robotRouteRef: routeRef, ...(conversationId ? { robotConversationId: conversationId } : {}) } };
}
