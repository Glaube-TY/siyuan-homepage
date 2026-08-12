/**
 * Composition: register system tools.
 */

import { ToolRegistry } from "../registries/tool-registry";
import { createMemoryManageTool, type MemoryManageToolOptions } from "../tools/system/memory-manage.tool";
import { createAgentToolHelpTool, type AvailableToolSnapshot } from "../tools/aggregate/agent-tool-help.tool";
import type { ExternalSkillSettings } from "../../../types/settings";

export interface SystemToolOptions {
  memory?: MemoryManageToolOptions;
  globalToolAccess?: {
    agentToolHelp?: boolean;
  };
  externalSkillSettings?: ExternalSkillSettings;
  agentToolHelpAvailableTools?: readonly AvailableToolSnapshot[];
}

export function registerSystemTools(
  toolRegistry: ToolRegistry,
  options: SystemToolOptions = {},
): void {
  if (options.memory && (options.memory.read || options.memory.write)) {
    toolRegistry.ensureTool(createMemoryManageTool(options.memory));
  }

  if (
    options.globalToolAccess?.agentToolHelp !== false &&
    options.externalSkillSettings &&
    options.agentToolHelpAvailableTools
  ) {
    toolRegistry.ensureTool(createAgentToolHelpTool({
      externalSkillSettings: options.externalSkillSettings,
      availableTools: options.agentToolHelpAvailableTools,
    }));
  }
}
