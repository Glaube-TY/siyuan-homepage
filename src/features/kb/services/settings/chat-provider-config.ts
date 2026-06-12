/**
 * 聊天提供商配置统一纯逻辑模块
 * 提供 provider/model 配置相关的纯函数，不引入 Svelte UI、LLM 调用或思源 API
 */

import type { KbChatProviderConfig, KbChatModelConfig, KbChatProviderType } from "../../types/settings";
import type { ProviderNativeAgentCompatibility } from "../../types/settings";
import type { DiscoverModelsResult } from "../qa/model-list-discovery";
import { isKimiProviderType } from "../qa/model-list-discovery";

const LEGACY_COMPATIBILITY_KEY = ["provider", "Request", "Compatibility"].join("");

/**
 * 校验和清洗 ProviderNativeAgentCompatibility，只保留合法枚举和值
 */
function sanitizeProviderNativeAgentCompatibility(raw: unknown): ProviderNativeAgentCompatibility | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const result: ProviderNativeAgentCompatibility = {};

  const suitability = obj.suitability;
  if (suitability === "normal" || suitability === "not_recommended") {
    result.suitability = suitability;
  }

  const nativeToolCalls = obj.nativeToolCalls;
  if (typeof nativeToolCalls === "boolean") result.nativeToolCalls = nativeToolCalls;

  const streamingToolCalls = obj.streamingToolCalls;
  if (typeof streamingToolCalls === "boolean") result.streamingToolCalls = streamingToolCalls;

  const toolResultContinuation = obj.toolResultContinuation;
  if (typeof toolResultContinuation === "boolean") result.toolResultContinuation = toolResultContinuation;

  const reasoningDelta = obj.reasoningDelta;
  if (typeof reasoningDelta === "boolean") result.reasoningDelta = reasoningDelta;

  const thinkingOffStrategy = obj.thinkingOffStrategy;
  if (thinkingOffStrategy === "omit" || thinkingOffStrategy === "openai_thinking_disabled" || thinkingOffStrategy === "enable_thinking_false") {
    result.thinkingOffStrategy = thinkingOffStrategy;
  }

  const thinkingOnStrategy = obj.thinkingOnStrategy;
  if (thinkingOnStrategy === "omit" || thinkingOnStrategy === "openai_thinking_enabled" || thinkingOnStrategy === "enable_thinking_true") {
    result.thinkingOnStrategy = thinkingOnStrategy;
  }

  const timeoutMs = obj.timeoutMs;
  if (typeof timeoutMs === "number" && Number.isInteger(timeoutMs) && timeoutMs > 0) {
    result.timeoutMs = Math.max(30000, Math.min(300000, timeoutMs));
  }

  const tokenParamStrategy = obj.tokenParamStrategy;
  if (tokenParamStrategy === "max_tokens" || tokenParamStrategy === "max_completion_tokens") {
    result.tokenParamStrategy = tokenParamStrategy;
  }

  const temperatureParamStrategy = obj.temperatureParamStrategy;
  if (temperatureParamStrategy === "default" || temperatureParamStrategy === "omit" || temperatureParamStrategy === "fixed") {
    result.temperatureParamStrategy = temperatureParamStrategy;
  }

  const fixedTemperature = obj.fixedTemperature;
  if (typeof fixedTemperature === "number" && !isNaN(fixedTemperature) && fixedTemperature >= 0 && fixedTemperature <= 2) {
    result.fixedTemperature = fixedTemperature;
  }

  // 如果没有任何合法字段，返回 undefined
  if (Object.keys(result).length === 0) return undefined;
  return result;
}

/**
 * 校验和清洗 finalComposeMode，只保留合法枚举值
 */
function sanitizeFinalComposeMode(value: unknown): "auto" | "stream" | "non_stream" | undefined {
  return value === "auto" || value === "stream" || value === "non_stream"
    ? value
    : undefined;
}

/**
 * 规范化 ID（trim 处理）
 */
export function normalizeId(value: unknown): string {
  return String(value || "").trim();
}

/**
 * 规范化 provider type
 * 只允许已知类型，非法值回退到 "openai-compatible"
 */
export function normalizeProviderType(type: unknown): KbChatProviderType {
  const knownTypes: KbChatProviderType[] = ["kimi", "kimi-api", "kimi-coding", "mimo", "mimo-api", "mimo-coding-plan", "deepseek", "deepseek-api", "openai-compatible"];
  const normalized = String(type || "").trim().toLowerCase() as KbChatProviderType;
  return knownTypes.includes(normalized) ? normalized : "openai-compatible";
}

