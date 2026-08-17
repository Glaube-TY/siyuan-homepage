/**
 * 知识库设置类型
 */

/** 聊天模型提供商类型 */
export type KbChatProviderType = "kimi-api" | "kimi-coding" | "mimo-api" | "mimo-coding-plan" | "deepseek-api" | "opencode-go" | "opencode-zen" | "openai-compatible";

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

/** AI 对话界面样式 */
export type KbChatAppearanceStyle = "default" | "minimal" | "prose" | "card";

/** AI 对话头像来源 */
export type KbChatAvatarKind = "default" | "emoji" | "image";

/** 单个对话头像设置 */
export type KbChatAvatarSettings = {
  kind: KbChatAvatarKind;
  emoji?: string;
  imageDataUrl?: string;
};

/** AI 对话外观设置 */
export type KbChatAppearanceSettings = {
  style: KbChatAppearanceStyle;
  userAvatar: KbChatAvatarSettings;
  assistantAvatar: KbChatAvatarSettings;
};

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

/** Provider-visible aggregate Agent tool names. */
export type KbGlobalToolName =
  | "siyuan_kb"
  | "diary_task"
  | "siyuan_database"
  | "siyuan_doc_edit"
  | "siyuan_tree"
  | "siyuan_meta"
  | "siyuan_asset"
  | "siyuan_riff"
  | "homepage_manage"
  | "homepage_components"
  | "temporary_workbench"
  | "skill_manage"
  | "mcp_manage"
  | "notebrain_file"
  | "web_fetch"
  | "memory_manage"
  | "agent_tool_help";

/** 全局工具设置 */
export type KbToolSettings = {
  /**
   * 工具设置结构版本。1 = 两顶层主页工具结构（homepage_manage + homepage_components + temporary_workbench）。
   * 旧存储无此字段，归一化时执行一次迁移并写入 1；后续读取幂等。
   */
  schemaVersion?: 1;
  /** 被禁用的全局工具名称列表。agent_tool_help 永远不在此列表中（系统必需，固定启用）。 */
  disabledGlobalToolNames: KbGlobalToolName[];
  /**
   * 聚合工具内的子工具（dotted action 前缀）禁用列表。
   * key = 聚合工具名（当前为 homepage_components），value = 被禁用的前缀，如 ["music"]。
   * 父工具关闭时不注册任何子操作；重新开启后恢复原有子工具开关状态。
   */
  disabledSubtools?: Record<string, string[]>;
  /**
   * 无 action 的直接写工具的可信免确认名单。
   * 有 action 的聚合工具应使用 toolActionConfirmOverrides 进行 action 级覆盖。
   */
  disabledWriteToolConfirmationNames?: string[];
  /**
   * action 级确认覆盖配置。
   * 结构：{ [toolName]: { [actionName]: boolean } }
   * - true  表示需要确认（即便 metadata 默认 requiresConfirmation=false 也强制确认；当前仅对 requiresConfirmation=true 的 action 生效）
   * - false 表示用户已设为可信免确认（仍会经过 preview / safety guards / validateInputForPreview，但不弹用户确认）
   * 只对聚合工具（有 actions）且 metadata 标记 requiresConfirmation=true 的 action 生效。
   * 无 action 的直接工具仍使用 disabledWriteToolConfirmationNames。
   */
  toolActionConfirmOverrides?: Record<string, Record<string, boolean>>;
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

export type NotebrainPermissionAction = "allow" | "ask" | "deny";

export type NotebrainAgentWorkspaceSettings = {
  /** 沙箱环境总开关。关闭后本页所有设置均不生效，不注册沙箱工具，不进行环境检测。 */
  enabled: boolean;
  commandExecutionEnabled: boolean;
  defaultCommandTimeoutMs: number;
  maxCommandOutputChars: number;
  commandDefaultAction: NotebrainPermissionAction;
  commandAllowRules: string[];
  commandAskRules: string[];
  commandDenyRules: string[];
  /** 是否注册 notebrain 文件写入/删除工具（notebrain_file.write_file、notebrain_file.delete_path）。不影响 skill_manage.install 内部写入。 */
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
  /** 当前 Agent Profile 的运行时白名单；不持久化时表示全部允许。 */
  allowedSkillIds?: readonly string[];
};

export type McpSettings = {
  enabled: boolean;
  maxVisibleToolsPerTurn: number;
  disabledServerIds: string[];
  disabledToolNames: string[];
  trustedToolNames: string[];
  /** 当前 Agent Profile 的运行时白名单；不持久化时表示全部允许。 */
  allowedServerIds?: readonly string[];
  allowedToolNames?: readonly string[];
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
  /** AI 对话外观设置 */
  chatAppearance: KbChatAppearanceSettings;
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
   * Agent 每轮最大工具调用次数。控制一次提问中 Agent 最多能调用多少次工具。
   * 数值越大越适合复杂 MCP / 多工具任务，但也可能增加耗时和费用。
   * 0 表示无限制；常用值 20/50，默认 20。
   */
  agentMaxToolCallsPerTurn: number;
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
   * 全局工具设置
   */
  toolSettings: KbToolSettings;
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
