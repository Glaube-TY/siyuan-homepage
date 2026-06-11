/**
 * Planner decision types: only tool / answer / stop.
 */

import { z } from "zod";
import { isForbiddenFlowControlField } from "../shared/flow-control";

/**
 * 一次性 Planner 决策验证错误。
 * code 区分格式错误（可 repair）和安全边界错误（必须 fail closed）。
 */
export class PlannerDecisionValidationError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_shape" | "invalid_answer_shape" | "invalid_stop_shape" | "forbidden_field" | "forbidden_flow_control" | "unknown_tool",
  ) {
    super(message);
    this.name = "PlannerDecisionValidationError";
  }
}

export const plannerDecisionZodSchema = z.union([
  z.object({
    type: z.literal("tool"),
    toolName: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
  }).strict(),
  z.object({
    type: z.literal("answer"),
    args: z.object({
      body: z.string().min(1).max(20000),
      references: z.array(z.unknown()).optional().default([]),
      stageSummary: z.object({
        summary: z.string().trim().min(1).max(1500),
      }).strict().optional(),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal("stop"),
    reasonCode: z.enum(["user_canceled", "internal_aborted", "need_clarification", "cannot_continue"]),
    message: z.string().optional(),
  }).strict(),
]);

export type PlannerDecision =
  | PlannerToolDecision
  | PlannerAnswerDecision
  | PlannerStopDecision;

export interface PlannerToolDecision {
  type: "tool";
  toolName: string;
  args: Record<string, unknown>;
}

export interface PlannerAnswerDecision {
  type: "answer";
  args: {
    body: string;
    references?: unknown[];
    stageSummary?: AnswerStageSummary;
  };
}

export interface AnswerStageSummary {
  summary: string;
}

export interface PlannerStopDecision {
  type: "stop";
  reasonCode: PlannerStopReasonCode;
  message?: string;
}

export type PlannerStopReasonCode =
  | "user_canceled"
  | "internal_aborted"
  | "need_clarification"
  | "cannot_continue";

export interface AnswerResourceRef {
  sourceType?: "siyuan_doc" | "web_page" | "file" | "mcp_resource" | "api_result";
  docId?: string;
  blockId?: string;
  url?: string;
  fileId?: string;
  resourceId?: string;
  title?: string;
  sourceName?: string;
  provider?: string;
}

const TOOL_DECISION_KEYS = new Set(["type", "toolName", "args"]);
const ANSWER_DECISION_KEYS = new Set(["type", "args"]);
const STOP_DECISION_KEYS = new Set(["type", "reasonCode", "message"]);
const ALLOWED_ANSWER_KEYS = new Set(["body", "references", "stageSummary"]);

const FORBIDDEN_DECISION_KEYS = [
  "realPath",
  "realDocId",
  "realBlockId",
  "internalMapping",
  "internalPath",
  "progress",
  "progress_answer",
  "AssistantProgress",
  "maxSteps",
  "budget",
  "remainingStep",
  "remainingSteps",
  "dedup",
  "rationale",
  "usedReferenceHandles",
  "workspaceSummary",
] as const;

const FORBIDDEN_DECISION_KEY_SET = new Set<string>(FORBIDDEN_DECISION_KEYS);

export function validatePlannerDecision(
  decision: unknown,
  toolManifest?: readonly { name: string; inputJsonSchema?: unknown }[],
): PlannerDecision {
  if (!decision || typeof decision !== "object") {
    throw new PlannerDecisionValidationError(
      `decision must be a JSON object, got ${typeof decision}.`,
      "invalid_shape",
    );
  }

  const d = decision as { type?: unknown } & Record<string, unknown>;

  if (d.type === "tool") {
    assertAllowedTopLevelKeys(d, TOOL_DECISION_KEYS, "tool decision");

    const toolName = typeof d.toolName === "string" ? d.toolName : "";
    const schema = toolManifest?.find((t) => t.name === toolName)?.inputJsonSchema as
      | { properties?: Record<string, unknown> }
      | undefined;
    const allowedArgsKeys = schema?.properties
      ? new Set(Object.keys(schema.properties))
      : new Set<string>();

    assertNoBlacklistKeysRecursiveForToolDecision(d, allowedArgsKeys);
    return parseToolDecision(d);
  }

  assertNoBlacklistKeysRecursive(decision, "decision");

  if (d.type === "answer") {
    assertAllowedTopLevelKeys(d, ANSWER_DECISION_KEYS, "answer decision");
    return parseAnswerDecision(d);
  }
  if (d.type === "stop") {
    assertAllowedTopLevelKeys(d, STOP_DECISION_KEYS, "stop decision");
    return parseStopDecision(d);
  }
  throw new PlannerDecisionValidationError(
    `decision.type must be "tool" | "answer" | "stop" (got ${String(d.type)}).`,
    "invalid_shape",
  );
}

function assertAllowedTopLevelKeys(
  decision: Record<string, unknown>,
  allowedKeys: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(decision)) {
    if (!allowedKeys.has(key)) {
      throw new PlannerDecisionValidationError(`${label} contains key "${key}" not in whitelist.`, "forbidden_field");
    }
  }
}

function parseToolDecision(d: Record<string, unknown>): PlannerToolDecision {
  if (typeof d.toolName !== "string" || !d.toolName) {
    throw new PlannerDecisionValidationError(`tool decision requires a non-empty toolName.`, "invalid_shape");
  }
  if (d.toolName === "final_answer" || d.toolName === "answer") {
    throw new PlannerDecisionValidationError(
      `toolName "${d.toolName}" must use decision.type "answer".`,
      "unknown_tool",
    );
  }
  assertPlainObjectArgs(d.args, "tool args");
  return {
    type: "tool",
    toolName: d.toolName,
    args: d.args as Record<string, unknown>,
  };
}

function parseAnswerDecision(d: Record<string, unknown>): PlannerAnswerDecision {
  assertAnswerArgsShape(d.args);
  return {
    type: "answer",
    args: d.args as PlannerAnswerDecision["args"],
  };
}

function parseStopDecision(d: Record<string, unknown>): PlannerStopDecision {
  const reasonCode = d.reasonCode as PlannerStopReasonCode;
  if (
    reasonCode !== "user_canceled" &&
    reasonCode !== "internal_aborted" &&
    reasonCode !== "need_clarification" &&
    reasonCode !== "cannot_continue"
  ) {
    throw new PlannerDecisionValidationError(
      `stop decision reasonCode invalid: ${String(reasonCode)}`,
      "invalid_stop_shape",
    );
  }
  return {
    type: "stop",
    reasonCode,
    message: typeof d.message === "string" ? d.message : undefined,
  };
}

function assertPlainObjectArgs(args: unknown, label: string): asserts args is Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new PlannerDecisionValidationError(`${label} must be an object.`, "invalid_shape");
  }
}

