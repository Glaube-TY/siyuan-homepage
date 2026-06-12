import type { KbChatModelConfig, KbChatProviderConfig } from "../../../types/settings";
import { buildProviderDiagnostics, type AgentProviderDiagnostic } from "./provider-diagnostics";
import { hasNativeToolCallSupport } from "./tool-call-support-test";

export interface AgentCompatibilityResult {
  ok: boolean;
  code?: string;
  message?: string;
  diagnostics: AgentProviderDiagnostic[];
}

export function assertAgentCompatible(params: {
  provider: KbChatProviderConfig | undefined;
  model: KbChatModelConfig | undefined;
}): AgentCompatibilityResult {
  if (!params.provider || !params.model) {
    return {
      ok: false,
      code: "agent_model_not_configured",
      message: "No usable chat model is configured for the Agent.",
      diagnostics: [],
    };
  }

  const diagnostics = buildProviderDiagnostics({ provider: params.provider, model: params.model });
  const blocking = diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (blocking) {
    return {
      ok: false,
      code: blocking.code,
      message: blocking.message,
      diagnostics,
    };
  }

  if (!hasNativeToolCallSupport({ provider: params.provider, model: params.model })) {
    return {
      ok: false,
      code: "native_tool_calls_not_supported",
      message: "The selected model is not marked as supporting provider-native tool calls.",
      diagnostics,
    };
  }

  return { ok: true, diagnostics };
}

