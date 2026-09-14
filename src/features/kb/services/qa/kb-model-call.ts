/**
 * KB Model Call — 唯一模型调用接口
 *
 * 职责：
 * - 项目内普通文本模型调用的统一入口
 * - 提供两个对外方法：callModelText / streamModelText
 * - thinkingMode 到请求体参数的转换只在此模块内发生：
 *   - 根据 profile.providerNativeAgentCompatibility 的 thinkingOffStrategy/thinkingOnStrategy 决定
 *   - thinkingMode=off 时绝不发送任何启用思考的参数
 *
 * 普通文本调用只能调用本模块的方法，
 * 不得直接拼接 thinking / providerOptions / extraBody / response_format。
 */

import type { ChatModelSelection } from "../../types/chat-model-selection";
import type { ProviderNativeAgentCompatibility } from "../../types/settings";
import type { ThinkingMode } from "../../types/session";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";
import { getKbSettings } from "../settings/kb-settings-service";
import { resolveProviderProfile } from "./provider-profile";
import {
  buildOpenAICompatibleTextRequestPlan,
  resolveOpenAICompatibleAiSdkProviderName,
  type OpenAICompatibleRequestBodyExtras,
} from "./openai-compatible-request-config";

// 内部 llm-client 函数 — 外部不得直接导入
import {
  callLlm as _callLlm,
  streamLlm as _streamLlm,
  type LlmCallOptions,
} from "./llm-client";

// 从 model-provider-factory 直接创建 selected model
import { createSelectedChatModel, type SelectedChatModelInfo } from "./model-provider-factory";

// ═══════════════════════════════════════════════════════════════════
// 公开类型
// ═══════════════════════════════════════════════════════════════════

export type { ThinkingMode } from "../../types/session";

export interface ModelCallCommonOptions {
  /** 本轮对话使用的模型选择（优先于 settings 中的默认模型） */
  chatModelSelection?: ChatModelSelection | null;
  /** 用于中断请求的 AbortSignal */
  abortSignal?: AbortSignal;
  /** 最大输出 token 数 */
  maxOutputTokens?: number;
  /** 温度 */
  temperature?: number;
}

export interface CallModelTextOptions extends ModelCallCommonOptions {
  purpose?: "homepage_status" | "daily_quote" | "selection_ai" | "generic" | "compose";
}

export interface StreamModelTextCallbacks {
  onChunk: (event: { chunk: string; fullContent: string }) => void;
  onFinish?: (fullContent: string) => void | Promise<void>;
  onError?: (error: Error) => void;
  onStreamStatus?: (event: {
    type: "reasoning-start" | "reasoning-delta" | "reasoning-end" | "text-start" | "text-delta" | "finish" | "error";
    delta?: string;
    fullContent?: string;
  }) => void;
}

export interface StreamModelTextOptions extends ModelCallCommonOptions {
  purpose?: "homepage_status" | "daily_quote" | "selection_ai" | "generic" | "compose";
}

// ═══════════════════════════════════════════════════════════════════
// 内部：ModelCallConfig — thinkingMode + 输出预算 唯一转换点
// ═══════════════════════════════════════════════════════════════════

const THINKING_MIN_OUTPUT_TOKENS = 4096;

export interface BuildModelCallConfigInput {
  thinkingMode: ThinkingMode;
  agentThinkingEnabled: boolean;
  requestedMaxOutputTokens: number;
  purpose: string;
  mode: "json" | "text" | "stream";
  /** resolved selected model — provider type + native Agent compatibility extracted from it */
  selectedModel?: SelectedChatModelInfo;
}

export interface BuildModelCallConfigOutput {
  providerOptions: Record<string, Record<string, unknown>> | undefined;
  rawBodyExtras: OpenAICompatibleRequestBodyExtras | undefined;
  maxOutputTokens: number | undefined;
  actualOutputParameter: "max_tokens" | "max_completion_tokens";
  effectiveMaxOutputTokens: number;
  debug: {
    inputThinkingMode: ThinkingMode;
    effectiveThinkingMode: ThinkingMode;
    agentThinkingEnabled: boolean;
    purpose: string;
    mode: "json" | "text" | "stream";
    hasThinkingParam: boolean;
    thinkingParamType: "enabled" | "disabled" | null;
    hasThinkingEnableParam: boolean;
    hasThinkingDisableParam: boolean;
    thinkingType: unknown;
    requestedMaxOutputTokens: number;
    effectiveMaxOutputTokens: number;
    adjustedForThinking: boolean;
    providerType: string;
    aiSdkProviderName: string;
    thinkingParamStrategy: string;
    tokenParamStrategy: "max_tokens" | "max_completion_tokens";
    actualOutputParameter: "max_tokens" | "max_completion_tokens";
  };
}