/**
 * 通过已知预设的 presetId/id/name 推断 provider type
 * 用于归一化旧数据中 type 字段可能不正确的情况
 * 大小写不敏感
 */
function normalizeProviderTypeByKnownPreset(provider: Partial<KbChatProviderConfig>): KbChatProviderType {
  const id = String(provider.id || "").trim().toLowerCase();
  const name = String(provider.name || "").trim().toLowerCase();
  const presetId = String(provider.presetId || "").trim().toLowerCase();
  const baseUrl = String(provider.baseUrl || "").trim().toLowerCase();
  const combined = `${id}/${name}/${presetId}`;

  if (combined.indexOf("kimi-coding") >= 0) return "kimi-coding";
  if (combined.indexOf("kimi-api") >= 0) return "kimi-api";
  if (combined.indexOf("kimi") >= 0 || combined.indexOf("moonshot") >= 0) return "kimi-api";

  if (combined.indexOf("mimo-coding-plan") >= 0) return "mimo-coding-plan";
  if (combined.indexOf("mimo-api") >= 0) return "mimo-api";
  if (combined.indexOf("mimo") >= 0) {
    if (baseUrl.indexOf("token-plan") >= 0) return "mimo-coding-plan";
    if (baseUrl.indexOf("xiaomimimo.com") >= 0) return "mimo-api";
    return "mimo-api";
  }

  if (combined.indexOf("deepseek-api") >= 0) return "deepseek-api";
  if (combined.indexOf("deepseek") >= 0) return "deepseek-api";

  // 历史遗留的第三方 OpenAI-compatible 供应商 ID，映射到 openai-compatible
  const legacyOpenaiCompatibleIds = ["hunyuan", "volcengine", "zhipu", "siliconflow", "minimax", "baidu-qianfan", "openrouter", "volcano"];
  if (id === "openai-compatible" || id.startsWith("openai-compatible-") || legacyOpenaiCompatibleIds.includes(id) || legacyOpenaiCompatibleIds.some((prefix) => id.startsWith(prefix + "-"))) {
    return "openai-compatible";
  }

  return provider.type as KbChatProviderType || "openai-compatible";
}

/**
 * 判断模型是否可用：id 非空且 enabled !== false
 */
export function isUsableChatModel(model: KbChatModelConfig | undefined): boolean {
  return Boolean(model && normalizeId(model.id) && model.enabled !== false);
}

/**
 * 判断 provider 是否有可用聊天模型
 */
export function hasUsableChatModel(provider: KbChatProviderConfig): boolean {
  const models = Array.isArray(provider.models) ? provider.models : [];
  return models.some((m) => isUsableChatModel(m));
}

/**
 * 解析聊天模型选择
 * 统一选择契约：
 * - 只有 enabled !== false 的 provider 才能作为可用 provider
 * - 只有 id trim 后非空且 enabled !== false 的 model 才能作为可用 model
 * - selection 失效时，优先回退到同一 provider 下 default=true 且可用的模型，再回退到第一个可用模型
 * - 如果当前 provider 不可用，回退到第一个"启用且有可用模型"的 provider
 * - 如果没有任何可用 provider/model，返回空字符串
 */
