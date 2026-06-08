/**
 * Provider Profile
 *
 * 为不同供应商/入口定义控制面策略和超时策略。
 * 不再包含 reasoning 请求参数相关字段；thinkingMode → providerOptions
 * 的唯一转换在 qa/kb-model-call.ts 中完成。
 *
 * 职责：
 * - 定义 ProviderProfile 接口
 * - 提供 resolveProviderProfile 函数
 * - 不在 Agent 链路中 hardcode 特定模型名
 * - 所有 provider 差异只放在 provider profile / llm-client
 */

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
  note?: string;
  warning?: string;
}

const PROVIDER_PROFILE_DEFAULTS: Record<string, ProviderProfileDefaults> = {
  kimi: {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    warning: "Kimi 能力未知，保守默认",
  },
  "kimi-api": {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    warning: "Kimi API 能力未知，保守默认",
  },
  "kimi-coding": {
    providerFamily: "kimi",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    warning: "Kimi Coding 能力未知，保守默认",
  },
  mimo: {
    providerFamily: "mimo",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
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
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
  },
  "mimo-coding-plan": {
    providerFamily: "mimo",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 10000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
  },
  deepseek: {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: true,
    supportsJsonMode: true,
    controlPlaneStrategy: "structured_output",
    allowStructuredFallback: true,
    controlPlaneTimeoutMs: 6000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    warning: "DeepSeek 能力未知，保守默认",
  },
  "deepseek-api": {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    warning: "DeepSeek API 能力未知，保守默认",
  },
  "openai-compatible": {
    providerFamily: "custom",
    endpointKind: "openai_compatible",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    warning: "自定义接口能力未知，保守默认",
  },
};

const LEGACY_PROVIDER_MAP: Record<string, string> = {
  mimo: "mimo-api",
  kimi: "kimi-api",
  deepseek: "deepseek-api",
};

export function resolveProviderProfile(
  providerType: string,
  modelOverrides?: {
    finalComposeMode?: "auto" | "stream" | "non_stream";
  },
): ProviderProfile {
  const resolvedType = LEGACY_PROVIDER_MAP[providerType] ?? providerType;
  const defaults = PROVIDER_PROFILE_DEFAULTS[resolvedType] ?? PROVIDER_PROFILE_DEFAULTS["openai-compatible"];

  const composeModeDefault = modelOverrides?.finalComposeMode ?? defaults.composeModeDefault;

  const profile: ProviderProfile = {
    providerType: resolvedType,
    providerFamily: defaults.providerFamily,
    endpointKind: defaults.endpointKind,
    supportsStructuredOutputs: defaults.supportsStructuredOutputs,
    supportsJsonMode: defaults.supportsJsonMode,
    controlPlaneStrategy: defaults.controlPlaneStrategy,
    allowStructuredFallback: defaults.allowStructuredFallback,
    controlPlaneTimeoutMs: defaults.controlPlaneTimeoutMs,
    controlPlaneMaxRetries: defaults.controlPlaneMaxRetries,
    composeModeDefault,
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
  }, "info");

  return profile;
}
