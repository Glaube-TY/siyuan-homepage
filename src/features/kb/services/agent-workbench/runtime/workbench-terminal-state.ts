import type { AgentWorkbenchEvent } from "../contracts/turn-event";

export const PROVIDER_OUTPUT_TRUNCATED_ERROR_CODE = "provider_output_truncated";

export function getFinalWorkbenchDoneStatus(
  events: readonly AgentWorkbenchEvent[] | undefined,
): "answer_ready" | "failed" | "cancelled" | undefined {
  if (!events) return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "done") return event.status;
  }
  return undefined;
}

export function hasSettledWorkbenchTerminal(
  events: readonly AgentWorkbenchEvent[] | undefined,
): boolean {
  const status = getFinalWorkbenchDoneStatus(events);
  return status === "answer_ready" || status === "failed";
}

export function hasWorkbenchErrorCode(
  events: readonly AgentWorkbenchEvent[] | undefined,
  code: string,
): boolean {
  return events?.some((event) => event.type === "error" && event.code === code) ?? false;
}

export function isProviderOutputTruncatedWorkbench(
  events: readonly AgentWorkbenchEvent[] | undefined,
): boolean {
  return hasWorkbenchErrorCode(events, PROVIDER_OUTPUT_TRUNCATED_ERROR_CODE);
}
