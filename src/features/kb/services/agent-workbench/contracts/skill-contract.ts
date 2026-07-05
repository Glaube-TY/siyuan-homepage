/**
 * Skill Contract
 *
 * A skill is an instruction package for domain boundaries, terminology,
 * evidence rules, and general answer preferences.
 *
 * A skill must not own tools, execute code, select tools for the model,
 * prescribe tool order, or force a fixed runtime flow.
 */

import type { ToolManifest } from "./tool-contract";

export interface SkillRuntimeContext {
  question: string;
  toolManifest: readonly ToolManifest[];
  enabledSkillNames: readonly string[];
  observations: readonly SkillContextEvidence[];
  userEnabledSkillNames?: readonly string[];
  userDisabledSkillNames?: readonly string[];
}

export interface SkillContextEvidence {
  kind:
    | "tool_executed"
    | "tool_failed"
    | "tool_zero_hits"
    | "tool_observation"
    | "turn_started"
    | "turn_finished"
    | "skill_observation";
  toolName?: string;
  reasonCode?: string;
  /** One-line summary for UI/trace (not rendered in agent prompt) */
  summary?: string;
  /** Structured data for agent context; tools define their own shape */
  content?: unknown;
}

export interface SkillPromptSection {
  title: string;
  body: string;
  priority: number;
  meta?: {
    skillName: string;
    bytesEstimate: number;
  };
}

export interface SkillContract {
  name: string;
  title: string;
  description: string;
  priority: number;
  enabledByDefault: boolean;
  /** Concise usage rules for the model. */
  usageRules?: readonly string[];
  /** Example tasks (natural language). */
  examples?: readonly string[];
  /** Instructions for testing this skill. */
  testInstructions?: readonly string[];
  /** Build the prompt section injected into agent context */
  buildPromptSection(ctx: SkillRuntimeContext): SkillPromptSection;
}

export function isSkillContractLike(value: unknown): value is SkillContract {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.title === "string" &&
    typeof v.description === "string" &&
    typeof v.priority === "number" &&
    typeof v.enabledByDefault === "boolean" &&
    typeof v.buildPromptSection === "function"
  );
}
