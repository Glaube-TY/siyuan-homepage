/**
 * 知识库默认设置
 */

import type { KbSettings, WebSearchSettings, KbSkillSettings, KbToolSettings, GlobalMemorySettings, QuickPromptsSettings } from "../types/settings";

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
  disabledBuiltinSkillNames: [],
};

export const DEFAULT_KB_SETTINGS: KbSettings = {
  assistantActionAlignment: "left",
  firstPassMaxHits: 50,
  headingMatchWeight: 10,
  textMatchWeight: 5,
  previewMatchWeight: 3,
  agentReadMaxCharsPerDoc: 12000,
  controlPlaneThinkingEnabled: false,
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
};