export function resolveChatModelSelection(
  providers: KbChatProviderConfig[],
  preferredProviderId?: string,
  preferredModelId?: string
): { providerId: string; modelId: string } {
  const safeProviders = Array.isArray(providers) ? providers : [];
  if (safeProviders.length === 0) {
    return { providerId: "", modelId: "" };
  }

  const normalizedPreferredProviderId = normalizeId(preferredProviderId);
  const normalizedPreferredModelId = normalizeId(preferredModelId);

  // 优先使用 preferred provider（如果 enabled 且有可用模型）
  let selectedProvider = safeProviders.find(
    (p) =>
      normalizeId(p.id) === normalizedPreferredProviderId &&
      p.enabled !== false &&
      hasUsableChatModel(p)
  );

  // 否则找第一个 enabled 且有可用模型的 provider
  if (!selectedProvider) {
    selectedProvider = safeProviders.find(
      (p) => p.enabled !== false && hasUsableChatModel(p)
    );
  }

  // 没有可用 provider 时返回空
  if (!selectedProvider) {
    return { providerId: "", modelId: "" };
  }

  const providerModels = Array.isArray(selectedProvider.models) ? selectedProvider.models : [];

  // 在选中的 provider 中找 model
  let selectedModel: KbChatModelConfig | undefined;

  // 优先使用 preferred model（必须 isUsableChatModel）
  if (normalizedPreferredModelId && normalizedPreferredProviderId === normalizeId(selectedProvider.id)) {
    selectedModel = providerModels.find(
      (m) => normalizeId(m.id) === normalizedPreferredModelId && isUsableChatModel(m)
    );
  }

  // 否则找 default=true 的可用模型
  if (!selectedModel) {
    selectedModel = providerModels.find((m) => m.default === true && isUsableChatModel(m));
  }

  // 再回退到第一个可用模型（优先选择适合 Agent 的模型）
  if (!selectedModel) {
    selectedModel = providerModels.find((m) => isUsableChatModel(m) && !m.notRecommendedForAgent);
  }
  if (!selectedModel) {
    selectedModel = providerModels.find((m) => isUsableChatModel(m));
  }

  // 没有可用模型时返回空字符串
  return {
    providerId: normalizeId(selectedProvider.id),
    modelId: selectedModel ? normalizeId(selectedModel.id) : "",
  };
}

/**
 * 规范化 provider 下的 models 列表
 * - trim model id
 * - 按 trim 后 model id 去重，保留第一个有效配置
 * - 如果存在至少一个真实可用模型，移除空 id 占位模型
 * - 如果不存在真实模型，但原始 models 中有空 id 占位模型，则保留第一个空占位模型
 * - default 规范化：最多一个 default=true，且必须指向可用模型；空占位永远不能 default
 */
function normalizeProviderModels(
  rawModels: Partial<KbChatModelConfig>[],
  fallbackTemperature: number
): KbChatModelConfig[] {
  const existingMap = new Map<string, KbChatModelConfig>();
  let firstEmptyPlaceholder: KbChatModelConfig | null = null;

  for (const rawModel of rawModels) {
    if (!rawModel || typeof rawModel !== "object") continue;

    const modelId = String(rawModel.id ?? "").trim();

    if (!modelId) {
      if (!firstEmptyPlaceholder) {
        const rawName = String(rawModel.name ?? "").trim();
        firstEmptyPlaceholder = {
          id: "",
          name: rawName || "请填写模型 ID",
          temperature: fallbackTemperature,
          maxTokens: undefined,
          contextWindowTokens: undefined,
          default: false,
          enabled: false,
          supportVision: rawModel.supportVision,
        };
      }
      continue;
    }

    if (existingMap.has(modelId)) continue;

    let temperature = fallbackTemperature;
    if (rawModel.temperature !== undefined) {
      const val = parseFloat(String(rawModel.temperature));
      temperature = isNaN(val) ? fallbackTemperature : val;
    }

    let maxTokens: number | undefined = undefined;
    if (rawModel.maxTokens !== undefined) {
      const val = parseInt(String(rawModel.maxTokens), 10);
      maxTokens = isNaN(val) || val <= 0 ? undefined : val;
    }

    let contextWindowTokens: number | undefined = undefined;
    if (rawModel.contextWindowTokens !== undefined) {
      const val = parseInt(String(rawModel.contextWindowTokens), 10);
      contextWindowTokens = isNaN(val) || val <= 0 ? undefined : val;
    }

    const modelName = String(rawModel.name ?? "").trim() || modelId;

    const rawModelRecord = rawModel as Record<string, unknown>;
    const providerNativeAgentCompatibility = sanitizeProviderNativeAgentCompatibility(
      rawModel.providerNativeAgentCompatibility ?? rawModelRecord[LEGACY_COMPATIBILITY_KEY],
    );

    existingMap.set(modelId, {
      id: modelId,
      name: modelName,
      temperature,
      maxTokens,
      contextWindowTokens,
      default: rawModel.default,
      enabled: typeof rawModel.enabled === "boolean" ? rawModel.enabled : true,
      supportVision: rawModel.supportVision,
      notRecommendedForAgent: rawModel.notRecommendedForAgent,
      providerNativeAgentCompatibility,
      finalComposeMode: sanitizeFinalComposeMode(rawModel.finalComposeMode),
    });
  }

  const models = Array.from(existingMap.values());

  if (models.length > 0 && firstEmptyPlaceholder) {
    // 有真实模型时，移除空占位
  } else if (firstEmptyPlaceholder) {
    models.push(firstEmptyPlaceholder);
  }

  // default 规范化：只认可"可用模型"的 default，空占位永远不能 default
  const usableDefaults = models.filter((m) => m.default === true && isUsableChatModel(m));

  if (usableDefaults.length === 0) {
    models.forEach((m) => { m.default = false; });
    const firstUsable = models.find((m) => isUsableChatModel(m));
    if (firstUsable) {
      firstUsable.default = true;
    }
  } else if (usableDefaults.length > 1) {
    let firstFound = false;
    models.forEach((m) => {
      if (m.default === true && isUsableChatModel(m)) {
        if (!firstFound) {
          firstFound = true;
        } else {
          m.default = false;
        }
      } else if (m.default === true) {
        m.default = false;
      }
    });
  } else {
    models.forEach((m) => {
      if (m.default === true && !isUsableChatModel(m)) {
        m.default = false;
      }
    });
  }

  return models;
}

