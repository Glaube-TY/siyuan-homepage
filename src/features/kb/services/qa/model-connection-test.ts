/**
 * 模型连接测试服务
 * 测试 provider/model 配置是否可正常连接
 */

import { generateText } from "ai";
import { createChatModelFromProvider, normalizeText, resolveOpenAICompatibleBaseUrlForProvider } from "./model-provider-factory";
import type { KbChatProviderConfig, KbChatModelConfig } from "../../types/settings";

/**
 * 测试结果
 */
export interface ModelConnectionTestResult {
  /** 是否成功 */
  success: boolean;
  /** 严重级别（UI 展示用） */
  severity?: "success" | "warning" | "error";
  /** 结果消息 */
  message: string;
  /** 耗时（毫秒） */
  elapsedMs?: number;
}

const OPENAI_COMPATIBLE_TYPES = [
  "kimi",
  "kimi-api",
  "kimi-coding",
  "mimo",
  "mimo-api",
  "mimo-coding-plan",
  "deepseek",
  "deepseek-api",
  "openai-compatible",
];

function sanitizeErrorMessage(message: string, apiKey?: string): string {
  let sanitized = message;
  if (apiKey) {
    sanitized = sanitized.split(apiKey).join("***");
  }
  const apiKeyPattern = /[a-zA-Z0-9_-]{20,}/g;
  sanitized = sanitized.replace(apiKeyPattern, "***");
  return sanitized;
}

/**
 * 对 OpenAI-compatible 提供商执行原始 HTTP 测试
 */
async function testOpenAICompatibleRaw(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig,
  signal: AbortSignal
): Promise<ModelConnectionTestResult | null> {
  const modelId = normalizeText(modelConfig.id);
  if (!modelId) {
    return null;
  }

  const baseUrl = resolveOpenAICompatibleBaseUrlForProvider(provider);
  if (!baseUrl) {
    return null;
  }

  const apiKey = normalizeText(provider.apiKey);
  const endpoint = `${baseUrl}/chat/completions`;

  const body = {
    model: modelId,
    messages: [
      { role: "system" as const, content: "你是连接测试助手。请只输出 OK 两个字母，不要解释。" },
      { role: "user" as const, content: "OK" },
    ],
    temperature: 0,
    max_tokens: 128,
    stream: false,
  };

  const startTime = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    const elapsedMs = Date.now() - startTime;

    let responseJson: any;
    try {
      responseJson = await response.json();
    } catch {
      responseJson = null;
    }

    if (!response.ok) {
      const errorText = responseJson?.error?.message || `HTTP ${response.status}`;
      return {
        success: false,
        severity: "error",
        message: `连接失败：${sanitizeErrorMessage(errorText, apiKey)}`,
        elapsedMs,
      };
    }

    const content: string | undefined = responseJson?.choices?.[0]?.message?.content;
    const contentTrimmed = typeof content === "string" ? content.trim() : "";
    const hasChoices = Array.isArray(responseJson?.choices) && responseJson.choices.length > 0;
    const hasUsage = responseJson?.usage != null;
    const finishReason = responseJson?.choices?.[0]?.finish_reason;
    const hasFinishReason = finishReason != null;
    const reasoningContent: string | undefined =
      responseJson?.choices?.[0]?.message?.reasoning_content ||
      responseJson?.choices?.[0]?.message?.reasoning ||
      responseJson?.choices?.[0]?.message?.thinking;
    const reasoningChars = typeof reasoningContent === "string" ? reasoningContent.length : 0;

    if (contentTrimmed) {
      return {
        success: true,
        severity: "success",
        message: `连接成功，模型返回正常，用时 ${elapsedMs} ms。`,
        elapsedMs,
      };
    }

    if (hasChoices || hasUsage || hasFinishReason) {
      if (reasoningChars > 0) {
        return {
          success: true,
          severity: "warning",
          message: `连接成功，但本次轻量测试未返回正文（模型返回了推理内容，约 ${reasoningChars} 字符）；端点、鉴权和模型 ID 可用。`,
          elapsedMs,
        };
      }
      return {
        success: true,
        severity: "warning",
        message: `连接成功，但本次轻量测试未返回正文；端点、鉴权和模型 ID 可用。若正常对话可用，可暂时忽略。`,
        elapsedMs,
      };
    }

    return {
      success: false,
      severity: "error",
      message: "接口响应不是标准 OpenAI-compatible chat/completions 结构，请检查 Base URL 或服务商兼容性。",
      elapsedMs,
    };
  } catch (error: any) {
    if (error?.name === "AbortError" || signal.aborted) {
      return {
        success: false,
        severity: "error",
        message: "连接超时（20秒），请检查网络或模型服务是否可用",
        elapsedMs: Date.now() - startTime,
      };
    }
    // raw fetch 失败时返回 null，让上层 fallback 到 generateText
    return null;
  }
}

