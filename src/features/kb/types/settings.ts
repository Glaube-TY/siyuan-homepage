/**
 * 知识库设置类型
 */

/** 聊天模型提供商类型 */
export type KbChatProviderType = "kimi" | "kimi-api" | "kimi-coding" | "mimo" | "mimo-api" | "mimo-coding-plan" | "deepseek" | "deepseek-api" | "openai-compatible";

/** 自动操作兼容性配置（控制面 / Planner JSON 决策阶段） */
export type ControlPlaneCompatibility = {
  /** 自动操作适配度：普通 / 不推荐 */
  suitability?: "normal" | "not_recommended";
  /** JSON 输出策略：raw_prompt（不传 response_format）/ response_format_json_object */
  jsonOutputStrategy?: "raw_prompt" | "response_format_json_object";
  /** 关闭思考策略：omit（不传）/ openai_thinking_disabled / enable_thinking_false */
  thinkingOffStrategy?: "omit" | "openai_thinking_disabled" | "enable_thinking_false";
  /** 开启思考策略：omit（不传）/ openai_thinking_enabled / enable_thinking_true */
  thinkingOnStrategy?: "omit" | "openai_thinking_enabled" | "enable_thinking_true";
  /** 自动操作超时（毫秒） */
  timeoutMs?: number;
  /** Token 参数策略：max_tokens / max_completion_tokens */
  tokenParamStrategy?: "max_tokens" | "max_completion_tokens";
  /** 温度参数策略 */
  temperatureParamStrategy?: "default" | "omit" | "fixed";
  /** fixed 策略时使用的固定温度值 */
  fixedTemperature?: number;
  /** Planner 调用传输方式：non_stream_json（非流式）/ stream_json（流式接收 content 后解析 JSON） */
  plannerTransport?: "non_stream_json" | "stream_json";
};

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
  /** 不推荐用于自动操作规划（适合代码任务/思考模型等） */
  notRecommendedForPlanner?: boolean;
  /** 用户声明的 final compose 流式策略（覆盖 provider 默认） */
  finalComposeMode?: "auto" | "stream" | "non_stream";
  /** 自动操作兼容性配置（模型级覆盖） */
  controlPlaneCompatibility?: ControlPlaneCompatibility;
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
  /** 自动操作兼容性配置（provider 级默认，可被模型级覆盖） */
  controlPlaneCompatibility?: ControlPlaneCompatibility;
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
  /** 已初始化默认禁用状态的内置 Skill 名称列表（用于一次性迁移） */
  initializedDefaultDisabledBuiltinSkillNames?: string[];
};

/** 全局工具名称 */
export type KbGlobalToolName = "read_docs" | "web_read_page" | "edit_global_memory" | "get_doc_info";

/** 内置危险 Skill 工具名称（可跳过执行前确认） */
export type KbDangerousSkillToolName =
  | "create_doc"
  | "update_block"
  | "insert_block"
  | "delete_block"
  | "move_block"
  | "rename_doc"
  | "delete_doc"
  | "replace_doc_content";

/** 全局工具设置 */
export type KbToolSettings = {
  /** 被禁用的全局工具名称列表 */
  disabledGlobalToolNames: KbGlobalToolName[];
  /** 已关闭"执行前确认"的危险 Skill 工具名称列表（默认 undefined，表示全部开启确认） */
  disabledDangerousSkillToolConfirmationNames?: KbDangerousSkillToolName[];
};

/** 快捷提示语设置 */
export type QuickPromptsSettings = {
  /** 是否启用快捷提示语 */
  enabled: boolean;
  /** 提示语文档 ID */
  docId: string;
  /** 最后更新时间 */
  updatedAt?: number;
};

/** 全局记忆设置 */
export type GlobalMemorySettings = {
  /** 是否启用全局记忆 */
  enabled: boolean;
  /** 记忆文档 ID */
  docId: string;
  /** 最大读取字符数 */
  maxChars: number;
  /** 是否允许 AI 更新记忆 */
  allowAiUpdate: boolean;
  /** 最后更新时间 */
  updatedAt?: number;
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
  /**
   * 全局工具设置
   */
  toolSettings: KbToolSettings;
  /**
   * 全局记忆设置
   */
  globalMemory: GlobalMemorySettings;
  /**
   * 快捷提示语设置
   */
  quickPrompts: QuickPromptsSettings;
};
