import type { KbChatModelConfig, KbChatProviderConfig } from "../../../types/settings";

export interface AgentProviderDiagnostic {
  code: string;
  message: string;
  severity: "info" | "warn" | "error";
}

export function buildProviderDiagnostics(params: {
  provider: KbChatProviderConfig;
  model: KbChatModelConfig;
}): AgentProviderDiagnostic[] {
  const diagnostics: AgentProviderDiagnostic[] = [];
  if (!params.provider.apiKey?.trim()) {
    diagnostics.push({
      code: "missing_api_key",
      message: "The selected provider has no API key.",
      severity: "error",
    });
  }
  if (!params.model.id?.trim()) {
    diagnostics.push({
      code: "missing_model_id",
      message: "The selected model has no model id.",
      severity: "error",
    });
  }
  if (params.model.notRecommendedForAgent) {
    diagnostics.push({
      code: "model_not_recommended_for_agent",
      message: "The selected model is marked as not recommended for automatic agent work.",
      severity: "warn",
    });
  }
  return diagnostics;
}

