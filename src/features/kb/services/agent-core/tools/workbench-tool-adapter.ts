import type { ToolResultLog } from "../../agent-workbench/runtime/tool-result-log";
import type { ToolRegistry } from "../../agent-workbench/registries/tool-registry";
import { ToolExecutor as WorkbenchToolExecutor } from "../../agent-workbench/runtime/tool-executor";
import type { McpSettings, NotebrainAgentWorkspaceSettings } from "../../../types/settings";
import { loadMcpToolIndex } from "../../agent-workbench/mcp/mcp-tool-index";
import { buildNotebrainCommandPermissionPreview } from "./local/notebrain-command-runtime";
import type { NativeTool } from "./native-tool";
import { ensureObjectJsonSchema } from "./native-tool-schema";
import { NativeToolRegistry } from "./native-tool-registry";
import { executionOutcomeToNativeResult } from "./tool-result-renderer";

const READ_ONLY_AGGREGATE_ACTIONS_BY_TOOL = new Map<string, Set<string>>([
  ["siyuan_kb", new Set(["search", "read_docs", "get_doc_info", "list_map", "list_by_time", "outline", "refs", "extra_search"])],
  ["diary_task", new Set(["overview", "query_tasks", "query_records", "find_docs"])],
  ["siyuan_database", new Set(["list", "read", "find_rows", "extra_read"])],
  ["siyuan_doc_edit", new Set(["read_blocks", "block_read"])],
  ["siyuan_tree", new Set(["doc_path"])],
  ["siyuan_asset", new Set(["read"])],
  ["skill_manage", new Set(["list", "read", "read_file"])],
  ["mcp_manage", new Set(["list_servers", "list_tools", "read_tool", "list_presets"])],
  ["notebrain_file", new Set(["list_dir", "read_file"])],
  ["web_fetch", new Set(["read_page", "http_get"])],
]);

const INTERNALLY_CONFIRMED_AGGREGATE_ACTIONS_BY_TOOL = new Map<string, Set<string>>([
  ["siyuan_doc_edit", new Set([
    "create_doc",
    "update_block",
    "insert_block",
    "delete_blocks",
    "move_block",
    "rename_doc",
    "delete_doc",
    "replace_doc_content",
  ])],
]);

const READ_ONLY_NESTED_ACTIONS_BY_AGGREGATE = new Map<string, Map<string, Set<string>>>([
  ["siyuan_doc_edit", new Map([
    ["block_attr", new Set(["get", "batch_get"])],
    ["block_ref", new Set(["get_ref_ids", "get_ref_text", "get_def_ids_by_ref_text", "check_ref"])],
  ])],
  ["siyuan_tree", new Map([
    ["notebook", new Set(["list", "get_conf"])],
    ["doc_tree", new Set(["list_children", "list_tree"])],
  ])],
  ["siyuan_meta", new Map([
    ["tag", new Set(["list", "search"])],
    ["bookmark", new Set(["list", "list_blocks"])],
  ])],
  ["siyuan_asset", new Map([
    ["workspace_file", new Set(["read_dir", "get_file", "unique_filename"])],
  ])],
  ["siyuan_riff", new Map([
    ["deck", new Set(["list"])],
    ["card", new Set([
      "due_cards",
      "tree_due_cards",
      "notebook_due_cards",
      "list_cards",
      "tree_cards",
      "notebook_cards",
      "cards_by_block_ids",
      "get_card_info",
    ])],
  ])],
]);

function isReadOnlyAction(toolName: string, args: Record<string, unknown>): boolean {
  const action = typeof args.action === "string" ? args.action : "";
  if (READ_ONLY_AGGREGATE_ACTIONS_BY_TOOL.get(toolName)?.has(action) === true) return true;
  const aggregateNested = READ_ONLY_NESTED_ACTIONS_BY_AGGREGATE.get(toolName)?.get(action);
  const nestedArgs = args.args && typeof args.args === "object" ? args.args as Record<string, unknown> : undefined;
  const nestedAction = typeof nestedArgs?.action === "string" ? nestedArgs.action : "";
  return aggregateNested?.has(nestedAction) === true;
}

