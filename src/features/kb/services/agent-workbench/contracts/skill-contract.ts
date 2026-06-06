/**
 * Skill Contract — Skill is a Chinese capability manual.
 * It does NOT own tools, bind tools, or decide tool sequences.
 */

export interface SkillRuntimeContext {
  question: string;
  toolManifest: readonly import("./tool-contract").ToolManifest[];
  enabledSkillNames: readonly string[];
  observations: readonly SkillObservation[];
  userEnabledSkillNames?: readonly string[];
  userDisabledSkillNames?: readonly string[];
}

export interface SkillObservation {
  kind:
    | "tool_executed"
    | "tool_failed"
    | "tool_zero_hits"
    | "tool_observation"
    | "turn_started"
    | "turn_finished"
    | "skill_observation"
    | "planner_returned_no_action";
  toolName?: string;
  reasonCode?: string;
  /** One-line summary for UI/trace (not rendered in Planner prompt) */
  summary?: string;
  /** Structured JSON data for Planner — tools define their own shape */
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
  /** Build the prompt section injected into planner context */
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