/**
 * 清洗和补全 chatProviders
 * - 允许空数组
 * - 保证 provider 的必填字段都有合理兜底
 * - 不自动补模型，用户通过 UI 添加或刷新
 * - provider.id 为空时生成稳定 id
 * - 对 provider.id 做去重
 * - 所有字符串字段都会 trim
 * - models 做 trim、去重、占位清理、default 规范化
 */
export function sanitizeChatProviders(
  providers: unknown,
  fallbackTemperature: number
): KbChatProviderConfig[] {
  if (!Array.isArray(providers)) {
    return [];
  }

  const usedIds = new Set<string>();

  const sanitized = providers.map((rawProvider, index) => {
    const provider = (rawProvider && typeof rawProvider === "object" ? rawProvider : {}) as Partial<KbChatProviderConfig>;

    const correctedType = normalizeProviderTypeByKnownPreset(provider);
    const type = normalizeProviderType(correctedType);

    let baseUrl = String(provider.baseUrl ?? "").trim();
    if (type === "deepseek" && baseUrl === "https://api.deepseek.com/v1") {
      baseUrl = "";
    }

    // 迁移旧内置 Kimi 默认地址：把已保存的 .ai 地址清空，
    // 由 resolveOpenAICompatibleBaseUrlForProvider 使用新的 .cn 默认值
    if ((type === "kimi" || type === "kimi-api") && (baseUrl === "" || baseUrl === "https://api.moonshot.ai/v1" || baseUrl === "https://api.moonshot.ai/v1/")) {
      baseUrl = "";
    }

    let id = String(provider.id || "").trim();
    if (!id) {
      id = `${type}-${index + 1}`;
    }

    let uniqueId = id;
    let counter = 1;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${id}-${counter}`;
      counter++;
    }
    usedIds.add(uniqueId);
    id = uniqueId;

    const name = String(provider.name ?? "").trim() || id;

    const apiKey = String(provider.apiKey || "").trim();
    const enabled = typeof provider.enabled === "boolean" ? provider.enabled : true;

    const rawModels = Array.isArray(provider.models) ? provider.models : [];
    const models = rawModels.length > 0
      ? normalizeProviderModels(rawModels, fallbackTemperature)
      : [];

    // 不自动补模型，保持空数组
    const presetId = String(provider.presetId ?? "").trim() || undefined;
    const rawProviderRecord = provider as Record<string, unknown>;
    const providerNativeAgentCompatibility = sanitizeProviderNativeAgentCompatibility(
      provider.providerNativeAgentCompatibility ?? rawProviderRecord[LEGACY_COMPATIBILITY_KEY],
    );

    const sanitizedProvider: KbChatProviderConfig = {
      id,
      name,
      type,
      baseUrl,
      apiKey,
      enabled,
      models,
      presetId,
      providerNativeAgentCompatibility: providerNativeAgentCompatibility,
    };
    return sanitizedProvider;
  });

  return sanitized;
}

/**
 * 解析选中的聊天配置
 * 先调用 resolveChatModelSelection 得到 trim 后的 providerId/modelId，
 * 再用 normalizeId 查找 provider/model 对象。
 */
export function resolveSelectedChatConfig(
  chatProviders: KbChatProviderConfig[],
  selectedProviderId: string | undefined,
  selectedModelId: string | undefined
): {
  provider: KbChatProviderConfig | undefined;
  model: KbChatModelConfig | undefined;
  selectedProviderId: string;
  selectedModelId: string;
} {
  if (!Array.isArray(chatProviders) || chatProviders.length === 0) {
    return {
      provider: undefined,
      model: undefined,
      selectedProviderId: "",
      selectedModelId: "",
    };
  }

  const resolved = resolveChatModelSelection(chatProviders, selectedProviderId, selectedModelId);
  const normalizedProviderId = normalizeId(resolved.providerId);
  const normalizedModelId = normalizeId(resolved.modelId);

  if (!normalizedProviderId) {
    return {
      provider: undefined,
      model: undefined,
      selectedProviderId: "",
      selectedModelId: "",
    };
  }

  const provider = chatProviders.find(
    (p) => normalizeId(p.id) === normalizedProviderId
  );

  if (!provider || !normalizedModelId) {
    return {
      provider,
      model: undefined,
      selectedProviderId: normalizedProviderId,
      selectedModelId: "",
    };
  }

  const providerModels = Array.isArray(provider.models) ? provider.models : [];
  const model = providerModels.find(
    (m) => normalizeId(m.id) === normalizedModelId
  );

  return {
    provider,
    model,
    selectedProviderId: normalizedProviderId,
    selectedModelId: normalizedModelId,
  };
}

/**
 * 合并发现的模型到 provider
 * - discovered model id 必须 trim，空 id 跳过
 * - 同一 provider 下按 trim 后 model id 去重
 * - 保留已有模型的用户配置字段（name、temperature、maxTokens、enabled、supportVision）
 * - 如果已有重复模型 ID，保留第一个有效配置，跳过后续重复项
 * - 如果发现到真实模型，移除原来的空 id 禁用占位模型
 * - default 逻辑：只认可"可用模型"的 default；如果没有可用 default，先清掉所有 default，再把第一个可用模型设为 default=true；如果存在多个可用 default，只保留第一个
 */
export function mergeDiscoveredChatModels(
  provider: KbChatProviderConfig,
  discovered: DiscoverModelsResult
): { updatedProvider: KbChatProviderConfig; message: string } {
  const existingMap = new Map<string, KbChatModelConfig>();
  for (const m of provider.models || []) {
    const existingId = normalizeId(m.id);
    if (existingId && !existingMap.has(existingId)) {
      existingMap.set(existingId, { ...m });
    }
  }

  let addedCount = 0;
  let updatedCount = 0;
  const discoveredIds = new Set<string>();
  for (const dm of discovered.models) {
    const discoveredId = normalizeId(dm.id);
    if (!discoveredId) continue;
    if (discoveredIds.has(discoveredId)) continue;
    discoveredIds.add(discoveredId);
    if (!existingMap.has(discoveredId)) {
      const isAvailable = dm.available !== false;
      // Kimi K2 系列模型使用服务商默认温度
      const isKimiK2Model = isKimiProviderType(provider.type) && /^kimi-k2/.test(discoveredId);
      const defaultTemperature = isKimiK2Model ? 1 : 0.3;
      const defaultProviderNativeAgentCompatibility = isKimiK2Model
        ? { temperatureParamStrategy: "omit" as const }
        : undefined;
      existingMap.set(discoveredId, {
        id: discoveredId,
        name: dm.name || discoveredId,
        temperature: defaultTemperature,
        enabled: isAvailable,
        default: false,
        notRecommendedForAgent: dm.notRecommendedForAgent,
        providerNativeAgentCompatibility: defaultProviderNativeAgentCompatibility,
      });
      if (!isAvailable && (dm as any).unavailableReason) {
        existingMap.get(discoveredId)!.name = `${dm.name || discoveredId}（不可用）`;
      }
      addedCount++;
    } else {
      // 已有模型也要同步 discovered 的 priority/isLegacy/notRecommendedForAgent 等字段
      const existing = existingMap.get(discoveredId)!;
      let modelUpdated = false;
      if (dm.notRecommendedForAgent !== undefined && existing.notRecommendedForAgent !== dm.notRecommendedForAgent) {
        existing.notRecommendedForAgent = dm.notRecommendedForAgent;
        modelUpdated = true;
      }
      if ((dm as any).priority !== undefined) {
        (existing as any).priority = (dm as any).priority;
        modelUpdated = true;
      }
      if ((dm as any).isLegacy !== undefined) {
        (existing as any).isLegacy = (dm as any).isLegacy;
        modelUpdated = true;
      }
      // 迁移已有 Kimi K2 模型：使用服务商默认温度
      if (isKimiProviderType(provider.type) && /^kimi-k2/.test(existing.id)) {
        const oldTemp = existing.temperature;
        if (oldTemp === 0.3 || oldTemp === 0 || oldTemp === undefined) {
          existing.temperature = 1;
          modelUpdated = true;
        }
        // 迁移到 omit 策略（不再固定发送 temperature）
        if (!existing.providerNativeAgentCompatibility?.temperatureParamStrategy || existing.providerNativeAgentCompatibility?.temperatureParamStrategy === "fixed") {
          existing.providerNativeAgentCompatibility = {
            ...existing.providerNativeAgentCompatibility,
            temperatureParamStrategy: "omit",
            fixedTemperature: undefined,
          };
          modelUpdated = true;
        }
      }
      if (modelUpdated) {
        updatedCount++;
      }
    }
  }

  const mergedModels = Array.from(existingMap.values());

  // 如果发现到真实模型，移除空 id 占位模型
  const hasRealModels = mergedModels.some((m) => normalizeId(m.id));
  const filteredModels = hasRealModels
    ? mergedModels.filter((m) => normalizeId(m.id))
    : mergedModels;

  // default 规范化：只认可"可用模型"的 default
  const usableDefaults = filteredModels.filter((m) => m.default === true && isUsableChatModel(m));

  if (usableDefaults.length === 0) {
    // 没有任何可用 default，先清掉所有 default
    filteredModels.forEach((m) => { m.default = false; });
    // 优先选择适合 Agent 的模型
    const firstUsable = filteredModels.find((m) => isUsableChatModel(m) && !m.notRecommendedForAgent);
    if (firstUsable) {
      firstUsable.default = true;
    } else {
      // 如果没有适合 Agent 的模型，选择第一个可用模型并标记 warning
      const fallbackUsable = filteredModels.find((m) => isUsableChatModel(m));
      if (fallbackUsable) {
        fallbackUsable.default = true;
      }
    }
  } else if (usableDefaults.length > 1) {
    // 存在多个可用 default，优先保留适合 Agent 的
    let firstFound = false;
    filteredModels.forEach((m) => {
      if (m.default === true && isUsableChatModel(m)) {
        if (!firstFound) {
          firstFound = true;
        } else {
          m.default = false;
        }
      } else if (m.default === true) {
        // 不可用模型的 default 也清掉
        m.default = false;
      }
    });
  } else {
    // 只有一个可用 default，清掉不可用模型的 default
    filteredModels.forEach((m) => {
      if (m.default === true && !isUsableChatModel(m)) {
        m.default = false;
      }
    });
  }

  const updatedProvider = { ...provider, models: filteredModels };
  const effectiveDiscoveredCount = discoveredIds.size;

  // 检查是否只有不推荐用于 Agent 的模型
  const hasRecommendedModel = filteredModels.some((m) => isUsableChatModel(m) && !m.notRecommendedForAgent);
  let finalMessage = `已发现 ${effectiveDiscoveredCount} 个有效模型，新增 ${addedCount} 个`;
  if (updatedCount > 0) {
    finalMessage += `，更新 ${updatedCount} 个已有模型`;
  }
  finalMessage += "；请运行 Agent 工具调用兼容性测试确认模型是否适合 Agent 模式";
  if (!hasRecommendedModel && filteredModels.some((m) => isUsableChatModel(m))) {
    if (isKimiProviderType(provider.type)) {
      finalMessage += "；当前选中的模型更适合普通回答，不太适合 Agent 模式";
    } else {
      finalMessage += "；当前模型更适合生成计划，不太适合 Agent 模式";
    }
  }

  return {
    updatedProvider,
    message: finalMessage,
  };
}

/**
 * 获取 provider 下指定 providerId 的模型数量
 */
export function getProviderModelCount(provider: KbChatProviderConfig): number {
  return Array.isArray(provider.models) ? provider.models.length : 0;
}

/**
 * 构建聊天模型 key
 */
export function getChatModelKey(providerId: string, modelId: string): string {
  return `${normalizeId(providerId)}::${normalizeId(modelId)}`;
}
