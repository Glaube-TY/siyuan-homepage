import type { ToolResultLog } from "../../agent-workbench/runtime/tool-result-log";
import type { ToolRegistry } from "../../agent-workbench/registries/tool-registry";
import { createNativeToolRegistryFromWorkbench } from "./workbench-tool-adapter";
import type { NativeToolRegistry } from "./native-tool-registry";
import type { NotebrainAgentWorkspaceSettings, McpSettings, RuntimeToolsSettings } from "../../../types/settings";

export interface BuildNativeToolRegistryForTurnParams {
  toolRegistry: ToolRegistry;
  observationLog: ToolResultLog;
  question: string;
  conversationId: string;
  abortSignal?: AbortSignal;
  notebrainWorkspaceSettings?: NotebrainAgentWorkspaceSettings;
  mcpSettings?: McpSettings;
  runtimeToolsSettings?: RuntimeToolsSettings;
}

/**
 * Native tool composition root for one Agent turn.
 *
 * Workbench contracts remain the source for read-only/system/web tools.
 * Siyuan write operations are registered as native tools so every dangerous
 * operation goes through the native permission gate before execution.
 */
export async function buildNativeToolRegistryForTurn(
  params: BuildNativeToolRegistryForTurnParams,
): Promise<NativeToolRegistry> {
  return createNativeToolRegistryFromWorkbench({
    toolRegistry: params.toolRegistry,
    observationLog: params.observationLog,
    question: params.question,
    abortSignal: params.abortSignal,
    mcpSettings: params.mcpSettings,
    notebrainWorkspaceSettings: params.notebrainWorkspaceSettings,
  });
}
