/**
 * Composition: register system tools.
 */

import { ToolRegistry } from "../registries/tool-registry";
import { createMemoryManageTool, type MemoryManageToolOptions } from "../tools/system/memory-manage.tool";
import { createAgentToolHelpTool, type AvailableToolSnapshot } from "../tools/aggregate/agent-tool-help.tool";
import type { ExternalSkillSettings } from "../../../types/settings";
import { createAutomationManageTool, type AutomationManageToolOptions } from "../tools/system/automation-manage.tool";
import { createNotificationManageTool } from "../tools/system/notification-manage.tool";

export interface SystemToolOptions {
  memory?: MemoryManageToolOptions;
  globalToolAccess?: {
    agentToolHelp?: boolean;
  };
  externalSkillSettings?: ExternalSkillSettings;
  agentToolHelpAvailableTools?: readonly AvailableToolSnapshot[];
  automation?: AutomationManageToolOptions;
  notification?: boolean;
}

export function registerSystemTools(
  toolRegistry: ToolRegistry,
  options: SystemToolOptions = {},
): void {
  if (options.memory && (options.memory.read || options.memory.write)) {
    toolRegistry.ensureTool(createMemoryManageTool(options.memory));
  }
  if (options.automation) toolRegistry.ensureTool(createAutomationManageTool(options.automation));
  if (options.notification) toolRegistry.ensureTool(createNotificationManageTool());

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
