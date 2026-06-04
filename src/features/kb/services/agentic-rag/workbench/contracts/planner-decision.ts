import { assertNoFlowControlFields, isForbiddenFlowControlField } from "../guards/flow-control-guard";

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
  toolName: "final_answer" | "answer";
  args: unknown;
  rationale?: string;
}

export interface PlannerStopDecision {
  type: "stop";
  reasonCode: PlannerStopReasonCode;
  rationale?: string;
}

export type PlannerStopReasonCode =
  | "user_canceled"
  | "internal_aborted";

const BLACKLIST_KEYS = [
  "path",
  "realPath",
  "realDocId",
  "realBlockId",
  "internalMapping",
] as const;

const ALLOWED_ANSWER_KEYS = new Set([
  "body",
  "references",
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

  // 归一化：兼容 { type:"answer", body:"..." }（args 层缺失）
  // 归一化：兼容 { type:"tool", toolName:"final_answer"/"answer" } → 归一化为 answer decision
  // 归一化：兼容 { type:"tool", toolName:"...", args:null } → args={}
  const normalized = normalizeDecision(d);

  if (normalized.type === "tool") return parseToolDecision(normalized);
  if (normalized.type === "answer") return parseAnswerDecision(normalized);
  if (normalized.type === "stop") return parseStopDecision(normalized);
  throw new Error(
    `[PlannerDecision] decision.type must be "tool" | "answer" | "stop" (got ${String(normalized.type)}).`,
  );
}

/**
 * 归一化 Planner 原始决策对象。
 * 所有归一化只针对 Planner 已显式输出的决策字段，不根据问题或证据自动选择下一步。
 */
function normalizeDecision(d: Record<string, unknown>): Record<string, unknown> {
  const type = d.type as string | undefined;

  // 兼容 { type:"tool", toolName:"final_answer"/"answer" } → 归一化为 answer
  if (type === "tool") {
    const toolName = d.toolName as string | undefined;
    if (toolName === "final_answer" || toolName === "answer") {
      return {
        ...d,
        type: "answer",
        toolName: "final_answer",
        args: d.args ?? {},
      };
    }
    // 兼容 args:null → args={}
    if (d.args === null || d.args === undefined) {
      return { ...d, args: {} };
    }
  }

  // 兼容 { type:"answer", args:null } → args={}
  if (type === "answer" && (d.args === null || d.args === undefined)) {
    return { ...d, args: {} };
  }

  return d;
}

function parseToolDecision(d: Record<string, unknown>): PlannerToolDecision {
  if (typeof d.toolName !== "string" || !d.toolName) {
    throw new Error(`[PlannerDecision] tool decision requires a non-empty toolName.`);
  }
  if (d.toolName === "final_answer" || d.toolName === "answer") {
    throw new Error(
      `[PlannerDecision] toolName "${d.toolName}" must use decision.type "answer", not "tool".`,
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
  if (d.toolName !== undefined) {
    if (typeof d.toolName !== "string") {
      throw new Error(`[PlannerDecision] answer decision toolName must be a string.`);
    }
    if (d.toolName !== "final_answer" && d.toolName !== "answer") {
      throw new Error(
        `[PlannerDecision] answer decision toolName must be "final_answer" (got "${d.toolName}").`,
      );
    }
  }

  // 兼容 args 层缺失时，从顶层提取 body/references
  const rawArgs = d.args && typeof d.args === "object"
    ? d.args
    : {
        body: d.body,
        references: d.references,
      };

  assertAnswerArgsShape(rawArgs);
  return {
    type: "answer",
    toolName: "final_answer",
    args: rawArgs,
    rationale: typeof d.rationale === "string" ? d.rationale : undefined,
  };
}

function parseStopDecision(d: Record<string, unknown>): PlannerStopDecision {
  const reasonCode = d.reasonCode as PlannerStopReasonCode;
  if (
    reasonCode !== "user_canceled" &&
    reasonCode !== "internal_aborted"
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
  if (args == null || typeof args !== "object") {
    throw new Error(`[PlannerDecision] answer args must be an object with body.`);
  }
  const obj = args as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) {
    throw new Error(
      `[PlannerDecision] answer args.body must be a non-empty string.`,
    );
  }
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_ANSWER_KEYS.has(key)) {
      throw new Error(
        `[PlannerDecision] answer args contains key "${key}" not in whitelist.`,
      );
    }
  }
  if ("references" in obj && !Array.isArray(obj.references)) {
    throw new Error(
      `[PlannerDecision] answer args.references must be an array.`,
    );
  }
  assertNoBlacklistKeysRecursive(obj, "answer args");
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
          `Planner must not carry flow-control hints / forbidden flow-control / real-ID key.`,
      );
    }
  }
}
