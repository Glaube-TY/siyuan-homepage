import type { KbChatModelConfig, KbChatProviderConfig } from "../../../types/settings";
import type { ThinkingMode } from "../../../types/session";
import { resolveOpenAICompatibleBaseUrlForProvider, resolveProviderFamily } from "./provider-url-resolver";
import { resolveModelTemperatureForRequest, resolveProviderProfile } from "../../qa/provider-profile";
import { buildOpenAICompatibleThinkingBodyOptions } from "../../qa/openai-compatible-request-config";
import { normalizeOpenAICompatibleEndpoint } from "./provider-url-normalizer";
import { pushAgentDebugEvent } from "../../agent-workbench/debug/workbench-debug";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter";
import { GeminiAdapter } from "./gemini-adapter";
import { AnthropicAdapter } from "./anthropic-adapter";
import type { ProviderAdapter } from "./provider-adapter";
import {
  BrowserAgentHttpTransport,
  TimedAgentHttpTransport,
  type AgentHttpTransport,
} from "./agent-http-transport";

export interface ProviderFactoryOverrides {
  /** 注入 HTTP 传输（Kernel Robot 传 KernelAgentHttpTransport；前端不传使用浏览器 fetch）。 */
  transport?: AgentHttpTransport;
  /** 是否流式（Kernel 传 false；前端不传默认 true 保持现有流式体验）。 */
  stream?: boolean;
  /** 覆盖 Provider Profile 的单次模型请求超时。 */
  requestTimeoutMs?: number;
}

function buildRequestBodyExtras(params: {
  thinkingMode: ThinkingMode;
  agentThinkingEnabled: boolean;
  provider: KbChatProviderConfig;
  model: KbChatModelConfig;
}): Record<string, unknown> | undefined {
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

  return buildOpenAICompatibleThinkingBodyOptions(effectiveThinkingMode, cp);
}

export function createProviderAdapterForKbModel(params: {
  provider: KbChatProviderConfig;
  model: KbChatModelConfig;
  thinkingMode: ThinkingMode;
  agentThinkingEnabled: boolean;
  overrides?: ProviderFactoryOverrides;
}): ProviderAdapter {
  const profile = resolveProviderProfile(params.provider.type, {
    providerNativeAgentCompatibility: params.provider.providerNativeAgentCompatibility,
    modelNativeAgentCompatibility: params.model.providerNativeAgentCompatibility,
  });

  pushAgentDebugEvent("NATIVE_AGENT_PROFILE_RESOLVED_SAFE", {
    providerType: profile.providerType,
    providerFamily: profile.providerFamily,
    endpointKind: profile.endpointKind,
    providerRequestStrategy: profile.providerRequestStrategy,
    supportsStructuredOutputs: profile.supportsStructuredOutputs,
    providerRequestTimeoutMs: profile.providerRequestTimeoutMs,
    hasProviderNativeAgentCompatibility: !!profile.providerNativeAgentCompatibility,
  }, "info");

  const adapterId = `${params.provider.id}:${params.model.id}`;
  const apiKey = params.provider.apiKey;
  const modelId = params.model.id;
  const requestTimeoutMs = params.overrides?.requestTimeoutMs ?? profile.providerRequestTimeoutMs;
  const transport = new TimedAgentHttpTransport(
    params.overrides?.transport ?? new BrowserAgentHttpTransport(),
    requestTimeoutMs,
  );

  const baseUrl = params.provider.baseUrl?.trim() || "";
  const providerFamily = resolveProviderFamily(params.provider);
  if (providerFamily === "gemini") {
    return new GeminiAdapter({
      id: adapterId,
      model: modelId,
      apiKey: apiKey || "",
      baseUrl: baseUrl || undefined,
      transport,
      requestTimeoutMs,
      ...(params.overrides?.stream !== undefined ? { stream: params.overrides.stream } : {}),
    });
  }

  if (providerFamily === "anthropic") {
    return new AnthropicAdapter({
      id: adapterId,
      model: modelId,
      apiKey: apiKey || "",
      baseUrl: baseUrl || undefined,
      maxTokens: params.model.maxTokens,
      transport,
      requestTimeoutMs,
      ...(params.overrides?.stream !== undefined ? { stream: params.overrides.stream } : {}),
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
    requestBodyExtras: buildRequestBodyExtras(params),
    transport,
    requestTimeoutMs,
    ...(params.overrides?.stream !== undefined ? { stream: params.overrides.stream } : {}),
  });
}
