/**
 * Provider Profile
 *
 * 为不同供应商/入口定义控制面策略和兼容性配置。
 * 模型适配差异只放在 provider profile 层，不散落到 AgentLoop/Tool/Skill。
 *
 * 职责：
 * - 定义 ProviderProfile 接口
 * - 提供 resolveProviderProfile 函数
 * - 不在 Agent 链路中 hardcode 特定模型名
 * - 所有 provider 差异只放在 provider profile / llm-client
 */

import type { ControlPlaneCompatibility } from "../../types/settings";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";

export type EndpointKind = "api" | "coding_plan" | "openai_compatible" | "unknown";

export type ControlPlaneStrategy = "raw_first" | "json_mode" | "structured_output";

export interface ProviderProfile {
  providerType: string;
  providerFamily: string;
  endpointKind: EndpointKind;
  supportsStructuredOutputs: boolean;
  supportsJsonMode: boolean;
  controlPlaneStrategy: ControlPlaneStrategy;
  allowStructuredFallback: boolean;
  controlPlaneTimeoutMs: number;
  controlPlaneMaxRetries: number;
  composeModeDefault: "auto" | "stream" | "non_stream";
  thinkingControl?: {
    supportsToggle: boolean;
    defaultMode: "enabled" | "disabled" | "unknown";
    disableRequiresExplicitParam: boolean;
  };
  /** 合并后的控制面兼容性配置（provider 默认 + model 覆盖） */
  controlPlaneCompatibility?: ControlPlaneCompatibility;
  /** Planner 调用传输方式 */
  plannerTransport?: "non_stream_json" | "stream_json";
  note?: string;
  warning?: string;
}

interface ProviderProfileDefaults {
  providerFamily: string;
  endpointKind: EndpointKind;
  supportsStructuredOutputs: boolean;
  supportsJsonMode: boolean;
  controlPlaneStrategy: ControlPlaneStrategy;
  allowStructuredFallback: boolean;
  controlPlaneTimeoutMs: number;
  controlPlaneMaxRetries: number;
  composeModeDefault: "auto" | "stream" | "non_stream";
  thinkingControl?: {
    supportsToggle: boolean;
    defaultMode: "enabled" | "disabled" | "unknown";
    disableRequiresExplicitParam: boolean;
  };
  /** provider 级默认的控制面兼容性 */
  controlPlaneCompatibility?: ControlPlaneCompatibility;
  /** Planner 调用传输方式 */
  plannerTransport?: "non_stream_json" | "stream_json";
  note?: string;
  warning?: string;
}

