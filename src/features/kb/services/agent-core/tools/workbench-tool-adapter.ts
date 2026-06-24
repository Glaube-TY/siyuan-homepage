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

const READ_ONLY_ACTIONS_BY_TOOL = new Map<string, Set<string>>([
  ["siyuan_block_attr", new Set(["get", "batch_get"])],
  ["siyuan_block_ref", new Set(["get_ref_ids", "get_ref_text", "get_def_ids_by_ref_text", "check_ref"])],
  ["siyuan_notebook_manage", new Set(["list", "get_conf"])],
  ["siyuan_doc_tree", new Set(["list_children", "list_tree"])],
  ["siyuan_tag_manage", new Set(["list", "search"])],
  ["siyuan_bookmark_manage", new Set(["list", "list_blocks"])],
  ["siyuan_workspace_file", new Set(["read_dir", "get_file", "unique_filename"])],
  ["siyuan_riff_deck", new Set(["list"])],
  ["siyuan_riff_card", new Set([
    "due_cards",
    "tree_due_cards",
    "notebook_due_cards",
    "list_cards",
    "tree_cards",
    "notebook_cards",
    "cards_by_block_ids",
  ])],
]);

function isReadOnlyAction(toolName: string, args: Record<string, unknown>): boolean {
  const action = typeof args.action === "string" ? args.action : "";
  return READ_ONLY_ACTIONS_BY_TOOL.get(toolName)?.has(action) === true;
}

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
    if (manifest.availability.available !== true) continue;

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
      preview: isWriteTool
        ? async (args) => isReadOnlyAction(contract.name, args)
          ? { permissionAction: "allow" }
          : {}
        : undefined,
    };

    nativeRegistry.register(nativeTool);
  }

  return nativeRegistry;
}
