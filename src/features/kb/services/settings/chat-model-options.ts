/**
 * 聊天模型选项构建 helper
 * 从 KbSettings.chatProviders 中构建输入框可选择的模型列表
 */

import type { KbSettings } from "../../types/settings";
import type { ChatModelOption } from "../../types/chat-model-selection";
import { buildChatModelKey } from "../../types/chat-model-selection";
import { normalizeId, isUsableChatModel } from "./chat-provider-config";

/**
 * 从 settings 构建聊天模型选项列表
 * 只返回启用的 provider 和 model
 */
export function buildChatModelOptions(settings: KbSettings): ChatModelOption[] {
  const providers = Array.isArray(settings.chatProviders) ? settings.chatProviders : [];
  const options: ChatModelOption[] = [];
  const usedKeys = new Set<string>();

  for (const provider of providers) {
    if (provider.enabled === false) continue;

    const providerId = normalizeId(provider.id);
    if (!providerId) continue;

    const models = Array.isArray(provider.models) ? provider.models : [];
    const providerName = String(provider.name ?? "").trim() || providerId;

    for (const model of models) {
      if (!isUsableChatModel(model)) continue;

      const modelId = normalizeId(model.id);
      const key = buildChatModelKey(providerId, modelId);

      if (usedKeys.has(key)) {
        console.warn(`[chat-model-options] 跳过重复模型 key: ${key}`);
        continue;
      }
      usedKeys.add(key);

      const modelName = String(model.name ?? "").trim() || modelId;

      options.push({
        key,
        providerId,
        modelId,
        providerName,
        providerType: String(provider.type ?? "").trim() || "unknown",
        modelName,
        label: `${providerName} / ${modelName}`,
        description: `模型 ID：${modelId}`,
        contextWindowTokens: model.contextWindowTokens,
      });
    }
  }

  return options;
}

/**
 * 查找默认的聊天模型选项
 * 优先使用 settings.selectedChatProviderId + settings.selectedChatModelId
 */
export function findDefaultChatModelOption(
  settings: KbSettings,
  options: ChatModelOption[]
): ChatModelOption | undefined {
  if (options.length === 0) return undefined;

  const selectedProviderId = normalizeId(settings.selectedChatProviderId);
  const selectedModelId = normalizeId(settings.selectedChatModelId);

  if (selectedProviderId && selectedModelId) {
    const found = options.find(
      (opt) =>
        normalizeId(opt.providerId) === selectedProviderId &&
        normalizeId(opt.modelId) === selectedModelId
    );
    if (found) return found;
  }

  return options[0];
}
