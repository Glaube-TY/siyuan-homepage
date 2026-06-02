/**
 * 模型连接测试服务
 * 测试 provider/model 配置是否可正常连接
 */

import { generateText } from "ai";
import { createChatModelFromProvider, normalizeText } from "./model-provider-factory";
import type { KbChatProviderConfig, KbChatModelConfig } from "../../types/settings";

/**
 * 测试结果
 */
export interface ModelConnectionTestResult {
  /** 是否成功 */
  success: boolean;
  /** 结果消息 */
  message: string;
  /** 耗时（毫秒） */
  elapsedMs?: number;
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
  if (["kimi", "kimi-api", "kimi-coding", "mimo", "mimo-api", "mimo-coding-plan", "deepseek", "deepseek-api", "openai-compatible"].includes(provider.type)) {
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
  const startTime = Date.now();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 20000);

  try {
    const model = createChatModelFromProvider(provider, modelConfig);

    const result = await generateText({
      model,
      prompt: "请只回复 OK",
      maxOutputTokens: 16,
      temperature: 0,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startTime;

    if (result.text && result.text.trim()) {
      return {
        success: true,
        message: `连接成功，模型返回正常，用时 ${elapsedMs} ms。`,
        elapsedMs,
      };
    } else {
      return {
        success: false,
        message: "连接成功但返回内容为空，请检查模型配置",
        elapsedMs,
      };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startTime;

    if (error?.name === "AbortError" || abortController.signal.aborted) {
      return {
        success: false,
        message: "连接超时（20秒），请检查网络或模型服务是否可用",
        elapsedMs,
      };
    }

    let errorMessage = error?.message || String(error);

    const apiKey = normalizeText(provider.apiKey);
    if (apiKey) {
      errorMessage = errorMessage.split(apiKey).join("***");
    }

    const apiKeyPattern = /[a-zA-Z0-9_-]{20,}/g;
    errorMessage = errorMessage.replace(apiKeyPattern, "***");

    return {
      success: false,
      message: `连接失败：${errorMessage}`,
      elapsedMs,
    };
  }
}
