/**
 * Composition root: agentic-rag workbench.
 */

import { BudgetGuard } from "./workbench/runtime/budget-guard";
import { ObservationStore } from "./workbench/runtime/observation-store";
import { getGlobalSkillRegistry } from "./workbench/registries/skill-registry";
import { getGlobalToolRegistry } from "./workbench/registries/tool-registry";
import {
  registerBuiltinKbRetrievalSkill,
  registerBuiltinKbRetrievalTools,
} from "./skills/builtin/kb-retrieval/register";
import type { KbRetrievalToolDeps } from "./skills/builtin/kb-retrieval/adapters/kb-retrieval-tool-deps";
import { registerSystemAnswerTool } from "./skills/system/answer/register";

export interface AgenticRagWorkbench {
  skillRegistry: ReturnType<typeof getGlobalSkillRegistry>;
  toolRegistry: ReturnType<typeof getGlobalToolRegistry>;
  budgetGuard: BudgetGuard;
  observationStore: ObservationStore;
}

export interface AgenticRagWorkbenchOptions {
  kbRetrievalToolDeps?: KbRetrievalToolDeps;
}

export function createAgenticRagWorkbench(
  options: AgenticRagWorkbenchOptions = {},
): AgenticRagWorkbench {
  const skillRegistry = getGlobalSkillRegistry();
  registerBuiltinKbRetrievalSkill(skillRegistry);
  const toolRegistry = getGlobalToolRegistry();
  if (options.kbRetrievalToolDeps) {
    registerBuiltinKbRetrievalTools(toolRegistry, options.kbRetrievalToolDeps);
  }
  registerSystemAnswerTool(toolRegistry);
  return {
    skillRegistry,
    toolRegistry,
    budgetGuard: new BudgetGuard(),
    observationStore: new ObservationStore(),
  };
}
