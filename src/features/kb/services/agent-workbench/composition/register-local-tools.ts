import type { NotebrainAgentWorkspaceSettings, RuntimeToolsSettings } from "../../../types/settings";
import { ToolRegistry } from "../registries/tool-registry";
import {
  createDeletePathActionTool,
  createListDirActionTool,
  createReadFileActionTool,
  createRunCommandActionTool,
  createWriteFileActionTool,
} from "../tools/local/notebrain-file-tools";
import { createAggregateTool, type AggregateActionBinding } from "../tools/aggregate/aggregate-tool-factory";
import { findAggregateToolMeta } from "../tools/aggregate/aggregate-tool-metadata";

export function registerLocalTools(
  toolRegistry: ToolRegistry,
  settings?: NotebrainAgentWorkspaceSettings,
  runtimeToolsSettings?: RuntimeToolsSettings,
): void {
  // Sandbox master switch must be enabled for any local file tools.
  if (settings?.enabled !== true) return;
  const actions: AggregateActionBinding[] = [
    { action: "list_dir", tool: createListDirActionTool() },
    { action: "read_file", tool: createReadFileActionTool() },
  ];
  if (settings?.fileWriteToolsEnabled !== false) {
    actions.push(
      { action: "write_file", tool: createWriteFileActionTool() },
      { action: "delete_path", tool: createDeletePathActionTool() },
    );
  }
  if (settings?.commandExecutionEnabled === true) {
    actions.push(
      { action: "run_command", tool: createRunCommandActionTool(settings, runtimeToolsSettings) },
    );
  }
  const meta = findAggregateToolMeta("notebrain_file");
  toolRegistry.ensureTool(createAggregateTool({
    name: "notebrain_file",
    title: meta?.title ?? "Notebrain 文件",
    description: meta?.description ?? "读写 Notebrain 工作区文件。",
    boundary: meta?.boundary ?? "只允许访问 Notebrain 工作区相对路径；写入和删除需要确认。",
    source: "local",
    actions,
  }));
}
