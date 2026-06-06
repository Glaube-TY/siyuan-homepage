/**
 * Composition root: Agent Workbench runtime.
 * Uses per-turn registries with no global state between turns.
 */

import { ObservationLog } from "./observation-log";
import { SkillRegistry } from "../registries/skill-registry";
import { ToolRegistry } from "../registries/tool-registry";
import { createFinalAnswerTool } from "../tools/system/final-answer.tool";
import {
  createListKnowledgeMapTool,
  type ListKnowledgeMapDeps,
} from "../tools/siyuan/list-knowledge-map.tool";
import {
  createSearchScopeTool,
  type SearchScopeDeps,
} from "../tools/siyuan/search-scope.tool";
import {
  createReadDocsTool,
  type ReadDocsDeps,
} from "../tools/siyuan/read-docs.tool";
import {
  createGetDailyWorkspaceOverviewTool,
  type GetDailyWorkspaceOverviewDeps,
} from "../tools/siyuan/get-daily-workspace-overview.tool";
import {
  createQueryTasksTool,
  type QueryTasksDeps,
} from "../tools/siyuan/query-tasks.tool";
import {
  createQueryDiaryRecordsTool,
  type QueryDiaryRecordsDeps,
} from "../tools/siyuan/query-diary-records.tool";
import {
  createFindDiaryDocsTool,
  type FindDiaryDocsDeps,
} from "../tools/siyuan/find-diary-docs.tool";
import { createKnowledgeBaseQaSkill } from "../skills/builtin/knowledge-base-qa.skill";
import { createScheduleTaskDiarySkill } from "../skills/builtin/schedule-task-diary.skill";

// Tool execution implementations — independent of Skill directory
import type { SiyuanToolDeps } from "../tools/siyuan/siyuan-tool-deps";
import { executeListKnowledgeMap } from "../tools/siyuan/impl/list-knowledge-map.impl";
import { executeSearchScope } from "../tools/siyuan/impl/search-scope.impl";
import { executeReadDocs } from "../tools/siyuan/impl/read-docs.impl";
import { executeGetDailyWorkspaceOverview } from "../tools/siyuan/impl/get-daily-workspace-overview.impl";
import { executeQueryTasks } from "../tools/siyuan/impl/query-tasks.impl";
import { executeQueryDiaryRecords } from "../tools/siyuan/impl/query-diary-records.impl";
import { executeFindDiaryDocs } from "../tools/siyuan/impl/find-diary-docs.impl";

// User skill loader (uses new agent-workbench contracts directly)
import { MarkdownSkillLoader } from "../skills/user/markdown-skill-loader";
import type { UserSkillStorageAdapter, UserSkillLoadDiagnostic } from "../skills/user/user-skill-loader-types";
import {
  loadUserSkillIndex,
  loadUserSkillMarkdownByFilename,
} from "../storage/user-skill-store";

// Schema sanity — dev-mode only guard
import { runSchemaSanity } from "../debug/schema-sanity";
// Single debug entry point
import { setupAgentDebug } from "../debug/workbench-debug";

export interface AgentWorkbenchRuntime {
  skillRegistry: SkillRegistry;
  toolRegistry: ToolRegistry;
  observationLog: ObservationLog;
}

export interface AgentWorkbenchRuntimeOptions {
  kbRetrievalToolDeps?: SiyuanToolDeps;
}

