/**
 * Composition root: Agent Workbench runtime.
 * Uses per-turn registries with no global state between turns.
 *
 * This file only creates registries and calls composition modules.
 * All tool/skill factory + impl imports live in composition/ modules.
 */

import { ToolResultLog } from "./tool-result-log";
import { SkillRegistry } from "../registries/skill-registry";
import { ToolRegistry } from "../registries/tool-registry";
import type { SiyuanToolDeps } from "../tools/siyuan/siyuan-tool-deps";
import type { WebSearchProvider } from "../tools/web-search/web-search-provider";
import { registerBuiltinSkills, type BuiltinCapabilityAccess } from "../composition/register-builtin-skills";
import { registerSystemTools } from "../composition/register-system-tools";
import { registerSiyuanTools } from "../composition/register-siyuan-tools";
import { registerWebTools } from "../composition/register-web-tools";

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
  observationLog: ToolResultLog;
}

export type { BuiltinCapabilityAccess };

export interface AgentWorkbenchRuntimeOptions {
  kbRetrievalToolDeps?: SiyuanToolDeps;
  /** Optional: web search runtime deps. When present + mode smart/required, registers web_search. */
  webSearchToolDeps?: {
    getProvider(): WebSearchProvider;
    maxResults: number;
    timeoutMs: number;
  };
  /** Optional: web read page runtime deps. When present, registers global web_read_page. */
  webReadPageToolDeps?: {
    readProxyEndpoint?: string;
    readPageMaxChars: number;
    timeoutMs: number;
  };
  /** Built-in capability visibility from settings. Not a business controller — just composition-root gate. */
  builtinCapabilityAccess?: BuiltinCapabilityAccess;
  /** Global tool visibility from settings. Controls whether read_docs / web_read_page / edit_global_memory are registered. */
  globalToolAccess?: {
    readDocs: boolean;
    webReadPage: boolean;
    editGlobalMemory: boolean;
    getDocInfo: boolean;
  };
  /** Optional: global memory tool deps. When present, registers edit_global_memory. */
  globalMemoryToolDeps?: {
    docId: string;
    maxMemoryChars: number;
  };
  /** 当前对话标识，用于 confirmation store 等需要关联 conversation 的场景。 */
  conversationId?: string;
}

export function createAgentWorkbenchRuntime(
  options: AgentWorkbenchRuntimeOptions = {},
): AgentWorkbenchRuntime {
  // Per-turn registries, no global state.
  const skillRegistry = new SkillRegistry();
  const toolRegistry = new ToolRegistry();

  // Register built-in skills based on capability access (settings-level visibility gate)
  registerBuiltinSkills(skillRegistry, options.builtinCapabilityAccess);

  // Register system tools (edit_global_memory)
  registerSystemTools(toolRegistry, {
    globalMemoryToolDeps: options.globalMemoryToolDeps,
    globalToolAccess: options.globalToolAccess,
  });

  // Register Siyuan tools (knowledge base, diary, doc editing)
  if (options.kbRetrievalToolDeps) {
    registerSiyuanTools(toolRegistry, {
      kbRetrievalToolDeps: options.kbRetrievalToolDeps,
      conversationId: options.conversationId,
      builtinCapabilityAccess: options.builtinCapabilityAccess,
      globalToolAccess: options.globalToolAccess,
    });
  }

  // Register web tools (web_search, web_read_page)
  registerWebTools(toolRegistry, {
    webSearchToolDeps: options.webSearchToolDeps,
    webReadPageToolDeps: options.webReadPageToolDeps,
    globalToolAccess: options.globalToolAccess,
  });

  // Single debug entry point — no console output by default
  setupAgentDebug();

  // Dev-mode schema sanity — stores to debug sink, accessed via __kbAgentDebug("all")
  if (isDevEnv()) {
    const dummyCtx = { question: "", callCounts: {} };
    runSchemaSanity(toolRegistry.getToolManifest(dummyCtx));
  }

  return {
    skillRegistry,
    toolRegistry,
    observationLog: new ToolResultLog(),
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
