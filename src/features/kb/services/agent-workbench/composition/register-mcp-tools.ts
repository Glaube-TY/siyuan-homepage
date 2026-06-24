import type { McpSettings, RuntimeToolsSettings } from "../../../types/settings";
import { ToolRegistry } from "../registries/tool-registry";
import {
  createMcpListServersTool,
  createMcpListToolsTool,
  createMcpReadToolTool,
  createMcpSaveServerTool,
  createMcpSyncToolsTool,
  createMcpListPresetsTool,
  createMcpCleanupStaleToolsTool,
} from "../tools/mcp/mcp-management-tools";

export function registerMcpManagementTools(
  toolRegistry: ToolRegistry,
  settings: McpSettings,
  runtimeTools?: RuntimeToolsSettings,
): void {
  toolRegistry.ensureTool(createMcpListServersTool(settings));
  toolRegistry.ensureTool(createMcpSaveServerTool(settings));
  toolRegistry.ensureTool(createMcpSyncToolsTool(settings, runtimeTools));
  toolRegistry.ensureTool(createMcpListToolsTool(settings));
  toolRegistry.ensureTool(createMcpReadToolTool(settings));
  toolRegistry.ensureTool(createMcpListPresetsTool(settings));
  toolRegistry.ensureTool(createMcpCleanupStaleToolsTool(settings));
}

