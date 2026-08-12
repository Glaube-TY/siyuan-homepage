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
import { registerSystemTools } from "../composition/register-system-tools";
import { registerSiyuanTools } from "../composition/register-siyuan-tools";
import { registerWebTools } from "../composition/register-web-tools";
import { registerLocalTools } from "../composition/register-local-tools";
import { registerExternalSkillTools } from "../composition/register-external-skill-tools";
import { registerMcpManagementTools } from "../composition/register-mcp-tools";
import { registerHomepageTools } from "../composition/register-homepage-tools";
import { registerHomepageComponentTools } from "../composition/register-homepage-component-tools";
import {
  DEFAULT_EXTERNAL_SKILL_SETTINGS,
  DEFAULT_MCP_SETTINGS,
} from "../../../constants/default-settings";
import type { ExternalSkillSettings, McpSettings, NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../types/settings";
import type { ConfirmationRoute } from "../../agent-core/permissions/confirmation-bridge";
import type { AvailableToolSnapshot } from "../tools/aggregate/agent-tool-help.tool";
import {
  agentProfileAllowsMemory,
  agentProfileAllowsTool,
  agentProfileAllowsToolAction,
  agentProfileHasCapability,
  type AgentProfile,
} from "../../../../agent-platform/agent-profile";

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

export interface BuiltinCapabilityAccess {
  knowledgeBase: boolean;
  scheduleTaskDiary: boolean;
  databaseAssistant: boolean;
  docContentEditing: boolean;
  notebookDocTree: boolean;
  tagBookmarkOutline: boolean;
  assetManagement: boolean;
  riffReview: boolean;
  homepageManagement: boolean;
  homepageQuickNote: boolean;
  homepageFocus: boolean;
  homepageAccounting: boolean;
  homepageFixedAssets: boolean;
  homepageAnniversary: boolean;
  homepageFavorites: boolean;
  homepageReview: boolean;
  homepageMusic: boolean;
}

export interface AgentWorkbenchRuntimeOptions {
  profile: AgentProfile;
  kbRetrievalToolDeps?: SiyuanToolDeps;
  /** Optional: web read page runtime deps. When present, registers web_fetch.read_page. */
  webReadPageToolDeps?: {
    readProxyEndpoint?: string;
    readPageMaxChars: number;
    timeoutMs: number;
  };
  /** Built-in capability visibility from settings. Not a business controller — just composition-root gate. */
  builtinCapabilityAccess?: BuiltinCapabilityAccess;
  /** Global tool visibility from settings. Controls aggregate and system tool registration. */
  globalToolAccess?: {
    webFetch: boolean;
    editGlobalMemory: boolean;
    agentToolHelp: boolean;
  };
  /** Optional: global memory tool deps. When present, registers edit_global_memory. */
  globalMemoryToolDeps?: {
    docId: string;
    maxMemoryChars: number;
    baseDigest?: string;
  };
  /** 当前对话标识，用于 confirmation store 等需要关联 conversation 的场景。 */
  conversationId?: string;
  confirmationRoute?: ConfirmationRoute;
  externalSkillSettings?: ExternalSkillSettings;
  mcpSettings?: McpSettings;
  notebrainWorkspaceSettings?: NotebrainAgentWorkspaceSettings;
  runtimeToolsSettings?: RuntimeToolsSettings;
}

export function createAgentWorkbenchRuntime(
  options: AgentWorkbenchRuntimeOptions,
): AgentWorkbenchRuntime {
  // Per-turn registries, no global state.
  const skillRegistry = new SkillRegistry();
  const toolRegistry = new ToolRegistry({
    allowsTool: (name) => agentProfileAllowsTool(options.profile, name),
    allowsAction: (toolName, action) => agentProfileAllowsToolAction(options.profile, toolName, action),
  });
  const externalSkillSettings = options.externalSkillSettings ?? DEFAULT_EXTERNAL_SKILL_SETTINGS;

  // Register system tools (edit_global_memory)
  if (agentProfileHasCapability(options.profile, "global-memory")) {
    registerSystemTools(toolRegistry, {
      globalMemoryToolDeps: agentProfileAllowsMemory(options.profile, "write")
        ? options.globalMemoryToolDeps
        : undefined,
      globalToolAccess: options.globalToolAccess,
    });
  }

  // Register Siyuan tools (knowledge base, diary, doc editing)
  if (agentProfileHasCapability(options.profile, "siyuan") && options.kbRetrievalToolDeps) {
    registerSiyuanTools(toolRegistry, {
      kbRetrievalToolDeps: options.kbRetrievalToolDeps,
      conversationId: options.conversationId,
      confirmationRoute: options.confirmationRoute,
      builtinCapabilityAccess: options.builtinCapabilityAccess,
      globalToolAccess: options.globalToolAccess,
    });
  }

  if (agentProfileHasCapability(options.profile, "homepage")) {
    registerHomepageTools(toolRegistry, {
      enabled: options.builtinCapabilityAccess?.homepageManagement === true,
    });
    registerHomepageComponentTools(toolRegistry, {
      quickNote: options.builtinCapabilityAccess?.homepageQuickNote === true,
      focus: options.builtinCapabilityAccess?.homepageFocus === true,
      accounting: options.builtinCapabilityAccess?.homepageAccounting === true,
      fixedAssets: options.builtinCapabilityAccess?.homepageFixedAssets === true,
      anniversary: options.builtinCapabilityAccess?.homepageAnniversary === true,
      favorites: options.builtinCapabilityAccess?.homepageFavorites === true,
      review: options.builtinCapabilityAccess?.homepageReview === true,
      music: options.builtinCapabilityAccess?.homepageMusic === true,
    });
  }

  // Register web_fetch aggregate tool.
  if (agentProfileHasCapability(options.profile, "web")) {
    registerWebTools(toolRegistry, {
      webReadPageToolDeps: options.webReadPageToolDeps,
      globalToolAccess: options.globalToolAccess,
    });
  }

  if (agentProfileHasCapability(options.profile, "local-workspace")) {
    registerLocalTools(toolRegistry, options.notebrainWorkspaceSettings, options.runtimeToolsSettings);
  }
  if (agentProfileHasCapability(options.profile, "external-skills")) {
    registerExternalSkillTools(toolRegistry, externalSkillSettings);
  }
  // ponytail: MCP management tools only registered when mcp.enabled=true
  const effectiveMcpSettings = options.mcpSettings ?? DEFAULT_MCP_SETTINGS;
  if (agentProfileHasCapability(options.profile, "mcp") && effectiveMcpSettings.enabled) {
    registerMcpManagementTools(toolRegistry, effectiveMcpSettings, options.runtimeToolsSettings);
  }

  if (agentProfileHasCapability(options.profile, "tools") && options.globalToolAccess?.agentToolHelp !== false) {
    const helpSnapshotCtx = { question: "", callCounts: {} };
    const currentProviderVisibleTools: AvailableToolSnapshot[] = toolRegistry.getToolManifest(helpSnapshotCtx)
      .filter((manifest) => manifest.availability.available === true)
      .map((manifest) => {
        const contract = toolRegistry.getTool(manifest.name);
        return {
          name: manifest.name,
          actions: extractManifestActionEnum(manifest.inputJsonSchema),
          actionHelp: contract?.aggregateActionHelp,
          argsSchema: manifest.inputJsonSchema,
        };
      });
    registerSystemTools(toolRegistry, {
      globalToolAccess: options.globalToolAccess,
      externalSkillSettings,
      agentToolHelpAvailableTools: [...currentProviderVisibleTools, { name: "agent_tool_help" }],
    });
  }

  function extractManifestActionEnum(schema: unknown): string[] | undefined {
    if (!schema || typeof schema !== "object") return undefined;
    const properties = (schema as Record<string, unknown>).properties;
    if (!properties || typeof properties !== "object") return undefined;
    const actionSchema = (properties as Record<string, unknown>).action;
    if (!actionSchema || typeof actionSchema !== "object") return undefined;
    const enumValues = (actionSchema as Record<string, unknown>).enum;
    if (Array.isArray(enumValues) && enumValues.every((v) => typeof v === "string")) {
      return enumValues as string[];
    }
    return undefined;
  }

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
