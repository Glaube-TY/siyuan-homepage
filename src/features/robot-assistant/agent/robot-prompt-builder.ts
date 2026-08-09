import { buildAgentSystemPrompt } from "../../../features/kb/services/agent-core/prompts/system-prefix";
import type { RobotProviderId } from "../contracts/robot-provider";
import type { RobotChatType } from "../contracts/robot-message";

/**
 * Robot Agent 提示构建。
 * 复用共享 Agent core principles / tool rules / factual grounding / tool help requirement，
 * 并增加 Robot 上下文；不直接使用整个 UI Agent system prompt。
 */
export interface RobotPromptContext {
  provider: RobotProviderId;
  chatType: RobotChatType;
  senderId: string;
  senderName?: string;
  nowIso: string;
  allowlistedTools: string[];
}

export function buildRobotSystemPrompt(context: RobotPromptContext): string {
  const toolList = context.allowlistedTools.length > 0
    ? context.allowlistedTools.join("、")
    : "(无)";
  return [
    buildAgentSystemPrompt(),
    "",
    "## 机器人聊天上下文",
    `- 当前渠道：${context.provider}；聊天类型：${context.chatType === "group" ? "群聊" : context.chatType === "private" ? "私聊" : "未知"}`,
    context.senderName ? `- 当前用户：${context.senderName}` : `- 当前用户 ID：${context.senderId}`,
    `- 当前时间：${context.nowIso}`,
    `- 本轮允许的远程工具：${toolList}`,
    "- 回复是聊天消息，需要简洁；不使用 Markdown 表格渲染复杂排版。",
    "- 不得声称后台执行；工具失败要如实说明。",
    "- 不得把内部 tool JSON 原样回复给用户。",
    "- 不得泄露 API Key / Secret / token。",
    "- 远程删除等高风险操作必须经过用户确认。",
    "- 工具需要确认时会收到确认流程；用户确认后才会执行。",
  ].join("\n");
}

export function buildRobotHelpReply(context: RobotPromptContext): string {
  return [
    "机器人助手使用说明：",
    `- 当前渠道：${context.provider}；当前时间：${context.nowIso}`,
    "- 直接发送自然语言即可调用 AI Agent（记账、纪念日、收藏、复习、知识库、日记等）。",
    "- 内部命令：帮助 / 状态 / 新会话 / 取消 / 确认。",
  ].join("\n");
}
