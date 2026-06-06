/**
 * Provider Profile
 *
 * 为不同供应商/入口定义控制面策略、reasoning 控制能力和超时策略。
 *
 * 职责：
 * - 定义 ProviderProfile 接口
 * - 提供 resolveProviderProfile 函数
 * - 不在 Agent 链路中 hardcode 特定模型名
 * - 所有 provider 差异只放在 provider profile / llm-client
 */

import type { ReasoningCapabilityType } from "../../types/settings";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";

export type EndpointKind = "api" | "coding_plan" | "openai_compatible" | "unknown";

export type ControlPlaneStrategy = "raw_first" | "json_mode" | "structured_output";

export type ReasoningControlParamStyle = "openai_effort" | "thinking_type" | "none" | "unknown";

export interface ProviderProfile {
  providerType: string;
  providerFamily: string;
  endpointKind: EndpointKind;
  supportsStructuredOutputs: boolean;
  supportsJsonMode: boolean;
  supportsReasoningControl: boolean;
  reasoningControlParamStyle: ReasoningControlParamStyle;
  controlPlaneStrategy: ControlPlaneStrategy;
  allowStructuredFallback: boolean;
  controlPlaneTimeoutMs: number;
  controlPlaneMaxRetries: number;
  composeModeDefault: "auto" | "stream" | "non_stream";
  reasoningCapability: ReasoningCapabilityType;
  note?: string;
  warning?: string;
}

interface ProviderProfileDefaults {
  providerFamily: string;
  endpointKind: EndpointKind;
  supportsStructuredOutputs: boolean;
  supportsJsonMode: boolean;
  supportsReasoningControl: boolean;
  reasoningControlParamStyle: ReasoningControlParamStyle;
  controlPlaneStrategy: ControlPlaneStrategy;
  allowStructuredFallback: boolean;
  controlPlaneTimeoutMs: number;
  controlPlaneMaxRetries: number;
  composeModeDefault: "auto" | "stream" | "non_stream";
  reasoningCapability: ReasoningCapabilityType;
  note?: string;
  warning?: string;
}

const PROVIDER_PROFILE_DEFAULTS: Record<string, ProviderProfileDefaults> = {
  kimi: {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: false,
    reasoningControlParamStyle: "unknown",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "unknown",
    warning: "Kimi reasoning 能力未知，不伪装关闭",
  },
  "kimi-api": {
    providerFamily: "kimi",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: false,
    reasoningControlParamStyle: "unknown",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "unknown",
    warning: "Kimi API reasoning 能力未知，不伪装关闭",
  },
  "kimi-coding": {
    providerFamily: "kimi",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: false,
    reasoningControlParamStyle: "unknown",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "unknown",
    warning: "Kimi Coding reasoning 能力未知，不伪装关闭",
  },
  mimo: {
    providerFamily: "mimo",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: true,
    reasoningControlParamStyle: "thinking_type",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "openai_effort",
  },
  "mimo-api": {
    providerFamily: "mimo",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: true,
    reasoningControlParamStyle: "thinking_type",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "openai_effort",
  },
  "mimo-coding-plan": {
    providerFamily: "mimo",
    endpointKind: "coding_plan",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: true,
    reasoningControlParamStyle: "thinking_type",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 10000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "openai_effort",
  },
  deepseek: {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: true,
    supportsJsonMode: true,
    supportsReasoningControl: false,
    reasoningControlParamStyle: "unknown",
    controlPlaneStrategy: "structured_output",
    allowStructuredFallback: true,
    controlPlaneTimeoutMs: 6000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "unknown",
    warning: "DeepSeek reasoning 控制参数未经可靠验证，不发送猜测参数",
  },
  "deepseek-api": {
    providerFamily: "deepseek",
    endpointKind: "api",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: false,
    reasoningControlParamStyle: "unknown",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "unknown",
    warning: "DeepSeek API reasoning 控制参数未经可靠验证，不发送猜测参数",
  },
  "openai-compatible": {
    providerFamily: "custom",
    endpointKind: "openai_compatible",
    supportsStructuredOutputs: false,
    supportsJsonMode: false,
    supportsReasoningControl: false,
    reasoningControlParamStyle: "unknown",
    controlPlaneStrategy: "raw_first",
    allowStructuredFallback: false,
    controlPlaneTimeoutMs: 8000,
    controlPlaneMaxRetries: 1,
    composeModeDefault: "auto",
    reasoningCapability: "unknown",
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
    reasoningCapability?: ReasoningCapabilityType;
    finalComposeMode?: "auto" | "stream" | "non_stream";
  },
): ProviderProfile {
  const resolvedType = LEGACY_PROVIDER_MAP[providerType] ?? providerType;
  const defaults = PROVIDER_PROFILE_DEFAULTS[resolvedType] ?? PROVIDER_PROFILE_DEFAULTS["openai-compatible"];

  const reasoningCapability = (modelOverrides?.reasoningCapability && modelOverrides.reasoningCapability !== "unknown")
    ? modelOverrides.reasoningCapability
    : defaults.reasoningCapability;

  const composeModeDefault = modelOverrides?.finalComposeMode ?? defaults.composeModeDefault;

  const profile: ProviderProfile = {
    providerType: resolvedType,
    providerFamily: defaults.providerFamily,
    endpointKind: defaults.endpointKind,
    supportsStructuredOutputs: defaults.supportsStructuredOutputs,
    supportsJsonMode: defaults.supportsJsonMode,
    supportsReasoningControl: defaults.supportsReasoningControl,
    reasoningControlParamStyle: defaults.reasoningControlParamStyle,
    controlPlaneStrategy: defaults.controlPlaneStrategy,
    allowStructuredFallback: defaults.allowStructuredFallback,
    controlPlaneTimeoutMs: defaults.controlPlaneTimeoutMs,
    controlPlaneMaxRetries: defaults.controlPlaneMaxRetries,
    composeModeDefault,
    reasoningCapability,
    note: defaults.note,
    warning: defaults.warning,
  };

  pushAgentDebugEvent("CONTROL_PLANE_PROFILE_RESOLVED_SAFE", {
    providerType: profile.providerType,
    providerFamily: profile.providerFamily,
    endpointKind: profile.endpointKind,
    controlPlaneStrategy: profile.controlPlaneStrategy,
    supportsStructuredOutputs: profile.supportsStructuredOutputs,
    supportsReasoningControl: profile.supportsReasoningControl,
    reasoningControlParamStyle: profile.reasoningControlParamStyle,
    controlPlaneTimeoutMs: profile.controlPlaneTimeoutMs,
  }, "info");

  return profile;
}

export function buildReasoningProviderOptionsFromProfile(
  profile: ProviderProfile,
  effort: "low" | "medium" | "none",
): Record<string, Record<string, unknown>> | undefined {
  if (!profile.supportsReasoningControl) {
    return undefined;
  }
  if (effort === "none") {
    return undefined;
  }
  if (profile.reasoningControlParamStyle === "openai_effort") {
    return { openai: { reasoning_effort: effort } };
  }
  return undefined;
}

export function buildThinkingTypeProviderOptions(
  profile: ProviderProfile,
  thinkingEnabled: boolean,
): Record<string, Record<string, unknown>> | undefined {
  if (!profile.supportsReasoningControl) {
    return undefined;
  }
  if (profile.reasoningControlParamStyle !== "thinking_type") {
    return undefined;
  }
  return { openai: { thinking: { type: thinkingEnabled ? "enabled" : "disabled" } } };
}
