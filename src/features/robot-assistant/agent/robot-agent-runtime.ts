import type { RobotSessionState } from "../contracts/robot-session";
import type { RobotProviderId } from "../contracts/robot-provider";
import type { RobotChatType } from "../contracts/robot-message";
import type { RobotToolPolicy } from "../settings/robot-settings-types";
import type { AgentMessage } from "../../../features/kb/services/agent-core/messages/agent-message";

/**
 * Robot Agent 运行时契约（Kernel-safe）。
 * Kernel 实现（后续增量）使用共享 `NativeToolAgentLoop` + `buildRobotKernelToolRegistry()`
 * + `KernelAgentHttpTransport`（stream:false）+ Robot 确认 transport。
 */

export interface RobotAgentTurnInput {
  session: RobotSessionState;
  userText: string;
  provider: RobotProviderId;
  accountId: string;
  chatId: string;
  chatType: RobotChatType;
  senderId: string;
  senderName?: string;
  /** 每个会话的持久 conversationId。 */
  conversationId: string;
  /** 由 RobotCore 构建的 Robot 系统提示（复用共享 Agent 原则）。 */
  systemPrompt: string;
  /** 运行时必须据此过滤真实 registry；不能只把 allowlist 写进提示词。 */
  toolPolicy: RobotToolPolicy;
  /** 单次模型调用超时（ms）。 */
  modelTimeoutMs: number;
  /** 整个 turn 总超时（ms）。 */
  turnTimeoutMs: number;
}

export interface RobotAgentToolSummary {
  toolName: string;
  action?: string;
  summary?: string;
}

export interface RobotAgentTurnResult {
  ok: boolean;
  answer: string;
  errorCode?: string;
  toolSummaries: RobotAgentToolSummary[];
  /** 与输入一致的 conversationId（Kernel 实现可能更新）。 */
  conversationId: string;
  /** 与本地 Agent 相同格式、已经过存储级压缩的完整执行上下文。 */
  agentMessages?: AgentMessage[];
}

export interface RobotAgentRuntime {
  runTurn(input: RobotAgentTurnInput): Promise<RobotAgentTurnResult>;
}
