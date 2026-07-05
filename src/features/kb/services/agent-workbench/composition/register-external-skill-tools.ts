import type { ExternalSkillSettings } from "../../../types/settings";
import { ToolRegistry } from "../registries/tool-registry";
import {
  createInstallActionTool,
  createListActionTool,
  createReadFileActionTool,
  createReadActionTool,
  createReindexActionTool,
  createUninstallActionTool,
} from "../tools/external-skills/external-skill-tools";
import { createAggregateTool } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";

export function registerExternalSkillTools(
  toolRegistry: ToolRegistry,
  settings: ExternalSkillSettings,
): void {
  const meta = findAggregateToolMeta("skill_manage");
  toolRegistry.ensureTool(createAggregateTool({
    name: "skill_manage",
    title: meta?.title ?? "Skill 说明包管理",
    description: meta?.description ?? "管理外部/自定义 Skill 说明包。",
    boundary: meta?.boundary ?? "只处理外部/自定义 Skill；写入前需要确认。",
    source: "local",
    actions: [
      { action: "list", tool: createListActionTool(settings) },
      { action: "read", tool: createReadActionTool(settings) },
      { action: "read_file", tool: createReadFileActionTool(settings) },
      { action: "install", tool: createInstallActionTool(settings) },
      { action: "uninstall", tool: createUninstallActionTool(settings) },
      { action: "reindex", tool: createReindexActionTool(settings) },
    ],
  }));
}