function isInternallyConfirmedAction(toolName: string, args: Record<string, unknown>): boolean {
  const action = typeof args.action === "string" ? args.action : "";
  return INTERNALLY_CONFIRMED_AGGREGATE_ACTIONS_BY_TOOL.get(toolName)?.has(action) === true;
}

async function previewMcpManageCallTool(
  args: Record<string, unknown>,
  settings?: McpSettings,
): Promise<Record<string, unknown>> {
  if (settings?.enabled !== true) return {};
  if (args.action !== "call_tool") return {};
  const nestedArgs = args.args && typeof args.args === "object"
    ? args.args as Record<string, unknown>
    : null;
  const serverId = typeof nestedArgs?.serverId === "string" ? nestedArgs.serverId : "";
  const toolName = typeof nestedArgs?.toolName === "string" ? nestedArgs.toolName : "";
  if (!serverId || !toolName) return {};
  const disabledServers = new Set(settings.disabledServerIds ?? []);
  if (disabledServers.has(serverId)) return {};
  const disabledTools = new Set(settings.disabledToolNames ?? []);
  const index = await loadMcpToolIndex();
  const tool = index.tools.find(
    (entry) =>
      entry.serverId === serverId &&
      entry.enabled !== false &&
      (entry.internalName === toolName || entry.originalName === toolName),
  );
  if (!tool) return {};
  if (disabledTools.has(tool.internalName) || disabledTools.has(tool.originalName)) return {};
  const trustedTools = new Set(settings.trustedToolNames ?? []);
  const trusted = tool.trusted === true
    || trustedTools.has(tool.internalName)
    || trustedTools.has(tool.originalName);
  return tool.readOnly === true || trusted ? { permissionAction: "allow" } : {};
}

function previewNotebrainFileRunCommand(
  args: Record<string, unknown>,
  settings?: NotebrainAgentWorkspaceSettings,
): Record<string, unknown> {
  if (!settings || settings.enabled !== true || settings.commandExecutionEnabled !== true) {
    return {
      permissionAction: "deny",
      permissionReasonCode: "prerequisite_missing",
      permissionReason: "notebrain 本地命令执行未启用。",
    };
  }
  const nestedArgs = args.args && typeof args.args === "object"
    ? args.args as Record<string, unknown>
    : {};
  return buildNotebrainCommandPermissionPreview(nestedArgs, settings);
}

export function createNativeToolRegistryFromWorkbench(params: {
  toolRegistry: ToolRegistry;
  observationLog: ToolResultLog;
  question: string;
  abortSignal?: AbortSignal;
  mcpSettings?: McpSettings;
  notebrainWorkspaceSettings?: NotebrainAgentWorkspaceSettings;
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
      riskLevel: isWriteTool ? "medium" : "low",
      providerVisible: contract.providerVisible,
      source: contract.source,
      safety: contract.safety,
      isReadOnlyCall: (args) => isReadOnlyAction(contract.name, args) || contract.readOnly,
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
      preflightValidate: contract.validateInputForPreview
        ? (args) => {
            const validation = contract.validateInputForPreview?.(args);
            if (validation && !validation.ok) {
              const details = validation.error?.details && typeof validation.error.details === "object"
                ? validation.error.details as Record<string, unknown>
                : undefined;
              return {
                ok: false,
                error: {
                  code: typeof details?.code === "string" ? details.code : "invalid_action_args",
                  message: validation.error?.message ?? "参数校验失败。",
                  details: validation.error?.details,
                },
              };
            }
            return { ok: true };
          }
        : undefined,
      preview: isWriteTool
        ? async (args) => {
            return isReadOnlyAction(contract.name, args)
              ? { permissionAction: "allow" }
              : isInternallyConfirmedAction(contract.name, args)
                ? { permissionAction: "allow" }
                : contract.name === "notebrain_file" && args.action === "run_command"
                  ? previewNotebrainFileRunCommand(args, params.notebrainWorkspaceSettings)
                  : contract.name === "mcp_manage"
                    ? previewMcpManageCallTool(args, params.mcpSettings)
                    : {};
          }
        : undefined,
    };

    nativeRegistry.register(nativeTool);
  }

  return nativeRegistry;
}