/**
 * 使用 AI SDK generateText 作为 fallback 测试
 */
async function testWithGenerateText(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig,
  signal: AbortSignal
): Promise<ModelConnectionTestResult> {
  const startTime = Date.now();
  const apiKey = normalizeText(provider.apiKey);

  try {
    const model = createChatModelFromProvider(provider, modelConfig);

    const result = await generateText({
      model,
      prompt: "你是连接测试助手。请只输出 OK 两个字母，不要解释。",
      maxOutputTokens: 128,
      temperature: 0,
      abortSignal: signal,
    });

    const elapsedMs = Date.now() - startTime;

    const textTrimmed = result.text ? result.text.trim() : "";
    const contentPartCount = result.response?.messages?.reduce((count: number, msg: any) => {
      return count + (msg.parts?.filter((p: any) => p.type === "text" && p.text)?.length || 0);
    }, 0) || 0;
    const reasoningPartCount = result.response?.messages?.reduce((count: number, msg: any) => {
      return count + (msg.parts?.filter((p: any) => p.type === "reasoning" && p.reasoning)?.length || 0);
    }, 0) || 0;
    const finishReason = result.finishReason || "";

    if (textTrimmed) {
      return {
        success: true,
        severity: "success",
        message: `连接成功，模型返回正常，用时 ${elapsedMs} ms。`,
        elapsedMs,
      };
    }

    if (contentPartCount > 0 || reasoningPartCount > 0 || finishReason) {
      if (reasoningPartCount > 0) {
        return {
          success: true,
          severity: "warning",
          message: `连接成功，但本次轻量测试未返回正文（检测到 ${reasoningPartCount} 个 reasoning 片段）；端点、鉴权和模型 ID 可用。`,
          elapsedMs,
        };
      }
      return {
        success: true,
        severity: "warning",
        message: `连接成功，但本次轻量测试未返回正文；端点、鉴权和模型 ID 可用。若正常对话可用，可暂时忽略。`,
        elapsedMs,
      };
    }

    return {
      success: false,
      severity: "error",
      message: "连接成功但返回内容为空，请检查模型配置",
      elapsedMs,
    };
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;

    if (error?.name === "AbortError" || signal.aborted) {
      return {
        success: false,
        severity: "error",
        message: "连接超时（20秒），请检查网络或模型服务是否可用",
        elapsedMs,
      };
    }

    let errorMessage = error?.message || String(error);
    errorMessage = sanitizeErrorMessage(errorMessage, apiKey);

    return {
      success: false,
      severity: "error",
      message: `连接失败：${errorMessage}`,
      elapsedMs,
    };
  }
}

/**
 * 测试模型连接
 * @param provider 提供商配置
 * @param modelConfig 模型配置
 * @returns 测试结果
 */
export async function testChatModelConnection(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig
): Promise<ModelConnectionTestResult> {
  // 检查 provider 是否启用
  if (provider.enabled === false) {
    return {
      success: false,
      message: "该提供商已禁用",
    };
  }

  // 检查 model 是否启用
  if (modelConfig.enabled === false) {
    return {
      success: false,
      message: "该模型已禁用",
    };
  }

  // 检查 model id
  const modelId = normalizeText(modelConfig.id);
  if (!modelId) {
    return {
      success: false,
      message: "模型 ID 不能为空",
    };
  }

  // 所有四个入口都需要 API Key
  if (OPENAI_COMPATIBLE_TYPES.includes(provider.type)) {
    const apiKey = normalizeText(provider.apiKey);
    if (!apiKey) {
      const providerNames: Record<string, string> = {
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
      return {
        success: false,
        message: `${providerNames[provider.type] || provider.type} API Key 不能为空`,
      };
    }
  }

  if (["mimo", "mimo-api", "mimo-coding-plan", "openai-compatible"].includes(provider.type)) {
    const baseUrl = normalizeText(provider.baseUrl);
    if (!baseUrl) {
      const providerNames: Record<string, string> = {
        mimo: "Mimo",
        "mimo-api": "MiMo API",
        "mimo-coding-plan": "MiMo Coding Plan",
        "openai-compatible": "自定义接口",
      };
      return {
        success: false,
        message: `${providerNames[provider.type] || provider.type} Base URL 不能为空，通常应填写到 /v1`,
      };
    }
  }

  // 开始测试
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 20000);

  try {
    // 优先对 OpenAI-compatible 提供商使用 raw fetch 测试
    if (OPENAI_COMPATIBLE_TYPES.includes(provider.type)) {
      const rawResult = await testOpenAICompatibleRaw(provider, modelConfig, abortController.signal);
      if (rawResult != null) {
        return rawResult;
      }
    }

    // fallback 到 AI SDK generateText
    return await testWithGenerateText(provider, modelConfig, abortController.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}
