import Ajv from "ajv";
import type { McpSettings, RuntimeToolsSettings } from "../../../../types/settings";
import type { NativeTool } from "../native-tool";
import type { NativeToolRegistry } from "../native-tool-registry";
import { ensureObjectJsonSchema } from "../native-tool-schema";
import { stringifyToolResultContent } from "../tool-execution-result";
import { loadMcpServers } from "../../../agent-workbench/mcp/mcp-config-store";
import { loadMcpToolIndex } from "../../../agent-workbench/mcp/mcp-tool-index";
import { callMcpTool } from "../../../agent-workbench/mcp/mcp-client-manager";
import { normalizeMcpResultContent } from "../../../agent-workbench/mcp/mcp-result-normalizer";
import { getNotebrainRuntimeEnvironment } from "../../../agent-workbench/workspace/notebrain-runtime-env";
import { pushAgentDebugEvent } from "../../../agent-workbench/debug/workbench-debug";
import type { McpServerConfig, McpToolIndexEntry } from "../../../agent-workbench/mcp/mcp-types";

/** Belt-and-suspenders: redact any remaining secrets in error messages before ToolResult. */
function redactErrorMessage(msg: string): string {
  return msg
    .replace(/(["']?\s*Authorization\s*:\s*Bearer\s+)\S+/gi, "$1***")
    .replace(/(["']?\s*Bearer\s+)\S+/gi, "$1***")
    .replace(/(\b(token|api[_-]?key|apiKey|secret|password|access_token|refresh_token|client_secret|accessToken|refreshToken|clientSecret)\s*[:=]\s*)([^\s,;"'}]+)/gi, "$1***")
    .replace(/enc:v1:[A-Za-z0-9+/=]+/g, "enc:v1:***");
}

function scoreTool(question: string, tool: McpToolIndexEntry): number {
  const q = question.toLowerCase();
  const haystack = [
    tool.internalName,
    tool.originalName,
    tool.title ?? "",
    tool.description ?? "",
    tool.serverId,
  ].join(" ").toLowerCase();
  if (!q.trim()) return 0;
  let score = 0;
  for (const token of q.split(/\s+/).filter((item) => item.length >= 2)) {
    if (haystack.includes(token)) score += token.length;
  }
  return score;
}

function selectVisibleMcpTools(params: {
  tools: McpToolIndexEntry[];
  settings: McpSettings;
  question: string;
}): McpToolIndexEntry[] {
  const disabledServers = new Set(params.settings.disabledServerIds ?? []);
  const disabledTools = new Set(params.settings.disabledToolNames ?? []);
  const enabled = params.tools
    .filter((tool) => tool.enabled !== false)
    .filter((tool) => !disabledServers.has(tool.serverId))
    .filter((tool) => !disabledTools.has(tool.internalName) && !disabledTools.has(tool.originalName));
  const max = Math.max(1, Math.min(params.settings.maxVisibleToolsPerTurn || 40, 80));

  // Group tools by serverId to avoid splitting a server's tools mid-group
  const scored = enabled.map((tool) => ({ tool, score: scoreTool(params.question, tool) }));
  // Sort by score descending, then name for stability
  scored.sort((a, b) => b.score - a.score || a.tool.internalName.localeCompare(b.tool.internalName));

  // Group by serverId: for each server, compute max score among its tools
  const serverMaxScore = new Map<string, number>();
  for (const item of scored) {
    const sid = item.tool.serverId;
    const prev = serverMaxScore.get(sid);
    if (prev === undefined || item.score > prev) {
      serverMaxScore.set(sid, item.score);
    }
  }

  // Sort unique servers by their best tool score descending
  const sortedServerIds = [...new Set(scored.map((item) => item.tool.serverId))]
    .sort((a, b) => (serverMaxScore.get(b) ?? 0) - (serverMaxScore.get(a) ?? 0));

  // Greedily add whole server groups until max is reached
  const result: McpToolIndexEntry[] = [];
  for (const sid of sortedServerIds) {
    const serverTools = scored
      .filter((item) => item.tool.serverId === sid)
      .map((item) => item.tool);
    if (result.length + serverTools.length <= max) {
      result.push(...serverTools);
    }
    if (result.length >= max) break;
  }

  return result;
}

function compileValidator(schema: unknown) {
  try {
    const ajv = new Ajv({ allErrors: true, strict: false });
    return ajv.compile(schema || { type: "object", properties: {}, additionalProperties: true });
  } catch {
    return null;
  }
}

function createNativeMcpTool(params: {
  server: McpServerConfig;
  tool: McpToolIndexEntry;
  trusted: boolean;
  runtimeTools?: RuntimeToolsSettings;
}): NativeTool {
  const parameters = ensureObjectJsonSchema(params.tool.inputSchema);
  const validate = compileValidator(parameters);
  // Use readOnly from tool index (classified from MCP annotations or heuristic)
  const isReadOnly = params.tool.readOnly === true;
  const nativeTool = {
    name: params.tool.internalName,
    title: params.tool.title || params.tool.originalName,
    description: params.tool.description || `MCP tool ${params.tool.originalName} from ${params.tool.serverId}`,
    parameters,
    readOnly: isReadOnly,
    parallelSafe: false,
    riskLevel: params.tool.riskLevel ?? "medium",
    providerVisible: true,
    source: "mcp" as const,
    safety: {
      readOnly: isReadOnly,
      canWrite: !isReadOnly,
      requiresConfirmation: isReadOnly ? false : !params.trusted,
      permissionScope: `mcp.${params.tool.serverId}`,
    },
    meta: {
      serverId: params.tool.serverId,
      originalName: params.tool.originalName,
    },
    async execute(args: Record<string, unknown>) {
      if (validate && !validate(args)) {
        return {
          ok: false,
          summary: "MCP 工具参数不符合 inputSchema。",
          errorCode: "invalid_args",
          content: stringifyToolResultContent({
            ok: false,
            toolName: params.tool.internalName,
            code: "invalid_args",
            message: ajvErrorsToMessage(validate.errors),
          }),
        };
      }
      try {
        const result = await callMcpTool({
          server: params.server,
          tool: params.tool,
          args,
        }, params.runtimeTools);
        const normalized = normalizeMcpResultContent(result);
        // read_media_file is only for images/audio/video; text files are expected to fail.
        // Rewrite the summary so the AI doesn't treat this as an MCP system failure.
        let summary = normalized.summary;
        if (!normalized.ok && params.tool.originalName === "read_media_file") {
          summary = "read_media_file 只适合图片/音频/视频等媒体文件，当前输入不是媒体文件或 MCP 返回了不兼容内容。";
        }
        return {
          ok: normalized.ok,
          summary,
          errorCode: normalized.ok ? undefined : "mcp_tool_error",
          data: {
            serverId: params.tool.serverId,
            toolName: params.tool.originalName,
            result: normalized.data,
            textPreview: normalized.contentText,
            truncated: normalized.truncated,
          },
          content: stringifyToolResultContent({
            ok: normalized.ok,
            toolName: params.tool.internalName,
            data: {
              serverId: params.tool.serverId,
              toolName: params.tool.originalName,
              result: normalized.data,
              textPreview: normalized.contentText,
              truncated: normalized.truncated,
              ...(!normalized.ok && params.tool.originalName === "read_media_file" ? {
                hint: "read_media_file 只适合图片/音频/视频等媒体文件。文本文件请使用 read_text_file。",
              } : {}),
            },
          }),
        };
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "MCP 工具调用失败。";
        const message = redactErrorMessage(rawMessage);
        return {
          ok: false,
          summary: message,
          errorCode: "mcp_call_failed",
          content: stringifyToolResultContent({
            ok: false,
            toolName: params.tool.internalName,
            code: "mcp_call_failed",
            message,
          }),
        };
      }
    },
  } satisfies NativeTool & { meta: Record<string, string> };
  return nativeTool;
}

function ajvErrorsToMessage(errors: any): string {
  if (!Array.isArray(errors) || errors.length === 0) return "参数校验失败。";
  return errors.slice(0, 5).map((err) => `${err.instancePath || "/"} ${err.message || ""}`.trim()).join("; ");
}

export async function registerNativeMcpTools(params: {
  registry: NativeToolRegistry;
  settings: McpSettings;
  question: string;
  runtimeToolsSettings?: RuntimeToolsSettings;
}): Promise<void> {
  if (params.settings.enabled !== true) return;
  const [serversFile, toolIndex] = await Promise.all([
    loadMcpServers(),
    loadMcpToolIndex(),
  ]);
  const env = getNotebrainRuntimeEnvironment();
  const trustedTools = new Set(params.settings.trustedToolNames ?? []);

  // Detect stdio servers that will be filtered out on non-PC environments.
  // Emit a structured debug event so window.__kbAgentDebug("all") can show
  // exactly which capabilities were disabled by the runtime environment.
  if (!env.isPcElectron) {
    const enabledServers = serversFile.servers.filter((server) => server.enabled !== false);
    const filteredStdioServers = enabledServers.filter(
      (server) => server.transport === "stdio",
    );
    const filteredServerIds = filteredStdioServers.map((s) => s.id);
    const filteredToolCount = toolIndex.tools.filter(
      (tool) => filteredServerIds.includes(tool.serverId),
    ).length;
    if (filteredStdioServers.length > 0) {
      pushAgentDebugEvent("MCP_STDIO_TOOLS_FILTERED", {
        filteredServerCount: filteredStdioServers.length,
        filteredToolCount,
        platformLabel: env.platformLabel,
        reasonCode: env.reasonCode,
        unsupportedCapabilities: env.unsupportedCapabilities,
        filteredServerIds,
      }, "info");
    }
  }

  const serverMap = new Map(
    serversFile.servers
      .filter((server) => server.enabled !== false)
      .filter((server) => server.transport !== "stdio" || env.isPcElectron)
      .map((server) => [server.id, server]),
  );
  const visibleTools = selectVisibleMcpTools({
    // Filter to only tools from active enabled servers before scoring/truncation.
    // Stale tools from deleted or disabled servers must not consume slots.
    tools: toolIndex.tools.filter((tool) => serverMap.has(tool.serverId)),
    settings: params.settings,
    question: params.question,
  });
  for (const tool of visibleTools) {
    const server = serverMap.get(tool.serverId);
    if (!server) continue;
    const trusted = tool.trusted || trustedTools.has(tool.internalName) || trustedTools.has(tool.originalName);
    params.registry.register(createNativeMcpTool({ server, tool, trusted, runtimeTools: params.runtimeToolsSettings }));
  }
}