/**
 * 项目内唯一处理 thinkingMode → 请求体参数 + 输出预算的地方。
 *
 * 有效思考模式计算规则（仅属于模型调用配置层，非业务流程控制）：
 * - 输入框 thinkingMode 是本轮总开关；thinkingMode="off" 时 effectiveThinkingMode 永远为 "off"
 * - thinkingMode="on" 时 effectiveThinkingMode = "on"
 *   - true → effectiveThinkingMode = "on"
 *   - false → effectiveThinkingMode = "off"
 * agentThinkingEnabled 只影响 native Agent 主请求；普通文本调用在 thinkingMode=on 时直接请求思考。
 *
 * thinking 参数策略由 profile.providerNativeAgentCompatibility 决定：
 * - off + omit：不传任何思考参数
 * - off + openai_thinking_disabled：{ thinking: { type: "disabled" } }
 * - off + enable_thinking_false：{ enable_thinking: false }
 * - on + omit：不传任何思考参数
 * - on + openai_thinking_enabled：{ thinking: { type: "enabled" } }
 * - on + enable_thinking_true：{ enable_thinking: true }
 *
 * off 时绝不发送 enabled / reasoning_effort。
 */
export function buildModelCallConfig(input: BuildModelCallConfigInput): BuildModelCallConfigOutput {
  const { thinkingMode, agentThinkingEnabled, requestedMaxOutputTokens, purpose, mode, selectedModel } = input;

  const providerType = selectedModel?.providerConfig?.type ?? "openai-compatible";
  const providerCompatibility = selectedModel?.providerConfig?.providerNativeAgentCompatibility;
  const modelCompatibility = selectedModel?.modelConfig?.providerNativeAgentCompatibility;

  const effectiveThinkingMode: ThinkingMode =
    thinkingMode === "off"
      ? "off"
      : "on";

  // 获取 provider profile，合并 native Agent compatibility
  let resolvedProviderType: string = providerType ?? "openai-compatible";
  let providerCompatibilityMerged: ProviderNativeAgentCompatibility | undefined;
  try {
    const profile = resolveProviderProfile(resolvedProviderType, {
      providerNativeAgentCompatibility: providerCompatibility,
      modelNativeAgentCompatibility: modelCompatibility,
    });
    resolvedProviderType = profile.providerType;
    providerCompatibilityMerged = profile.providerNativeAgentCompatibility;
  } catch {
    // profile 解析失败，使用默认值
  }

  let effectiveMaxOutputTokens = requestedMaxOutputTokens;
  let adjustedForThinking = false;
  if (effectiveThinkingMode === "on" && requestedMaxOutputTokens < THINKING_MIN_OUTPUT_TOKENS) {
    effectiveMaxOutputTokens = THINKING_MIN_OUTPUT_TOKENS;
    adjustedForThinking = true;
  }

  const aiSdkProviderName = selectedModel?.aiSdkProviderName
    ?? resolveOpenAICompatibleAiSdkProviderName(providerType);
  const requestPlan = buildOpenAICompatibleTextRequestPlan({
    aiSdkProviderName,
    thinkingMode: effectiveThinkingMode,
    compatibility: providerCompatibilityMerged,
    maxOutputTokens: effectiveMaxOutputTokens,
  });
  const rawBodyExtras = requestPlan.bodyExtras;
  const thinkingOptions = rawBodyExtras?.thinking as Record<string, unknown> | undefined;
  const thinkingType = thinkingOptions?.type ?? null;
  const hasThinkingParam = thinkingOptions !== undefined;
  const hasThinkingEnableParam = rawBodyExtras?.enable_thinking === true;
  const hasThinkingDisableParam = rawBodyExtras?.enable_thinking === false;
  const thinkingParamStrategy = effectiveThinkingMode === "on"
    ? providerCompatibilityMerged?.thinkingOnStrategy ?? "omit"
    : providerCompatibilityMerged?.thinkingOffStrategy ?? "omit";

  return {
    providerOptions: requestPlan.providerOptions,
    rawBodyExtras,
    maxOutputTokens: requestPlan.maxOutputTokens,
    actualOutputParameter: requestPlan.actualOutputParameter,
    effectiveMaxOutputTokens,
    debug: {
      inputThinkingMode: thinkingMode,
      effectiveThinkingMode,
      agentThinkingEnabled,
      purpose,
      mode,
      hasThinkingParam,
      thinkingParamType: thinkingType as "enabled" | "disabled" | null,
      hasThinkingEnableParam,
      hasThinkingDisableParam,
      thinkingType,
      requestedMaxOutputTokens,
      effectiveMaxOutputTokens,
      adjustedForThinking,
      providerType: resolvedProviderType,
      aiSdkProviderName,
      thinkingParamStrategy,
      tokenParamStrategy: requestPlan.actualOutputParameter,
      actualOutputParameter: requestPlan.actualOutputParameter,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 公开方法：callModelText — 普通文本调用
// ═══════════════════════════════════════════════════════════════════

/**
 * 调用模型获取纯文本输出。
 */
export async function callModelText(
  prompt: string,
  thinkingMode: ThinkingMode,
  options: CallModelTextOptions = {},
): Promise<string> {
  const kbSettings = await getKbSettings();

  const selectedModel = createSelectedChatModel(kbSettings, options.chatModelSelection);

  const config = buildModelCallConfig({
    thinkingMode,
    agentThinkingEnabled: kbSettings.agentThinkingEnabled,
    requestedMaxOutputTokens: options.maxOutputTokens ?? 2048,
    purpose: options.purpose ?? "generic",
    mode: "text",
    selectedModel,
  });

  pushAgentDebugEvent("MODEL_REQUEST_FEATURES_SAFE", config.debug, "info");

  const llmOptions: LlmCallOptions = {
    abortSignal: options.abortSignal,
    purpose: options.purpose ?? "generic",
    maxOutputTokens: config.maxOutputTokens,
    temperature: options.temperature,
    chatModelSelection: options.chatModelSelection,
    providerOptions: config.providerOptions,
    selectedChatModel: selectedModel,
  };

  const response = await _callLlm(prompt, llmOptions);
  return response.content;
}

// ═══════════════════════════════════════════════════════════════════
// 公开方法 3：streamModelText — 流式文本输出（Composer）
// ═══════════════════════════════════════════════════════════════════

/**
 * 流式调用模型获取文本输出。
 * Composer 使用此方法生成最终回答。
 *
 * thinkingMode="on" 且模型返回 reasoning 时，通过 callbacks.onStreamStatus
 * 传递 reasoning 事件供 Composer 展示/保存。
 * thinkingMode="off" 时，如果模型意外返回 reasoning，在接口层过滤，
 * 不转发给外部调用者，只记录安全 debug。
 */
export async function streamModelText(
  prompt: string,
  thinkingMode: ThinkingMode,
  callbacks: StreamModelTextCallbacks,
  options: StreamModelTextOptions = {},
): Promise<void> {
  const kbSettings = await getKbSettings();

  const selectedModel = createSelectedChatModel(kbSettings, options.chatModelSelection);

  const config = buildModelCallConfig({
    thinkingMode,
    agentThinkingEnabled: kbSettings.agentThinkingEnabled,
    requestedMaxOutputTokens: options.maxOutputTokens ?? 4096,
    purpose: options.purpose ?? "compose",
    mode: "stream",
    selectedModel,
  });

  pushAgentDebugEvent("MODEL_REQUEST_FEATURES_SAFE", config.debug, "info");

  const effectiveThinkingMode = config.debug.effectiveThinkingMode;

  // 聚合统计被丢弃的 reasoning 事件（thinkingMode=off 时）
  let discardedReasoningEventCount = 0;
  let discardedReasoningDeltaCount = 0;
  let discardedReasoningChars = 0;

  function flushDiscardedReasoningDebug() {
    if (discardedReasoningEventCount > 0) {
      pushAgentDebugEvent("MODEL_REASONING_EVENTS_DISCARDED_SAFE", {
        discardedReasoningEventCount,
        discardedReasoningDeltaCount,
        discardedReasoningChars,
        hasDiscardedReasoning: true,
        purpose: config.debug.purpose,
        mode: config.debug.mode,
      }, "info");
      discardedReasoningEventCount = 0;
      discardedReasoningDeltaCount = 0;
      discardedReasoningChars = 0;
    }
  }

  // 包装 onStreamStatus：thinkingMode=off 时过滤 reasoning 事件
  const wrappedCallbacks: StreamModelTextCallbacks = {
    onChunk: callbacks.onChunk,
    onFinish: (content) => {
      flushDiscardedReasoningDebug();
      callbacks.onFinish?.(content);
    },
    onError: (error) => {
      flushDiscardedReasoningDebug();
      callbacks.onError?.(error);
    },
    onStreamStatus: (event) => {
      const isReasoningEvent =
        event.type === "reasoning-start" ||
        event.type === "reasoning-delta" ||
        event.type === "reasoning-end";

      if (isReasoningEvent && effectiveThinkingMode === "off") {
        discardedReasoningEventCount++;
        if (event.type === "reasoning-delta") {
          discardedReasoningDeltaCount++;
          discardedReasoningChars += event.delta?.length ?? 0;
        }
        if (event.type === "reasoning-end") {
          flushDiscardedReasoningDebug();
        }
        return;
      }

      callbacks.onStreamStatus?.(event);
    },
  };

  const llmOptions: LlmCallOptions = {
    abortSignal: options.abortSignal,
    purpose: options.purpose ?? "compose",
    maxOutputTokens: config.maxOutputTokens,
    temperature: options.temperature,
    chatModelSelection: options.chatModelSelection,
    providerOptions: config.providerOptions,
    selectedChatModel: selectedModel,
  };

  await _streamLlm(prompt, wrappedCallbacks, llmOptions, options.abortSignal);
}
