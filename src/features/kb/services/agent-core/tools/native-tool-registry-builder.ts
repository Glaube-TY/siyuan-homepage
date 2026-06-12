import type { ToolResultLog } from "../../agent-workbench/runtime/tool-result-log";
import type { ToolRegistry } from "../../agent-workbench/registries/tool-registry";
import { createNativeToolRegistryFromWorkbench } from "./workbench-tool-adapter";
import { registerNativeSiyuanWriteTools } from "./siyuan/native-siyuan-write-tools";
import type { NativeToolRegistry } from "./native-tool-registry";

export interface BuildNativeToolRegistryForTurnParams {
  toolRegistry: ToolRegistry;
  observationLog: ToolResultLog;
  question: string;
  conversationId: string;
  abortSignal?: AbortSignal;
}

/**
 * Native tool composition root for one Agent turn.
 *
 * Workbench contracts remain the source for read-only/system/web tools.
 * Siyuan write operations are registered as native tools so every dangerous
 * operation goes through the native permission gate before execution.
 */
export function buildNativeToolRegistryForTurn(
  params: BuildNativeToolRegistryForTurnParams,
): NativeToolRegistry {
  const registry = createNativeToolRegistryFromWorkbench({
    toolRegistry: params.toolRegistry,
    observationLog: params.observationLog,
    question: params.question,
    abortSignal: params.abortSignal,
  });

  registerNativeSiyuanWriteTools(registry, {
    conversationId: params.conversationId,
  });

  return registry;
}
