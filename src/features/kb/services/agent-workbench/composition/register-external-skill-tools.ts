import type { ExternalSkillSettings } from "../../../types/settings";
import { ToolRegistry } from "../registries/tool-registry";
import {
  createSkillInstallTool,
  createSkillListTool,
  createSkillReadFileTool,
  createSkillReadTool,
  createSkillReindexTool,
  createSkillUninstallTool,
} from "../tools/external-skills/external-skill-tools";

export function registerExternalSkillTools(
  toolRegistry: ToolRegistry,
  settings: ExternalSkillSettings,
): void {
  toolRegistry.ensureTool(createSkillListTool(settings));
  toolRegistry.ensureTool(createSkillReadTool(settings));
  toolRegistry.ensureTool(createSkillReadFileTool(settings));
  toolRegistry.ensureTool(createSkillInstallTool(settings));
  toolRegistry.ensureTool(createSkillUninstallTool(settings));
  toolRegistry.ensureTool(createSkillReindexTool(settings));
}

