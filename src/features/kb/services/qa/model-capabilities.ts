import type { ReasoningCapabilityType } from "../../types/settings";
import { pushAgentDebugEvent } from "../agent-workbench/debug/workbench-debug";

export type ThinkingMode = "off" | "on";

export type { ReasoningCapabilityType };

const PROVIDER_DEFAULT_CAPABILITY: Record<string, ReasoningCapabilityType> = {
  deepseek: "unknown",
  "deepseek-api": "unknown",
  kimi: "unknown",
  "kimi-api": "unknown",
  "kimi-coding": "unknown",
  mimo: "unknown",
  "mimo-api": "unknown",
  "mimo-coding-plan": "unknown",
  "openai-compatible": "unknown",
};

const reasoningUnsupportedCache = new Set<string>();

export function isReasoningUnsupportedCached(providerType: string, modelId: string): boolean {
  return reasoningUnsupportedCache.has(`${providerType}:${modelId}`);
}

export function cacheReasoningUnsupported(providerType: string, modelId: string): void {
  reasoningUnsupportedCache.add(`${providerType}:${modelId}`);
}

export interface ComposeRuntimeObservation {
  providerType: string;
  modelLabel: string;
  reason: string;
  timestamp: number;
}

const COMPOSE_OBSERVATION_STORAGE_KEY = "kb_compose_obs_v1";
const COMPOSE_OBSERVATION_TTL_MS = 1000 * 60 * 60 * 4;

