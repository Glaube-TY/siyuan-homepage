/**
 * PlannerDecision
 *
 * 决策校验。
 * - answer toolName 必须严格等于 "answer"。
 * - 不信任 LLM 返回的 decidedAt / stepIndex / observationsSnapshot。
 * - 递归检查流程控制字段和黑名单键。
 * - answer args 仅允许白名单字段。
 */

import { assertNoFlowControlFields, isForbiddenFlowControlField } from "../guards/flow-control-guard";
import { assertSafeDisplayedHandle } from "../evidence/evidence-pack";

export type PlannerDecision =
  | PlannerToolDecision
  | PlannerAnswerDecision
  | PlannerStopDecision;

export interface PlannerToolDecision {
  type: "tool";
  toolName: string;
  args: unknown;
  rationale?: string;
}

export interface PlannerAnswerDecision {
  type: "answer";
  toolName: "answer";
  args: unknown;
  rationale?: string;
}

export interface PlannerStopDecision {
  type: "stop";
  reasonCode: PlannerStopReasonCode;
  rationale?: string;
}

export type PlannerStopReasonCode =
  | "planner_declined_to_act"
  | "user_canceled"
  | "evidence_sufficient_to_stop"
  | "ambiguous_need_clarification";

const BLACKLIST_KEYS = [
  "evidenceDocIds",
  "evidenceBlockIds",
  "realDocId",
  "realBlockId",
  "docId",
  "blockId",
  "notebookId",
  "path",
  "realPath",
] as const;

const ALLOWED_ANSWER_KEYS = new Set([
  "body",
  "evidenceMode",
  "displayedReferenceHandles",
  "safeEvidenceHandles",
  "rationale",
  "confidence",
  "uncertainty",
]);

export function validatePlannerDecision(decision: unknown): PlannerDecision {
  if (!decision || typeof decision !== "object") {
    throw new Error(
      `[PlannerDecision] decision must be an object, got ${typeof decision}.`,
    );
  }
  assertNoForbiddenKeys(decision);
  assertNoFlowControlFields(decision, "decision");

  const d = decision as { type?: unknown } & Record<string, unknown>;
  if (d.type === "tool") return parseToolDecision(d);
  if (d.type === "answer") return parseAnswerDecision(d);
  if (d.type === "stop") return parseStopDecision(d);
  throw new Error(
    `[PlannerDecision] decision.type must be "tool" | "answer" | "stop" (got ${String(d.type)}).`,
  );
}

function parseToolDecision(d: Record<string, unknown>): PlannerToolDecision {
  if (typeof d.toolName !== "string" || !d.toolName) {
    throw new Error(`[PlannerDecision] tool decision requires a non-empty toolName.`);
  }
  if (d.toolName === "answer") {
    throw new Error(
      `[PlannerDecision] toolName "answer" must use decision.type "answer", not "tool".`,
    );
  }
  assertNoBlacklistKeysRecursive(d.args, "tool args");
  return {
    type: "tool",
    toolName: d.toolName,
    args: d.args,
    rationale: typeof d.rationale === "string" ? d.rationale : undefined,
  };
}

function parseAnswerDecision(d: Record<string, unknown>): PlannerAnswerDecision {
  if (typeof d.toolName !== "string") {
    throw new Error(`[PlannerDecision] answer decision requires toolName.`);
  }
  if (d.toolName !== "answer") {
    throw new Error(
      `[PlannerDecision] answer decision toolName must be "answer" (got "${d.toolName}").`,
    );
  }
  assertAnswerArgsShape(d.args);
  return {
    type: "answer",
    toolName: "answer",
    args: d.args,
    rationale: typeof d.rationale === "string" ? d.rationale : undefined,
  };
}

function parseStopDecision(d: Record<string, unknown>): PlannerStopDecision {
  const reasonCode = d.reasonCode as PlannerStopReasonCode;
  if (
    reasonCode !== "planner_declined_to_act" &&
    reasonCode !== "user_canceled" &&
    reasonCode !== "evidence_sufficient_to_stop" &&
    reasonCode !== "ambiguous_need_clarification"
  ) {
    throw new Error(
      `[PlannerDecision] stop decision reasonCode invalid: ${String(reasonCode)}`,
    );
  }
  return {
    type: "stop",
    reasonCode,
    rationale: typeof d.rationale === "string" ? d.rationale : undefined,
  };
}

function assertAnswerArgsShape(args: unknown): void {
  if (args == null) {
    throw new Error(`[PlannerDecision] answer args must be an object with body.`);
  }
  if (typeof args !== "object") {
    throw new Error(`[PlannerDecision] answer args must be an object.`);
  }
  const obj = args as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) {
    throw new Error(
      `[PlannerDecision] answer args.body must be a non-empty string.`,
    );
  }
  if (
    obj.evidenceMode !== "with_evidence" &&
    obj.evidenceMode !== "insufficient_evidence" &&
    obj.evidenceMode !== "without_kb_evidence"
  ) {
    throw new Error(
      `[PlannerDecision] answer args.evidenceMode must be one of ` +
        `with_evidence | insufficient_evidence | without_kb_evidence.`,
    );
  }

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_ANSWER_KEYS.has(key)) {
      throw new Error(
        `[PlannerDecision] answer args contains key "${key}" not in whitelist.`,
      );
    }
  }

  if (
    "displayedReferenceHandles" in obj &&
    !isStringArray(obj.displayedReferenceHandles)
  ) {
    throw new Error(
      `[PlannerDecision] answer args.displayedReferenceHandles must be string[].`,
    );
  }
  if (
    "safeEvidenceHandles" in obj &&
    !isStringArray(obj.safeEvidenceHandles)
  ) {
    throw new Error(
      `[PlannerDecision] answer args.safeEvidenceHandles must be string[].`,
    );
  }

  if (Array.isArray(obj.displayedReferenceHandles)) {
    for (let i = 0; i < obj.displayedReferenceHandles.length; i += 1) {
      assertSafeDisplayedHandle(obj.displayedReferenceHandles[i]);
    }
  }
  if (Array.isArray(obj.safeEvidenceHandles)) {
    for (let i = 0; i < obj.safeEvidenceHandles.length; i += 1) {
      assertSafeDisplayedHandle(obj.safeEvidenceHandles[i]);
    }
  }

  assertNoBlacklistKeysRecursive(obj, "answer args");
}

function isStringArray(v: unknown): v is string[] {
  if (!Array.isArray(v)) return false;
  for (const x of v) {
    if (typeof x !== "string") return false;
  }
  return true;
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
      if ((BLACKLIST_KEYS as readonly string[]).includes(key)) {
        throw new Error(
          `[PlannerDecision] ${path} contains forbidden key "${key}". ` +
            `Real IDs / paths are not exposed to Planner.`,
        );
      }
      assertNoBlacklistKeysRecursive(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
  }
}

function assertNoForbiddenKeys(decision: unknown): void {
  if (!decision || typeof decision !== "object") return;
  for (const key of Object.keys(decision)) {
    if (isForbiddenFlowControlField(key)) {
      throw new Error(
        `[PlannerDecision] decision contains forbidden key "${key}". ` +
          `Planner must not carry flow-control hints / finalizeAnswer / real IDs.`,
      );
    }
  }
}
