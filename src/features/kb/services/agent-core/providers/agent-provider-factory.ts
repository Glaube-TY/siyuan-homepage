import type { KbChatModelConfig, KbChatProviderConfig } from "../../../types/settings";
import type { ThinkingMode } from "../../../types/session";
import { resolveOpenAICompatibleBaseUrlForProvider } from "../../qa/model-provider-factory";
import { resolveModelTemperatureForRequest, resolveProviderProfile } from "../../qa/provider-profile";
import { normalizeOpenAICompatibleEndpoint } from "./provider-url-normalizer";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter";
import { GeminiAdapter } from "./gemini-adapter";
import { AnthropicAdapter } from "./anthropic-adapter";
import type { ProviderAdapter } from "./provider-adapter";

function buildProviderOptions(params: {
  thinkingMode: ThinkingMode;
  agentThinkingEnabled: boolean;
  provider: KbChatProviderConfig;
  model: KbChatModelConfig;
}): Record<string, Record<string, unknown>> | undefined {
  const profile = resolveProviderProfile(params.provider.type, {
    providerNativeAgentCompatibility: params.provider.providerNativeAgentCompatibility,
    modelNativeAgentCompatibility: params.model.providerNativeAgentCompatibility,
  });
  const cp = profile.providerNativeAgentCompatibility;
  const effectiveThinkingMode: ThinkingMode =
    params.thinkingMode === "on"
      ? "on"
      : params.thinkingMode === "off"
        ? "off"
        : params.agentThinkingEnabled ? "on" : "off";

  if (effectiveThinkingMode === "on") {
    if (cp?.thinkingOnStrategy === "openai_thinking_enabled") {
      return { openai: { thinking: { type: "enabled" } } };
    }
    if (cp?.thinkingOnStrategy === "enable_thinking_true") {
      return { openai: { enable_thinking: true } };
    }
    return undefined;
  }

  if (cp?.thinkingOffStrategy === "openai_thinking_disabled") {
    return { openai: { thinking: { type: "disabled" } } };
  }
  if (cp?.thinkingOffStrategy === "enable_thinking_false") {
    return { openai: { enable_thinking: false } };
  }
  return undefined;
}

export function createProviderAdapterForKbModel(params: {
  provider: KbChatProviderConfig;
  model: KbChatModelConfig;
  thinkingMode: ThinkingMode;
  agentThinkingEnabled: boolean;
}): ProviderAdapter {
  const profile = resolveProviderProfile(params.provider.type, {
    providerNativeAgentCompatibility: params.provider.providerNativeAgentCompatibility,
    modelNativeAgentCompatibility: params.model.providerNativeAgentCompatibility,
  });

  const adapterId = `${params.provider.id}:${params.model.id}`;
  const apiKey = params.provider.apiKey;
  const modelId = params.model.id;

  // Detect Gemini by baseUrl pattern (gemini.googleapis.com or generativelanguage.googleapis.com)
  const baseUrl = params.provider.baseUrl?.trim() || "";
  if (baseUrl.includes("gemini.googleapis") || baseUrl.includes("generativelanguage.googleapis")) {
    return new GeminiAdapter({
      id: adapterId,
      model: modelId,
      apiKey: apiKey || "",
      baseUrl: baseUrl || undefined,
    });
  }

  // Detect Anthropic by baseUrl pattern (api.anthropic.com)
  if (baseUrl.includes("api.anthropic.com") || baseUrl.includes("anthropic")) {
    return new AnthropicAdapter({
      id: adapterId,
      model: modelId,
      apiKey: apiKey || "",
      baseUrl: baseUrl || undefined,
      maxTokens: params.model.maxTokens,
    });
  }

  // Default: OpenAI-compatible
  const endpoint = normalizeOpenAICompatibleEndpoint(resolveOpenAICompatibleBaseUrlForProvider(params.provider));
  const temperature = resolveModelTemperatureForRequest({
    providerType: params.provider.type,
    modelId: params.model.id,
    modelConfigTemperature: params.model.temperature,
    providerNativeAgentCompatibility: profile.providerNativeAgentCompatibility,
  });

  return new OpenAICompatibleAdapter({
    id: adapterId,
    model: modelId,
    apiKey: apiKey || "",
    chatCompletionsUrl: endpoint.chatCompletionsUrl,
    temperature,
    maxTokens: params.model.maxTokens,
    tokenParamStrategy: profile.providerNativeAgentCompatibility?.tokenParamStrategy,
    providerOptions: buildProviderOptions(params),
  });
}
