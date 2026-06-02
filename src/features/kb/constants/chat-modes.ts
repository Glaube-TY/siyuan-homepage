/**
 * 聊天模式定义
 * 定义知识库问答的不同资料引用范围
 */

export type ChatMode =
  | "current_notebook"
  | "current_doc_with_children"
  | "whole_kb";

export interface ChatModeConfig {
  id: ChatMode;
  label: string;
  description: string;
  available: boolean;
}

export const CHAT_MODES: ChatModeConfig[] = [
  {
    id: "current_notebook",
    label: "当前笔记本",
    description: "检索当前笔记本中的相关内容",
    available: true,
  },
  {
    id: "current_doc_with_children",
    label: "文档及子文档",
    description: "基于当前文档及其子文档检索",
    available: true,
  },
  {
    id: "whole_kb",
    label: "全库问答",
    description: "基于整个知识库检索",
    available: true,
  },
];

export const DEFAULT_CHAT_MODE: ChatMode = "whole_kb";

export function getChatModeLabel(mode: ChatMode): string {
  return CHAT_MODES.find((m) => m.id === mode)?.label || mode;
}

export function isChatModeAvailable(mode: ChatMode): boolean {
  return CHAT_MODES.find((m) => m.id === mode)?.available ?? false;
}