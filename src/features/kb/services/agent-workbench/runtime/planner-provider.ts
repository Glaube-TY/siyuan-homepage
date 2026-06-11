/**
 * PlannerProvider — thin abstraction for model decision.
 *
 * AgentLoop depends on this interface rather than a raw decideNextStep function.
 * Current implementation: PromptJsonPlannerProvider (JSON-in-prompt).
 * Future: provider-native tool-call provider — the seam types below enable this.
 */

import type { PlannerContext } from "./planner-context-builder";
import { renderPlannerPrompt } from "./prompt-renderer";
import type { PlannerDecision } from "../contracts/planner-decision";

/* ────────────────────────────────────────────────────────────────── */
/*  Future provider-native tool-call seam types                       */
/*  NOT used by PromptJsonPlannerProvider. These exist so that a       */
/*  future NativeToolCallPlannerProvider can be added without          */
/*  changing AgentLoop or ToolManifest.                                */
/* ────────────────────────────────────────────────────────────────── */

/** Provider mode — transitional: only prompt_json is currently active */
export type PlannerProviderMode = "prompt_json" | "native_tool_call";

/** Tool schema in provider-native format.
 *  `parametersJsonSchema` is a JSON-compatible JSON Schema object — NOT a Zod schema.
 *  It expresses the tool's parameter contract as a JSON Schema object
 *  (type, properties, required, additionalProperties, etc.). */
export interface PlannerProviderToolSchema {
  name: string;
  description: string;
  parametersJsonSchema: unknown;
}

/** A message in the provider conversation */
export interface PlannerProviderMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: PlannerProviderToolCall[];
}

/** A single tool call within a provider response */
export interface PlannerProviderToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** Provider decision result — must normalize to the project's PlannerDecision protocol.
 *  Future native tool-call providers shall de-serialize model output into
 *  the same tool/answer/stop shape that AgentLoop already expects.
 *  Do NOT introduce a second answer/tool protocol. */
export type PlannerProviderDecisionResult = PlannerDecision;
/* ────────────────────────────────────────────────────────────────── */

/**
 * Input to the planner provider — structured context, not a raw string.
 */
export interface PlannerProviderInput {
  context: PlannerContext;
  abortSignal?: AbortSignal;
}

/**
 * Planner provider interface.
 * `decide` returns a raw decision object — AgentLoop validates it.
 */
export interface PlannerProvider {
  /** Provider mode — helps consumers know which path is active */
  readonly mode: PlannerProviderMode;
  decide(input: PlannerProviderInput): Promise<unknown>;
}

/**
 * Prompt JSON planner provider — current implementation.
 *
 * Internally renders the PlannerContext to a prompt string via renderPlannerPrompt,
 * then sends it to the LLM. The LLM returns a raw JSON object; AgentLoop validates
 * it as a PlannerDecision.
 *
 * This is the transitional implementation. When models support native tool calling,
 * a NativeToolCallPlannerProvider can replace this — implementing the same
 * PlannerProvider interface but using input.context.toolManifest as JSON Schema
 * and input.context.observations as tool messages.
 */
export class PromptJsonPlannerProvider implements PlannerProvider {
  readonly mode = "prompt_json" as const;

  constructor(
    private readonly callLlm: (prompt: string, opts: { abortSignal?: AbortSignal }) => Promise<unknown>,
  ) {}

  async decide(input: PlannerProviderInput): Promise<unknown> {
    const prompt = renderPlannerPrompt(input.context);
    return this.callLlm(prompt, { abortSignal: input.abortSignal });
  }
}
