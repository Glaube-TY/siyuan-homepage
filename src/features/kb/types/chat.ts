/**
 * 知识库聊天消息类型
 */

/** 引用项（轻量结构） */
export type ReferenceItem = {
  /** 序号 */
  index: number;
  /** 文档标题 */
  docTitle: string;
  /**
   * 思源内部文档路径，仅用于范围过滤，不用于展示
   */
  path?: string;
  /** 标题路径文本 */
  headingPathText: string;
  /** 来源块 ID 列表 */
  sourceBlockIds: string[];
  /**
   * 显示标题（仅用于 UI 展示）
   * - 用于区分多个 docTitle 相同但来源不同的引用
   * - 如果为空，UI 仍使用 docTitle
   * - 不影响 navigateToReference
   */
  displayTitle?: string;
  /** 文档 ID（可选，Agent Core 使用） */
  docId?: string;
  /** 笔记本 ID（可选，Agent Core 使用） */
  box?: string;
  /** 文档分数（可选，Agent Core 使用） */
  docScore?: number;
  /**
   * 证据层级（可选，Agent Core 使用）
   * - content: 已读正文
   * - structure: 结构来源
   * - candidate: 搜索候选
   * - snippet/section/document: 旧格式兼容
   */
  readLevel?: "content" | "structure" | "candidate" | "snippet" | "section" | "document";
  /** 引用原因（可选，Agent Core 使用） */
  referenceReason?: "agent_explicit" | "read_content" | "structure_result" | "search_candidate";
  /** 是否已通过 grounding 校验（Agent Core 使用） */
  grounded?: boolean;
  /** 来源类型：siyuan_doc（默认）或 web_page 等 */
  sourceType?: "siyuan_doc" | "web_page" | "file" | "mcp_resource" | "api_result";
  /** 网页 URL（sourceType=web_page 时使用） */
  url?: string;
  /** 来源名称（如域名） */
  sourceName?: string;
  /** 搜索/读取 provider */
  provider?: string;
};

/** 用户手动附加的文档（轻量元信息，不存正文） */
export interface AttachedKbDoc {
  docId: string;
  title: string;
  box?: string;
  path?: string;
  source: "manual_search" | "mention" | "current_doc";
  createdAt: number;
}

/**
 * 用户消息请求上下文（轻量，用于 regenerate 复用）
 * 不保存正文、标题、路径等敏感信息
 */
export interface UserMessageRequestContext {
  originalMode: string;
  effectiveScopeMode: string;
  customDocIds?: string[];
  attachedDocs?: AttachedKbDoc[];
  currentDocId?: string;
  fixedDocIds?: string[];
  thinkingMode?: string;
  createdFrom: "send" | "regenerate" | "retry";
  /** 联网模式: off(关闭), smart(智能), required(必须) */
  webAccessMode?: "off" | "smart" | "required";
}

/** 用户消息 */
export type UserChatMessage = {
  id: string;
  role: "user";
  content: string;
  createdAt: number;
  /** 用户手动附加的文档列表（可选） */
  attachedDocs?: AttachedKbDoc[];
  /** 请求上下文（可选，用于 regenerate 复用原 scope） */
  requestContext?: UserMessageRequestContext;
  /** 已被压缩标记（true 时不再全文进入 runtime context） */
  compacted?: boolean;
};

/** 引用段落实体 */
export interface CitationSegment {
  /** 文本内容 */
  text: string;
  /** 引用的 citation IDs */
  citationIds: number[];
}

