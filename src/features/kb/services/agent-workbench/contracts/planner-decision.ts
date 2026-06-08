/**
 * Planner decision types: only tool / answer / stop.
 */

import { z } from "zod";
import { isForbiddenFlowControlField } from "../shared/flow-control";

export const plannerDecisionZodSchema = z.union([
  z.object({
    type: z.literal("tool"),
    toolName: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
  }).strict(),
  z.object({
    type: z.literal("answer"),
    args: z.object({
      body: z.string().min(1).max(2000),
      references: z.array(z.object({
        sourceType: z.enum(["siyuan_doc", "web_page", "file", "mcp_resource", "api_result"]).optional(),
        docId: z.string().optional(),
        blockId: z.string().optional(),
        url: z.string().optional(),
        fileId: z.string().optional(),
        resourceId: z.string().optional(),
        title: z.string().optional(),
        sourceName: z.string().optional(),
        provider: z.string().optional(),
      }).strict()).optional().default([]),
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
    references?: AnswerResourceRef[];
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
  "path",
  "realPath",
  "realDocId",
  "realBlockId",
  "internalMapping",
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

export function validatePlannerDecision(decision: unknown): PlannerDecision {
  if (!decision || typeof decision !== "object") {
    throw new Error(
      `decision must be a JSON object, got ${typeof decision}.`,
    );
  }
  assertNoBlacklistKeysRecursive(decision, "decision");

  const d = decision as { type?: unknown } & Record<string, unknown>;

  if (d.type === "tool") {
    assertAllowedTopLevelKeys(d, TOOL_DECISION_KEYS, "tool decision");
    return parseToolDecision(d);
  }
  if (d.type === "answer") {
    assertAllowedTopLevelKeys(d, ANSWER_DECISION_KEYS, "answer decision");
    return parseAnswerDecision(d);
  }
  if (d.type === "stop") {
    assertAllowedTopLevelKeys(d, STOP_DECISION_KEYS, "stop decision");
    return parseStopDecision(d);
  }
  throw new Error(
    `decision.type must be "tool" | "answer" | "stop" (got ${String(d.type)}).`,
  );
}

function assertAllowedTopLevelKeys(
  decision: Record<string, unknown>,
  allowedKeys: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(decision)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} contains key "${key}" not in whitelist.`);
    }
  }
}

function parseToolDecision(d: Record<string, unknown>): PlannerToolDecision {
  if (typeof d.toolName !== "string" || !d.toolName) {
    throw new Error(`tool decision requires a non-empty toolName.`);
  }
  if (d.toolName === "final_answer" || d.toolName === "answer") {
    throw new Error(
      `toolName "${d.toolName}" must use decision.type "answer".`,
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
    throw new Error(
      `stop decision reasonCode invalid: ${String(reasonCode)}`,
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
    throw new Error(`${label} must be an object.`);
  }
}

function assertAnswerArgsShape(args: unknown): void {
  if (args == null || typeof args !== "object") {
    throw new Error(`answer args must be an object with body.`);
  }
  const obj = args as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) {
    throw new Error(`answer args.body must be a non-empty string.`);
  }
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_ANSWER_KEYS.has(key)) {
      throw new Error(`answer args contains key "${key}" not in whitelist.`);
    }
  }
  if ("references" in obj) {
    if (!Array.isArray(obj.references)) {
      throw new Error(`answer args.references must be an array.`);
    }
    assertValidReferences(obj.references);
  }
  if ("stageSummary" in obj) {
    assertValidStageSummary(obj.stageSummary);
  }
}

function assertValidStageSummary(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`answer args.stageSummary must be an object.`);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.some((key) => key !== "summary")) {
    throw new Error(`answer args.stageSummary contains key not in whitelist.`);
  }
  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    throw new Error(`answer args.stageSummary.summary must be a non-empty string.`);
  }
  if (obj.summary.length > 1500) {
    throw new Error(`answer args.stageSummary.summary must be at most 1500 characters.`);
  }
}

const ALLOWED_REF_SOURCE_TYPES = new Set([
  "siyuan_doc", "web_page", "file", "mcp_resource", "api_result",
]);

const ALLOWED_REF_KEYS = new Set([
  "sourceType", "docId", "blockId", "url", "fileId", "resourceId", "title", "sourceName", "provider",
]);

function assertValidReferences(refs: unknown[]): void {
  for (let i = 0; i < refs.length; i += 1) {
    const ref = refs[i];
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
      throw new Error(`answer args.references[${i}] must be a plain object.`);
    }
    const r = ref as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (!ALLOWED_REF_KEYS.has(key)) {
        throw new Error(`answer args.references[${i}] contains key "${key}" not in whitelist.`);
      }
    }
    if (r.sourceType !== undefined && !ALLOWED_REF_SOURCE_TYPES.has(r.sourceType as string)) {
      throw new Error(`answer args.references[${i}].sourceType invalid: ${String(r.sourceType)}`);
    }
    for (const strKey of ["docId", "blockId", "url", "fileId", "resourceId", "title", "sourceName", "provider"] as const) {
      const val = r[strKey];
      if (val !== undefined && typeof val !== "string") {
        throw new Error(`answer args.references[${i}].${strKey} must be a string.`);
      }
    }
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
      if (FORBIDDEN_DECISION_KEY_SET.has(key) || isForbiddenFlowControlField(key)) {
        throw new Error(`${path} contains forbidden key "${key}".`);
      }
      assertNoBlacklistKeysRecursive(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
  }
}
