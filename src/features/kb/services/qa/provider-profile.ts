/**
 * Provider Profile
 *
 * 为不同供应商/入口定义 native Agent 请求策略和兼容性配置。
 * 模型适配差异只放在 provider profile 层，不散落到 Agent loop/Tool/Skill。
 *
 * 职责：
 * - 定义 ProviderProfile 接口
 * - 提供 resolveProviderProfile 函数
 * - 不在 Agent 链路中 hardcode 特定模型名
 * - 所有 provider 差异只放在 provider profile / llm-client
 */

import type { ProviderNativeAgentCompatibility } from "../../types/settings";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";

export type EndpointKind = "api" | "coding_plan" | "openai_compatible" | "unknown";

export type ProviderRequestStrategy = "chat_completions" | "native_messages";

export interface ProviderProfile {
  providerType: string;
  providerFamily: string;
  endpointKind: EndpointKind;
  supportsStructuredOutputs: boolean;
  supportsJsonMode: boolean;
  providerRequestStrategy: ProviderRequestStrategy;
  allowStructuredFallback: boolean;
  providerRequestTimeoutMs: number;
  providerRequestMaxRetries: number;
  composeModeDefault: "auto" | "stream" | "non_stream";
  thinkingControl?: {
    supportsToggle: boolean;
    defaultMode: "enabled" | "disabled" | "unknown";
    disableRequiresExplicitParam: boolean;
  };
  /** 合并后的 native Agent 兼容性配置（provider 默认 + model 覆盖） */
  providerNativeAgentCompatibility?: ProviderNativeAgentCompatibility;
  note?: string;
  warning?: string;
}

interface ProviderProfileDefaults {
  providerFamily: string;
  endpointKind: EndpointKind;
  supportsStructuredOutputs: boolean;
  supportsJsonMode: boolean;
  providerRequestStrategy: ProviderRequestStrategy;
  allowStructuredFallback: boolean;
  providerRequestTimeoutMs: number;
  providerRequestMaxRetries: number;
  composeModeDefault: "auto" | "stream" | "non_stream";
  thinkingControl?: {
    supportsToggle: boolean;
    defaultMode: "enabled" | "disabled" | "unknown";
    disableRequiresExplicitParam: boolean;
  };
  /** provider 级默认的 native Agent 兼容性 */
  providerNativeAgentCompatibility?: ProviderNativeAgentCompatibility;
  note?: string;
  warning?: string;
}