function createSiyuanToolDeps(deps: SiyuanToolDeps) {
  const lkmDeps: ListKnowledgeMapDeps = {
    executeListKnowledgeMap: (args) => executeListKnowledgeMap(deps, args),
  };
  const searchDeps: SearchScopeDeps = {
    executeSearchScope: (args) => executeSearchScope(deps, args),
  };
  const readDeps: ReadDocsDeps = {
    executeReadDocs: (args) => executeReadDocs(deps, args),
  };
  const overviewDeps: GetDailyWorkspaceOverviewDeps = {
    executeGetDailyWorkspaceOverview: (args) => executeGetDailyWorkspaceOverview(deps, args),
  };
  const taskDeps: QueryTasksDeps = {
    executeQueryTasks: (args) => executeQueryTasks(deps, args),
  };
  const recordDeps: QueryDiaryRecordsDeps = {
    executeQueryDiaryRecords: (args) => executeQueryDiaryRecords(deps, args),
  };
  const diaryDocDeps: FindDiaryDocsDeps = {
    executeFindDiaryDocs: (args) => executeFindDiaryDocs(deps, args),
  };
  return { lkmDeps, searchDeps, readDeps, overviewDeps, taskDeps, recordDeps, diaryDocDeps };
}

export function createAgentWorkbenchRuntime(
  options: AgentWorkbenchRuntimeOptions = {},
): AgentWorkbenchRuntime {
  // Per-turn registries, no global state.
  const skillRegistry = new SkillRegistry();
  const toolRegistry = new ToolRegistry();

  // Register built-in skill
  skillRegistry.ensureSkill(createKnowledgeBaseQaSkill(), "builtin");
  skillRegistry.ensureSkill(createScheduleTaskDiarySkill(), "builtin");

  // Register final_answer (plannerVisible: false — not in tool manifest)
  toolRegistry.ensureTool(createFinalAnswerTool());

  // Register siyuan tools
  if (options.kbRetrievalToolDeps) {
    const {
      lkmDeps,
      searchDeps,
      readDeps,
      overviewDeps,
      taskDeps,
      recordDeps,
      diaryDocDeps,
    } = createSiyuanToolDeps(options.kbRetrievalToolDeps);
    toolRegistry.ensureTool(createListKnowledgeMapTool(lkmDeps));
    toolRegistry.ensureTool(createSearchScopeTool(searchDeps));
    toolRegistry.ensureTool(createReadDocsTool(readDeps));
    toolRegistry.ensureTool(createGetDailyWorkspaceOverviewTool(overviewDeps));
    toolRegistry.ensureTool(createQueryTasksTool(taskDeps));
    toolRegistry.ensureTool(createQueryDiaryRecordsTool(recordDeps));
    toolRegistry.ensureTool(createFindDiaryDocsTool(diaryDocDeps));
  }

  // Single debug entry point — no console output by default
  setupAgentDebug();

  // Dev-mode schema sanity — stores to debug sink, accessed via __kbAgentDebug("all")
  if (isDevEnv()) {
    const dummyCtx = { question: "", callCounts: {} };
    runSchemaSanity(toolRegistry.getPlannerManifest(dummyCtx));
  }

  return {
    skillRegistry,
    toolRegistry,
    observationLog: new ObservationLog(),
  };
}

/** Load and register user markdown skills into a per-turn SkillRegistry. */
export async function refreshUserSkills(
  skillRegistry: SkillRegistry,
): Promise<{ registered: number; diagnostics: UserSkillLoadDiagnostic[] }> {
  const adapter: UserSkillStorageAdapter = {
    async loadIndex() { return loadUserSkillIndex(); },
    async loadMarkdownByFilename(filename: string) { return loadUserSkillMarkdownByFilename(filename); },
  };
  const loader = new MarkdownSkillLoader(adapter);
  const { skills, diagnostics } = await loader.loadSkillsWithDiagnostics();

  const result = skillRegistry.replaceSkillsBySource("user", skills);
  if (result.ok === false) {
    diagnostics.push({
      entryId: "", filename: "", level: "error", code: "REPLACE_FAILED",
      message: "Failed to replace user skills.",
    });
    return { registered: 0, diagnostics };
  }
  return { registered: result.replaced, diagnostics };
}

function isDevEnv(): boolean {
  try {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } }).env;
    return env?.DEV === true || env?.MODE === "development";
  } catch {
    return false;
  }
}