/** AI 助手消息 */
export type AssistantChatMessage = {
  id: string;
  role: "assistant";
  content: string;
  createdAt: number;
  /** 引用段落（可选，用于内联引用渲染） */
  citationSegments?: CitationSegment[];
  /** 实际被引用过的参考资料（可选） */
  citedReferences?: ReferenceItem[];
  /** 回答是否已完成（用于控制按钮显示） */
  isComplete?: boolean;
  /**
   * Agent Workbench Turn Memory（可选）
   * - Agent Workbench 模式写入
   * - 轻量结构，不保存证据正文、Markdown 全文、sourceBlockIds
   */
  agentMemory?: import("../services/agent-workbench/memory/agent-turn-memory").AgentTurnMemory;
  /**
   * 本轮 Workbench 轻量 UI 事件流
   * - 可持久化用于会话复现
   * - 不保存 observation data、prompt、工具正文或 debug trace
   * - 不进入 conversationContext / agent context
   */
  workbenchEvents?: import("../services/agent-workbench").AgentWorkbenchEvent[];
  /**
   * 运行态状态文本（可选）
   * - 仅用于当前 UI 渲染，不持久化为最终回答内容
   * - 当 content 为空且 agentStatus 非空时，气泡显示轻量加载状态
   * - 开始流式输出后应清空此字段
   */
  agentStatus?: string;
  /**
   * 模型 reasoning 内容（可选）
   * - 仅 thinkingMode=on 且模型返回 reasoning 时填充
   * - 用于 UI 折叠展示，不写入笔记
   */
  reasoning?: {
    content: string;
    status: "streaming" | "done";
    partCount: number;
    chars: number;
  };
  /** 已被压缩标记（true 时不再全文进入 runtime context） */
  compacted?: boolean;
};

/** 错误消息 */
export type ErrorChatMessage = {
  id: string;
  role: "error";
  content: string;
  createdAt: number;
};

/** 加载中消息 */
export type LoadingChatMessage = {
  id: string;
  role: "loading";
  content: string;
  createdAt: number;
};

/** 聊天消息联合类型 */
export type ChatMessage =
  | UserChatMessage
  | AssistantChatMessage
  | ErrorChatMessage
  | LoadingChatMessage;

// ==================== 类型守卫 ====================

/** 判断是否为加载中消息 */
export function isLoadingMessage(message: ChatMessage): message is LoadingChatMessage {
  return message.role === "loading";
}

/** 判断是否为助手消息 */
export function isAssistantMessage(message: ChatMessage): message is AssistantChatMessage {
  return message.role === "assistant";
}

/** 判断是否为错误消息 */
export function isErrorMessage(message: ChatMessage): message is ErrorChatMessage {
  return message.role === "error";
}

/** 判断是否为文本类消息（有 content 字段） */
export function isTextChatMessage(message: ChatMessage): message is UserChatMessage | AssistantChatMessage | ErrorChatMessage | LoadingChatMessage {
  return message.role !== "loading" || "content" in message;
}

/** 获取消息的文本内容 */
export function getMessageContent(message: ChatMessage): string {
  return "content" in message ? message.content : "";
}

// ==================== 会话类型 ====================

/**
 * 知识库对话会话
 */
export type KbConversationSession = {
  /** 会话唯一 ID */
  id: string;
  /** 会话标题 */
  title: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 消息列表 */
  messages: ChatMessage[];
  /** Agent 生成的会话内阶段摘要，仅用于当前会话上下文预算管理 */
  stageSummaries?: ConversationStageSummary[];
  /** 压缩状态（可选，兼容旧会话） */
  compressionState?: import("./context-usage").ContextCompressionState;
  /** 压缩摘要文本（可选） */
  compressedContextSummary?: string;
  /** Provider-facing native Agent message log; UI messages remain separate. */
  agentSession?: {
    id: string;
    messages: import("../services/agent-core/messages/agent-message").AgentMessage[];
    updatedAt: number;
  };
};

export type ConversationStageSummary = {
  id: string;
  index: number;
  summary: string;
  createdAt: number;
  startAfterAssistantMessageId?: string;
  startTurnIndex: number;
  endUserMessageId: string;
  endAssistantMessageId: string;
  endTurnIndex: number;
  source: "agent_stage_summary" | "emergency_llm_stage_summary";
  summaryChars: number;
};
