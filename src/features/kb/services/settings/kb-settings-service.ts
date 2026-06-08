/**
 * KB 设置服务
 * 负责读取/合并/保存 KB 设置
 */

import type { KbSettings, KbChatProviderConfig, KbChatModelConfig, WebSearchSettings, KbSkillSettings } from "../../types/settings";
import {
  DEFAULT_KB_SETTINGS,
  DEFAULT_TEMPERATURE,
  DEFAULT_WEB_SEARCH_SETTINGS,
  DEFAULT_SKILL_SETTINGS,
} from "../../constants/default-settings";
import {
  sanitizeChatProviders as sanitizeChatProvidersCore,
  resolveSelectedChatConfig as resolveSelectedChatConfigCore,
} from "./chat-provider-config";

const SETTINGS_KEY = "kb-settings";

// ==================== 数值归一化 helpers ====================

/**
 * 通用数值 clamp
 */
function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 归一化整数型设置
 * - 空字符串 / NaN / Infinity / 负数 → 回退默认值
 * - 超出 [min, max] → clamp
 */
function normalizeIntegerSetting(
  raw: unknown,
  defaultValue: number,
  min: number,
  max: number
): number {
  const val = parseInt(String(raw), 10);
  if (!Number.isFinite(val) || val < 0) {
    return defaultValue;
  }
  return clampNumber(val, min, max);
}

/**
 * 归一化浮点型设置（支持 0 值，允许用户明确关闭某项加权）
 * - 空字符串 / NaN / Infinity / 负数 → 回退默认值
 * - 超出 [min, max] → clamp
 */
function normalizeFloatSetting(
  raw: unknown,
  defaultValue: number,
  min: number,
  max: number
): number {
  const val = parseFloat(String(raw));
  if (!Number.isFinite(val) || val < 0) {
    return defaultValue;
  }
  return clampNumber(val, min, max);
}

function normalizeAssistantActionAlignment(raw: unknown): KbSettings["assistantActionAlignment"] {
  if (raw === "center" || raw === "right" || raw === "left") {
    return raw;
  }
  return DEFAULT_KB_SETTINGS.assistantActionAlignment;
}

/**
 * 归一化 Skill 设置
 * - disabledBuiltinSkillNames 只保留合法 string，去重
 */
function normalizeSkillSettings(raw: unknown): KbSkillSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SKILL_SETTINGS };
  }
  const s = raw as Record<string, unknown>;
  const rawNames = s.disabledBuiltinSkillNames;
  let names: string[] = [];
  if (Array.isArray(rawNames)) {
    names = rawNames.filter((n): n is string => typeof n === "string" && n.length > 0);
    names = [...new Set(names)];
  }
  return {
    disabledBuiltinSkillNames: names,
  };
}

/**
 * 归一化网页搜索设置
 * - 非对象 → 回退默认值
 * - 数值 clamp 到有效范围
 * - 空字符串的可选字段 → undefined
 * - 无效 provider → "anysearch"
 * - 无效 zone → "cn"
 * - 空 language → "zh-CN"
 */
