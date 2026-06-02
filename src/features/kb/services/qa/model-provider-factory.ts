/**
 * 模型提供商工厂
 * 根据 KbSettings 创建 AI SDK 可用的 language model
 *
 * 四个入口（Kimi / Mimo / DeepSeek / 自定义接口）底层统一 OpenAI-compatible 协议
 */

// 使用 any 类型来避免 AI SDK 版本兼容性问题
// 实际返回的是 LanguageModel，但不同 provider 返回的版本不同
type AnyLanguageModel = any;
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { KbSettings, KbChatProviderConfig, KbChatModelConfig, KbChatProviderType } from "../../types/settings";
import { resolveChatModelSelection, normalizeId } from "../settings/chat-provider-config";

/**
 * 规范化文本值
 * 统一对字符串字段做 trim 处理
 * @param value 原始值
 * @param fallback 回退值（默认为空字符串）
 * @returns trim 后的字符串
 */
export function normalizeText(value: unknown, fallback = ""): string {
  return String(value || fallback).trim();
}

/**
 * 规范化 OpenAI-compatible Base URL 的通用逻辑
 * - 去掉末尾斜杠
 * - 兼容用户填到 /chat/completions 的情况，截断到 /v1
 * - 确保以 /v1 结尾
 */
function normalizeOpenAICompatibleBaseUrl(baseUrl: string): string {
  let normalized = normalizeText(baseUrl);
  normalized = normalized.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    normalized = normalized.slice(0, -"/chat/completions".length);
  }
  if (!normalized.endsWith("/v1")) {
    if (normalized.endsWith("/v1/")) {
      normalized = normalized.replace(/\/+$/, "");
    } else {
      normalized = `${normalized}/v1`;
    }
  }
  return normalized;
}

const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<KbChatProviderType, string>> = {
  kimi: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com/v1",
};

export function resolveOpenAICompatibleBaseUrlForProvider(provider: KbChatProviderConfig): string {
  const raw = normalizeText(provider.baseUrl);
  if (!raw) {
    const defaultUrl = PROVIDER_DEFAULT_BASE_URLS[provider.type];
    if (defaultUrl) {
      return defaultUrl;
    }
    return "";
  }
  return normalizeOpenAICompatibleBaseUrl(raw);
}

/**
 * 选中的模型信息
 */
export interface SelectedChatModelInfo {
  /** AI SDK language model 实例 */
  model: AnyLanguageModel;
  /** 提供商配置 */
  providerConfig: KbChatProviderConfig;
  /** 模型配置 */
  modelConfig: KbChatModelConfig;
  /** 提供商显示标签 */
  providerLabel: string;
  /** 模型显示标签 */
  modelLabel: string;
}

import type { ChatModelSelection } from "../../types/chat-model-selection";

/**
 * 根据 settings 创建选中的 chat model
 * @param settings KbSettings
 * @param selection 可选的模型选择，优先于 settings 中的默认选择
 * @returns SelectedChatModelInfo
 */
export function createSelectedChatModel(
  settings: KbSettings,
  selection?: ChatModelSelection | null
): SelectedChatModelInfo {
  if (!Array.isArray(settings.chatProviders)) {
    throw new Error("settings.chatProviders 不是数组，请检查配置");
  }

  const { chatProviders } = settings;

  // 优先使用传入的 selection，否则使用 settings 中的默认选择
  const preferredProviderId = selection?.providerId || settings.selectedChatProviderId;
  const preferredModelId = selection?.modelId || settings.selectedChatModelId;

  const resolved = resolveChatModelSelection(chatProviders, preferredProviderId, preferredModelId);

  if (!resolved.providerId || !resolved.modelId) {
    throw new Error("未找到可用的模型提供商，请检查设置");
  }

  const normalizedResolvedProviderId = normalizeId(resolved.providerId);
  const normalizedResolvedModelId = normalizeId(resolved.modelId);

  const provider = chatProviders.find((p) => normalizeId(p.id) === normalizedResolvedProviderId);
  if (!provider) {
    throw new Error("未找到选中的提供商配置");
  }

  const providerModels = Array.isArray(provider.models) ? provider.models : [];
  const modelConfig = providerModels.find((m) => normalizeId(m.id) === normalizedResolvedModelId);
  if (!modelConfig) {
    throw new Error(`提供商 "${provider.name || provider.id}" 下未找到模型 "${resolved.modelId}"`);
  }

  // 根据 provider 类型创建 model
  const model = createChatModelFromProvider(provider, modelConfig);

  return {
    model,
    providerConfig: provider,
    modelConfig,
    providerLabel: normalizeText(provider.name) || normalizeText(provider.id) || "Unknown",
    modelLabel: normalizeText(modelConfig.name) || normalizeText(modelConfig.id) || "Unknown",
  };
}

/**
 * 根据提供商类型创建 AI SDK model
 * 四入口统一走 resolveOpenAICompatibleBaseUrlForProvider + createOpenAICompatible
 * - kimi/deepseek: 空 baseUrl 使用默认地址
 * - mimo/openai-compatible: 必须用户填写 baseUrl
 */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  kimi: "Kimi",
  "kimi-api": "Kimi API",
  "kimi-coding": "Kimi Coding",
  mimo: "Mimo",
  "mimo-api": "MiMo API",
  "mimo-coding-plan": "MiMo Coding Plan",
  deepseek: "DeepSeek",
  "deepseek-api": "DeepSeek API",
  "openai-compatible": "自定义接口",
};

export function createChatModelFromProvider(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig
): AnyLanguageModel {
  const providerType = provider.type;
  const providerName = normalizeText(provider.name) || normalizeText(provider.id) || PROVIDER_DISPLAY_NAMES[providerType] || "Unknown";
  const modelId = normalizeText(modelConfig.id);
  const apiKey = normalizeText(provider.apiKey);

  if (!modelId) {
    throw new Error(`提供商 "${providerName}" 的模型 ID 为空`);
  }

  if (["kimi", "kimi-api", "kimi-coding", "mimo", "mimo-api", "mimo-coding-plan", "deepseek", "deepseek-api", "openai-compatible"].includes(providerType) && !apiKey) {
    throw new Error(`${PROVIDER_DISPLAY_NAMES[providerType] || providerType} API Key 不能为空`);
  }

  if ((providerType === "mimo" || providerType === "mimo-api" || providerType === "mimo-coding-plan" || providerType === "openai-compatible") && !normalizeText(provider.baseUrl)) {
    throw new Error(
      `${PROVIDER_DISPLAY_NAMES[providerType] || providerName} 未配置 baseUrl。` +
      `提示：baseURL 通常应填到 /v1，例如 https://api.xxx.com/v1`
    );
  }

  const baseURL = resolveOpenAICompatibleBaseUrlForProvider(provider);

  const compatible = createOpenAICompatible({
    name: providerType === "openai-compatible" ? (normalizeText(provider.id) || normalizeText(provider.name) || "openai-compatible") : providerType,
    baseURL,
    apiKey,
    includeUsage: true,
  });

  return compatible(modelId);
}
