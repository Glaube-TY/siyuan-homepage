/**
 * 聊天模型选择类型定义
 * 用于侧边栏输入框选择本次对话使用的模型
 */

export type ChatModelSelection = {
  providerId: string;
  modelId: string;
};

export type ChatModelOption = ChatModelSelection & {
  key: string;
  providerName: string;
  providerType: string;
  modelName: string;
  label: string;
  description: string;
  contextWindowTokens?: number;
};

export function buildChatModelKey(providerId: string, modelId: string): string {
  return `${String(providerId || "").trim()}::${String(modelId || "").trim()}`;
}
