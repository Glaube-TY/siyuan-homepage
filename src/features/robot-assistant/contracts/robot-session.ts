import type { RobotProviderId } from "./robot-provider";
import type { AgentMessage } from "../../kb/services/agent-core/messages/agent-message";

/** 机器人会话 key：provider + accountId + chatId（+ 可选 senderId）。 */
export interface RobotSessionKey {
  provider: RobotProviderId;
  accountId: string;
  chatId: string;
  senderId?: string;
}

/** 轻量机器人会话，独立于前端 UI Chat Panel。 */
export interface RobotSessionState {
  key: RobotSessionKey;
  conversationId: string;
  /** 用户可见的远程聊天名称。 */
  title: string;
  /** 用户可见的 user / assistant 消息记录。 */
  recentMessages: Array<{ role: "user" | "assistant"; content: string; createdAt: number }>;
  /** 与本地 Agent 相同格式的压缩后执行上下文，包含工具调用/结果配对。 */
  agentMessages?: AgentMessage[];
  /** 最近 tool call 摘要。 */
  toolCallSummaries: Array<{ toolName: string; action?: string; summary: string; createdAt: number }>;
  /** pending 高风险确认（单会话最多一个）。 */
  pendingConfirmationId?: string;
  /** 模型配置快照（非敏感，不存 API key）。 */
  modelSnapshot?: {
    providerId?: string;
    modelId?: string;
  };
  lastActivityAt: number;
  createdAt: number;
}

export interface RobotSessionStore {
  get(key: RobotSessionKey): Promise<RobotSessionState | null>;
  put(state: RobotSessionState): Promise<void>;
  list(): Promise<RobotSessionState[]>;
  create(state: RobotSessionState): Promise<void>;
  activate(key: RobotSessionKey, conversationId: string): Promise<boolean>;
  rename(conversationId: string, title: string): Promise<boolean>;
  delete(conversationId: string): Promise<boolean>;
  reset(key: RobotSessionKey): Promise<void>;
}