function normalizeWebSearchSettings(raw: unknown): WebSearchSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_WEB_SEARCH_SETTINGS };
  }

  const s = raw as Record<string, unknown>;

  // enabled
  const enabled = typeof s.enabled === "boolean" ? s.enabled : DEFAULT_WEB_SEARCH_SETTINGS.enabled;

  // provider
  const providerRaw = s.provider;
  const provider =
    providerRaw === "anysearch" || providerRaw === "custom_json" || providerRaw === "tavily"
      ? providerRaw
      : DEFAULT_WEB_SEARCH_SETTINGS.provider;

  // optional string fields — empty string → undefined
  const optionalString = (key: string): string | undefined => {
    const v = s[key];
    if (typeof v === "string" && v.length > 0) return v;
    return undefined;
  };

  // maxResults (1-10, integer)
  const maxResults =
    typeof s.maxResults === "number" && Number.isFinite(s.maxResults)
      ? clampNumber(Math.round(s.maxResults), 1, 10)
      : DEFAULT_WEB_SEARCH_SETTINGS.maxResults;

  // readPageMaxChars (2000-30000, integer)
  const readPageMaxChars =
    typeof s.readPageMaxChars === "number" && Number.isFinite(s.readPageMaxChars)
      ? clampNumber(Math.round(s.readPageMaxChars), 2000, 30000)
      : DEFAULT_WEB_SEARCH_SETTINGS.readPageMaxChars;

  // timeoutMs (5000-60000, integer)
  const timeoutMs =
    typeof s.timeoutMs === "number" && Number.isFinite(s.timeoutMs)
      ? clampNumber(Math.round(s.timeoutMs), 5000, 60000)
      : DEFAULT_WEB_SEARCH_SETTINGS.timeoutMs;

  // anySearchZone
  const zoneRaw = s.anySearchZone;
  const anySearchZone: WebSearchSettings["anySearchZone"] =
    zoneRaw === "cn" || zoneRaw === "intl" ? zoneRaw : DEFAULT_WEB_SEARCH_SETTINGS.anySearchZone;

  // anySearchLanguage
  const langRaw = s.anySearchLanguage;
  const anySearchLanguage =
    typeof langRaw === "string" && langRaw.length > 0
      ? langRaw
      : DEFAULT_WEB_SEARCH_SETTINGS.anySearchLanguage;

  return {
    enabled,
    provider,
    searchEndpoint: optionalString("searchEndpoint"),
    readProxyEndpoint: optionalString("readProxyEndpoint"),
    apiKey: optionalString("apiKey"),
    maxResults,
    readPageMaxChars,
    timeoutMs,
    anySearchZone,
    anySearchLanguage,
  };
}

// ==================== KB Settings Changed Event ====================

/**
 * KB 设置变更事件名
 * 用于通知其他模块（如主面板）设置已更新
 */
export const KB_SETTINGS_CHANGED_EVENT = "kb-settings-changed";

// 插件实例引用，由外部注入
let pluginInstance: any = null;

/**
 * 注入插件实例
 * 应在插件初始化时调用
 */
export function setKbSettingsPlugin(plugin: any) {
  pluginInstance = plugin;
}

/**
 * 获取插件实例
 */
function getPlugin(): any {
  if (!pluginInstance) {
    console.warn("[KB Settings] Plugin instance not set, using default settings");
  }
  return pluginInstance;
}

/**
 * 获取当前 KB 设置（已合并默认值）
 * 从插件 storage 读取，如不存在则返回默认值
 */
export async function getKbSettings(): Promise<KbSettings> {
  const plugin = getPlugin();
  if (!plugin) {
    return mergeKbSettings({});
  }

  try {
    const savedSettings = await plugin.loadData(SETTINGS_KEY);
    return mergeKbSettings(savedSettings || {});
  } catch (e) {
    console.warn("[KB Settings] Failed to load settings, using defaults", e);
    return mergeKbSettings({});
  }
}

/**
 * 保存 KB 设置
 * 返回最终 mergedSettings，方便调用方同步更新 UI
 */
export async function saveKbSettings(settings: Partial<KbSettings>): Promise<KbSettings> {
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("Plugin instance not set");
  }

  try {
    // 先读取现有设置，合并后再保存
    const existingSettings = await plugin.loadData(SETTINGS_KEY);
    const mergedSettings = mergeKbSettings({
      ...(existingSettings || {}),
      ...settings,
    });
    await plugin.saveData(SETTINGS_KEY, mergedSettings);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(KB_SETTINGS_CHANGED_EVENT, { detail: mergedSettings })
      );
    }
    return mergedSettings;
  } catch (e) {
    console.error("[KB Settings] Failed to save settings", e);
    throw e;
  }
}

/**
 * 归一化数值型设置，避免字符串型配置漂移
 */
