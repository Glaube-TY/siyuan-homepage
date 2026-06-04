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
import { registerFinalAnswerTool } from "./skills/system/answer/register";
import { registerSystemContextTools } from "./skills/system/context";
import { registerProgressAnswerTool } from "./skills/system/progress-answer/register";
import { registerUserMarkdownSkills } from "./skills/user";
import type { UserSkillStorageAdapter } from "./shared/user-skill/user-skill-loader-types";
import {
  loadUserSkillIndex,
  loadUserSkillMarkdownByFilename,
} from "./storage/user-skill-store";
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
    registerSystemContextTools(toolRegistry, options.kbRetrievalToolDeps);
  }
  registerFinalAnswerTool(toolRegistry);
  registerProgressAnswerTool(toolRegistry);
  return {
    skillRegistry,
    toolRegistry,
    budgetGuard: new BudgetGuard(),
    observationStore: new ObservationStore(),
  };
}

/**
 * 加载并注册用户 markdown skills。
 * 应在应用启动时调用一次；后续用户修改 skill 后可再次调用以刷新。
 * diagnostics 返回给设置 UI，不进入 Planner observation。
 */
export async function refreshUserSkills(
  skillRegistry: ReturnType<typeof getGlobalSkillRegistry>,
): Promise<{ registered: number; diagnostics: import("./skills/user/register-user-markdown-skills").RegisterUserSkillsResult["diagnostics"] }> {
  const adapter: UserSkillStorageAdapter = {
    async loadIndex() { return loadUserSkillIndex(); },
    async loadMarkdownByFilename(filename: string) { return loadUserSkillMarkdownByFilename(filename); },
  };
  const result = await registerUserMarkdownSkills(skillRegistry, adapter);
  return result;
}
