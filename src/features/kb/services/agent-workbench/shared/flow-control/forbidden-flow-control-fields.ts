/**
 * Flow-control forbidden fields: 纯常量和纯检测函数。
 */

export const FORBIDDEN_FLOW_CONTROL_FIELDS: readonly string[] = [
  "nextAction",
  "recommendedAction",
  "suggestedAction",
  "fallbackAction",
  "continuation",
  "recovery",
  "forcedTool",
  "forcedNextTool",
  "autoNextTool",
  "preferredNextStep",
  "shouldUseWhen",
  "workflowSteps",
  "nextStage",
  "finalizeAnswer",
  "recommendedState",
  "fallbackIfNoHits",
  "allowedNext",
  "materializesTo",
  "autoRoute",
] as const;

const FIELD_SET = new Set<string>(FORBIDDEN_FLOW_CONTROL_FIELDS);

export const AUTO_ACTION_PATTERN = /AUTO_.*ACTION/i;

export function isForbiddenFlowControlField(key: string): boolean {
  return FIELD_SET.has(key) || AUTO_ACTION_PATTERN.test(key);
}
