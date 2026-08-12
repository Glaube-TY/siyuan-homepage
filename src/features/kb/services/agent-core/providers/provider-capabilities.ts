export interface ProviderCapabilities {
  nativeToolCalls: boolean;
  streaming: boolean;
  reasoningDeltas: boolean;
  parallelToolCalls: boolean;
  requiredToolChoice: boolean;
  usageReporting: boolean;
}

export const OPENAI_COMPATIBLE_CAPABILITIES: ProviderCapabilities = {
  nativeToolCalls: true,
  streaming: true,
  reasoningDeltas: true,
  parallelToolCalls: true,
  // OpenAI-compatible 只保证协议外形，不保证思考模型支持 tool_choice=required。
  requiredToolChoice: false,
  usageReporting: true,
};

export const GEMINI_CAPABILITIES: ProviderCapabilities = {
  nativeToolCalls: true,
  streaming: true,
  reasoningDeltas: true,
  parallelToolCalls: true,
  requiredToolChoice: true,
  usageReporting: true,
};

export const ANTHROPIC_CAPABILITIES: ProviderCapabilities = {
  nativeToolCalls: true,
  streaming: true,
  reasoningDeltas: true,
  parallelToolCalls: true,
  requiredToolChoice: true,
  usageReporting: true,
};