const PROVIDER_PROFILE_DEFAULTS: Record<string, ProviderProfileDefaults> = {
  kimi: {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    controlPlaneStrategy: "json_mode",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    controlPlaneCompatibility: {
      jsonOutputStrategy: "response_format_json_object",
      temperatureParamStrategy: "omit",
    },
    plannerTransport: "stream_json",
    note: "Kimi API 支持 response_format json_object",
  },
  "kimi-api": {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    controlPlaneStrategy: "json_mode",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    controlPlaneCompatibility: {
      jsonOutputStrategy: "response_format_json_object",
      temperatureParamStrategy: "omit",
    },
    plannerTransport: "stream_json",
    note: "Kimi API 支持 response_format json_object",
  },
  "kimi-coding": {
    providerFamily: "kimi",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    controlPlaneCompatibility: {
      suitability: "not_recommended",
      temperatureParamStrategy: "omit",
    },
    plannerTransport: "stream_json",
    warning: "Coding Plan 端点更适合代码任务，不推荐用于自动操作规划。",
  },
  mimo: {
    providerFamily: "mimo",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
  },
  "mimo-api": {
    providerFamily: "mimo",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    controlPlaneCompatibility: {
      jsonOutputStrategy: "raw_prompt",
      thinkingOffStrategy: "openai_thinking_disabled",
      thinkingOnStrategy: "openai_thinking_enabled",
      tokenParamStrategy: "max_completion_tokens",
    },
    plannerTransport: "stream_json",
    note: "MiMo API 支持 thinking 参数（OpenAI-compatible 风格）",
  },
  "mimo-coding-plan": {
    providerFamily: "mimo",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    controlPlaneCompatibility: {
      suitability: "not_recommended",
      tokenParamStrategy: "max_completion_tokens",
      thinkingOffStrategy: "openai_thinking_disabled",
    },
    plannerTransport: "stream_json",
    warning: "Coding Plan 端点更适合长计划或代码任务，不推荐用于自动操作规划。",
  },
  deepseek: {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    controlPlaneStrategy: "json_mode",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    thinkingControl: {
      supportsToggle: true,
      defaultMode: "enabled",
      disableRequiresExplicitParam: true,
    },
    controlPlaneCompatibility: {
      thinkingOffStrategy: "openai_thinking_disabled",
      thinkingOnStrategy: "openai_thinking_enabled",
      jsonOutputStrategy: "response_format_json_object",
    },
    note: "DeepSeek 支持 thinking 开关和 response_format json_object",
  },
  "deepseek-api": {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: true,
    controlPlaneStrategy: "json_mode",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    thinkingControl: {
      supportsToggle: true,
      defaultMode: "enabled",
      disableRequiresExplicitParam: true,
    },
    controlPlaneCompatibility: {
      thinkingOffStrategy: "openai_thinking_disabled",
      thinkingOnStrategy: "openai_thinking_enabled",
      jsonOutputStrategy: "response_format_json_object",
    },
    note: "DeepSeek API 支持 thinking 开关和 response_format json_object",
  },
  "openai-compatible": {
    providerFamily: "custom",
    endpointKind: "openai_compatible",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 30000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    controlPlaneCompatibility: {
      jsonOutputStrategy: "raw_prompt",
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
 * 合并两个 ControlPlaneCompatibility，model 覆盖 provider。
 */
function mergeControlPlaneCompatibility(
  providerCp?: ControlPlaneCompatibility,
  modelCp?: ControlPlaneCompatibility,
): ControlPlaneCompatibility | undefined {
  if (!providerCp && !modelCp) return undefined;
  return {
    suitability: modelCp?.suitability ?? providerCp?.suitability,
    jsonOutputStrategy: modelCp?.jsonOutputStrategy ?? providerCp?.jsonOutputStrategy,
    thinkingOffStrategy: modelCp?.thinkingOffStrategy ?? providerCp?.thinkingOffStrategy,
    thinkingOnStrategy: modelCp?.thinkingOnStrategy ?? providerCp?.thinkingOnStrategy,
    timeoutMs: modelCp?.timeoutMs ?? providerCp?.timeoutMs,
    tokenParamStrategy: modelCp?.tokenParamStrategy ?? providerCp?.tokenParamStrategy,
    temperatureParamStrategy: modelCp?.temperatureParamStrategy ?? providerCp?.temperatureParamStrategy,
    fixedTemperature: modelCp?.fixedTemperature ?? providerCp?.fixedTemperature,
    plannerTransport: modelCp?.plannerTransport ?? providerCp?.plannerTransport,
  };
}

/**
 * 规范化 controlPlaneTimeoutMs：最小 30000，最大 300000。
 * 用于清理旧配置中遗留的 8000/10000 等历史默认值。
 */
function normalizeControlPlaneTimeoutMs(value: unknown, defaultMs = 30000): number {
  if (typeof value !== "number" || isNaN(value) || value <= 0) return defaultMs;
  if (value < 30000) return 30000;
  if (value > 300000) return 300000;
  return value;
}

export function resolveProviderProfile(
  providerType: string,
  modelOverrides?: {
    finalComposeMode?: "auto" | "stream" | "non_stream";
    /** provider 级 controlPlaneCompatibility */
    providerControlPlaneCompatibility?: ControlPlaneCompatibility;
    /** model 级 controlPlaneCompatibility（覆盖 provider） */
    modelControlPlaneCompatibility?: ControlPlaneCompatibility;
  },
): ProviderProfile {
  const resolvedType = LEGACY_PROVIDER_MAP[providerType] ?? providerType;
  const defaults = PROVIDER_PROFILE_DEFAULTS[resolvedType] ?? PROVIDER_PROFILE_DEFAULTS["openai-compatible"];

  const composeModeDefault = modelOverrides?.finalComposeMode ?? defaults.composeModeDefault;

  // 合并 controlPlaneCompatibility：内置默认 → provider 配置 → model 配置
  const mergedCp = mergeControlPlaneCompatibility(
    defaults.controlPlaneCompatibility,
    mergeControlPlaneCompatibility(
      modelOverrides?.providerControlPlaneCompatibility,
      modelOverrides?.modelControlPlaneCompatibility,
    ),
  );

  // 根据 mergedCp.jsonOutputStrategy 做一致修正
  let effectiveSupportsJsonMode = defaults.supportsJsonMode;
  let effectiveControlPlaneStrategy = defaults.controlPlaneStrategy;
  if (mergedCp?.jsonOutputStrategy === "response_format_json_object") {
    effectiveSupportsJsonMode = true;
    effectiveControlPlaneStrategy = "json_mode";
  } else if (mergedCp?.jsonOutputStrategy === "raw_prompt") {
    effectiveControlPlaneStrategy = "raw_first";
  }

  const profile: ProviderProfile = {
    providerType: resolvedType,
    providerFamily: defaults.providerFamily,
    endpointKind: defaults.endpointKind,
    supportsStructuredOutputs: defaults.supportsStructuredOutputs,
    supportsJsonMode: effectiveSupportsJsonMode,
    controlPlaneStrategy: effectiveControlPlaneStrategy,
    allowStructuredFallback: defaults.allowStructuredFallback,
    controlPlaneTimeoutMs: normalizeControlPlaneTimeoutMs(mergedCp?.timeoutMs, defaults.controlPlaneTimeoutMs),
    controlPlaneMaxRetries: defaults.controlPlaneMaxRetries,
    composeModeDefault,
    thinkingControl: defaults.thinkingControl,
    controlPlaneCompatibility: mergedCp,
    plannerTransport: mergedCp?.plannerTransport ?? defaults.plannerTransport,
    note: defaults.note,
    warning: defaults.warning,
  };

  pushAgentDebugEvent("CONTROL_PLANE_PROFILE_RESOLVED_SAFE", {
    providerType: profile.providerType,
    providerFamily: profile.providerFamily,
    endpointKind: profile.endpointKind,
    controlPlaneStrategy: profile.controlPlaneStrategy,
    supportsStructuredOutputs: profile.supportsStructuredOutputs,
    controlPlaneTimeoutMs: profile.controlPlaneTimeoutMs,
    hasControlPlaneCompatibility: !!mergedCp,
  }, "info");

  return profile;
}

/**
 * 统一温度解析函数 — 所有模型调用路径共用。
 *
 * 规则：
 * 1. controlPlaneCompatibility.temperatureParamStrategy === "fixed" → 返回 fixedTemperature
 * 2. controlPlaneCompatibility.temperatureParamStrategy === "omit" → 返回 undefined（不发送）
 * 3. 默认 (default 或未设置) → optionsTemperature ?? modelConfigTemperature ?? fallbackTemperature
 */
export function resolveModelTemperatureForRequest(params: {
  providerType: string;
  modelId: string;
  modelConfigTemperature?: number;
  optionsTemperature?: number;
  controlPlaneCompatibility?: ControlPlaneCompatibility;
  fallbackTemperature?: number;
}): number | undefined {
  const cp = params.controlPlaneCompatibility;

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
