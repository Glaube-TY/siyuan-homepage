/**
 * 知识库 Session/Orchestration 相关类型
 *
 * 为 orchestration 层函数提供命名返回类型
 */

import type { ChatMessage, ConversationStageSummary } from "./chat";
import type { ChatMode } from "../constants/chat-modes";
import type { ChatModelSelection } from "./chat-model-selection";
import type { KbConversationSession } from "./chat";
import type { ContextUsageSnapshot, ContextCompressionState } from "./context-usage";

export type ThinkingMode = "off" | "on";
export type { ContextUsageSnapshot, ContextUsageLevel, ContextCompressionState, ContextUsageMaxContextSource } from "./context-usage";

/**
 * KB Session 完整状态
 * 用于 store 层状态管理
 */
export type KbSessionState = {
  // 错误状态
  error: string;

  // AI 问答相关
  asking: boolean;
  qaError: string;

  // 聊天消息列表
  messages: ChatMessage[];

  // 当前选择的聊天模式（会话级记忆）
  selectedMode?: ChatMode;

  // 输入框草稿（未发送的问题）
  draftQuestion?: string;

  /**
   * 输入框当前选择的聊天模型
   * 由用户在侧边栏输入框选择，不修改 settings.selectedChatProviderId / selectedChatModelId
   * 发送问题时传给 askByMode，优先于默认模型使用
   * 新对话不清空，在当前侧边栏会话中继续保留
   */
  selectedChatModelSelection?: ChatModelSelection;

  /**
   * 当前 Agent 运行状态文本
   * - 用于向用户展示简洁的运行状态，如"正在分析问题"、"正在检索资料"
   * - 不暴露内部 taskType、traceSteps、raw plan、raw hidden content
   * - 不持久化，新一轮提问时会被重置
   */
  agentStatus?: string;

  /**
   * 思考模式开关
   * - 用户手动控制，不是自动模型策略
   * - 本轮所有 LLM 调用的 reasoning 控制参数（Planner、Composer 等）
   * - 不影响工具执行、证据边界或业务流程
   */
  thinkingMode?: ThinkingMode;

  /**
   * 上下文用量快照（运行时，不持久化）
   * - 仅用于 UI 显示和 trace 诊断
   * - 不影响 Planner 决策和工具链路
   */
  contextUsage?: ContextUsageSnapshot;

  /**
   * 压缩摘要文本（运行时，从会话层同步）
   * - 用于 runtime context 构建
   * - 不影响 Planner 决策和工具链路
   */
  compressedContextSummary?: string;

  /**
   * Planner 生成的会话内阶段摘要。
   * 仅用于当前会话上下文预算管理，不写入长期记忆或思源文档。
   */
  stageSummaries?: ConversationStageSummary[];

  /**
   * 压缩状态（运行时，从会话层同步）
   * - 仅用于 UI 显示
   * - 不影响 Planner 决策和工具链路
   */
  compressionState?: ContextCompressionState;
};

/**
 * 扩展的 KB Session 状态（包含多会话管理）
 * 用于 store 内部和组件层
 */
export type ExtendedKbSessionState = KbSessionState & {
  /** 会话列表 */
  conversations: KbConversationSession[];
  /** 当前活跃会话 ID */
  activeConversationId: string;
};
