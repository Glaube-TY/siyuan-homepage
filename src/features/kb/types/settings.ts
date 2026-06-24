/**
 * 知识库设置类型
 */

/** 聊天模型提供商类型 */
export type KbChatProviderType = "kimi" | "kimi-api" | "kimi-coding" | "mimo" | "mimo-api" | "mimo-coding-plan" | "deepseek" | "deepseek-api" | "openai-compatible";

/** Provider/native Agent 请求兼容性配置 */
export type ProviderNativeAgentCompatibility = {
  /** Agent 适配度：普通 / 不推荐 */
  suitability?: "normal" | "not_recommended";
  /** 是否支持 provider-native tool calls；false 时不能进入 Agent 模式 */
  nativeToolCalls?: boolean;
  /** 是否支持流式工具调用增量 */
  streamingToolCalls?: boolean;
  /** 是否支持 role=tool / functionResponse / tool_result 后继续输出普通 assistant 文本 */
  toolResultContinuation?: boolean;
  /** 是否支持 reasoning delta */
  reasoningDelta?: boolean;
  /** 关闭思考策略：omit（不传）/ openai_thinking_disabled / enable_thinking_false */
  thinkingOffStrategy?: "omit" | "openai_thinking_disabled" | "enable_thinking_false";
  /** 开启思考策略：omit（不传）/ openai_thinking_enabled / enable_thinking_true */
  thinkingOnStrategy?: "omit" | "openai_thinking_enabled" | "enable_thinking_true";
  /** Agent 请求超时（毫秒） */
  timeoutMs?: number;
  /** Token 参数策略：max_tokens / max_completion_tokens */
  tokenParamStrategy?: "max_tokens" | "max_completion_tokens";
  /** 温度参数策略 */
  temperatureParamStrategy?: "default" | "omit" | "fixed";
  /** fixed 策略时使用的固定温度值 */
  fixedTemperature?: number;
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
  /** 不推荐用于 Agent 模式（适合纯回答/代码长思考等） */
  notRecommendedForAgent?: boolean;
  /** 用户声明的 final compose 流式策略（覆盖 provider 默认） */
  finalComposeMode?: "auto" | "stream" | "non_stream";
  /** native Agent 兼容性配置（模型级覆盖） */
  providerNativeAgentCompatibility?: ProviderNativeAgentCompatibility;
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
  /** native Agent 兼容性配置（provider 级默认，可被模型级覆盖） */
  providerNativeAgentCompatibility?: ProviderNativeAgentCompatibility;
};

export type KbAssistantActionAlignment = "left" | "center" | "right";

/** 处理过程/思考过程显示模式 */
export type KbProcessDisplayMode = "collapsed" | "expanded" | "auto";

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
export type KbGlobalToolName = "read_docs" | "web_read_page" | "edit_global_memory" | "get_doc_info" | "web_http_get" | "web_http_post";

/** 内置危险写工具名称 */
export type KbDangerousSkillToolName =
  | "create_doc"
  | "update_block"
  | "insert_block"
  | "delete_blocks"
  | "move_block"
  | "rename_doc"
  | "delete_doc"
  | "replace_doc_content";

/** 全局工具设置 */
export type KbToolSettings = {
  /** 被禁用的全局工具名称列表 */
  disabledGlobalToolNames: KbGlobalToolName[];
  /** 保留旧设置迁移用；已合并到 disabledWriteToolConfirmationNames */
  disabledDangerousSkillToolConfirmationNames?: KbDangerousSkillToolName[];
  /** 已被用户设为"可信免确认"的写工具名称列表 */
  disabledWriteToolConfirmationNames?: string[];
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

export type NotebrainPermissionAction = "allow" | "ask" | "deny";

export type NotebrainAgentWorkspaceSettings = {
  commandExecutionEnabled: boolean;
  defaultCommandTimeoutMs: number;
  maxCommandOutputChars: number;
  commandDefaultAction: NotebrainPermissionAction;
  commandAllowRules: string[];
  commandAskRules: string[];
  commandDenyRules: string[];
  /** 是否注册 notebrain 文件写入/删除工具（write_notebrain_file、delete_notebrain_path）。不影响 skill_install 内部写入。 */
  fileWriteToolsEnabled: boolean;
  /** 严格工作区模式：开启后拒绝访问系统信息、绝对路径、管道重定向等高风险命令（默认 true）。 */
  commandStrictWorkspaceMode: boolean;
  /** 是否允许命令访问网络。默认 false（保守）。注意：这不是 OS 级网络隔离，只是启发式风险标记。 */
  allowNetworkAccess: boolean;
  /** 是否允许读取系统信息的命令（systeminfo/wmic/ipconfig 等）。默认 false。 */
  allowSystemInfoCommands: boolean;
  /** 是否允许包含绝对路径的命令。默认 false。 */
  allowAbsolutePaths: boolean;
};

export type ExternalSkillSettings = {
  enabled: boolean;
  maxSkillReadChars: number;
  autoInstallEnabled: boolean;
  disabledSkillIds: string[];
  legacyUserSkillDirectInject?: boolean;
};

export type McpSettings = {
  enabled: boolean;
  maxVisibleToolsPerTurn: number;
  disabledServerIds: string[];
  disabledToolNames: string[];
  trustedToolNames: string[];
};

export type RuntimeToolsSettings = {
  /** Master switch — when false, detection still runs but results are not exposed to Agent. */
  enabled: boolean;
  /** Whether to include runtime tool status in Agent context instructions. */
  exposeToAgent: boolean;
  /** Additional directories to prepend to PATH for command lookup. */
  extraPathDirs: string[];
  /** User-specified command overrides, e.g. { "npx": "C:\\APP\\nodejs\\npx.cmd" }. */
  commandOverrides: Record<string, string>;
  /** Cached detection results (persisted for quick UI display; refreshed on demand). */
  detectedTools?: Record<string, any>;
};

export type KbSettings = {
  /** AI 回答底部操作按钮对齐方式 */
  assistantActionAlignment: KbAssistantActionAlignment;
  /** 第一次检索最大返回条数 */
  firstPassMaxHits: number;
  /** 文档标题命中权重 */
  docTitleMatchWeight: number;
  /** 正文标题命中权重 */
  headingMatchWeight: number;
  /** 正文命中权重 */
  textMatchWeight: number;
  /** 内部弱匹配权重，保留兼容，不在设置页暴露 */
  previewMatchWeight: number;
  /** Agent 单次读取每篇文档的默认字符数 */
  agentReadMaxCharsPerDoc: number;
  /**
   * 控制 native Agent 主请求是否在"输入框思考已开启"时请求模型思考。
   * 默认关闭。
   * 输入框思考关闭时，该设置无效。
   * 不影响工具执行、证据边界或权限确认。
   */
  agentThinkingEnabled: boolean;
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
  /** Notebrain Agent 工作区与本地命令设置 */
  notebrainWorkspace: NotebrainAgentWorkspaceSettings;
  /** 外部 Skill 设置 */
  externalSkills: ExternalSkillSettings;
  /** MCP Client 设置 */
  mcp: McpSettings;
  /** 本机运行时工具设置 */
  runtimeTools: RuntimeToolsSettings;
  /** 处理过程折叠模式（工作台事件区） */
  workbenchProcessDisplayMode: KbProcessDisplayMode;
  /** 思考过程折叠模式 */
  reasoningProcessDisplayMode: KbProcessDisplayMode;
};
