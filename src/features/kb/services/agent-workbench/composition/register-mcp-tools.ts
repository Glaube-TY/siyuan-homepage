import type { McpSettings, RuntimeToolsSettings } from "../../../types/settings";
import { ToolRegistry } from "../registries/tool-registry";
import {
  createListServersActionTool,
  createListToolsActionTool,
  createReadToolActionTool,
  createSaveServerActionTool,
  createSyncToolsActionTool,
  createListPresetsActionTool,
  createCleanupStaleToolsActionTool,
  createCallToolActionTool,
  createDeleteServerActionTool,
} from "../tools/mcp/mcp-management-tools";
import { createAggregateTool } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";

export function registerMcpManagementTools(
  toolRegistry: ToolRegistry,
  settings: McpSettings,
  runtimeTools?: RuntimeToolsSettings,
): void {
  // Internal defensive check: caller should also gate, but be safe.
  if (settings.enabled !== true) return;
  const meta = findAggregateToolMeta("mcp_manage");
  toolRegistry.ensureTool(createAggregateTool({
    name: "mcp_manage",
    title: meta?.title ?? "MCP 管理",
    description: meta?.description ?? "管理 MCP Server 和工具索引。",
    boundary: meta?.boundary ?? "写入 MCP 配置前需要确认。",
    source: "local",
    actions: [
      { action: "list_servers", tool: createListServersActionTool(settings) },
      { action: "save_server", tool: createSaveServerActionTool(settings) },
      { action: "delete_server", tool: createDeleteServerActionTool(settings) },
      { action: "sync_tools", tool: createSyncToolsActionTool(settings, runtimeTools) },
      { action: "list_tools", tool: createListToolsActionTool(settings) },
      { action: "read_tool", tool: createReadToolActionTool(settings) },
      { action: "call_tool", tool: createCallToolActionTool(settings, runtimeTools) },
      { action: "list_presets", tool: createListPresetsActionTool(settings) },
      { action: "cleanup_stale_tools", tool: createCleanupStaleToolsActionTool(settings) },
    ],
  }));
}
