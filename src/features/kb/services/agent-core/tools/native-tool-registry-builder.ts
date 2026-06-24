import type { ToolResultLog } from "../../agent-workbench/runtime/tool-result-log";
import type { ToolRegistry } from "../../agent-workbench/registries/tool-registry";
import { createNativeToolRegistryFromWorkbench } from "./workbench-tool-adapter";
import { registerNativeSiyuanWriteTools } from "./siyuan/native-siyuan-write-tools";
import type { NativeToolRegistry } from "./native-tool-registry";
import { registerNativeLocalTools } from "./local/register-native-local-tools";
import type { NotebrainAgentWorkspaceSettings, McpSettings, RuntimeToolsSettings } from "../../../types/settings";
import { registerNativeMcpTools } from "./mcp/register-native-mcp-tools";

export interface BuildNativeToolRegistryForTurnParams {
  toolRegistry: ToolRegistry;
  observationLog: ToolResultLog;
  question: string;
  conversationId: string;
  abortSignal?: AbortSignal;
  docContentEditingEnabled?: boolean;
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
  const registry = createNativeToolRegistryFromWorkbench({
    toolRegistry: params.toolRegistry,
    observationLog: params.observationLog,
    question: params.question,
    abortSignal: params.abortSignal,
  });

  if (params.docContentEditingEnabled === true) {
    registerNativeSiyuanWriteTools(registry, {
      conversationId: params.conversationId,
    });
  }

  if (params.notebrainWorkspaceSettings) {
    registerNativeLocalTools(registry, params.notebrainWorkspaceSettings, params.runtimeToolsSettings);
  }

  if (params.mcpSettings) {
    await registerNativeMcpTools({
      registry,
      settings: params.mcpSettings,
      question: params.question,
      runtimeToolsSettings: params.runtimeToolsSettings,
    });
  }

  return registry;
}
