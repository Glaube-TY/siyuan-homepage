import type { ToolResultLog } from "../../agent-workbench/runtime/tool-result-log";
import type { ToolRegistry } from "../../agent-workbench/registries/tool-registry";
import { ToolExecutor as WorkbenchToolExecutor } from "../../agent-workbench/runtime/tool-executor";
import type { McpSettings, NotebrainAgentWorkspaceSettings } from "../../../types/settings";
import { loadMcpToolIndex } from "../../agent-workbench/mcp/mcp-tool-index";
import { isMcpServerAllowed, isMcpToolAllowed } from "../../agent-workbench/mcp/mcp-access";
import { buildNotebrainCommandPermissionPreview } from "./local/notebrain-command-runtime";
import type { NativeTool } from "./native-tool";
import { ensureObjectJsonSchema } from "./native-tool-schema";
import { NativeToolRegistry } from "./native-tool-registry";
import { executionOutcomeToNativeResult } from "./tool-result-renderer";

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
  if (!isMcpServerAllowed(settings, serverId)) return {};
  const index = await loadMcpToolIndex();
  const tool = index.tools.find(
    (entry) =>
      entry.serverId === serverId &&
      entry.enabled !== false &&
      (entry.internalName === toolName || entry.originalName === toolName),
  );
  if (!tool) return {};
  if (!isMcpToolAllowed(settings, tool)) return {};
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
  /** Robot Kernel 在 native permission gate 完成远程确认，因此不能跳过 internallyConfirmed 调用。 */
  trustInternallyConfirmed?: boolean;
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
      ...(contract.aggregateActionHelp ? { aggregateActionHelp: contract.aggregateActionHelp } : {}),
      isReadOnlyCall: (args) => contract.resolveCallSafety?.(args).readOnly ?? contract.readOnly,
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
            const callSafety = contract.resolveCallSafety?.(args) ?? contract.safety;
            return callSafety.readOnly
              ? { permissionAction: "allow" }
              : callSafety.requiresConfirmation === false
                ? { permissionAction: "allow" }
              : callSafety.internallyConfirmed === true && params.trustInternallyConfirmed !== false
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