function normalizeNumericSettings(settings: Partial<KbSettings>): Partial<KbSettings> {
  const normalized = { ...settings };

  if (normalized.firstPassMaxHits !== undefined) {
    normalized.firstPassMaxHits = normalizeIntegerSetting(
      normalized.firstPassMaxHits,
      DEFAULT_KB_SETTINGS.firstPassMaxHits,
      1,
      100
    );
  }

  if (normalized.headingMatchWeight !== undefined) {
    normalized.headingMatchWeight = normalizeFloatSetting(
      normalized.headingMatchWeight,
      DEFAULT_KB_SETTINGS.headingMatchWeight,
      0,
      50
    );
  }

  if (normalized.textMatchWeight !== undefined) {
    normalized.textMatchWeight = normalizeFloatSetting(
      normalized.textMatchWeight,
      DEFAULT_KB_SETTINGS.textMatchWeight,
      0,
      50
    );
  }

  if (normalized.previewMatchWeight !== undefined) {
    normalized.previewMatchWeight = normalizeFloatSetting(
      normalized.previewMatchWeight,
      DEFAULT_KB_SETTINGS.previewMatchWeight,
      0,
      50
    );
  }

  if (normalized.agentReadMaxCharsPerDoc !== undefined) {
    normalized.agentReadMaxCharsPerDoc = normalizeIntegerSetting(
      normalized.agentReadMaxCharsPerDoc,
      DEFAULT_KB_SETTINGS.agentReadMaxCharsPerDoc,
      2000,
      100000
    );
  }

  // 归一化 webSearch 中的数值字段（处理字符串型配置漂移）
  // normalizeWebSearchSettings 会做最终 clamp，这里先做 parseInt 转换
  const rawWebSearch = (normalized as { webSearch?: unknown }).webSearch;
  if (rawWebSearch && typeof rawWebSearch === "object") {
    const ws = { ...rawWebSearch } as Record<string, unknown>;

    if (ws.maxResults !== undefined) {
      ws.maxResults = normalizeIntegerSetting(
        ws.maxResults,
        DEFAULT_WEB_SEARCH_SETTINGS.maxResults,
        1,
        10
      );
    }

    if (ws.readPageMaxChars !== undefined) {
      ws.readPageMaxChars = normalizeIntegerSetting(
        ws.readPageMaxChars,
        DEFAULT_WEB_SEARCH_SETTINGS.readPageMaxChars,
        2000,
        30000
      );
    }

    if (ws.timeoutMs !== undefined) {
      ws.timeoutMs = normalizeIntegerSetting(
        ws.timeoutMs,
        DEFAULT_WEB_SEARCH_SETTINGS.timeoutMs,
        5000,
        60000
      );
    }

    (normalized as { webSearch?: unknown }).webSearch = ws;
  }

  // 归一化 chatProviders 中模型的 temperature 和 maxTokens
  // 注意：这里只负责数值归一化，不要补 id/name/type/baseUrl，交给 sanitizeChatProviders 统一处理
  // 使用 unknown 中间态避免 TypeScript 类型冲突
  const rawProviders = (normalized as { chatProviders?: unknown }).chatProviders;
  if (Array.isArray(rawProviders)) {
    (normalized as { chatProviders?: unknown }).chatProviders = rawProviders.map((provider) => {
      // provider 不是对象时返回空对象占位，sanitizeChatProviders 会兜底
      if (!provider || typeof provider !== "object") {
        return {};
      }

      // 浅拷贝 provider，避免修改原对象
      const providerCopy = { ...provider } as Record<string, unknown>;

      // models 不是数组时设为空数组，sanitizeChatProviders 会兜底
      const rawModels = providerCopy.models;
      const models = Array.isArray(rawModels) ? rawModels : [];

      providerCopy.models = models.map((model) => {
        // model 不是对象时返回空对象占位，sanitizeChatProviders 会兜底
        if (!model || typeof model !== "object") {
          return {};
        }

        // 浅拷贝 model
        const modelCopy = { ...model } as Record<string, unknown>;

        // 归一化 temperature
        if (modelCopy.temperature !== undefined) {
          const val = parseFloat(String(modelCopy.temperature));
          modelCopy.temperature = isNaN(val) ? DEFAULT_TEMPERATURE : val;
        }

        // 归一化 maxTokens
        if (modelCopy.maxTokens !== undefined) {
          const val = parseInt(String(modelCopy.maxTokens), 10);
          modelCopy.maxTokens = isNaN(val) || val <= 0 ? undefined : val;
        }

        // 归一化 contextWindowTokens
        if (modelCopy.contextWindowTokens !== undefined) {
          const val = parseInt(String(modelCopy.contextWindowTokens), 10);
          modelCopy.contextWindowTokens = isNaN(val) || val <= 0 ? undefined : val;
        }

        return modelCopy;
      });

      return providerCopy;
    });
  }

  return normalized;
}

