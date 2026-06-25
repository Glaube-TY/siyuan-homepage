/**
 * 知识库默认设置
 */

import type { KbSettings, WebSearchSettings, KbSkillSettings, KbToolSettings, GlobalMemorySettings, QuickPromptsSettings, KbProcessDisplayMode, NotebrainAgentWorkspaceSettings, ExternalSkillSettings, McpSettings, RuntimeToolsSettings } from "../types/settings";

/** 默认温度参数 */
export const DEFAULT_TEMPERATURE = 0.3;

/** 默认全局工具设置 */
export const DEFAULT_TOOL_SETTINGS: KbToolSettings = {
  disabledGlobalToolNames: [],
};

/** 默认全局记忆设置 */
export const DEFAULT_GLOBAL_MEMORY_SETTINGS: GlobalMemorySettings = {
  enabled: false,
  docId: "",
  maxChars: 8000,
  allowAiUpdate: false,
};

/** 默认快捷提示语设置 */
export const DEFAULT_QUICK_PROMPTS_SETTINGS: QuickPromptsSettings = {
  enabled: false,
  docId: "",
};

export const DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS: NotebrainAgentWorkspaceSettings = {
  enabled: false,
  commandExecutionEnabled: false,
  defaultCommandTimeoutMs: 120000,
  maxCommandOutputChars: 20000,
  commandDefaultAction: "ask",
  commandAllowRules: [],
  commandAskRules: ["*"],
  commandDenyRules: [],
  fileWriteToolsEnabled: true,
  commandStrictWorkspaceMode: true,
  allowNetworkAccess: false,
  allowSystemInfoCommands: false,
  allowAbsolutePaths: false,
};

export const DEFAULT_EXTERNAL_SKILL_SETTINGS: ExternalSkillSettings = {
  enabled: true,
  maxSkillReadChars: 20000,
  autoInstallEnabled: true,
  disabledSkillIds: [],
  legacyUserSkillDirectInject: false,
};

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: false,
  maxVisibleToolsPerTurn: 40,
  disabledServerIds: [],
  disabledToolNames: [],
  trustedToolNames: [],
};

export const DEFAULT_RUNTIME_TOOLS_SETTINGS: RuntimeToolsSettings = {
  enabled: true,
  exposeToAgent: true,
  extraPathDirs: [],
  commandOverrides: {},
};

/** 默认网页搜索设置 */
export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  enabled: false,
  provider: "anysearch",
  maxResults: 5,
  readPageMaxChars: 12000,
  timeoutMs: 15000,
  anySearchZone: "cn",
  anySearchLanguage: "zh-CN",
};

export const DEFAULT_SKILL_SETTINGS: KbSkillSettings = {
  disabledBuiltinSkillNames: [
    "builtin_doc_content_editing",
    "builtin_notebook_doc_tree",
    "builtin_tag_bookmark_outline",
    "builtin_asset_management",
    "builtin_riff_review",
  ],
  initializedDefaultDisabledBuiltinSkillNames: [
    "builtin_doc_content_editing",
    "builtin_notebook_doc_tree",
    "builtin_tag_bookmark_outline",
    "builtin_asset_management",
    "builtin_riff_review",
  ],
};

export const DEFAULT_KB_SETTINGS: KbSettings = {
  assistantActionAlignment: "left",
  firstPassMaxHits: 50,
  docTitleMatchWeight: 20,
  headingMatchWeight: 10,
  textMatchWeight: 5,
  previewMatchWeight: 3,
  agentReadMaxCharsPerDoc: 12000,
  agentThinkingEnabled: false,
  agentMaxToolCallsPerTurn: 10,
  /** 聊天模型提供商列表（默认为空，用户需从预设添加） */
  chatProviders: [],
  /** 当前选中的聊天提供商 ID（默认为空） */
  selectedChatProviderId: "",
  /** 当前选中的聊天模型 ID（默认为空） */
  selectedChatModelId: "",
  /** 网页搜索设置 */
  webSearch: DEFAULT_WEB_SEARCH_SETTINGS,
  /** Skill 设置 */
  skillSettings: DEFAULT_SKILL_SETTINGS,
  /** 全局工具设置 */
  toolSettings: DEFAULT_TOOL_SETTINGS,
  /** 全局记忆设置 */
  globalMemory: DEFAULT_GLOBAL_MEMORY_SETTINGS,
  /** 快捷提示语设置 */
  quickPrompts: DEFAULT_QUICK_PROMPTS_SETTINGS,
  /** Notebrain Agent 工作区与本地命令设置 */
  notebrainWorkspace: DEFAULT_NOTEBRAIN_WORKSPACE_SETTINGS,
  /** 外部 Skill 设置 */
  externalSkills: DEFAULT_EXTERNAL_SKILL_SETTINGS,
  /** MCP Client 设置 */
  mcp: DEFAULT_MCP_SETTINGS,
  /** 本机运行时工具设置 */
  runtimeTools: DEFAULT_RUNTIME_TOOLS_SETTINGS,
  /** 处理过程折叠模式 */
  workbenchProcessDisplayMode: "collapsed" as KbProcessDisplayMode,
  /** 思考过程折叠模式 */
  reasoningProcessDisplayMode: "collapsed" as KbProcessDisplayMode,
};
