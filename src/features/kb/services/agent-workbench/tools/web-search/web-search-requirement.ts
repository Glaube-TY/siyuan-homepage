import type { WebSearchTurnTracker } from "./web-search-provider";

export type WebSearchUsageRequirement = "not_required" | "not_attempted" | "failed" | "satisfied";

export function evaluateWebSearchUsageRequirement(params: {
  required: boolean;
  tracker: Pick<WebSearchTurnTracker, "attempted" | "succeeded">;
}): WebSearchUsageRequirement {
  if (!params.required) return "not_required";
  if (!params.tracker.attempted) return "not_attempted";
  return params.tracker.succeeded ? "satisfied" : "failed";
}
