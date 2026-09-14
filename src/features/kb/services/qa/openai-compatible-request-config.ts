import type { KbChatProviderConfig, ProviderNativeAgentCompatibility } from "../../types/settings";
import type { ThinkingMode } from "../../types/session";

export type OpenAICompatibleTokenParamStrategy = "max_tokens" | "max_completion_tokens";
export type OpenAICompatibleRequestBodyExtras = Record<string, unknown>;

const AI_SDK_PROVIDER_NAMES: Record<string, string> = {
  "kimi-api": "kimiApi",
  "kimi-coding": "kimiCoding",
  "mimo-api": "mimoApi",
  "mimo-coding-plan": "mimoCodingPlan",
  "deepseek-api": "deepseekApi",
  "opencode-go": "opencodeGo",
  "opencode-zen": "opencodeZen",
  "openai-compatible": "openaiCompatible",
};

/** 返回稳定的 AI SDK providerOptions namespace，不使用用户可编辑的显示名称或 ID。 */
export function resolveOpenAICompatibleAiSdkProviderName(
  provider: Pick<KbChatProviderConfig, "type"> | string,
): string {
  const providerType = typeof provider === "string" ? provider : provider.type;
  return AI_SDK_PROVIDER_NAMES[providerType] ?? "openaiCompatible";
}

/** 将思考策略转换为最终 OpenAI-compatible HTTP body 字段。 */
export function buildOpenAICompatibleThinkingBodyOptions(
  thinkingMode: ThinkingMode,
  compatibility?: ProviderNativeAgentCompatibility,
): OpenAICompatibleRequestBodyExtras | undefined {
  const strategy = thinkingMode === "on"
    ? compatibility?.thinkingOnStrategy
    : compatibility?.thinkingOffStrategy;

  if (strategy === "openai_thinking_enabled") return { thinking: { type: "enabled" } };
  if (strategy === "openai_thinking_disabled") return { thinking: { type: "disabled" } };
  if (strategy === "enable_thinking_true") return { enable_thinking: true };
  if (strategy === "enable_thinking_false") return { enable_thinking: false };
  return undefined;
}

export function resolveOpenAICompatibleTokenParamStrategy(
  compatibility?: ProviderNativeAgentCompatibility,
): OpenAICompatibleTokenParamStrategy {
  return compatibility?.tokenParamStrategy === "max_completion_tokens"
    ? "max_completion_tokens"
    : "max_tokens";
}

export interface OpenAICompatibleTextRequestPlan {
  providerOptions?: Record<string, OpenAICompatibleRequestBodyExtras>;
  maxOutputTokens?: number;
  actualOutputParameter: OpenAICompatibleTokenParamStrategy;
  bodyExtras?: OpenAICompatibleRequestBodyExtras;
}

/**
 * 构造普通文本调用的 AI SDK request plan。
 * bodyExtras 仍然是原始 HTTP body 字段，只有返回 providerOptions 时才包装 namespace。
 */
export function buildOpenAICompatibleTextRequestPlan(params: {
  aiSdkProviderName: string;
  thinkingMode: ThinkingMode;
  compatibility?: ProviderNativeAgentCompatibility;
  maxOutputTokens: number;
}): OpenAICompatibleTextRequestPlan {
  const thinkingExtras = buildOpenAICompatibleThinkingBodyOptions(
    params.thinkingMode,
    params.compatibility,
  );
  const actualOutputParameter = resolveOpenAICompatibleTokenParamStrategy(params.compatibility);
  const bodyExtras = thinkingExtras ? { ...thinkingExtras } : {};

  if (actualOutputParameter === "max_completion_tokens") {
    bodyExtras.max_completion_tokens = params.maxOutputTokens;
  }

  const hasBodyExtras = Object.keys(bodyExtras).length > 0;
  return {
    ...(hasBodyExtras ? {
      providerOptions: { [params.aiSdkProviderName]: bodyExtras },
      bodyExtras,
    } : {}),
    maxOutputTokens: actualOutputParameter === "max_tokens" ? params.maxOutputTokens : undefined,
    actualOutputParameter,
  };
}
