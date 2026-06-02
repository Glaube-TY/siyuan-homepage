/**
 * 知识库设置类型
 */

/** 聊天模型提供商类型 */
export type KbChatProviderType = "kimi" | "kimi-api" | "kimi-coding" | "mimo" | "mimo-api" | "mimo-coding-plan" | "deepseek" | "deepseek-api" | "openai-compatible";

/**
 * 模型可控思考能力类型
 * - unknown: 未声明，保守默认不传 reasoning 参数
 * - none: 不支持可控思考
 * - openai_effort: OpenAI/DeepSeek 风格 reasoning_effort
 * - model_native_uncontrolled: 模型自带不可控思考
 */
export type ReasoningCapabilityType = "unknown" | "none" | "openai_effort" | "model_native_uncontrolled";

/** 单个模型配置 */
export type KbChatModelConfig = {
  /** 模型 ID */
  id: string;
  /** 模型显示名称 */
  name: string;
  /** 温度参数 */
  temperature: number;
  /** 最大 Token 数（输出上限） */
  maxTokens?: number;
  /** 上下文窗口 Token 数（输入+输出总窗口） */
  contextWindowTokens?: number;
  /** 是否默认选中 */
  default?: boolean;
  /** 是否启用该模型 */
  enabled?: boolean;
  /** 是否支持视觉 */
  supportVision?: boolean;
  /** 是否支持思考模式 */
  supportThinking?: boolean;
  /** 用户声明的可控思考能力类型（覆盖 provider 默认） */
  reasoningCapability?: ReasoningCapabilityType;
  /** 用户声明的 final compose 流式策略（覆盖 provider 默认） */
  finalComposeMode?: "auto" | "stream" | "non_stream";
};

/** 模型提供商配置 */
export type KbChatProviderConfig = {
  /** 提供商 ID */
  id: string;
  /** 提供商显示名称 */
  name: string;
  /** 提供商类型 */
  type: KbChatProviderType;
  /** API Base URL */
  baseUrl: string;
  /** API Key（可选，用于非本地服务） */
  apiKey?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 该提供商下的模型列表 */
  models: KbChatModelConfig[];
  /** 来源模板 ID（不代表内置，用户配置仍可删除/禁用/编辑） */
  presetId?: string;
};

export type KbAssistantActionAlignment = "left" | "center" | "right";

export type KbSettings = {
  /** AI 回答底部操作按钮对齐方式 */
  assistantActionAlignment: KbAssistantActionAlignment;
  /** 最大上下文条数 */
  maxContextItems: number;
  /** 单条上下文最大长度 */
  maxContextTextLength: number;
  /** 第一次检索最大返回条数 */
  firstPassMaxHits: number;
  /** 标题路径命中权重 */
  headingMatchWeight: number;
  /** 正文命中权重 */
  textMatchWeight: number;
  /** 预览命中权重 */
  previewMatchWeight: number;
  /**
   * 聊天模型提供商列表（多提供商配置）
   */
  chatProviders: KbChatProviderConfig[];
  /**
   * 当前选中的聊天提供商 ID
   */
  selectedChatProviderId: string;
  /**
   * 当前选中的聊天模型 ID
   */
  selectedChatModelId: string;
};
