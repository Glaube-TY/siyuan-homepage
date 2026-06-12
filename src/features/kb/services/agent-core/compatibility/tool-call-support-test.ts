import type { KbChatModelConfig, KbChatProviderConfig } from "../../../types/settings";
import { resolveProviderProfile } from "../../qa/provider-profile";

export function hasNativeToolCallSupport(params: {
  provider: KbChatProviderConfig;
  model: KbChatModelConfig;
}): boolean {
  try {
    const profile = resolveProviderProfile(params.provider.type, {
      providerNativeAgentCompatibility: params.provider.providerNativeAgentCompatibility,
      modelNativeAgentCompatibility: params.model.providerNativeAgentCompatibility,
    });
    return profile.providerNativeAgentCompatibility?.nativeToolCalls !== false;
  } catch {
    return false;
  }
}