const PROVIDER_PROFILE_DEFAULTS: Record<string, ProviderProfileDefaults> = {
  kimi: {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    providerNativeAgentCompatibility: {
      nativeToolCalls: true,
      streamingToolCalls: true,
      toolResultContinuation: true,
      temperatureParamStrategy: "omit",
    },
    note: "Kimi API supports OpenAI-compatible native tool calls.",
  },
  "kimi-api": {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    providerNativeAgentCompatibility: {
      nativeToolCalls: true,
      streamingToolCalls: true,
      toolResultContinuation: true,
      temperatureParamStrategy: "omit",
    },
    note: "Kimi API supports OpenAI-compatible native tool calls.",
  },
  "kimi-coding": {
    providerFamily: "kimi",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    providerNativeAgentCompatibility: {
      suitability: "not_recommended",
      nativeToolCalls: true,
      temperatureParamStrategy: "omit",
    },
    warning: "Coding Plan 端点更适合代码任务，不推荐用于 Agent 模式。",
  },
  mimo: {
    providerFamily: "mimo",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
  },
  "mimo-api": {
    providerFamily: "mimo",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    providerNativeAgentCompatibility: {
      nativeToolCalls: true,
      streamingToolCalls: true,
      toolResultContinuation: true,
      thinkingOffStrategy: "openai_thinking_disabled",
      thinkingOnStrategy: "openai_thinking_enabled",
      tokenParamStrategy: "max_completion_tokens",
    },
    note: "MiMo API 支持 thinking 参数（OpenAI-compatible 风格）",
  },
  "mimo-coding-plan": {
    providerFamily: "mimo",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    providerNativeAgentCompatibility: {
      suitability: "not_recommended",
      nativeToolCalls: true,
      tokenParamStrategy: "max_completion_tokens",
      thinkingOffStrategy: "openai_thinking_disabled",
    },
    warning: "Coding Plan 端点更适合长计划或代码任务，不推荐用于 Agent 模式。",
  },
  deepseek: {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    thinkingControl: {
      supportsToggle: true,
      defaultMode: "enabled",
      disableRequiresExplicitParam: true,
    },
    providerNativeAgentCompatibility: {
      nativeToolCalls: true,
      streamingToolCalls: true,
      toolResultContinuation: true,
      thinkingOffStrategy: "openai_thinking_disabled",
      thinkingOnStrategy: "openai_thinking_enabled",
    },
    note: "DeepSeek 支持 thinking 开关和 OpenAI-compatible tool calls.",
  },
  "deepseek-api": {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    thinkingControl: {
      supportsToggle: true,
      defaultMode: "enabled",
      disableRequiresExplicitParam: true,
    },
    providerNativeAgentCompatibility: {
      nativeToolCalls: true,
      streamingToolCalls: true,
      toolResultContinuation: true,
      thinkingOffStrategy: "openai_thinking_disabled",
      thinkingOnStrategy: "openai_thinking_enabled",
    },
    note: "DeepSeek API 支持 thinking 开关和 OpenAI-compatible tool calls.",
  },
  "openai-compatible": {
    providerFamily: "custom",
    endpointKind: "openai_compatible",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    providerRequestStrategy: "chat_completions",
    allowStructuredFallback: false,
    providerRequestTimeoutMs: 30000,
    providerRequestMaxRetries: 1,
    composeModeDefault: "auto",
    providerNativeAgentCompatibility: {
      nativeToolCalls: true,
      thinkingOffStrategy: "omit",
      thinkingOnStrategy: "omit",
    },
    warning: "自定义接口能力未知，保守默认",
  },
};

const LEGACY_PROVIDER_MAP: Record<string, string> = {
  mimo: "mimo-api",
  kimi: "kimi-api",
  deepseek: "deepseek-api",
};

/**
 * 合并两个 ProviderNativeAgentCompatibility，model 覆盖 provider。
 */
function mergeProviderNativeAgentCompatibility(
  providerCp?: ProviderNativeAgentCompatibility,
  modelCp?: ProviderNativeAgentCompatibility,
): ProviderNativeAgentCompatibility | undefined {
  if (!providerCp && !modelCp) return undefined;
  return {
    suitability: modelCp?.suitability ?? providerCp?.suitability,
    nativeToolCalls: modelCp?.nativeToolCalls ?? providerCp?.nativeToolCalls,
    streamingToolCalls: modelCp?.streamingToolCalls ?? providerCp?.streamingToolCalls,
    toolResultContinuation: modelCp?.toolResultContinuation ?? providerCp?.toolResultContinuation,
    reasoningDelta: modelCp?.reasoningDelta ?? providerCp?.reasoningDelta,
    thinkingOffStrategy: modelCp?.thinkingOffStrategy ?? providerCp?.thinkingOffStrategy,
    thinkingOnStrategy: modelCp?.thinkingOnStrategy ?? providerCp?.thinkingOnStrategy,
    timeoutMs: modelCp?.timeoutMs ?? providerCp?.timeoutMs,
    tokenParamStrategy: modelCp?.tokenParamStrategy ?? providerCp?.tokenParamStrategy,
    temperatureParamStrategy: modelCp?.temperatureParamStrategy ?? providerCp?.temperatureParamStrategy,
    fixedTemperature: modelCp?.fixedTemperature ?? providerCp?.fixedTemperature,
  };
}

/**
 * 规范化 providerRequestTimeoutMs：最小 30000，最大 300000。
 * 用于清理旧配置中遗留的 8000/10000 等历史默认值。
 */
function normalizeProviderRequestTimeoutMs(value: unknown, defaultMs = 30000): number {
  if (typeof value !== "number" || isNaN(value) || value <= 0) return defaultMs;
  if (value < 30000) return 30000;
  if (value > 300000) return 300000;
  return value;
}