/**
 * 清洗和补全 chatProviders（委托给统一模块）
 */
function sanitizeChatProviders(
  providers: unknown,
  fallbackTemperature: number
): KbChatProviderConfig[] {
  return sanitizeChatProvidersCore(providers, fallbackTemperature);
}

/**
 * 解析选中的聊天配置（委托给统一模块）
 */
function resolveSelectedChatConfig(
  chatProviders: KbChatProviderConfig[],
  selectedProviderId: string | undefined,
  selectedModelId: string | undefined
): {
  provider: KbChatProviderConfig | undefined;
  model: KbChatModelConfig | undefined;
  selectedProviderId: string;
  selectedModelId: string;
} {
  return resolveSelectedChatConfigCore(chatProviders, selectedProviderId, selectedModelId);
}

/**
 * 合并用户设置与默认值
 */
export function mergeKbSettings(userSettings: Partial<KbSettings>): KbSettings {
  // 第一步：归一化数值型设置
  const normalized = normalizeNumericSettings(userSettings);

  // 第二步：清洗 chatProviders
  const chatProviders = sanitizeChatProviders(
    normalized.chatProviders,
    DEFAULT_TEMPERATURE
  );

  // 第三步：解析选中的配置
  const selectedConfig = resolveSelectedChatConfig(
    chatProviders,
    normalized.selectedChatProviderId ?? userSettings.selectedChatProviderId,
    normalized.selectedChatModelId ?? userSettings.selectedChatModelId
  );
  const finalSelectedProviderId = selectedConfig.selectedProviderId;
  const finalSelectedModelId = selectedConfig.selectedModelId;

  // 第四步：显式构造 KbSettings 返回对象
  return {
    assistantActionAlignment: normalizeAssistantActionAlignment(normalized.assistantActionAlignment),
    firstPassMaxHits: normalized.firstPassMaxHits ?? DEFAULT_KB_SETTINGS.firstPassMaxHits,
    headingMatchWeight: normalized.headingMatchWeight ?? DEFAULT_KB_SETTINGS.headingMatchWeight,
    textMatchWeight: normalized.textMatchWeight ?? DEFAULT_KB_SETTINGS.textMatchWeight,
    previewMatchWeight: normalized.previewMatchWeight ?? DEFAULT_KB_SETTINGS.previewMatchWeight,
    agentReadMaxCharsPerDoc: normalized.agentReadMaxCharsPerDoc ?? DEFAULT_KB_SETTINGS.agentReadMaxCharsPerDoc,
    controlPlaneThinkingEnabled: typeof normalized.controlPlaneThinkingEnabled === "boolean"
      ? normalized.controlPlaneThinkingEnabled
      : DEFAULT_KB_SETTINGS.controlPlaneThinkingEnabled,
    chatProviders,
    selectedChatProviderId: finalSelectedProviderId,
    selectedChatModelId: finalSelectedModelId,
    webSearch: normalizeWebSearchSettings(normalized.webSearch),
    skillSettings: normalizeSkillSettings(normalized.skillSettings),
  };
}

/**
 * 获取单个设置项（带默认值回退）
 */
export function getKbSetting<K extends keyof KbSettings>(
  settings: Partial<KbSettings> | undefined,
  key: K
): KbSettings[K] {
  return (settings?.[key] as KbSettings[K]) ?? DEFAULT_KB_SETTINGS[key];
}
