import type { ToolResultLog } from "../../agent-workbench/runtime/tool-result-log";
import type { ToolRegistry } from "../../agent-workbench/registries/tool-registry";
import { ToolExecutor as WorkbenchToolExecutor } from "../../agent-workbench/runtime/tool-executor";
import type { NativeTool } from "./native-tool";
import { ensureObjectJsonSchema } from "./native-tool-schema";
import { NativeToolRegistry } from "./native-tool-registry";
import { executionOutcomeToNativeResult } from "./tool-result-renderer";

const HIGH_RISK_TOOLS = new Set([
  "delete_doc",
  "delete_blocks",
  "replace_doc_content",
]);

/**
 * Write tool names that are now registered natively via
 * native-siyuan-write-tools.ts. These are SKIPPED here to avoid
 * the old double-confirmation path.
 */
const NATIVE_WRITE_TOOL_NAMES = new Set([
  "update_block",
  "insert_block",
  "delete_blocks",
  "replace_doc_content",
  "move_block",
  "create_doc",
  "rename_doc",
  "delete_doc",
]);

export function createNativeToolRegistryFromWorkbench(params: {
  toolRegistry: ToolRegistry;
  observationLog: ToolResultLog;
  question: string;
  abortSignal?: AbortSignal;
}): NativeToolRegistry {
  const nativeRegistry = new NativeToolRegistry();
  const executor = new WorkbenchToolExecutor(params.toolRegistry, params.observationLog);
  const manifests = params.toolRegistry.getToolManifest({
    question: params.question,
    callCounts: params.observationLog.callCounts(),
    abortSignal: params.abortSignal,
  });

  for (const manifest of manifests) {
    // Skip write tools — they are registered natively via native-siyuan-write-tools
    if (NATIVE_WRITE_TOOL_NAMES.has(manifest.name)) continue;

    const contract = params.toolRegistry.getTool(manifest.name);
    if (!contract) continue;

    const isWriteTool = !contract.readOnly;
    const nativeTool: NativeTool = {
      name: contract.name,
      title: contract.title,
      description: contract.description,
      parameters: ensureObjectJsonSchema(manifest.inputJsonSchema),
      readOnly: contract.readOnly,
      parallelSafe: !isWriteTool, // readOnly tools are parallelSafe, writes are not
      riskLevel: isWriteTool ? (HIGH_RISK_TOOLS.has(contract.name) ? "high" : "medium") : "low",
      providerVisible: contract.providerVisible,
      source: contract.source,
      safety: contract.safety,
      execute: async (args, ctx) => {
        const outcome = await executor.execute(
          { toolName: contract.name, args },
          {
            question: ctx.question,
            callCounts: ctx.callCounts,
            abortSignal: ctx.abortSignal,
          },
        );
        return executionOutcomeToNativeResult(outcome, args);
      },
    };

    nativeRegistry.register(nativeTool);
  }

  return nativeRegistry;
}