function loadComposeObservationFromStorage(): Map<string, ComposeRuntimeObservation> {
  const map = new Map<string, ComposeRuntimeObservation>();
  try {
    const raw = sessionStorage.getItem(COMPOSE_OBSERVATION_STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, ComposeRuntimeObservation>;
    const now = Date.now();
    for (const [key, obs] of Object.entries(parsed)) {
      if (now - obs.timestamp < COMPOSE_OBSERVATION_TTL_MS) {
        map.set(key, obs);
      }
    }
  } catch {
    // sessionStorage unavailable or corrupt
  }
  return map;
}

function persistComposeObservationToStorage(cache: Map<string, ComposeRuntimeObservation>): void {
  try {
    const obj: Record<string, ComposeRuntimeObservation> = {};
    for (const [key, obs] of cache) {
      obj[key] = obs;
    }
    sessionStorage.setItem(COMPOSE_OBSERVATION_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // sessionStorage unavailable
  }
}

const composeObservationCache = loadComposeObservationFromStorage();

export function recordComposeObservation(obs: ComposeRuntimeObservation): void {
  const key = `${obs.providerType}:${obs.modelLabel}`;
  composeObservationCache.set(key, obs);
  pushAgentDebugEvent("COMPOSE_RUNTIME_OBSERVATION_RECORDED_SAFE", {
    providerType: obs.providerType,
    modelLabel: obs.modelLabel,
    reason: obs.reason,
  });
  persistComposeObservationToStorage(composeObservationCache);
}

export function getComposeObservation(providerType: string, modelLabel: string): ComposeRuntimeObservation | undefined {
  return composeObservationCache.get(`${providerType}:${modelLabel}`);
}

export function isReasoningParameterRejection(error: Error): boolean {
  const msg = (error.message || "").toLowerCase();
  const statusCode = (error as any)?.statusCode ?? (error as any)?.status;
  if (statusCode === 400 || statusCode === 422) {
    return true;
  }
  return (
    msg.includes("unknown parameter") ||
    msg.includes("unsupported parameter") ||
    msg.includes("unsupported_value") ||
    msg.includes("invalid_request_error") ||
    msg.includes("not supported") ||
    msg.includes("not supported with") ||
    msg.includes("reasoning_effort") ||
    msg.includes("thinking") && msg.includes("not supported")
  );
}

export function resolveEffectiveCapability(
  providerType: string,
  userDeclared?: ReasoningCapabilityType,
): ReasoningCapabilityType {
  if (userDeclared && userDeclared !== "unknown") {
    return userDeclared;
  }
  return PROVIDER_DEFAULT_CAPABILITY[providerType] ?? "unknown";
}

export type ComposeStreamStrategy = "stream" | "non_stream";

export type ProviderFamily =
  | "kimi"
  | "mimo"
  | "deepseek"
  | "custom";

export interface ModelCapabilityProfile {
  providerFamily: ProviderFamily;
  supportsStructuredOutputs: boolean;
  supportsTextStreaming: boolean;
  supportsReasoningStreaming: boolean;
  supportsReasoningControl: boolean;
  streamMayReturnReasoningOnly: boolean;
  preferredComposeMode: "auto" | "stream" | "non_stream";
  reasoningCapability: ReasoningCapabilityType;
  hasUserOverride: boolean;
}

interface ProviderFamilyDefaults {
  providerFamily: ProviderFamily;
  supportsStructuredOutputs: boolean;
  supportsTextStreaming: boolean;
  supportsReasoningStreaming: boolean;
  supportsReasoningControl: boolean;
  streamMayReturnReasoningOnly: boolean;
  preferredComposeMode: "auto" | "stream" | "non_stream";
  defaultReasoningCapability: ReasoningCapabilityType;
}

const PROVIDER_FAMILY_MAP: Record<string, ProviderFamily> = {
  kimi: "kimi",
  "kimi-api": "kimi",
  "kimi-coding": "kimi",
  mimo: "mimo",
  "mimo-api": "mimo",
  "mimo-coding-plan": "mimo",
  deepseek: "deepseek",
  "deepseek-api": "deepseek",
  "openai-compatible": "custom",
};

const PROVIDER_FAMILY_DEFAULTS: Record<ProviderFamily, ProviderFamilyDefaults> = {
  kimi: {
    providerFamily: "kimi",
    supportsStructuredOutputs: false,
    supportsTextStreaming: true,
    supportsReasoningStreaming: false,
    supportsReasoningControl: false,
    streamMayReturnReasoningOnly: true,
    preferredComposeMode: "auto",
    defaultReasoningCapability: "unknown",
  },
  mimo: {
    providerFamily: "mimo",
    supportsStructuredOutputs: false,
    supportsTextStreaming: true,
    supportsReasoningStreaming: false,
    supportsReasoningControl: true,
    streamMayReturnReasoningOnly: true,
    preferredComposeMode: "auto",
    defaultReasoningCapability: "unknown",
  },
  deepseek: {
    providerFamily: "deepseek",
    supportsStructuredOutputs: true,
    supportsTextStreaming: true,
    supportsReasoningStreaming: true,
    supportsReasoningControl: false,
    streamMayReturnReasoningOnly: false,
    preferredComposeMode: "auto",
    defaultReasoningCapability: "unknown",
  },
  custom: {
    providerFamily: "custom",
    supportsStructuredOutputs: false,
    supportsTextStreaming: true,
    supportsReasoningStreaming: false,
    supportsReasoningControl: false,
    streamMayReturnReasoningOnly: false,
    preferredComposeMode: "auto",
    defaultReasoningCapability: "unknown",
  },
};

export function resolveModelCapabilityProfile(
  providerType: string,
  modelOverrides?: {
    reasoningCapability?: ReasoningCapabilityType;
    finalComposeMode?: "auto" | "stream" | "non_stream";
  },
): ModelCapabilityProfile {
  const family = PROVIDER_FAMILY_MAP[providerType] ?? "custom";
  const defaults = PROVIDER_FAMILY_DEFAULTS[family];

  const userReasoning = modelOverrides?.reasoningCapability;
  const userCompose = modelOverrides?.finalComposeMode;
  const hasUserOverride = !!(userReasoning || userCompose);

  const reasoningCapability = (userReasoning && userReasoning !== "unknown")
    ? userReasoning
    : defaults.defaultReasoningCapability;

  const preferredComposeMode = userCompose ?? defaults.preferredComposeMode;

  return {
    providerFamily: family,
    supportsStructuredOutputs: defaults.supportsStructuredOutputs,
    supportsTextStreaming: defaults.supportsTextStreaming,
    supportsReasoningStreaming: defaults.supportsReasoningStreaming,
    supportsReasoningControl: defaults.supportsReasoningControl,
    streamMayReturnReasoningOnly: defaults.streamMayReturnReasoningOnly,
    preferredComposeMode,
    reasoningCapability,
    hasUserOverride,
  };
}

export function resolveComposeStrategyFromProfile(
  profile: ModelCapabilityProfile,
  thinkingMode?: ThinkingMode,
  runtime?: { providerType?: string; modelLabel?: string },
): { strategy: ComposeStreamStrategy; reason: string; thinkingModeCapabilityNote?: string } {
  if (!profile.supportsTextStreaming) {
    return {
      strategy: "non_stream",
      reason: `profile:${profile.providerFamily},capability:supportsTextStreaming=false`,
    };
  }

  if (profile.preferredComposeMode === "non_stream") {
    const note = thinkingMode === "on"
      ? "该模型/当前配置不支持实时思考流，思考内容将无法实时展示"
      : undefined;
    return {
      strategy: "non_stream",
      reason: `profile:${profile.providerFamily},mode=non_stream${profile.hasUserOverride ? ",user_override" : ""}`,
      thinkingModeCapabilityNote: note,
    };
  }
  if (profile.preferredComposeMode === "stream") {
    return {
      strategy: "stream",
      reason: `profile:${profile.providerFamily},mode=stream${profile.hasUserOverride ? ",user_override" : ""}`,
    };
  }

  if (runtime?.providerType && runtime?.modelLabel) {
    const obs = getComposeObservation(runtime.providerType, runtime.modelLabel);
    if (obs && obs.reason === "reasoning_only_compose") {
      pushAgentDebugEvent("COMPOSE_STRATEGY_FROM_OBSERVATION_SAFE", {
        providerType: runtime.providerType,
        modelLabel: runtime.modelLabel,
        observationReason: obs.reason,
        observationUsedForRouting: false,
        reason: "observation exists but not used for routing, respecting supportsTextStreaming=true",
      }, "debug");
    }
  }

  if (profile.streamMayReturnReasoningOnly) {
    if (thinkingMode === "on") {
      return {
        strategy: "stream",
        reason: `profile:${profile.providerFamily},mode=auto,thinking_on_force_stream`,
      };
    }
    return {
      strategy: "stream",
      reason: `profile:${profile.providerFamily},mode=auto,early_fallback_enabled`,
    };
  }
  return {
    strategy: "stream",
    reason: `profile:${profile.providerFamily},mode=auto`,
  };
}

export function shouldEarlyFallbackFromStream(
  observation: { textDeltaReceived: boolean; reasoningPartCount: number; elapsedMs: number },
  profile: ModelCapabilityProfile,
  thinkingMode?: ThinkingMode,
): boolean {
  if (observation.textDeltaReceived) return false;
  if (observation.reasoningPartCount === 0) return false;
  if (profile.preferredComposeMode === "stream") return false;
  if (thinkingMode === "on") return false;
  return profile.streamMayReturnReasoningOnly || profile.preferredComposeMode === "auto";
}

export function resolveComposeStreamStrategy(providerType: string): {
  strategy: ComposeStreamStrategy;
  reason: string;
} {
  const profile = resolveModelCapabilityProfile(providerType);
  const result = resolveComposeStrategyFromProfile(profile);
  return { strategy: result.strategy, reason: result.reason };
}

export function resolveReasoningEffortForCompose(
  thinkingMode: ThinkingMode,
  capability: ReasoningCapabilityType,
): {
  effort: "low" | "medium" | "none" | undefined;
  providerOptions: Record<string, Record<string, unknown>> | undefined;
  applied: boolean;
  skippedReason?: string;
} {
  if (capability === "unknown") {
    return { effort: undefined, providerOptions: undefined, applied: false, skippedReason: "unknown_capability" };
  }
  if (capability === "none") {
    return { effort: undefined, providerOptions: undefined, applied: false, skippedReason: "capability_none" };
  }
  if (capability === "model_native_uncontrolled") {
    return { effort: undefined, providerOptions: undefined, applied: false, skippedReason: "native_uncontrolled" };
  }

  if (thinkingMode === "off") {
    if (capability === "openai_effort") {
      return { effort: "low", providerOptions: undefined, applied: true };
    }
    return { effort: undefined, providerOptions: undefined, applied: false, skippedReason: "no_off_path" };
  }

  if (thinkingMode === "on") {
    if (capability === "openai_effort") {
      return { effort: "medium", providerOptions: undefined, applied: true };
    }
    return { effort: undefined, providerOptions: undefined, applied: false, skippedReason: "no_on_path" };
  }

  return { effort: undefined, providerOptions: undefined, applied: false, skippedReason: "unknown_thinking_mode" };
}