function assertAnswerArgsShape(args: unknown): void {
  if (args == null || typeof args !== "object") {
    throw new PlannerDecisionValidationError(`answer args must be an object with body.`, "invalid_answer_shape");
  }
  const obj = args as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) {
    throw new PlannerDecisionValidationError(`answer args.body must be a non-empty string.`, "invalid_answer_shape");
  }
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_ANSWER_KEYS.has(key)) {
      throw new PlannerDecisionValidationError(`answer args contains key "${key}" not in whitelist.`, "forbidden_field");
    }
  }
  if ("references" in obj) {
    if (!Array.isArray(obj.references)) {
      throw new PlannerDecisionValidationError(`answer args.references must be an array.`, "invalid_answer_shape");
    }
    // 不再对 references 条目做硬失败校验；
    // 无效条目会在 reference-collector / normalizeAnswerReferences 阶段被丢弃。
  }
  if ("stageSummary" in obj) {
    assertValidStageSummary(obj.stageSummary);
  }
}

function assertValidStageSummary(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlannerDecisionValidationError(`answer args.stageSummary must be an object.`, "invalid_answer_shape");
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.some((key) => key !== "summary")) {
    throw new PlannerDecisionValidationError(`answer args.stageSummary contains key not in whitelist.`, "forbidden_field");
  }
  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    throw new PlannerDecisionValidationError(`answer args.stageSummary.summary must be a non-empty string.`, "invalid_answer_shape");
  }
  if (obj.summary.length > 1500) {
    throw new PlannerDecisionValidationError(`answer args.stageSummary.summary must be at most 1500 characters.`, "invalid_answer_shape");
  }
}

function assertNoBlacklistKeysRecursive(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertNoBlacklistKeysRecursive(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (FORBIDDEN_DECISION_KEY_SET.has(key)) {
        throw new PlannerDecisionValidationError(`${path} contains forbidden key "${key}".`, "forbidden_field");
      }
      if (isForbiddenFlowControlField(key)) {
        throw new PlannerDecisionValidationError(`${path} contains forbidden key "${key}".`, "forbidden_flow_control");
      }
      assertNoBlacklistKeysRecursive(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
  }
}

function assertNoBlacklistKeysRecursiveForToolDecision(
  decision: Record<string, unknown>,
  allowedArgsKeys: Set<string>,
): void {
  for (const key of Object.keys(decision)) {
    if (key === "args") continue;
    if (FORBIDDEN_DECISION_KEY_SET.has(key)) {
      throw new PlannerDecisionValidationError(`decision contains forbidden key "${key}".`, "forbidden_field");
    }
    if (isForbiddenFlowControlField(key)) {
      throw new PlannerDecisionValidationError(`decision contains forbidden key "${key}".`, "forbidden_flow_control");
    }
  }

  const args = decision.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new PlannerDecisionValidationError(`tool args must be an object.`, "invalid_shape");
  }

  for (const key of Object.keys(args as Record<string, unknown>)) {
    if (!allowedArgsKeys.has(key)) {
      if (FORBIDDEN_DECISION_KEY_SET.has(key)) {
        throw new PlannerDecisionValidationError(`decision.args contains forbidden key "${key}".`, "forbidden_field");
      }
      if (isForbiddenFlowControlField(key)) {
        throw new PlannerDecisionValidationError(`decision.args contains forbidden key "${key}".`, "forbidden_flow_control");
      }
    }
    assertNoBlacklistKeysRecursive(
      (args as Record<string, unknown>)[key],
      `decision.args.${key}`,
    );
  }
}
