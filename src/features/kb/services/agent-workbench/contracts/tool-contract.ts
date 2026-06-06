/**
 * Thin ToolContract — a tool is a global independent capability.
 *
 * ToolExecutor is the SINGLE observation envelope generator.
 * Tools only execute and return structured ToolResult.
 * summarizeResult is optional — for UI/trace summary only.
 */

export interface ToolSafetyInfo {
  readOnly: boolean;
  canWrite?: boolean;
  requiresConfirmation?: boolean;
  permissionScope?: string;
}

export type ToolSource = "builtin" | "system" | "mcp" | "api" | "local";

export type ToolUnavailableReason =
  | "tool_not_registered"
  | "permission_denied"
  | "prerequisite_missing";

export interface ToolAvailability {
  available: boolean;
  reasonCode?: ToolUnavailableReason;
  hint?: string;
}

/** Tool execution result — raw data from the tool */
export interface ToolResult<TData = unknown> {
  ok: boolean;
  data: TData | null;
  error?: ToolErrorDetail;
}

/** Structured error detail — ToolExecutor builds the JSON error envelope from this */
export interface ToolErrorDetail {
  code: string;
  message: string;
  recoverable?: boolean;
  field?: string;
  expected?: string;
  received?: string;
  hint?: string;
  /** Additional structured details (e.g. zod issues, docIds, blockIds) */
  details?: unknown;
}

/**
 * Tool observation — JSON envelope for Planner.
 * Built by ToolExecutor, NOT by tools.
 *
 * Success: { ok: true, toolName, data: result.data }
 * Failure: { ok: false, toolName, error: { code, message, ... } }
 *
 * `summary` is for UI/trace only — never enters the Planner prompt data.
 */
export interface ToolObservation {
  toolName: string;
  ok: boolean;
  /** One-line summary for UI/trace only */
  summary: string;
  /** Arbitrary JSON data for Planner — comes from result.data */
  content?: unknown;
}

/** Tool runtime context — minimal facts only */
export interface ToolRuntimeContext {
  question: string;
  callCounts: Record<string, number>;
}

/** Tool contract — thin interface */
export interface ToolContract<TArgs = unknown, TResult = unknown> {
  name: string;
  title: string;
  description: string;
  inputSchema: import("zod").ZodSchema<TArgs>;
  outputSchema?: import("zod").ZodSchema<TResult>;
  readOnly: boolean;
  safety: ToolSafetyInfo;
  source: ToolSource;
  inputHint?: string;
  boundary?: string;
  plannerVisible: boolean;

  /** Hard availability check only — no business judgment */
  availability(ctx: ToolRuntimeContext): ToolAvailability;

  /** Execute the tool — return raw structured result */
  execute(ctx: ToolRuntimeContext, args: TArgs): Promise<ToolResult<TResult>>;

  /**
   * Optional: produce a UI/trace summary line.
   * NOT used to construct Planner-visible data. ToolExecutor uses result.data
   * directly. If absent, ToolExecutor generates a generic summary.
   */
  summarizeResult?(result: ToolResult<TResult>, ctx: ToolRuntimeContext): string;

  /**
   * Optional: explicit JSON Schema override for planner-visible tool manifest.
   * When present, this is used directly as inputJsonSchema, bypassing auto-conversion
   * from inputSchema. Use this when Zod preprocess/refine cannot express the full
   * parameter contract (e.g. mutual exclusion, oneOf constraints).
   */
  inputJsonSchemaOverride?: unknown;
}

/** Planner-visible tool manifest (no execute/summarize — JSON-compatible only) */
export interface ToolManifest {
  name: string;
  title: string;
  description: string;
  /** Machine-readable JSON Schema for planner. Omitted if conversion fails. */
  inputJsonSchema?: unknown;
  inputHint?: string;
  readOnly: boolean;
  safety: ToolSafetyInfo;
  source: ToolSource;
  boundary?: string;
  availability: ToolAvailability;
}
