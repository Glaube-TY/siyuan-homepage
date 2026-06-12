import type { KbChatProviderConfig, KbChatProviderType } from "../../types/settings";
import { resolveOpenAICompatibleBaseUrlForProvider } from "./model-provider-factory";

export interface DiscoveredModel {
  id: string;
  name?: string;
  reason?: string;
  available?: boolean;
  unavailableReason?: string;
  isLegacy?: boolean;
  priority?: number;
  /** 不推荐用于自动代理操作（适合代码任务/思考模型等） */
  notRecommendedForAgent?: boolean;
}

export interface DiscoverModelsResult {
  success: boolean;
  models: DiscoveredModel[];
  message: string;
}

const DISCOVERY_TIMEOUT = 20_000;

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeout = DISCOVERY_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const NON_CHAT_KEYWORDS = [
  "embed",
  "embedding",
  "rerank",
  "bge",
  "jina-embeddings",
  "tts",
  "stt",
  "whisper",
  "audio",
  "speech",
  "moderation",
  "image",
  "imagen",
  "dalle",
  "dall-e",
  "stable-diffusion",
  "sd-",
  "clip",
];

export function isLikelyChatModelId(_providerType: KbChatProviderType, id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  for (const keyword of NON_CHAT_KEYWORDS) {
    if (lower.includes(keyword)) return false;
  }
  return true;
}

function buildChatFilterMessage(rawCount: number, filteredCount: number): { success: boolean; message: string } {
  if (rawCount > 0 && filteredCount === 0) {
    return {
      success: false,
      message: "已获取模型列表，但未识别到适合聊天生成的模型；可以手动添加模型 ID。",
    };
  }
  return {
    success: true,
    message: `已发现 ${filteredCount} 个聊天模型`,
  };
}

function buildBearerHeaders(apiKey?: string): Record<string, string> {
  const key = String(apiKey || "").trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

const KIMI_MODEL_PRIORITY: Record<string, { priority: number; isLegacy: boolean; notRecommendedForAgent?: boolean }> = {
  "kimi-k2.6": { priority: 1, isLegacy: false },
  "kimi-k2.5": { priority: 2, isLegacy: false },
  "kimi-k2": { priority: 99, isLegacy: true },
  "kimi-k2-thinking": { priority: 99, isLegacy: true, notRecommendedForAgent: true },
};

/**
 * 判断是否为 Kimi 系列提供商
 */
export function isKimiProviderType(type: string): boolean {
  return type === "kimi" || type === "kimi-api" || type === "kimi-coding";
}

const PROVIDER_DISCOVERY_NAMES: Record<string, string> = {
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

export async function discoverOpenAICompatibleModelsForProvider(
  provider: KbChatProviderConfig
): Promise<DiscoverModelsResult> {
  const providerName = PROVIDER_DISCOVERY_NAMES[provider.type] || provider.type;

  if (["openai-compatible"].includes(provider.type) && !provider.baseUrl?.trim()) {
    return { success: false, models: [], message: `${providerName} 需要先填写 Base URL` };
  }

  const baseURL = resolveOpenAICompatibleBaseUrlForProvider(provider);
  if (!baseURL) {
    return { success: false, models: [], message: `${providerName} Base URL 解析失败，请检查配置` };
  }

  const url = joinUrl(baseURL, "models");

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      headers: buildBearerHeaders(provider.apiKey),
    });
  } catch {
    return { success: false, models: [], message: `网络请求失败，请检查 ${providerName} 的 Base URL 和网络` };
  }

  if (!res.ok) {
    const status = res.status;
    if (status === 401 || status === 403) {
      return { success: false, models: [], message: `API Key 无效或无权限 (${status})，请检查 Key 是否正确` };
    }
    if (status === 404) {
      return { success: false, models: [], message: "该接口不支持自动刷新，请手动填写模型 ID" };
    }
    return { success: false, models: [], message: `获取模型列表失败 (${status})，请检查 ${providerName} 的配置和网络` };
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { success: false, models: [], message: "响应格式异常，无法解析模型列表" };
  }

  const raw = data.data || [];
  const rawCount = raw.length;

  if (rawCount === 0) {
    return { success: false, models: [], message: "该接口返回空模型列表，请手动填写模型 ID" };
  }

  const chatModels: DiscoveredModel[] = raw
    .filter((m: { id: string }) => isLikelyChatModelId(provider.type, m.id))
    .map((m: { id: string }) => {
      if (isKimiProviderType(provider.type)) {
        const priorityInfo = KIMI_MODEL_PRIORITY[m.id] ?? { priority: 50, isLegacy: false };
        return {
          id: m.id,
          priority: priorityInfo.priority,
          isLegacy: priorityInfo.isLegacy,
          notRecommendedForAgent: priorityInfo.notRecommendedForAgent,
        };
      }
      return { id: m.id };
    });

  if (isKimiProviderType(provider.type)) {
    chatModels.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }

  const { success, message } = buildChatFilterMessage(rawCount, chatModels.length);

  let finalMessage = message;
  if (isKimiProviderType(provider.type)) {
    const legacyModels = chatModels.filter((m) => m.isLegacy);
    if (legacyModels.length > 0) {
      finalMessage += `；${legacyModels.length} 个旧版模型标记为 legacy，请优先使用 kimi-k2.6/kimi-k2.5`;
    }
  }

  return { success, models: chatModels, message: finalMessage };
}

export async function discoverProviderModels(provider: KbChatProviderConfig): Promise<DiscoverModelsResult> {
  switch (provider.type) {
    case "kimi":
    case "kimi-api":
    case "kimi-coding":
    case "mimo":
    case "mimo-api":
    case "mimo-coding-plan":
    case "deepseek":
    case "deepseek-api":
    case "openai-compatible":
      return discoverOpenAICompatibleModelsForProvider(provider);
    default:
      return { success: false, models: [], message: "该服务商暂不支持自动刷新模型列表，请手动填写模型 ID" };
  }
}
