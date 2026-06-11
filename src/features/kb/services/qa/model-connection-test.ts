/**
 * 模型连接测试服务
 * 测试 provider/model 配置是否可正常连接
 */

import { generateText } from "ai";
import { createChatModelFromProvider, normalizeText, resolveOpenAICompatibleBaseUrlForProvider } from "./model-provider-factory";
import { resolveProviderProfile, resolveModelTemperatureForRequest } from "./provider-profile";
import { buildOpenAICompatibleRawJsonRequestBody } from "./openai-compatible-request-body";
import { streamOpenAICompatibleJsonPlanner, type StreamJsonPlannerResultFailure } from "./openai-compatible-stream-json";
import type { KbChatProviderConfig, KbChatModelConfig, ControlPlaneCompatibility } from "../../types/settings";

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

/**
 * 自动操作兼容性测试结果
 */
export interface ControlPlaneCompatibilityTestResult {
  /** 测试状态 */
  status: "success" | "timeout" | "reasoning_only" | "invalid_json" | "error";
  /** 结果消息（用户可见，人话） */
  message: string;
  /** 耗时（毫秒） */
  elapsedMs: number;
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

  // 使用与 Planner 相同的 token 参数策略
  let tokenParamStrategy: "max_tokens" | "max_completion_tokens" = "max_tokens";
  let mergedCp: ControlPlaneCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(provider.type, {
      providerControlPlaneCompatibility: provider.controlPlaneCompatibility,
      modelControlPlaneCompatibility: modelConfig.controlPlaneCompatibility,
    });
    tokenParamStrategy = profile.controlPlaneCompatibility?.tokenParamStrategy ?? "max_tokens";
    mergedCp = profile.controlPlaneCompatibility;
  } catch {
    // profile 解析失败，使用默认
  }

  const resolvedTemperature = resolveModelTemperatureForRequest({
    providerType: provider.type,
    modelId,
    modelConfigTemperature: modelConfig.temperature,
    controlPlaneCompatibility: mergedCp,
    fallbackTemperature: 0,
  });

  const body: Record<string, unknown> = {
    model: modelId,
    messages: [
      { role: "system" as const, content: "你是连接测试助手。请只输出 OK 两个字母，不要解释。" },
      { role: "user" as const, content: "OK" },
    ],
    stream: false,
  };
  if (resolvedTemperature !== undefined) {
    body.temperature = resolvedTemperature;
  }
  if (tokenParamStrategy === "max_completion_tokens") {
    body.max_completion_tokens = 128;
  } else {
    body.max_tokens = 128;
  }

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
      const sanitizedError = sanitizeErrorMessage(errorText, apiKey);
      // Kimi 特殊错误提示人话
      if (provider.type === "kimi" || provider.type === "kimi-api" || provider.type === "kimi-coding") {
        const isKimiDefaultBase = baseUrl.startsWith("https://api.moonshot.cn/v1");
        const baseUrlNote = isKimiDefaultBase ? "" : " 当前服务地址不是默认地址，请确认是否为你自己设置的地址。";
        if (response.status === 401) {
          return {
            success: false,
            severity: "error",
            message: `连接失败：当前 API Key 未通过 Kimi 模型调用鉴权。请确认使用的是 Kimi 开放平台 API Key，并确认当前模型有调用权限。${baseUrlNote}`.trim(),
            elapsedMs,
          };
        }
        if (response.status === 403) {
          return {
            success: false,
            severity: "error",
            message: `连接失败：当前 API Key 没有调用该模型的权限，请在 Kimi 开放平台检查模型权限，或换用有权限的模型。${baseUrlNote}`.trim(),
            elapsedMs,
          };
        }
        if (sanitizedError.toLowerCase().includes("temperature")) {
          return {
            success: false,
            severity: "error",
            message: `连接失败：当前模型不接受这个温度参数。已按模型推荐参数修正后可重试。${baseUrlNote}`.trim(),
            elapsedMs,
          };
        }
        return {
          success: false,
          severity: "error",
          message: `连接失败：接口返回错误，请检查模型配置或稍后重试。${baseUrlNote}`.trim(),
          elapsedMs,
        };
      }
      let message: string;
      if (response.status === 401) {
        message = "API Key 鉴权失败。";
      } else if (response.status === 403) {
        message = "没有模型权限。";
      } else if (response.status === 429) {
        message = "请求过于频繁或额度受限。";
      } else if (response.status >= 500) {
        message = "服务商暂时无法完成请求。";
      } else {
        message = "连接失败，请检查模型配置或稍后重试。";
      }
      return {
        success: false,
        severity: "error",
        message,
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
          message: `连接成功，但本次轻量测试未返回正文；模型未返回正文内容。`,
          elapsedMs,
        };
      }
      return {
        success: true,
        severity: "warning",
        message: `连接成功，但本次轻量测试未返回正文。服务地址、鉴权和模型 ID 可用，若正常对话可用可暂时忽略。`,
        elapsedMs,
      };
    }

    return {
      success: false,
      severity: "error",
      message: "接口响应格式不符合要求，请检查服务地址或服务商兼容性。",
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

  try {
    const model = createChatModelFromProvider(provider, modelConfig);

    // 解析合并后的 provider profile 获取 controlPlaneCompatibility
    let mergedCp: ControlPlaneCompatibility | undefined;
    try {
      const p = resolveProviderProfile(provider.type, {
        providerControlPlaneCompatibility: provider.controlPlaneCompatibility,
        modelControlPlaneCompatibility: modelConfig.controlPlaneCompatibility,
      });
      mergedCp = p.controlPlaneCompatibility;
    } catch { /* use undefined */ }

    const resolvedTemperature = resolveModelTemperatureForRequest({
      providerType: provider.type,
      modelId: modelConfig.id,
      modelConfigTemperature: modelConfig.temperature,
      controlPlaneCompatibility: mergedCp,
      fallbackTemperature: 0,
    });

    const generateOptions: Parameters<typeof generateText>[0] = {
      model,
      prompt: "你是连接测试助手。请只输出 OK 两个字母，不要解释。",
      maxOutputTokens: 128,
      abortSignal: signal,
    };
    if (resolvedTemperature !== undefined) {
      generateOptions.temperature = resolvedTemperature;
    }
    const result = await generateText(generateOptions);

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
          message: `连接成功，但本次轻量测试未返回正文；模型未返回正文内容。`,
          elapsedMs,
        };
      }
      return {
        success: true,
        severity: "warning",
        message: `连接成功，但本次轻量测试未返回正文。服务地址、鉴权和模型 ID 可用，若正常对话可用可暂时忽略。`,
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

    return {
      success: false,
      severity: "error",
      message: "连接失败：未能完成连接测试，请检查模型配置或稍后重试。",
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

  if (["openai-compatible"].includes(provider.type)) {
    const baseUrl = normalizeText(provider.baseUrl);
    if (!baseUrl) {
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

/**
 * 测试自动操作兼容性（控制面 JSON 能力）
 *
 * 用极小 Planner JSON 测试模型是否能：
 * 1. 在超时内返回 content
 * 2. 返回可解析的 JSON
 * 3. 不返回 reasoning-only
 *
 * 不后台重试，不从思考内容提取 JSON。
 */
export async function testControlPlaneCompatibility(
  provider: KbChatProviderConfig,
  modelConfig: KbChatModelConfig
): Promise<ControlPlaneCompatibilityTestResult> {
  const startTimeOuter = Date.now();
  try {
    const modelId = normalizeText(modelConfig.id);
    if (!modelId) {
      return { status: "error", message: "模型 ID 不能为空", elapsedMs: 0 };
    }

    const baseUrl = resolveOpenAICompatibleBaseUrlForProvider(provider);
    if (!baseUrl) {
      return { status: "error", message: "Base URL 未配置", elapsedMs: 0 };
    }

    let endpoint = baseUrl;
    if (!endpoint.endsWith("/chat/completions")) {
      if (endpoint.endsWith("/v1")) {
        endpoint = endpoint + "/chat/completions";
      } else {
        endpoint = endpoint + "/v1/chat/completions";
      }
    }

    const apiKey = normalizeText(provider.apiKey);

    // 使用与 Planner raw JSON 相同的 profile 合并逻辑
    let profileTimeoutMs = 30000;
    let jsonOutputStrategy: "raw_prompt" | "response_format_json_object" = "raw_prompt";
    let thinkingOffStrategy: "omit" | "openai_thinking_disabled" | "enable_thinking_false" = "omit";
    let tokenParamStrategy: "max_tokens" | "max_completion_tokens" = "max_tokens";
    let plannerTransport: "non_stream_json" | "stream_json" = "non_stream_json";
    let mergedCp: ControlPlaneCompatibility | undefined;
    try {
      const profile = resolveProviderProfile(provider.type, {
        providerControlPlaneCompatibility: provider.controlPlaneCompatibility,
        modelControlPlaneCompatibility: modelConfig.controlPlaneCompatibility,
      });
      profileTimeoutMs = Math.max(30000, Math.min(300000, profile.controlPlaneTimeoutMs ?? 30000));
      jsonOutputStrategy = profile.controlPlaneCompatibility?.jsonOutputStrategy ?? "raw_prompt";
      thinkingOffStrategy = profile.controlPlaneCompatibility?.thinkingOffStrategy ?? "omit";
      tokenParamStrategy = profile.controlPlaneCompatibility?.tokenParamStrategy ?? "max_tokens";
      plannerTransport = (profile.plannerTransport
        ?? modelConfig.controlPlaneCompatibility?.plannerTransport
        ?? provider.controlPlaneCompatibility?.plannerTransport
        ?? "non_stream_json") as "non_stream_json" | "stream_json";
      mergedCp = profile.controlPlaneCompatibility;
    } catch {
      // profile 解析失败，使用默认
    }

    // 构造 thinking 参数
    let thinkingParams: { thinking?: { type: "enabled" | "disabled" }; enableThinking?: boolean } | undefined;
    if (thinkingOffStrategy === "openai_thinking_disabled") {
      thinkingParams = { thinking: { type: "disabled" } };
    } else if (thinkingOffStrategy === "enable_thinking_false") {
      thinkingParams = { enableThinking: false };
    }

    // 使用统一的 builder 构造请求体（与 Planner raw JSON 完全一致）
    const resolvedTemperature = resolveModelTemperatureForRequest({
      providerType: provider.type,
      modelId,
      modelConfigTemperature: modelConfig.temperature,
      controlPlaneCompatibility: mergedCp,
      fallbackTemperature: 0,
    });

    const body = buildOpenAICompatibleRawJsonRequestBody({
      modelId,
      messages: [
        { role: "system", content: "你是控制面 JSON 输出器，只能输出一个合法 JSON object；第一个字符必须是 {，最后一个字符必须是 }；禁止 Markdown、解释、思考过程、自然语言前后缀。" },
        { role: "user", content: `你是控制面 JSON 输出器，只能输出一个合法 JSON object。请返回以下格式：{"type":"answer","args":{"body":"ok","references":[]}} 第一个字符必须是 {，最后一个字符必须是 }。禁止 Markdown、解释、思考过程、自然语言前后缀。` },
      ],
      maxTokens: 256,
      temperature: resolvedTemperature,
      jsonOutputStrategy,
      thinkingParams,
      tokenParamStrategy,
    });

    // 流式模式：使用 SSE 流式接收
    if (plannerTransport === "stream_json") {
      let endpoint = baseUrl;
      if (!endpoint.endsWith("/chat/completions")) {
        if (endpoint.endsWith("/v1")) {
          endpoint = endpoint + "/chat/completions";
        } else {
          endpoint = endpoint + "/v1/chat/completions";
        }
      }

      const streamTimeoutMs = Math.max(30000, Math.min(300000, profileTimeoutMs));
      const startTime = Date.now();

      const result = await streamOpenAICompatibleJsonPlanner({
        endpoint,
        apiKey: apiKey || undefined,
        body,
        idleTimeoutMs: streamTimeoutMs,
      });

      const elapsedMs = Date.now() - startTime;

      if (!result.success) {
        const failResult = result as StreamJsonPlannerResultFailure;
        if (failResult.errorCode === "stream_idle_timeout") {
          return { status: "timeout", message: "模型没有在设定时间内返回可继续执行的内容。", elapsedMs };
        }
        if (failResult.errorCode === "user_aborted") {
          return { status: "error", message: "测试已取消。", elapsedMs };
        }
        if (failResult.errorCode === "reasoning_only_control_plane") {
          return { status: "reasoning_only", message: "模型没有返回可执行内容。", elapsedMs };
        }
        if (failResult.errorCode === "empty_content") {
          return { status: "error", message: "模型没有返回可执行内容。", elapsedMs };
        }
        if (failResult.errorCode === "invalid_json" || failResult.errorCode === "json_parse_failed") {
          return { status: "invalid_json", message: "模型输出格式不符合自动操作要求。", elapsedMs };
        }
        if (failResult.errorCode === "native_tool_calls_not_supported_here") {
          return { status: "error", message: "该模型返回了当前模式不支持的内容，可尝试换用更稳定的普通对话模型。", elapsedMs };
        }
        return { status: "error", message: "测试失败：未能完成自动操作测试，请稍后重试或检查模型配置。", elapsedMs };
      }

      // Parse JSON strictly
      const cleaned = result.content.trim();
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object" && "type" in parsed) {
          return { status: "success", message: "该模型可以用于自动操作。", elapsedMs };
        }
        return { status: "invalid_json", message: "模型输出格式不符合自动操作要求。", elapsedMs };
      } catch {
        return { status: "invalid_json", message: "模型输出格式不符合自动操作要求。", elapsedMs };
      }
    }

    // 非流式模式：现有路径
    // 超时时间：使用合并后的 profile.controlPlaneTimeoutMs
    const timeoutMs = Math.max(30000, Math.min(300000, profileTimeoutMs));

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    const startTime = Date.now();

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      const elapsedMs = Date.now() - startTime;

      if (!response.ok) {
        const status = response.status;
        let httpMessage: string;
        if (status === 401) httpMessage = "连接失败：当前 API Key 未通过鉴权。";
        else if (status === 403) httpMessage = "连接失败：当前 API Key 没有调用该模型的权限。";
        else if (status === 429) httpMessage = "请求过于频繁或额度受限，请稍后重试。";
        else if (status >= 500) httpMessage = "服务商暂时无法完成请求，请稍后重试。";
        else httpMessage = "测试失败：未能完成自动操作测试，请稍后重试或检查模型配置。";
        return { status: "error", message: httpMessage, elapsedMs };
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return { status: "error", message: "接口响应格式不符合要求，请检查服务地址或服务商兼容性。", elapsedMs };
      }

      const d = data as Record<string, unknown>;
      const choices = d?.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        return { status: "error", message: "接口响应格式不符合要求，请检查服务地址或服务商兼容性。", elapsedMs };
      }

      const msg = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
      if (!msg) {
        return { status: "error", message: "接口响应格式不符合要求，请检查服务地址或服务商兼容性。", elapsedMs };
      }

      const content = typeof msg.content === "string" ? msg.content : "";

      // 检查是否有 reasoning 但没有 content
      let reasoningChars = 0;
      for (const key of ["reasoning_content", "reasoning", "thinking"]) {
        const val = msg[key];
        if (typeof val === "string" && val.length > 0) {
          reasoningChars += val.length;
        }
      }

      if (!content || content.trim().length === 0) {
        if (reasoningChars > 0) {
          return { status: "reasoning_only", message: "模型没有返回可执行内容。", elapsedMs };
        }
        return { status: "error", message: "模型没有返回可执行内容。", elapsedMs };
      }

      // 尝试解析 JSON（自动操作测试必须严格：不从正文中正则提取 JSON）
      const cleaned = content.trim();
      try {
        const parsed = JSON.parse(cleaned);
        // 验证基本结构
        if (parsed && typeof parsed === "object" && "type" in parsed) {
          return { status: "success", message: "该模型可以用于自动操作。", elapsedMs };
        }
        return { status: "invalid_json", message: "模型输出格式不符合自动操作要求。", elapsedMs };
      } catch {
        return { status: "invalid_json", message: "模型输出格式不符合自动操作要求。", elapsedMs };
      }
    } catch (error: any) {
      const elapsedMs = Date.now() - startTime;
      if (error?.name === "AbortError" || abortController.signal.aborted) {
        return { status: "timeout", message: "模型没有在设定时间内返回可执行内容。", elapsedMs };
      }
      return { status: "error", message: "测试失败：未能完成自动操作测试，请稍后重试或检查模型配置。", elapsedMs };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: any) {
    // Debug log only — no raw internal details exposed to user
    console.warn("[testControlPlaneCompatibility] unhandled error", {
      providerType: provider.type,
      modelId: modelConfig.id,
      errorName: error?.name,
    });
    return {
      status: "error",
      message: "测试失败：未能完成自动操作测试，请稍后重试或检查模型配置。",
      elapsedMs: Date.now() - startTimeOuter,
    };
  }
}