export function resolveProviderProfile(
  providerType: string,
  modelOverrides?: {
    finalComposeMode?: "auto" | "stream" | "non_stream";
    /** provider 级 ProviderNativeAgentCompatibility */
    providerNativeAgentCompatibility?: ProviderNativeAgentCompatibility;
    /** model 级 ProviderNativeAgentCompatibility（覆盖 provider） */
    modelNativeAgentCompatibility?: ProviderNativeAgentCompatibility;
  },
): ProviderProfile {
  const resolvedType = LEGACY_PROVIDER_MAP[providerType] ?? providerType;
  const defaults = PROVIDER_PROFILE_DEFAULTS[resolvedType] ?? PROVIDER_PROFILE_DEFAULTS["openai-compatible"];

  const composeModeDefault = modelOverrides?.finalComposeMode ?? defaults.composeModeDefault;

  // 合并 ProviderNativeAgentCompatibility：内置默认 → provider 配置 → model 配置
  const mergedCp = mergeProviderNativeAgentCompatibility(
    defaults.providerNativeAgentCompatibility,
    mergeProviderNativeAgentCompatibility(
      modelOverrides?.providerNativeAgentCompatibility,
      modelOverrides?.modelNativeAgentCompatibility,
    ),
  );

  const profile: ProviderProfile = {
    providerType: resolvedType,
    providerFamily: defaults.providerFamily,
    endpointKind: defaults.endpointKind,
    supportsStructuredOutputs: defaults.supportsStructuredOutputs,
    supportsJsonMode: defaults.supportsJsonMode,
    providerRequestStrategy: defaults.providerRequestStrategy,
    allowStructuredFallback: defaults.allowStructuredFallback,
    providerRequestTimeoutMs: normalizeProviderRequestTimeoutMs(mergedCp?.timeoutMs, defaults.providerRequestTimeoutMs),
    providerRequestMaxRetries: defaults.providerRequestMaxRetries,
    composeModeDefault,
    thinkingControl: defaults.thinkingControl,
    providerNativeAgentCompatibility: mergedCp,
    note: defaults.note,
    warning: defaults.warning,
  };

  pushAgentDebugEvent("NATIVE_AGENT_PROFILE_RESOLVED_SAFE", {
    providerType: profile.providerType,
    providerFamily: profile.providerFamily,
    endpointKind: profile.endpointKind,
    providerRequestStrategy: profile.providerRequestStrategy,
    supportsStructuredOutputs: profile.supportsStructuredOutputs,
    providerRequestTimeoutMs: profile.providerRequestTimeoutMs,
    hasProviderNativeAgentCompatibility: !!mergedCp,
  }, "info");

  return profile;
}

/**
 * 统一温度解析函数 — 所有模型调用路径共用。
 *
 * 规则：
 * 1. ProviderNativeAgentCompatibility.temperatureParamStrategy === "fixed" → 返回 fixedTemperature
 * 2. ProviderNativeAgentCompatibility.temperatureParamStrategy === "omit" → 返回 undefined（不发送）
 * 3. 默认 (default 或未设置) → optionsTemperature ?? modelConfigTemperature ?? fallbackTemperature
 */
export function resolveModelTemperatureForRequest(params: {
  providerType: string;
  modelId: string;
  modelConfigTemperature?: number;
  optionsTemperature?: number;
  providerNativeAgentCompatibility?: ProviderNativeAgentCompatibility;
  fallbackTemperature?: number;
}): number | undefined {
  const cp = params.providerNativeAgentCompatibility;

  // 1. fixed
  if (cp?.temperatureParamStrategy === "fixed" && cp.fixedTemperature !== undefined) {
    return cp.fixedTemperature;
  }

  // 2. omit
  if (cp?.temperatureParamStrategy === "omit") {
    return undefined;
  }

  // 3. default (or unset)
  return params.optionsTemperature ?? params.modelConfigTemperature ?? params.fallbackTemperature;
}
