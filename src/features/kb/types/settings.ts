/**
 * 知识库设置类型
 */

/** 聊天模型提供商类型 */
export type KbChatProviderType = "kimi" | "kimi-api" | "kimi-coding" | "mimo" | "mimo-api" | "mimo-coding-plan" | "deepseek" | "deepseek-api" | "openai-compatible";

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

/** 网页搜索提供商类型 */
export type WebSearchProvider = "anysearch" | "custom_json" | "tavily";

/** AnySearch 区域 */
export type AnySearchZone = "cn" | "intl";

/** 网页搜索设置 */
export type WebSearchSettings = {
  /** 是否启用网页搜索 */
  enabled: boolean;
  /** 搜索提供商 */
  provider: WebSearchProvider;
  /** 自定义搜索 API 端点 */
  searchEndpoint?: string;
  /** 自定义读取代理端点 */
  readProxyEndpoint?: string;
  /** API Key */
  apiKey?: string;
  /** 最大搜索返回条数 (1-10) */
  maxResults: number;
  /** 网页读取最大字符数 (2000-30000) */
  readPageMaxChars: number;
  /** 搜索超时时间（毫秒） (5000-60000) */
  timeoutMs: number;
  /** AnySearch 区域 */
  anySearchZone: AnySearchZone;
  /** AnySearch 语言 */
  anySearchLanguage: string;
};

export type KbSkillSettings = {
  /** 被禁用的内置 Skill 名称列表 */
  disabledBuiltinSkillNames: string[];
};

export type KbSettings = {
  /** AI 回答底部操作按钮对齐方式 */
  assistantActionAlignment: KbAssistantActionAlignment;
  /** 第一次检索最大返回条数 */
  firstPassMaxHits: number;
  /** 标题路径命中权重 */
  headingMatchWeight: number;
  /** 正文命中权重 */
  textMatchWeight: number;
  /** 预览命中权重 */
  previewMatchWeight: number;
  /** Agent 单次读取每篇文档的默认字符数 */
  agentReadMaxCharsPerDoc: number;
  /**
   * 控制 Agent 规划 / Planner JSON 决策阶段是否在"输入框思考已开启"时请求模型思考。
   * 默认关闭。
   * 输入框思考关闭时，该设置无效。
   * 不影响最终回答 Composer 是否思考。
   */
  controlPlaneThinkingEnabled: boolean;
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
  /**
   * 网页搜索设置
   */
  webSearch: WebSearchSettings;
  /**
   * Skill 设置
   */
  skillSettings: KbSkillSettings;
};
