/**
 * PlannerContextBuilder — builds the planner context from registry + observations.
 */

import type { ToolRegistry } from "../registries/tool-registry";
import type { SkillRegistry } from "../registries/skill-registry";
import type { ToolManifest, ToolRuntimeContext } from "../contracts/tool-contract";
import type { SkillObservation, SkillPromptSection } from "../contracts/skill-contract";
import type { ObservationLog } from "./observation-log";
import type { ConversationContextSnapshot } from "./conversation-context-builder";

export interface PlannerContextInput {
  question: string;
  conversationContext?: ConversationContextSnapshot;
  userEnabledSkillNames: readonly string[];
  userDisabledSkillNames?: readonly string[];
  callCounts?: Record<string, number>;
  /** 全局记忆内容（已截断处理） */
  globalMemory?: string;
}

export interface PlannerContext {
  question: string;
  conversationContext?: ConversationContextSnapshot;
  toolManifest: ToolManifest[];
  skillSections: SkillPromptSection[];
  observations: SkillObservation[];
  /** 全局记忆内容（已截断处理） */
  globalMemory?: string;
}

export function buildPlannerContext(
  input: PlannerContextInput,
  options: {
    skillRegistry: SkillRegistry;
    toolRegistry: ToolRegistry;
    observationLog: ObservationLog;
  },
): PlannerContext {
  const toolCtx: ToolRuntimeContext = {
    question: input.question,
    callCounts: input.callCounts ?? {},
  };

  const toolManifest = options.toolRegistry.getPlannerManifest(toolCtx);

  const observations = options.observationLog.getPlannerObservations();

  const skillSections = options.skillRegistry.buildSkillPromptSections({
    question: input.question,
    toolManifest,
    enabledSkillNames: options.skillRegistry
      .getEnabledSkills({
        question: input.question,
        toolManifest,
        enabledSkillNames: [],
        observations,
        userEnabledSkillNames: input.userEnabledSkillNames,
        userDisabledSkillNames: input.userDisabledSkillNames,
      })
      .map((s) => s.name),
    observations,
    userEnabledSkillNames: input.userEnabledSkillNames,
    userDisabledSkillNames: input.userDisabledSkillNames,
  });

  return {
    question: input.question,
    conversationContext: input.conversationContext,
    toolManifest,
    skillSections,
    observations,
    globalMemory: input.globalMemory,
  };
}
