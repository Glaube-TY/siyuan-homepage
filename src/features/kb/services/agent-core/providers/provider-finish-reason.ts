export type ProviderFinishKind = "complete" | "truncated" | "aborted" | "unknown";

export function classifyProviderFinishReason(reason: string | undefined): ProviderFinishKind {
  const normalized = reason?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (!normalized) return "unknown";
  if (
    normalized === "length"
    || normalized === "max_tokens"
    || normalized === "max_token"
    || normalized === "max_output_tokens"
    || normalized.includes("token_limit")
  ) {
    return "truncated";
  }
  if (normalized === "aborted" || normalized === "cancelled" || normalized === "canceled") {
    return "aborted";
  }
  if (
    normalized === "stop"
    || normalized === "end_turn"
    || normalized === "tool_calls"
    || normalized === "function_call"
    || normalized === "complete"
    || normalized === "completed"
  ) {
    return "complete";
  }
  return "unknown";
}
