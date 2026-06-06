/**
 * 知识库默认设置
 */

import type { KbSettings } from "../types/settings";

/** 默认温度参数 */
export const DEFAULT_TEMPERATURE = 0.3;

export const DEFAULT_KB_SETTINGS: KbSettings = {
  assistantActionAlignment: "left",
  firstPassMaxHits: 50,
  headingMatchWeight: 10,
  textMatchWeight: 5,
  previewMatchWeight: 3,
  agentReadMaxCharsPerDoc: 12000,
  /** 聊天模型提供商列表（默认为空，用户需从预设添加） */
  chatProviders: [],
  /** 当前选中的聊天提供商 ID（默认为空） */
  selectedChatProviderId: "",
  /** 当前选中的聊天模型 ID（默认为空） */
  selectedChatModelId: "",
};
